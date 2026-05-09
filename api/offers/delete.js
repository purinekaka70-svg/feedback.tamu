const { requireRole } = require("../_lib/auth");
const { query } = require("../_lib/db");
const { body, method, send } = require("../_lib/http");

module.exports = async function handler(req, res) {
  if (!method(req, res, "POST")) return;
  const session = requireRole(req, res, ["admin", "seller"]);
  if (!session) return;
  try {
    const payload = await body(req);
    if (session.role === "seller") {
      await query("delete from seller_offers where public_id = $1 and seller_public_id = $2", [String(payload.id || ""), String(session.businessId)]);
    } else {
      await query("delete from seller_offers where public_id = $1", [String(payload.id || "")]);
    }
    send(res, 200, { ok: true });
  } catch {
    send(res, 500, { ok: false, message: "Failed to delete offer." });
  }
};
