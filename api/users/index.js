const { requireRole } = require("../_lib/auth");
const { query, tableExists } = require("../_lib/db");
const { method, send } = require("../_lib/http");

module.exports = async function handler(req, res) {
  const session = requireRole(req, res, "admin");
  if (!session) return;
  if (!method(req, res, "GET")) return;

  try {
    if (!(await tableExists("users"))) {
      send(res, 200, { ok: true, users: [] });
      return;
    }
    const rows = await query("SELECT id, name, email, phone, role, status, firebase_uid, created_at FROM users ORDER BY created_at DESC");
    send(res, 200, { ok: true, users: rows });
  } catch {
    send(res, 500, { ok: false, message: "Failed to load users." });
  }
};
