import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import {
  isAdminRequestAuthorized,
  normalizeEnvironmentValue
} from "../../server/admin-auth.js";

const BATCH_SIZE = 50;
const BATCH_DELAY_MS = 220;
const SUBSCRIBER_PAGE_SIZE = 1000;
const RISK_NOTICE = "本文仅用于研究记录，不构成投资建议";
const FAILURE_MESSAGE = "邮件发送失败，请稍后再试。";

function sendJson(response, statusCode, payload) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  return response.status(statusCode).json(payload);
}

function parseBody(body) {
  if (typeof body === "string") {
    return JSON.parse(body);
  }

  return body ?? {};
}

function isValidSupabaseUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".supabase.co");
  } catch {
    return false;
  }
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isSafeHeaderValue(value) {
  return Boolean(value) && value.length <= 320 && !/[\r\n]/.test(value);
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };

    return entities[character];
  });
}

function getRequestSiteUrl(request) {
  const origin = request.headers?.origin;

  if (typeof origin === "string") {
    try {
      const url = new URL(origin);
      if (url.protocol === "https:" || url.protocol === "http:") {
        return url.origin;
      }
    } catch {
      // Fall through to Vercel forwarding headers.
    }
  }

  const forwardedHost =
    request.headers?.["x-forwarded-host"] ?? request.headers?.host;
  const forwardedProtocol = request.headers?.["x-forwarded-proto"] ?? "https";

  if (
    typeof forwardedHost !== "string" ||
    typeof forwardedProtocol !== "string"
  ) {
    return "";
  }

  try {
    const url = new URL(`${forwardedProtocol}://${forwardedHost}`);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.origin
      : "";
  } catch {
    return "";
  }
}

function buildUnsubscribeUrl(siteUrl, token, isTest) {
  const unsubscribeUrl = new URL("/unsubscribe/", siteUrl);

  if (isTest) {
    unsubscribeUrl.searchParams.set("test", "1");
  } else {
    unsubscribeUrl.searchParams.set("token", token);
  }

  return unsubscribeUrl.toString();
}

function buildEmailContent({ subject, content, unsubscribeUrl }) {
  const safeSubject = escapeHtml(subject);
  const safeContent = escapeHtml(content).replace(/\r?\n/g, "<br />");
  const safeUnsubscribeUrl = escapeHtml(unsubscribeUrl);

  return {
    html: `
      <div style="margin:0;background:#f5f7fb;padding:32px 16px;font-family:Arial,'PingFang SC','Microsoft YaHei',sans-serif;color:#172033;">
        <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e5e9f0;border-radius:16px;padding:32px;">
          <h1 style="margin:0 0 20px;font-size:26px;line-height:1.45;">${safeSubject}</h1>
          <div style="margin:0 0 30px;color:#4b5565;font-size:16px;line-height:1.85;">${safeContent}</div>
          <p style="margin:0;padding-top:20px;border-top:1px solid #e5e9f0;color:#7a8494;font-size:13px;line-height:1.7;">
            ${RISK_NOTICE}<br />
            <a href="${safeUnsubscribeUrl}" style="color:#667085;">退订邮件更新</a>
          </p>
        </div>
      </div>
    `.trim(),
    text: `${subject}\n\n${content}\n\n${RISK_NOTICE}\n退订邮件更新：${unsubscribeUrl}`
  };
}

function logSupabaseError(error, status, operation) {
  console.error(`Supabase newsletter ${operation} failed:`, {
    status,
    message: error?.message,
    code: error?.code,
    details: error?.details,
    hint: error?.hint
  });
}

function logResendError(error, mode, batchNumber) {
  console.error("Resend newsletter send failed:", {
    mode,
    batchNumber,
    statusCode: error?.statusCode,
    name: error?.name,
    message: error?.message
  });
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function getActiveSubscribers(supabase) {
  const subscribersByEmail = new Map();

  for (let start = 0; ; start += SUBSCRIBER_PAGE_SIZE) {
    const { data, error, status } = await supabase
      .from("subscribers")
      .select("email, unsubscribe_token")
      .eq("status", "active")
      .not("email", "is", null)
      .neq("email", "")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(start, start + SUBSCRIBER_PAGE_SIZE - 1);

    if (error) {
      logSupabaseError(error, status, "subscriber query");
      throw new Error("Supabase subscriber query failed");
    }

    for (const subscriber of data ?? []) {
      const email =
        typeof subscriber.email === "string"
          ? subscriber.email.trim().toLowerCase()
          : "";
      const unsubscribeToken =
        typeof subscriber.unsubscribe_token === "string"
          ? subscriber.unsubscribe_token.trim()
          : "";

      if (email && isValidEmail(email)) {
        subscribersByEmail.set(email, {
          email,
          unsubscribeToken
        });
      }
    }

    if (!data || data.length < SUBSCRIBER_PAGE_SIZE) {
      break;
    }
  }

  return [...subscribersByEmail.values()];
}

function getConfiguration() {
  const supabaseUrl = normalizeEnvironmentValue(
    process.env.SUPABASE_URL
  )?.replace(/\/+$/, "");

  return {
    supabaseUrl,
    supabaseSecretKey: normalizeEnvironmentValue(
      process.env.SUPABASE_SECRET_KEY
    ),
    resendApiKey: normalizeEnvironmentValue(process.env.RESEND_API_KEY),
    adminSecret: normalizeEnvironmentValue(
      process.env.NEWSLETTER_ADMIN_SECRET
    ),
    fromEmail: normalizeEnvironmentValue(
      process.env.NEWSLETTER_FROM_EMAIL
    )
  };
}

function hasValidConfiguration(configuration) {
  return Boolean(
    configuration.supabaseUrl &&
      isValidSupabaseUrl(configuration.supabaseUrl) &&
      configuration.supabaseSecretKey &&
      configuration.resendApiKey &&
      configuration.adminSecret &&
      isSafeHeaderValue(configuration.fromEmail)
  );
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, {
      success: false,
      message: "仅支持 POST 请求。"
    });
  }

  let body;

  try {
    body = parseBody(request.body);
  } catch {
    return sendJson(response, 400, {
      success: false,
      message: "请求内容格式错误。"
    });
  }

  const configuration = getConfiguration();

  if (!hasValidConfiguration(configuration)) {
    console.error("Newsletter configuration is missing or invalid:", {
      hasSupabaseUrl: Boolean(configuration.supabaseUrl),
      hasValidSupabaseUrl: Boolean(
        configuration.supabaseUrl &&
          isValidSupabaseUrl(configuration.supabaseUrl)
      ),
      hasSupabaseSecretKey: Boolean(configuration.supabaseSecretKey),
      hasResendApiKey: Boolean(configuration.resendApiKey),
      hasNewsletterAdminSecret: Boolean(configuration.adminSecret),
      hasNewsletterFromEmail: Boolean(configuration.fromEmail)
    });

    return sendJson(response, 500, {
      success: false,
      message: FAILURE_MESSAGE
    });
  }

  const submittedAdminSecret =
    typeof body.adminSecret === "string" ? body.adminSecret.trim() : "";

  if (
    !isAdminRequestAuthorized(
      request,
      configuration.adminSecret,
      submittedAdminSecret
    )
  ) {
    return sendJson(response, 401, {
      success: false,
      message: "管理员密码错误。"
    });
  }

  const mode = body.mode === "test" ? "test" : body.mode === "broadcast"
    ? "broadcast"
    : "";
  const subject =
    typeof body.subject === "string" ? body.subject.trim() : "";
  const content =
    typeof body.content === "string" ? body.content.trim() : "";
  const testEmail =
    typeof body.testEmail === "string"
      ? body.testEmail.trim().toLowerCase()
      : "";

  if (
    !mode ||
    !subject ||
    subject.length > 200 ||
    !isSafeHeaderValue(subject) ||
    !content ||
    content.length > 10000 ||
    (mode === "test" && !isValidEmail(testEmail))
  ) {
    return sendJson(response, 400, {
      success: false,
      message: "请填写有效的邮件标题、正文和测试邮箱。"
    });
  }

  const siteUrl = getRequestSiteUrl(request);

  if (!siteUrl) {
    console.error("Newsletter request site URL could not be determined.");
    return sendJson(response, 500, {
      success: false,
      message: FAILURE_MESSAGE
    });
  }

  const supabase = createClient(
    configuration.supabaseUrl,
    configuration.supabaseSecretKey,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false
      },
      db: {
        schema: "public"
      }
    }
  );
  const resend = new Resend(configuration.resendApiKey);

  if (mode === "test") {
    const unsubscribeUrl = buildUnsubscribeUrl(siteUrl, "", true);
    const emailContent = buildEmailContent({
      subject,
      content,
      unsubscribeUrl
    });
    let error;

    try {
      ({ error } = await resend.emails.send({
        from: configuration.fromEmail,
        to: [testEmail],
        subject: `[测试] ${subject}`,
        html: emailContent.html,
        text: emailContent.text
      }));
    } catch (caughtError) {
      error = caughtError;
    }

    if (error) {
      logResendError(error, mode, 1);
      return sendJson(response, 502, {
        success: false,
        message: FAILURE_MESSAGE,
        totalSubscribers: 0,
        sentCount: 0,
        failedCount: 1,
        failedEmails: [testEmail]
      });
    }

    return sendJson(response, 200, {
      success: true,
      message: "测试邮件发送成功。",
      totalSubscribers: 0,
      sentCount: 1,
      failedCount: 0,
      failedEmails: []
    });
  }

  try {
    const subscribers = await getActiveSubscribers(supabase);
    const subscribersWithoutTokens = subscribers.filter(
      (subscriber) => !subscriber.unsubscribeToken
    );

    if (subscribersWithoutTokens.length > 0) {
      console.error("Active subscribers are missing unsubscribe tokens:", {
        count: subscribersWithoutTokens.length
      });

      return sendJson(response, 500, {
        success: false,
        message: "请先执行 Supabase newsletter 数据库升级 SQL。",
        totalSubscribers: subscribers.length,
        sentCount: 0,
        failedCount: 0,
        failedEmails: []
      });
    }

    if (subscribers.length === 0) {
      return sendJson(response, 200, {
        success: true,
        message: "当前没有 active 订阅用户。",
        totalSubscribers: 0,
        sentCount: 0,
        failedCount: 0,
        failedEmails: []
      });
    }

    let sentCount = 0;
    const failedEmails = [];

    for (let start = 0; start < subscribers.length; start += BATCH_SIZE) {
      const batchNumber = Math.floor(start / BATCH_SIZE) + 1;
      const batchSubscribers = subscribers.slice(start, start + BATCH_SIZE);
      const emails = batchSubscribers.map((subscriber) => {
        const unsubscribeUrl = buildUnsubscribeUrl(
          siteUrl,
          subscriber.unsubscribeToken,
          false
        );
        const emailContent = buildEmailContent({
          subject,
          content,
          unsubscribeUrl
        });

        return {
          from: configuration.fromEmail,
          to: [subscriber.email],
          subject,
          html: emailContent.html,
          text: emailContent.text
        };
      });
      let error;

      try {
        ({ error } = await resend.batch.send(emails));
      } catch (caughtError) {
        error = caughtError;
      }

      if (error) {
        logResendError(error, mode, batchNumber);
        failedEmails.push(
          ...batchSubscribers.map((subscriber) => subscriber.email)
        );
      } else {
        sentCount += batchSubscribers.length;
      }

      if (start + BATCH_SIZE < subscribers.length) {
        await wait(BATCH_DELAY_MS);
      }
    }

    const failedCount = failedEmails.length;
    const statusCode =
      failedCount === 0 ? 200 : sentCount > 0 ? 207 : 502;

    return sendJson(response, statusCode, {
      success: failedCount === 0,
      message:
        failedCount === 0
          ? `群发完成，共发送 ${sentCount} 封邮件。`
          : `群发完成，成功 ${sentCount} 封，失败 ${failedCount} 封。`,
      totalSubscribers: subscribers.length,
      sentCount,
      failedCount,
      failedEmails
    });
  } catch (error) {
    console.error("Newsletter broadcast failed:", {
      name: error?.name,
      message: error?.message
    });

    return sendJson(response, 500, {
      success: false,
      message: FAILURE_MESSAGE,
      totalSubscribers: 0,
      sentCount: 0,
      failedCount: 0,
      failedEmails: []
    });
  }
}
