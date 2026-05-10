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

function securityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), payment=()");
  res.setHeader("Cache-Control", "no-store");
}

module.exports = { rateLimit, securityHeaders };
