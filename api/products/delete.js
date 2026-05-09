const { requireRole } = require("../_lib/auth");
const { body, method, send } = require("../_lib/http");
const { query } = require("../_lib/db");

module.exports = async function handler(req, res) {
  const session = requireRole(req, res, ["admin", "seller"]);
  if (!session) return;
  if (!method(req, res, "POST")) return;
  try {
    const payload = await body(req);
    const id = Number(payload.id);
    if (!id) {
      send(res, 422, { ok: false, message: "Product id is required." });
      return;
    }
    if (session.role === "seller") {
      const rows = await query("SELECT business_id FROM products WHERE id = ? LIMIT 1", [id]);
      if (Number(rows[0]?.business_id || 0) !== Number(session.businessId || 0)) {
        send(res, 403, { ok: false, message: "You can only delete products from your business." });
        return;
      }
    }
    await query("DELETE FROM products WHERE id = ?", [id]);
    send(res, 200, { ok: true });
  } catch {
    send(res, 500, { ok: false, message: "Failed to delete product." });
  }
};
