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

function logSupabaseError(error) {
  console.error("Supabase subscribers insert failed:", {
    message: error?.message,
    code: error?.code,
    details: error?.details,
    hint: error?.hint
  });
}

async function readSupabaseError(supabaseResponse) {
  const responseText = await supabaseResponse.text();

  if (!responseText) {
    return {
      message: `Supabase returned HTTP ${supabaseResponse.status}`,
      code: String(supabaseResponse.status),
      details: null,
      hint: null
    };
  }

  try {
    return JSON.parse(responseText);
  } catch {
    return {
      message: responseText,
      code: String(supabaseResponse.status),
      details: null,
      hint: null
    };
  }
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

  if (!supabaseUrl || !supabaseSecretKey) {
    console.error("Supabase subscription configuration is missing.");
    return sendJson(response, 500, {
      success: false,
      message: FAILURE_MESSAGE
    });
  }

  const headers = {
    apikey: supabaseSecretKey,
    "Content-Type": "application/json",
    "Content-Profile": "public",
    Prefer: "return=minimal"
  };

  // Legacy service-role keys are JWTs and also authenticate through Bearer.
  // New sb_secret_ keys authenticate through apikey and reject Bearer usage.
  if (supabaseSecretKey.startsWith("eyJ")) {
    headers.Authorization = `Bearer ${supabaseSecretKey}`;
  }

  try {
    const supabaseResponse = await fetch(
      `${supabaseUrl}/rest/v1/subscribers`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          email: normalizedEmail,
          status: "active",
          source: "website"
        })
      }
    );

    if (supabaseResponse.ok) {
      return sendJson(response, 201, {
        success: true,
        message: SUCCESS_MESSAGE
      });
    }

    const error = await readSupabaseError(supabaseResponse);

    const isDuplicate =
      supabaseResponse.status === 409 ||
      error.code === "23505" ||
      String(error.message ?? "").toLowerCase().includes("duplicate key");

    if (isDuplicate) {
      return sendJson(response, 409, {
        success: false,
        message: DUPLICATE_EMAIL_MESSAGE
      });
    }

    logSupabaseError(error);

    return sendJson(response, 500, {
      success: false,
      message: FAILURE_MESSAGE
    });
  } catch (error) {
    logSupabaseError(error);

    return sendJson(response, 500, {
      success: false,
      message: FAILURE_MESSAGE
    });
  }
}
