const { requireRole } = require("../_lib/auth");
const { getPool } = require("../_lib/db");
const { body, method, send, text } = require("../_lib/http");

module.exports = async function handler(req, res) {
  if (!method(req, res, "POST")) return;
  const session = requireRole(req, res, ["admin", "seller"]);
  if (!session) return;
  const client = await getPool().connect();
  try {
    const id = text((await body(req)).id, 120);
    await client.query("begin");
    const params = [id];
    let sql = "select id, public_id from orders where (public_id = $1 or id::text = $1)";
    if (session.role === "seller") {
      params.push(Number(session.businessId || 0), String(session.businessId || ""));
      sql += ` and exists (
        select 1 from order_items oi
         where oi.order_id = orders.id
           and (oi.business_id = $2 or oi.store_public_id = $3)
      )`;
    }
    sql += " limit 1";
    const rows = await client.query(sql, params);
    const order = rows.rows[0];
    if (!order && session.role === "seller") {
      await client.query("rollback").catch(() => {});
      send(res, 403, { ok: false, message: "Unauthorized order access." });
      return;
    }
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
