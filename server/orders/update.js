const { requireRole } = require("../_lib/auth");
const { getPool, query } = require("../_lib/db");
const { body, method, send, text } = require("../_lib/http");
const { normalizeStatus } = require("../_lib/market");

function compactError(error) {
  return [error?.code, error?.constraint, error?.column, error?.table, error?.message]
    .filter(Boolean)
    .join(" | ")
    .slice(0, 260);
}

module.exports = async function handler(req, res) {
  if (!method(req, res, "POST")) return;
  const session = requireRole(req, res, ["admin", "seller"]);
  if (!session) return;
  try {
    const payload = await body(req);
    const id = text(payload.id || payload.publicId, 120);
    const status = normalizeStatus(payload.status, ["pending_payment", "paid", "confirmed", "processing", "delivering", "delivered", "cancelled"], "processing");
    const paymentStatus = text(payload.paymentStatus || "", 40);
    const params = [id, status, paymentStatus];
    let where = "(public_id = $1 or id::text = $1)";
    if (session.role === "seller") {
      params.push(Number(session.businessId || 0), String(session.businessId || ""));
      where += ` and exists (
        select 1 from order_items oi
         where oi.order_id = orders.id
           and (oi.business_id = $4 or oi.store_public_id = $5)
      )`;
    }
    const updated = await query(
      `update orders
          set status = coalesce(nullif($2,''), status),
              payment_status = coalesce(nullif($3,''), payment_status)
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
      const businessId = Number(session.businessId || 0) || null;
      const pool = getPool();
      if (session.role === "seller" && businessId) {
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
