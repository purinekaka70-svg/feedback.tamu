const { requireRole } = require("../_lib/auth");
const { query } = require("../_lib/db");
const { body, method, send } = require("../_lib/http");

module.exports = async function handler(req, res) {
  if (!method(req, res, "POST")) return;
  const session = requireRole(req, res, ["admin", "seller"]);
  if (!session) return;
  try {
    const id = Number((await body(req)).id);
    if (session.role === "seller") {
      await query("delete from products where id = $1 and business_id = $2", [id, Number(session.businessId)]);
    } else {
      await query("delete from products where id = $1", [id]);
    }
    send(res, 200, { ok: true });
  } catch {
    send(res, 500, { ok: false, message: "Failed to delete product." });
  }
};
