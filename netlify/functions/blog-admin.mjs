import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "henry_blog_admin";
const SESSION_SECONDS = 12 * 60 * 60;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_FAILURES = 5;
const loginAttempts = new Map();

const BASE_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...BASE_HEADERS, ...headers },
  });
}

function adminConfiguration() {
  const config = {
    scriptUrl: String(process.env.HENRY_BLOG_APPS_SCRIPT_URL || "").trim(),
    adminSecret: String(process.env.HENRY_BLOG_ADMIN_SECRET || "").trim(),
    password: String(process.env.HENRY_BLOG_ADMIN_PASSWORD || ""),
    sessionSecret: String(process.env.HENRY_BLOG_SESSION_SECRET || "").trim(),
  };

  const missing = [];
  if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(config.scriptUrl)) {
    missing.push("HENRY_BLOG_APPS_SCRIPT_URL");
  }
  if (config.adminSecret.length < 32) missing.push("HENRY_BLOG_ADMIN_SECRET");
  if (config.password.length < 12) missing.push("HENRY_BLOG_ADMIN_PASSWORD");
  if (config.sessionSecret.length < 32) missing.push("HENRY_BLOG_SESSION_SECRET");
  return { config, missing };
}

function secureEqual(left, right) {
  const leftBytes = Buffer.from(String(left));
  const rightBytes = Buffer.from(String(right));
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}

function signature(value, secret) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function cookieValue(request) {
  const cookies = request.headers.get("cookie") || "";
  const match = cookies
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`));
  if (!match) return "";
  try {
    return decodeURIComponent(match.slice(COOKIE_NAME.length + 1));
  } catch {
    return "";
  }
}

function hasValidSession(request, secret) {
  const value = cookieValue(request);
  const separator = value.lastIndexOf(".");
  if (separator < 1) return false;
  const payload = value.slice(0, separator);
  const provided = value.slice(separator + 1);
  if (!secureEqual(provided, signature(payload, secret))) return false;

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return Number(session.expiresAt) > Date.now();
  } catch {
    return false;
  }
}

function sessionCookie(request, secret) {
  const payload = Buffer.from(
    JSON.stringify({ expiresAt: Date.now() + SESSION_SECONDS * 1000 }),
  ).toString("base64url");
  const value = `${payload}.${signature(payload, secret)}`;
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_SECONDS}${secure}`;
}

function expiredCookie(request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

function sameOrigin(request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

function clientKey(request, secret) {
  const raw =
    request.headers.get("x-nf-client-connection-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  return signature(raw, secret);
}

function loginBlocked(key) {
  const current = loginAttempts.get(key);
  if (!current) return false;
  if (current.until <= Date.now()) {
    loginAttempts.delete(key);
    return false;
  }
  return current.count >= MAX_LOGIN_FAILURES;
}

function recordLoginFailure(key) {
  const current = loginAttempts.get(key);
  if (!current || current.until <= Date.now()) {
    loginAttempts.set(key, { count: 1, until: Date.now() + LOGIN_WINDOW_MS });
    return;
  }
  current.count += 1;
  loginAttempts.set(key, current);
}

async function parseBody(request) {
  const raw = await request.text();
  if (raw.length > 150_000) throw new Error("PAYLOAD_TOO_LARGE");
  return raw ? JSON.parse(raw) : {};
}

async function callAppsScript(config, payload) {
  const response = await fetch(config.scriptUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain; charset=utf-8" },
    body: JSON.stringify({ ...payload, secret: config.adminSecret }),
    redirect: "follow",
    signal: AbortSignal.timeout(25_000),
  });
  const raw = await response.text();
  let result;
  try {
    result = JSON.parse(raw);
  } catch {
    throw new Error("UNREADABLE_UPSTREAM");
  }

  const status =
    typeof result.status === "number" && result.status >= 400 && result.status <= 599
      ? result.status
      : response.ok
        ? 200
        : 502;
  const body = { ...result };
  delete body.status;
  return json(body, status);
}

export default async function handler(request) {
  const incoming = new URL(request.url);
  const action = incoming.searchParams.get("action") || "session";
  const { config, missing } = adminConfiguration();

  if (missing.length) {
    return json(
      {
        error: `The admin is not configured yet. Add: ${missing.join(", ")}.`,
      },
      503,
    );
  }

  if (action === "session" && request.method === "GET") {
    return json({ ok: true, authenticated: hasValidSession(request, config.sessionSecret) });
  }

  if (action === "login" && request.method === "POST") {
    if (!sameOrigin(request)) return json({ error: "Invalid request origin." }, 403);
    const key = clientKey(request, config.sessionSecret);
    if (loginBlocked(key)) {
      return json(
        { error: "Too many attempts. Wait 15 minutes before trying again." },
        429,
      );
    }

    let body;
    try {
      body = await parseBody(request);
    } catch {
      return json({ error: "The login request is not valid." }, 400);
    }
    if (!secureEqual(String(body.password || ""), config.password)) {
      recordLoginFailure(key);
      return json({ error: "That password is not correct." }, 401);
    }

    loginAttempts.delete(key);
    return json(
      { ok: true, authenticated: true },
      200,
      { "Set-Cookie": sessionCookie(request, config.sessionSecret) },
    );
  }

  if (action === "logout" && request.method === "POST") {
    if (!sameOrigin(request)) return json({ error: "Invalid request origin." }, 403);
    return json(
      { ok: true, authenticated: false },
      200,
      { "Set-Cookie": expiredCookie(request) },
    );
  }

  if (!hasValidSession(request, config.sessionSecret)) {
    return json({ error: "Your admin session has expired.", authenticated: false }, 401);
  }

  try {
    if (action === "data" && request.method === "GET") {
      return await callAppsScript(config, { action: "adminData" });
    }

    if (!sameOrigin(request)) return json({ error: "Invalid request origin." }, 403);
    let body;
    try {
      body = await parseBody(request);
    } catch (error) {
      const message =
        error instanceof Error && error.message === "PAYLOAD_TOO_LARGE"
          ? "That post is too large."
          : "The request body is not valid JSON.";
      return json({ error: message }, 400);
    }

    if (action === "savePost" && request.method === "POST") {
      return await callAppsScript(config, {
        action: "adminSavePost",
        originalSlug: body.originalSlug,
        post: body.post,
      });
    }
    if (action === "deletePost" && request.method === "POST") {
      return await callAppsScript(config, {
        action: "adminDeletePost",
        slug: body.slug,
      });
    }
    if (action === "moderateComment" && request.method === "POST") {
      return await callAppsScript(config, {
        action: "adminModerateComment",
        id: body.id,
        status: body.status,
      });
    }
    return json({ error: "Unknown action." }, 400);
  } catch (error) {
    console.error(
      "Blog admin request failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return json(
      { error: "The blog database is temporarily unreachable. Please try again." },
      502,
    );
  }
}
