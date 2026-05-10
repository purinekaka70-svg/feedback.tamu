const { requireRole } = require("../_lib/auth");
const { query } = require("../_lib/db");
const { body, method, send } = require("../_lib/http");

module.exports = async function handler(req, res) {
  if (!method(req, res, "POST")) return;
  const session = requireRole(req, res, ["admin", "seller"]);
  if (!session) return;
  try {
    const payload = await body(req);
    const id = Number(payload.id);
    const rows = session.role === "seller"
      ? await query("delete from categories where id = $1 and business_id = $2 returning id", [id, Number(session.businessId)])
      : await query("delete from categories where id = $1 returning id", [id]);
    if (!rows.length) {
      send(res, 403, { ok: false, message: "Category was not found for your business." });
      return;
    }
    send(res, 200, { ok: true });
  } catch {
    send(res, 500, { ok: false, message: "Failed to delete category." });
  }
};
