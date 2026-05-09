const { requireRole } = require("../_lib/auth");
const { query } = require("../_lib/db");
const { body, method, send, text } = require("../_lib/http");

module.exports = async function handler(req, res) {
  if (!method(req, res, "POST")) return;
  const session = requireRole(req, res, ["admin", "seller"]);
  if (!session) return;
  try {
    const payload = await body(req);
    const businessId = payload.businessId ? Number(payload.businessId) : null;
    if (session.role === "seller" && Number(session.businessId) !== Number(businessId)) {
      send(res, 403, { ok: false, message: "You can only manage categories for your business." });
      return;
    }
    const name = text(payload.name || payload.categoryName, 100);
    if (!name) {
      send(res, 422, { ok: false, message: "Category name is required." });
      return;
    }
    const found = businessId
      ? await query("select id from categories where business_id = $1 and lower(name) = lower($2) limit 1", [businessId, name])
      : await query("select id from categories where business_id is null and lower(name) = lower($1) limit 1", [name]);
    if (found[0]) {
      const rows = await query("update categories set image = coalesce(nullif($2,''), image) where id = $1 returning id", [found[0].id, text(payload.image, 153600)]);
      send(res, 200, { ok: true, category: { id: rows[0].id, name, businessId } });
      return;
    }
    const rows = await query("insert into categories (business_id, name, image) values ($1, $2, $3) returning id", [businessId, name, text(payload.image, 153600)]);
    send(res, 201, { ok: true, category: { id: rows[0].id, name, businessId } });
  } catch {
    send(res, 500, { ok: false, message: "Failed to save category." });
  }
};
