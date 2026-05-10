const bcrypt = require("bcryptjs");
const cookie = require("cookie");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { query } = require("./db");
const { send } = require("./http");

function secret() {
  const configured = process.env.TAMU_APP_KEY || process.env.JWT_SECRET || "";
  if (configured && configured.length >= 24) {
    return configured;
  }
  const privateFallback = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.SUPABASE_DB_PASS || "";
  if (privateFallback.length >= 24) {
    return crypto.createHash("sha256").update(`tamu-auth:${privateFallback}`).digest("hex");
  }
  if (secureCookie()) {
    throw new Error("TAMU_APP_KEY or JWT_SECRET must be set to a strong value in production.");
  }
  return "dev-only-tamu-express-secret-change-before-production";
}

function secureCookie() {
  return process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
}

function issueAuth(res, claims) {
  const token = jwt.sign(claims, secret(), { expiresIn: "8h" });
  res.setHeader("Set-Cookie", cookie.serialize("TAMU_AUTH", token, {
    httpOnly: true,
    secure: secureCookie(),
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8
  }));
}

function clearAuth(res) {
  res.setHeader("Set-Cookie", cookie.serialize("TAMU_AUTH", "", {
    httpOnly: true,
    secure: secureCookie(),
    sameSite: "lax",
    path: "/",
    maxAge: 0
  }));
}

function claims(req) {
  const cookies = cookie.parse(req.headers.cookie || "");
  const token = cookies.TAMU_AUTH || "";
  if (!token) return null;
  try {
    return jwt.verify(token, secret());
  } catch {
    return null;
  }
}

function requireRole(req, res, roles) {
  const session = claims(req);
  const allowed = Array.isArray(roles) ? roles : [roles];
  if (!session?.role || !allowed.includes(session.role)) {
    send(res, 403, { ok: false, message: "Unauthorized access. Please login again." });
    return null;
  }
  return session;
}

async function verifyPassword(password, hash) {
  const normalizedHash = String(hash || "").replace(/^\$2y\$/, "$2a$");
  return bcrypt.compare(String(password || ""), normalizedHash);
}

async function findUserByEmail(email, role = "") {
  const rows = role
    ? await query("select * from users where lower(email) = lower($1) and role = $2 limit 1", [email, role])
    : await query("select * from users where lower(email) = lower($1) limit 1", [email]);
  return rows[0] || null;
}

module.exports = { claims, clearAuth, findUserByEmail, issueAuth, requireRole, verifyPassword };
