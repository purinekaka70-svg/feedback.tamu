const { requireRole } = require("../_lib/auth");
const { query, tableExists } = require("../_lib/db");
const { method, send } = require("../_lib/http");

module.exports = async function handler(req, res) {
  const session = requireRole(req, res, ["admin", "seller"]);
  if (!session) return;
  if (!method(req, res, "GET")) return;
  try {
    if (!(await tableExists("payments"))) {
      send(res, 200, { ok: true, payments: [] });
      return;
    }
    const rows = await query("SELECT * FROM payments ORDER BY created_at DESC");
    send(res, 200, { ok: true, payments: rows });
  } catch {
    send(res, 500, { ok: false, message: "Failed to load payments." });
  }
};
