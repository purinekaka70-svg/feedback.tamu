const bcrypt = require("bcryptjs");
const cookie = require("cookie");
const jwt = require("jsonwebtoken");
const { query } = require("./db");
const { send } = require("./http");

function secret() {
  return process.env.TAMU_APP_KEY || process.env.JWT_SECRET || "change-this-tamu-express-secret";
}

function issueAuth(res, claims) {
  const token = jwt.sign(claims, secret(), { expiresIn: "8h" });
  res.setHeader("Set-Cookie", cookie.serialize("TAMU_AUTH", token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8
  }));
}

function clearAuth(res) {
  res.setHeader("Set-Cookie", cookie.serialize("TAMU_AUTH", "", {
    httpOnly: true,
    secure: true,
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
    send(res, 401, { ok: false, message: "Unauthorized request." });
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
