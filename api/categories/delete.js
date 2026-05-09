const { requireRole } = require("../_lib/auth");
const { body, method, send, text } = require("../_lib/http");
const { query } = require("../_lib/db");

module.exports = async function handler(req, res) {
  const session = requireRole(req, res, ["admin", "seller"]);
  if (!session) return;
  if (!method(req, res, "POST")) return;
  try {
    const payload = await body(req);
    const id = text(payload.id, 100);
    if (!id) {
      send(res, 422, { ok: false, message: "Category id is required." });
      return;
    }
    await query("DELETE FROM categories WHERE id = ? OR name = ?", [Number(id) || 0, id]);
    send(res, 200, { ok: true });
  } catch {
    send(res, 500, { ok: false, message: "Failed to delete category." });
  }
};
