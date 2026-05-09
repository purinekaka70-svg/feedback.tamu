const { requireRole } = require("../_lib/auth");
const { query } = require("../_lib/db");
const { body, method, send, text } = require("../_lib/http");
const { normalizeStatus } = require("../_lib/market");

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
        returning public_id`,
      params
    );
    if (!updated.length) {
      send(res, 403, { ok: false, message: "Unauthorized order access." });
      return;
    }
    if (paymentStatus) {
      const pay = paymentStatus === "confirmed" ? "paid" : paymentStatus === "pending_payment" ? "pending" : paymentStatus;
      const paymentParams = [updated[0].public_id || id, ["pending", "submitted", "paid", "failed"].includes(pay) ? pay : "submitted"];
      let paymentSql = "update payments set status = $2 where order_public_id = $1";
      if (session.role === "seller") {
        paymentParams.push(Number(session.businessId || 0));
        paymentSql += " and business_id = $3";
      }
      await query(paymentSql, paymentParams).catch(() => {});
    }
    send(res, 200, { ok: true });
  } catch {
    send(res, 500, { ok: false, message: "Failed to update order." });
  }
};
