const { requireRole } = require("../_lib/auth");
const { query } = require("../_lib/db");
const { body, method, send, text } = require("../_lib/http");

const TABLES = {
  business: "businesses",
  seller: "businesses",
  product: "products",
  category: "categories",
  order: "orders",
  user: "users",
  offer: "seller_offers"
};

module.exports = async function handler(req, res) {
  if (!method(req, res, "POST")) return;
  if (!requireRole(req, res, "admin")) return;
  try {
    const payload = await body(req);
    const action = text(payload.action, 40);
    const type = text(payload.type || payload.target, 40);
    const table = TABLES[type];
    if (!table) {
      send(res, 422, { ok: false, message: "Unknown admin control target." });
      return;
    }
    const id = text(payload.id, 120);
    if (action === "delete") {
      if (type === "offer") {
        await query(`delete from ${table} where public_id = $1`, [id]);
      } else if (type === "order") {
        await query(`delete from ${table} where public_id = $1 or id::text = $1`, [id]);
      } else {
        await query(`delete from ${table} where id = $1`, [Number(id)]);
      }
      send(res, 200, { ok: true });
      return;
    }
    if (action === "status") {
      await query(`update ${table} set status = $2 where id = $1`, [Number(id), text(payload.status, 40)]);
      send(res, 200, { ok: true });
      return;
    }
    send(res, 422, { ok: false, message: "Unsupported admin action." });
  } catch {
    send(res, 500, { ok: false, message: "Admin action failed." });
  }
};
