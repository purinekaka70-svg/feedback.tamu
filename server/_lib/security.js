const buckets = new Map();

function clientIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown")
    .split(",")[0]
    .trim()
    .slice(0, 80);
}

function rateLimit(req, res, key, options = {}) {
  const limit = Number(options.limit || 20);
  const windowMs = Number(options.windowMs || 60_000);
  const now = Date.now();
  const bucketKey = `${key}:${clientIp(req)}`;
  const current = buckets.get(bucketKey) || { count: 0, resetAt: now + windowMs };

  if (buckets.size > 5000) {
    for (const [storedKey, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(storedKey);
    }
  }

  if (current.resetAt <= now) {
    current.count = 0;
    current.resetAt = now + windowMs;
  }

  current.count += 1;
  buckets.set(bucketKey, current);

  if (current.count > limit) {
    res.statusCode = 429;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    securityHeaders(res);
    res.setHeader("Retry-After", String(Math.ceil((current.resetAt - now) / 1000)));
    res.end(JSON.stringify({ ok: false, message: "Too many requests. Try again shortly." }));
    return false;
  }

  return true;
}

function requestOrigin(req) {
  const value = String(req.headers.origin || req.headers.referer || "");
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function requestHostOrigin(req) {
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  if (!host) return "";
  const proto = String(req.headers["x-forwarded-proto"] || (req.socket?.encrypted ? "https" : "http")).split(",")[0].trim();
  return `${proto || "https"}://${host}`;
}

function sameOrigin(req) {
  const origin = requestOrigin(req);
  if (!origin) return true;
  return origin === requestHostOrigin(req);
}

function requireSameOrigin(req, res) {
  if (["GET", "HEAD", "OPTIONS"].includes(String(req.method || "").toUpperCase())) {
    return true;
  }
  if (sameOrigin(req)) return true;
  res.statusCode = 403;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  securityHeaders(res);
  res.end(JSON.stringify({ ok: false, message: "Cross-site request blocked." }));
  return false;
}

function securityHeaders(res) {
  const connectSources = [
    "'self'",
    "https://identitytoolkit.googleapis.com",
    "https://securetoken.googleapis.com",
    "https://*.googleapis.com"
  ].join(" ");
  const csp = [
    "default-src 'self'",
    `script-src 'self' https://www.gstatic.com https://unpkg.com`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: https:",
    `connect-src ${connectSources}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'"
  ].join("; ");
  res.setHeader("Content-Security-Policy", csp);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), payment=()");
  res.setHeader("Cache-Control", "no-store");
  if (process.env.VERCEL === "1" || process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }
}

function logRequest(req, status = "") {
  if (process.env.NODE_ENV === "test") return;
  const method = String(req.method || "GET");
  const url = String(req.url || "").split("?")[0].slice(0, 160);
  const ip = clientIp(req);
  console.info(JSON.stringify({
    level: "info",
    event: "api_request",
    method,
    path: url,
    status,
    ip
  }));
}

module.exports = { rateLimit, requireSameOrigin, sameOrigin, securityHeaders, logRequest };
