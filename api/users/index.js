const { requireRole } = require("../_lib/auth");
const { query } = require("../_lib/db");
const { method, send } = require("../_lib/http");

module.exports = async function handler(req, res) {
  if (!method(req, res, "GET")) return;
  if (!requireRole(req, res, "admin")) return;
  try {
    const users = await query("select id, name, email, role, status, created_at from users order by created_at desc");
    send(res, 200, { ok: true, users });
  } catch {
    send(res, 500, { ok: false, message: "Failed to load users." });
  }
};
