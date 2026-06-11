import {
  clearAdminSessionCookie,
  createAdminSessionCookie,
  hasValidAdminSession,
  normalizeEnvironmentValue,
  secretsMatch
} from "../../server/admin-auth.js";

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

export default function handler(request, response) {
  const adminSecret = normalizeEnvironmentValue(
    process.env.NEWSLETTER_ADMIN_SECRET
  );

  if (!adminSecret) {
    console.error("Newsletter admin authentication is not configured.");
    return sendJson(response, 500, {
      success: false,
      authenticated: false,
      message: "管理员验证暂不可用。"
    });
  }

  if (request.method === "GET") {
    const authenticated = hasValidAdminSession(request, adminSecret);

    return sendJson(response, authenticated ? 200 : 401, {
      success: authenticated,
      authenticated,
      message: authenticated ? "管理员已登录。" : "请先输入管理员密码。"
    });
  }

  if (request.method === "DELETE") {
    response.setHeader("Set-Cookie", clearAdminSessionCookie(request));
    return sendJson(response, 200, {
      success: true,
      authenticated: false,
      message: "已退出管理员登录。"
    });
  }

  if (request.method !== "POST") {
    response.setHeader("Allow", "GET, POST, DELETE");
    return sendJson(response, 405, {
      success: false,
      authenticated: false,
      message: "不支持该请求方式。"
    });
  }

  let body;

  try {
    body = parseBody(request.body);
  } catch {
    return sendJson(response, 400, {
      success: false,
      authenticated: false,
      message: "管理员密码错误。"
    });
  }

  const submittedSecret =
    typeof body.adminSecret === "string" ? body.adminSecret.trim() : "";

  if (!secretsMatch(submittedSecret, adminSecret)) {
    return sendJson(response, 401, {
      success: false,
      authenticated: false,
      message: "管理员密码错误。"
    });
  }

  response.setHeader(
    "Set-Cookie",
    createAdminSessionCookie(request, adminSecret)
  );

  return sendJson(response, 200, {
    success: true,
    authenticated: true,
    message: "管理员验证成功。"
  });
}
