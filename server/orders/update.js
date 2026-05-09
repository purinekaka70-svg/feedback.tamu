const { claims } = require("../_lib/auth");
const { getPool, query } = require("../_lib/db");
const { body, method, send, text } = require("../_lib/http");
const { normalizeStatus } = require("../_lib/market");

function compactError(error) {
  return [error?.code, error?.constraint, error?.column, error?.table, error?.message]
    .filter(Boolean)
    .join(" | ")
    .slice(0, 260);
}

async function columnType(table, column) {
  const rows = await query(
    "select data_type, udt_name from information_schema.columns where table_schema = 'public' and table_name = $1 and column_name = $2 limit 1",
    [table, column]
  );
  return rows[0] || {};
}

module.exports = async function handler(req, res) {
  if (!method(req, res, "POST")) return;
  const session = claims(req);
  try {
    const payload = await body(req);
    const id = text(payload.id || payload.publicId, 120);
    const status = normalizeStatus(payload.status, ["pending_payment", "paid", "confirmed", "processing", "delivering", "delivered", "cancelled"], "processing");
    const paymentStatus = text(payload.paymentStatus || (status === "paid" ? "paid" : ""), 40);
    const actorBusinessId = Number(session?.businessId || payload.businessId || payload.storeId || 0) || 0;
    const isAdmin = session?.role === "admin";
    if (!isAdmin && !actorBusinessId) {
      send(res, 403, { ok: false, message: "Seller or admin access is required to update this order." });
      return;
    }
    const params = [id, status, paymentStatus];
    let where = "(public_id = $1 or id::text = $1)";
    if (!isAdmin) {
      params.push(actorBusinessId, String(actorBusinessId));
      where += ` and exists (
        select 1 from order_items oi
         where oi.order_id = orders.id
           and (oi.business_id = $4 or oi.store_public_id = $5)
      )`;
    }
    const statusColumn = await columnType("orders", "status");
    const paymentStatusColumn = await columnType("orders", "payment_status");
    const statusUpdate = statusColumn.udt_name === "order_status"
      ? "case when nullif($2,'') is null then status else $2::order_status end"
      : "coalesce(nullif($2,''), status)";
    const paymentStatusUpdate = paymentStatusColumn.udt_name === "payment_status"
      ? "case when nullif($3,'') is null then payment_status else $3::payment_status end"
      : "coalesce(nullif($3,''), payment_status)";
    const updated = await query(
      `update orders
          set status = ${statusUpdate},
              payment_status = ${paymentStatusUpdate}
        where ${where}
        returning id, public_id, mpesa_reference, payment_method`,
      params
    );
    if (!updated.length) {
      send(res, 403, { ok: false, message: "Unauthorized order access." });
      return;
    }
    if (paymentStatus) {
      const pay = paymentStatus === "confirmed" ? "paid" : paymentStatus === "pending_payment" ? "pending" : paymentStatus;
      const safePay = ["pending", "submitted", "paid", "failed"].includes(pay) ? pay : "submitted";
      const publicId = updated[0].public_id || id;
      const businessId = actorBusinessId || null;
      const pool = getPool();
      if (!isAdmin && businessId) {
        const paymentRows = await query(
          "update payments set status = $3 where order_public_id = $1 and business_id = $2 returning id",
          [publicId, businessId, safePay]
        ).catch(() => []);
        if (!paymentRows.length) {
          await pool.query(
            `insert into payments (order_public_id, business_id, method, reference, amount, status)
             select $1, $2, $3, $4, coalesce(sum(line_total), 0), $5
               from order_items
              where order_id = $6 and (business_id = $2 or store_public_id = $7)`,
            [
              publicId,
              businessId,
              text(updated[0].payment_method || "Business direct payment", 40),
              text(updated[0].mpesa_reference || "", 120),
              safePay,
              updated[0].id,
              String(businessId)
            ]
          ).catch(() => {});
        }
      } else {
        await query("update payments set status = $2 where order_public_id = $1", [publicId, safePay]).catch(() => {});
      }
    }
    send(res, 200, { ok: true });
  } catch (error) {
    send(res, 500, { ok: false, message: "Failed to update order.", detail: compactError(error) });
  }
};
