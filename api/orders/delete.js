const { requireRole } = require("../_lib/auth");
const { getPool } = require("../_lib/db");
const { body, method, send, text } = require("../_lib/http");

module.exports = async function handler(req, res) {
  if (!method(req, res, "POST")) return;
  if (!requireRole(req, res, ["admin", "seller"])) return;
  const client = await getPool().connect();
  try {
    const id = text((await body(req)).id, 120);
    await client.query("begin");
    const rows = await client.query("select id, public_id from orders where public_id = $1 or id::text = $1 limit 1", [id]);
    const order = rows.rows[0];
    if (order) {
      await client.query("delete from order_items where order_id = $1", [order.id]);
      await client.query("delete from order_route_breakdown where order_id = $1", [order.id]);
      await client.query("delete from payments where order_public_id = $1", [order.public_id]);
      await client.query("delete from deliveries where order_public_id = $1", [order.public_id]);
      await client.query("delete from orders where id = $1", [order.id]);
    }
    await client.query("commit");
    send(res, 200, { ok: true });
  } catch {
    await client.query("rollback").catch(() => {});
    send(res, 500, { ok: false, message: "Failed to delete order." });
  } finally {
    client.release();
  }
};
