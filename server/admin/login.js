const { findUserByEmail, issueAuth, verifyPassword } = require("../_lib/auth");
const { query } = require("../_lib/db");
const { body, method, send, text } = require("../_lib/http");

async function verifySupabasePassword(password, hash) {
  if (!hash) return false;
  if (await verifyPassword(password, hash)) return true;
  const rows = await query("select crypt($1, $2) = $2 as ok", [String(password || ""), String(hash || "")]);
  return rows[0]?.ok === true;
}

module.exports = async function handler(req, res) {
  if (!method(req, res, "POST")) return;
  try {
    const payload = await body(req);
    const email = text(payload.email || payload.username, 180).toLowerCase();
    const password = String(payload.password || "");
    const admin = await findUserByEmail(email, "admin");
    const active = ["approved", "active"].includes(String(admin?.status || "").toLowerCase());
    if (!admin || !active || !(await verifySupabasePassword(password, admin.password))) {
      send(res, 401, { ok: false, message: "Invalid admin credentials." });
      return;
    }
    issueAuth(res, { userId: admin.id, role: "admin", email: admin.email });
    send(res, 200, { ok: true, user: { id: admin.id, name: admin.name, email: admin.email, role: "admin" } });
  } catch {
    send(res, 500, { ok: false, message: "Admin login failed." });
  }
};
