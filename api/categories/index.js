const { query } = require("../_lib/db");
const { method, send } = require("../_lib/http");
const { DEFAULT_CATEGORIES, key, slug } = require("../_lib/market");

module.exports = async function handler(req, res) {
  if (!method(req, res, "GET")) return;
  try {
    const map = new Map(DEFAULT_CATEGORIES.map((name) => [key(name), { id: slug(name), name, image: "", default: true }]));
    const rows = await query("select id, business_id, name, image from categories order by name asc");
    rows.forEach((row) => map.set(`${row.business_id || ""}-${key(row.name)}`, {
      id: String(row.id),
      businessId: row.business_id ? String(row.business_id) : "",
      name: row.name,
      image: row.image || ""
    }));
    send(res, 200, { ok: true, categories: [...map.values()] });
  } catch {
    send(res, 500, { ok: false, message: "Failed to load categories." });
  }
};
