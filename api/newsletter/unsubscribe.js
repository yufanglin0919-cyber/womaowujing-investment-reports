import { createClient } from "@supabase/supabase-js";

const FAILURE_MESSAGE = "退订失败，请稍后再试。";

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

function isValidUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function logSupabaseError(error, status) {
  console.error("Supabase newsletter unsubscribe failed:", {
    status,
    message: error?.message,
    code: error?.code,
    details: error?.details,
    hint: error?.hint
  });
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
      message: "退订链接无效。"
    });
  }

  const token = typeof body.token === "string" ? body.token.trim() : "";

  if (!token || !isValidUuid(token)) {
    return sendJson(response, 400, {
      success: false,
      message: "退订链接无效。"
    });
  }

  const supabaseUrl = normalizeEnvironmentValue(
    process.env.SUPABASE_URL
  )?.replace(/\/+$/, "");
  const supabaseSecretKey = normalizeEnvironmentValue(
    process.env.SUPABASE_SECRET_KEY
  );

  if (
    !supabaseUrl ||
    !isValidSupabaseUrl(supabaseUrl) ||
    !supabaseSecretKey
  ) {
    console.error("Newsletter unsubscribe configuration is missing:", {
      hasSupabaseUrl: Boolean(supabaseUrl),
      hasValidSupabaseUrl: Boolean(
        supabaseUrl && isValidSupabaseUrl(supabaseUrl)
      ),
      hasSupabaseSecretKey: Boolean(supabaseSecretKey)
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

  try {
    const { data, error, status } = await supabase
      .from("subscribers")
      .update({
        status: "unsubscribed",
        unsubscribed_at: new Date().toISOString()
      })
      .eq("unsubscribe_token", token)
      .select("id")
      .maybeSingle();

    if (error) {
      logSupabaseError(error, status);
      return sendJson(response, 500, {
        success: false,
        message: FAILURE_MESSAGE
      });
    }

    if (!data) {
      return sendJson(response, 404, {
        success: false,
        message: "退订链接无效或已经失效。"
      });
    }

    return sendJson(response, 200, {
      success: true,
      message: "你已成功退订，后续将不再收到邮件更新。"
    });
  } catch (error) {
    logSupabaseError(error, error?.status);
    return sendJson(response, 500, {
      success: false,
      message: FAILURE_MESSAGE
    });
  }
}
