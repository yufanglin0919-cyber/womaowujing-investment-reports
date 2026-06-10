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

  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!email || !isValidEmail(email)) {
    return sendJson(response, 400, {
      success: false,
      message: INVALID_EMAIL_MESSAGE
    });
  }

  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseSecretKey) {
    return sendJson(response, 500, {
      success: false,
      message: FAILURE_MESSAGE
    });
  }

  const headers = {
    apikey: supabaseSecretKey,
    "Content-Type": "application/json",
    Prefer: "return=minimal"
  };

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
          email,
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

    let error = {};

    try {
      error = await supabaseResponse.json();
    } catch {
      error = {};
    }

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

    return sendJson(response, 500, {
      success: false,
      message: FAILURE_MESSAGE
    });
  } catch {
    return sendJson(response, 500, {
      success: false,
      message: FAILURE_MESSAGE
    });
  }
}
