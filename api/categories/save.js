const { requireRole } = require("../_lib/auth");
const { body, method, send, text } = require("../_lib/http");
const { query } = require("../_lib/db");

module.exports = async function handler(req, res) {
  const session = requireRole(req, res, ["admin", "seller"]);
  if (!session) return;
  if (!method(req, res, "POST")) return;
  try {
    const payload = await body(req);
    const name = text(payload.name, 100).replace(/\s+/g, " ");
    const businessId = payload.businessId ? Number(payload.businessId) : null;
    if (!name) {
      send(res, 422, { ok: false, message: "Category name is required." });
      return;
    }
    if (session.role === "seller" && Number(session.businessId || 0) !== Number(businessId || 0)) {
      send(res, 403, { ok: false, message: "You can only manage categories for your approved business." });
      return;
    }
    const result = await query(
      "INSERT INTO categories (business_id, name, image) VALUES (?, ?, '') ON DUPLICATE KEY UPDATE name = VALUES(name)",
      [businessId, name]
    );
    send(res, 200, { ok: true, category: { id: result.insertId || null } });
  } catch {
    send(res, 500, { ok: false, message: "Failed to save category." });
  }
};
