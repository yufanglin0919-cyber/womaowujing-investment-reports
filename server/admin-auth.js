import {
  createHmac,
  timingSafeEqual
} from "node:crypto";

const COOKIE_NAME = "newsletter_admin_session";
const SESSION_DURATION_SECONDS = 8 * 60 * 60;

export function normalizeEnvironmentValue(value) {
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

export function secretsMatch(receivedSecret, expectedSecret) {
  if (!receivedSecret || !expectedSecret) {
    return false;
  }

  const receivedBuffer = Buffer.from(receivedSecret);
  const expectedBuffer = Buffer.from(expectedSecret);

  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

function signSession(expiresAt, adminSecret) {
  return createHmac("sha256", adminSecret)
    .update(`newsletter-admin:${expiresAt}`)
    .digest("base64url");
}

function parseCookies(cookieHeader) {
  if (typeof cookieHeader !== "string") {
    return {};
  }

  return cookieHeader.split(";").reduce((cookies, entry) => {
    const separatorIndex = entry.indexOf("=");

    if (separatorIndex < 0) {
      return cookies;
    }

    const name = entry.slice(0, separatorIndex).trim();
    const value = entry.slice(separatorIndex + 1).trim();

    if (name) {
      cookies[name] = value;
    }

    return cookies;
  }, {});
}

function requestUsesHttps(request) {
  const forwardedProtocol = request.headers?.["x-forwarded-proto"];

  if (typeof forwardedProtocol === "string") {
    return forwardedProtocol.split(",")[0].trim() === "https";
  }

  return process.env.VERCEL === "1";
}

export function createAdminSessionCookie(request, adminSecret) {
  const expiresAt =
    Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS;
  const signature = signSession(expiresAt, adminSecret);
  const secureAttribute = requestUsesHttps(request) ? "; Secure" : "";

  return `${COOKIE_NAME}=${expiresAt}.${signature}; Max-Age=${SESSION_DURATION_SECONDS}; Path=/; HttpOnly; SameSite=Strict${secureAttribute}`;
}

export function clearAdminSessionCookie(request) {
  const secureAttribute = requestUsesHttps(request) ? "; Secure" : "";

  return `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict${secureAttribute}`;
}

export function hasValidAdminSession(request, adminSecret) {
  if (!adminSecret) {
    return false;
  }

  const cookies = parseCookies(request.headers?.cookie);
  const sessionValue = cookies[COOKIE_NAME];

  if (!sessionValue) {
    return false;
  }

  const separatorIndex = sessionValue.indexOf(".");

  if (separatorIndex < 1) {
    return false;
  }

  const expiresAtValue = sessionValue.slice(0, separatorIndex);
  const signature = sessionValue.slice(separatorIndex + 1);
  const expiresAt = Number(expiresAtValue);

  if (
    !Number.isInteger(expiresAt) ||
    expiresAt <= Math.floor(Date.now() / 1000) ||
    !signature
  ) {
    return false;
  }

  return secretsMatch(signature, signSession(expiresAt, adminSecret));
}

export function readBearerToken(authorizationHeader) {
  if (typeof authorizationHeader !== "string") {
    return "";
  }

  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

export function isAdminRequestAuthorized(
  request,
  adminSecret,
  submittedSecret = ""
) {
  if (hasValidAdminSession(request, adminSecret)) {
    return true;
  }

  const fallbackSecret =
    submittedSecret || readBearerToken(request.headers?.authorization);

  return secretsMatch(fallbackSecret, adminSecret);
}
