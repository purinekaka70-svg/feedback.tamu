const { claims } = require("../_lib/auth");
const { getPool } = require("../_lib/db");
const { body, method, send, text } = require("../_lib/http");

async function tableExists(client, table) {
  const result = await client.query(
    "select 1 from information_schema.tables where table_schema = 'public' and table_name = $1 limit 1",
    [table]
  );
  return result.rows.length > 0;
}

async function columnExists(client, table, column) {
  const result = await client.query(
    "select 1 from information_schema.columns where table_schema = 'public' and table_name = $1 and column_name = $2 limit 1",
    [table, column]
  );
  return result.rows.length > 0;
}

function compactError(error) {
  return [error?.code, error?.constraint, error?.column, error?.table, error?.message]
    .filter(Boolean)
    .join(" | ")
    .slice(0, 260);
}

module.exports = async function handler(req, res) {
  if (!method(req, res, "POST")) return;
  const session = claims(req);
  let client;
  try {
    client = await getPool().connect();
    const payload = await body(req);
    const id = text(payload.id, 120);
    const phone = text(payload.phone, 40);
    if (!id) {
      send(res, 422, { ok: false, message: "Order id is required." });
      return;
    }
    if (!session?.role && !phone) {
      send(res, 403, { ok: false, message: "Customer phone is required to delete this order." });
      return;
    }
    const hasOrderItemsBusinessId = await columnExists(client, "order_items", "business_id");
    const hasRouteBreakdown = await tableExists(client, "order_route_breakdown") && await columnExists(client, "order_route_breakdown", "order_id");
    const hasPayments = await tableExists(client, "payments") && await columnExists(client, "payments", "order_public_id");
    const hasDeliveries = await tableExists(client, "deliveries") && await columnExists(client, "deliveries", "order_public_id");
    await client.query("begin");
    const params = [id];
    let sql = "select id, public_id from orders where (public_id = $1 or id::text = $1)";
    if (session?.role === "seller") {
      params.push(Number(session.businessId || 0), String(session.businessId || ""));
      sql += hasOrderItemsBusinessId
        ? ` and exists (
            select 1 from order_items oi
             where oi.order_id = orders.id
              and (oi.business_id = $2 or oi.store_public_id = $3)
          )`
        : ` and exists (
            select 1 from order_items oi
             where oi.order_id = orders.id
              and oi.store_public_id = $3
          )`;
    } else if (session?.role !== "admin") {
      params.push(phone);
      sql += " and customer_phone = $2";
    }
    sql += " limit 1";
    const rows = await client.query(sql, params);
    const order = rows.rows[0];
    if (!order) {
      await client.query("rollback").catch(() => {});
      send(res, 403, { ok: false, message: "Order was not found for this customer." });
      return;
    }
    await client.query("delete from order_items where order_id = $1", [order.id]);
    if (hasRouteBreakdown) {
      await client.query("delete from order_route_breakdown where order_id = $1", [order.id]);
    }
    if (hasPayments) {
      await client.query("delete from payments where order_public_id = $1", [order.public_id]);
    }
    if (hasDeliveries) {
      await client.query("delete from deliveries where order_public_id = $1", [order.public_id]);
    }
    await client.query("delete from orders where id = $1", [order.id]);
    await client.query("commit");
    send(res, 200, { ok: true });
  } catch (error) {
    await client?.query("rollback").catch(() => {});
    send(res, 500, { ok: false, message: "Failed to delete order.", detail: compactError(error) });
  } finally {
    client?.release();
  }
};
