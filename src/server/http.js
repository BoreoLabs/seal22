export function json(data, status = 200, extraHeaders = {}) {
  const headers = new Headers(extraHeaders);
  if (!headers.has("content-type")) headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { status, headers });
}

export function isSameOrigin(request) {
  const origin = request.headers.get("origin");
  let urlHost = "";
  try {
    urlHost = new URL(request.url).host;
  } catch {
    urlHost = "";
  }
  const forwarded = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ?? "";
  const host = request.headers.get("host") ?? "";
  const allowed = new Set([urlHost, forwarded, host].filter(Boolean));
  if (!origin || origin === "null") {
    const fetchSite = request.headers.get("sec-fetch-site");
    return !fetchSite || fetchSite === "same-origin" || fetchSite === "none";
  }
  try {
    return allowed.has(new URL(origin).host);
  } catch {
    return false;
  }
}

export function clientKey(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  const raw = forwarded ? forwarded.split(",")[0] : "local";
  return raw.trim().slice(0, 80) || "local";
}

const buckets = new Map();

export function rateLimit(key, { limit = 8, windowMs = 10 * 60 * 1000 } = {}) {
  const now = Date.now();
  const recent = (buckets.get(key) ?? []).filter((stamp) => now - stamp < windowMs);
  if (recent.length >= limit) {
    buckets.set(key, recent);
    return false;
  }
  recent.push(now);
  buckets.set(key, recent);
  return true;
}

export function sessionCookie(token, request) {
  return cookieHeader(`seal22_session=${encodeURIComponent(token)}`, request, 60 * 60 * 24 * 14);
}

export function clearSessionCookie(request) {
  return cookieHeader("seal22_session=", request, 0);
}

function cookieHeader(assignment, request, maxAge) {
  let secure = false;
  try {
    secure = new URL(request.url).protocol === "https:";
  } catch {
    secure = false;
  }
  const parts = [assignment, "HttpOnly", "Path=/", "SameSite=Lax", `Max-Age=${maxAge}`];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function readSessionToken(request) {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(/(?:^|;\s*)seal22_session=([^;]+)/);
  if (!match) return "";
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return "";
  }
}
