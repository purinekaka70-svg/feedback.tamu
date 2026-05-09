const { query, tableExists } = require("../_lib/db");
const { method, send } = require("../_lib/http");

const DEFAULTS = ["Supermarket", "Retail", "Wholesale"];

module.exports = async function handler(req, res) {
  if (!method(req, res, "GET")) return;
  try {
    const map = new Map(DEFAULTS.map((name, index) => [name.toLowerCase(), {
      id: `default-${index + 1}`,
      name,
      created_at: null,
      default: true
    }]));
    if (await tableExists("categories")) {
      const rows = await query("SELECT id, name, created_at FROM categories ORDER BY name ASC");
      rows.forEach((row) => {
        if (row.name) map.set(String(row.name).trim().toLowerCase(), row);
      });
    }
    send(res, 200, { ok: true, categories: [...map.values()] });
  } catch {
    send(res, 500, { ok: false, message: "Failed to load categories." });
  }
};
