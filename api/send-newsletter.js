import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const BATCH_SIZE = 100;
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

function normalizeEnvironmentValue(value) {
  const normalizedValue = value?.trim();

  if (
    normalizedValue?.length >= 2 &&
    ((normalizedValue.startsWith('"') && normalizedValue.endsWith('"')) ||
      (normalizedValue.startsWith("'") && normalizedValue.endsWith("'")))
  ) {
    return normalizedValue.slice(1, -1).trim();
  }

  return normalizedValue;
}

function isValidSupabaseUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".supabase.co");
  } catch {
    return false;
  }
}

function isValidArticleUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
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

function readBearerToken(authorizationHeader) {
  if (typeof authorizationHeader !== "string") {
    return "";
  }

  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

function secretsMatch(receivedSecret, expectedSecret) {
  const receivedBuffer = Buffer.from(receivedSecret);
  const expectedBuffer = Buffer.from(expectedSecret);

  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
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

function buildEmailContent({ title, summary, url }) {
  const safeTitle = escapeHtml(title);
  const safeSummary = escapeHtml(summary).replace(/\n/g, "<br />");
  const safeUrl = escapeHtml(url);

  return {
    html: `
      <div style="margin:0;background:#f5f7fb;padding:32px 16px;font-family:Arial,'PingFang SC','Microsoft YaHei',sans-serif;color:#172033;">
        <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e5e9f0;border-radius:16px;padding:32px;">
          <h1 style="margin:0 0 18px;font-size:26px;line-height:1.4;">${safeTitle}</h1>
          <p style="margin:0 0 26px;color:#4b5565;font-size:16px;line-height:1.8;">${safeSummary}</p>
          <p style="margin:0 0 30px;">
            <a href="${safeUrl}" style="color:#1457d9;font-size:16px;font-weight:600;text-decoration:none;">查看原文 →</a>
          </p>
          <p style="margin:0;padding-top:20px;border-top:1px solid #e5e9f0;color:#7a8494;font-size:13px;line-height:1.7;">${RISK_NOTICE}</p>
        </div>
      </div>
    `.trim(),
    text: `${title}\n\n${summary}\n\n查看原文：${url}\n\n${RISK_NOTICE}`
  };
}

function logSupabaseError(error, status) {
  console.error("Supabase subscriber query failed:", {
    status,
    message: error?.message,
    code: error?.code,
    details: error?.details,
    hint: error?.hint
  });
}

function logResendError(error, batchNumber) {
  console.error("Resend newsletter batch failed:", {
    batchNumber,
    statusCode: error?.statusCode,
    name: error?.name,
    message: error?.message
  });
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function getActiveSubscriberEmails(supabase) {
  const emails = new Set();

  for (let start = 0; ; start += SUBSCRIBER_PAGE_SIZE) {
    const { data, error, status } = await supabase
      .from("subscribers")
      .select("email")
      .eq("status", "active")
      .not("email", "is", null)
      .neq("email", "")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(start, start + SUBSCRIBER_PAGE_SIZE - 1);

    if (error) {
      logSupabaseError(error, status);
      throw new Error("Supabase subscriber query failed");
    }

    for (const subscriber of data ?? []) {
      const email =
        typeof subscriber.email === "string"
          ? subscriber.email.trim().toLowerCase()
          : "";

      if (email && isValidEmail(email)) {
        emails.add(email);
      }
    }

    if (!data || data.length < SUBSCRIBER_PAGE_SIZE) {
      break;
    }
  }

  return [...emails];
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, {
      success: false,
      message: "仅支持 POST 请求。"
    });
  }

  const adminSecret = normalizeEnvironmentValue(
    process.env.NEWSLETTER_ADMIN_SECRET
  );
  const receivedSecret = readBearerToken(request.headers?.authorization);

  if (!adminSecret) {
    console.error("Newsletter configuration is missing or invalid:", {
      hasNewsletterAdminSecret: false
    });

    return sendJson(response, 500, {
      success: false,
      message: FAILURE_MESSAGE
    });
  }

  if (!receivedSecret || !secretsMatch(receivedSecret, adminSecret)) {
    return sendJson(response, 401, {
      success: false,
      message: "未授权。"
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

  const subject =
    typeof body.subject === "string" ? body.subject.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const summary =
    typeof body.summary === "string" ? body.summary.trim() : "";
  const url = typeof body.url === "string" ? body.url.trim() : "";

  if (
    !subject ||
    subject.length > 200 ||
    !isSafeHeaderValue(subject) ||
    !title ||
    title.length > 200 ||
    !summary ||
    summary.length > 2000 ||
    !url ||
    url.length > 2048 ||
    !isValidArticleUrl(url)
  ) {
    return sendJson(response, 400, {
      success: false,
      message: "请提供有效的邮件主题、标题、摘要和原文链接。"
    });
  }

  const supabaseUrl = normalizeEnvironmentValue(
    process.env.SUPABASE_URL
  )?.replace(/\/+$/, "");
  const supabaseSecretKey = normalizeEnvironmentValue(
    process.env.SUPABASE_SECRET_KEY
  );
  const resendApiKey = normalizeEnvironmentValue(process.env.RESEND_API_KEY);
  const fromEmail = normalizeEnvironmentValue(
    process.env.NEWSLETTER_FROM_EMAIL
  );

  if (
    !supabaseUrl ||
    !isValidSupabaseUrl(supabaseUrl) ||
    !supabaseSecretKey ||
    !resendApiKey ||
    !isSafeHeaderValue(fromEmail)
  ) {
    console.error("Newsletter configuration is missing or invalid:", {
      hasSupabaseUrl: Boolean(supabaseUrl),
      hasValidSupabaseUrl: Boolean(
        supabaseUrl && isValidSupabaseUrl(supabaseUrl)
      ),
      hasSupabaseSecretKey: Boolean(supabaseSecretKey),
      hasResendApiKey: Boolean(resendApiKey),
      hasNewsletterAdminSecret: Boolean(adminSecret),
      hasNewsletterFromEmail: Boolean(fromEmail)
    });

    return sendJson(response, 500, {
      success: false,
      message: FAILURE_MESSAGE
    });
  }

  const supabase = createClient(supabaseUrl, supabaseSecretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false
    },
    db: {
      schema: "public"
    }
  });
  const resend = new Resend(resendApiKey);

  try {
    const recipients = await getActiveSubscriberEmails(supabase);

    if (recipients.length === 0) {
      return sendJson(response, 200, {
        success: true,
        message: "当前没有可发送的有效订阅用户。",
        sent: 0
      });
    }

    const content = buildEmailContent({ title, summary, url });
    let sent = 0;

    for (let start = 0; start < recipients.length; start += BATCH_SIZE) {
      const batchNumber = Math.floor(start / BATCH_SIZE) + 1;
      const batchRecipients = recipients.slice(start, start + BATCH_SIZE);
      const emails = batchRecipients.map((email) => ({
        from: fromEmail,
        to: [email],
        subject,
        html: content.html,
        text: content.text
      }));
      const { error } = await resend.batch.send(emails);

      if (error) {
        logResendError(error, batchNumber);
        return sendJson(response, 500, {
          success: false,
          message: FAILURE_MESSAGE,
          sent
        });
      }

      sent += batchRecipients.length;

      if (start + BATCH_SIZE < recipients.length) {
        await wait(BATCH_DELAY_MS);
      }
    }

    return sendJson(response, 200, {
      success: true,
      message: `邮件已发送给 ${sent} 位订阅用户。`,
      sent
    });
  } catch (error) {
    console.error("Newsletter sending failed:", {
      name: error?.name,
      message: error?.message
    });

    return sendJson(response, 500, {
      success: false,
      message: FAILURE_MESSAGE
    });
  }
}
