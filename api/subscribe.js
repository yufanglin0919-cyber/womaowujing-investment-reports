import { createClient } from "@supabase/supabase-js";

const INVALID_EMAIL_MESSAGE = "请输入有效邮箱。";
const DUPLICATE_EMAIL_MESSAGE = "你已经订阅过了。";
const SUCCESS_MESSAGE = "订阅成功，后续更新会发送到你的邮箱。";
const FAILURE_MESSAGE = "订阅失败，请稍后再试。";

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

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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

function logSupabaseError(error, status) {
  console.error("Supabase subscribers insert failed:", {
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
      message: FAILURE_MESSAGE
    });
  }

  let body;

  try {
    body = parseBody(request.body);
  } catch {
    return sendJson(response, 400, {
      success: false,
      message: INVALID_EMAIL_MESSAGE
    });
  }

  const normalizedEmail =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
    return sendJson(response, 400, {
      success: false,
      message: INVALID_EMAIL_MESSAGE
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
    !supabaseSecretKey ||
    !isValidSupabaseUrl(supabaseUrl)
  ) {
    console.error("Supabase subscription configuration is missing or invalid:", {
      hasSupabaseUrl: Boolean(supabaseUrl),
      hasSupabaseSecretKey: Boolean(supabaseSecretKey),
      hasValidSupabaseUrl: Boolean(
        supabaseUrl && isValidSupabaseUrl(supabaseUrl)
      )
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
    const { error, status } = await supabase
      .from("subscribers")
      .insert([
        {
          email: normalizedEmail,
          status: "active",
          source: "website"
        }
      ])
      .select("id")
      .single();

    const isDuplicate =
      status === 409 ||
      error?.code === "23505" ||
      String(error?.message ?? "").toLowerCase().includes("duplicate key");

    if (isDuplicate) {
      return sendJson(response, 409, {
        success: false,
        message: DUPLICATE_EMAIL_MESSAGE
      });
    }

    if (error) {
      logSupabaseError(error, status);

      return sendJson(response, 500, {
        success: false,
        message: FAILURE_MESSAGE
      });
    }

    return sendJson(response, 201, {
      success: true,
      message: SUCCESS_MESSAGE
    });
  } catch (error) {
    logSupabaseError(error, error?.status);

    return sendJson(response, 500, {
      success: false,
      message: FAILURE_MESSAGE
    });
  }
}
