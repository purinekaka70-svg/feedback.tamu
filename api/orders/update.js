const { requireRole } = require("../_lib/auth");
const { query } = require("../_lib/db");
const { body, method, send, text } = require("../_lib/http");
const { normalizeStatus } = require("../_lib/market");

module.exports = async function handler(req, res) {
  if (!method(req, res, "POST")) return;
  if (!requireRole(req, res, ["admin", "seller"])) return;
  try {
    const payload = await body(req);
    const id = text(payload.id || payload.publicId, 120);
    const status = normalizeStatus(payload.status, ["pending_payment", "paid", "confirmed", "processing", "delivering", "delivered", "cancelled"], "processing");
    const paymentStatus = text(payload.paymentStatus || "", 40);
    await query(
      `update orders
          set status = coalesce(nullif($2,''), status),
              payment_status = coalesce(nullif($3,''), payment_status)
        where public_id = $1 or id::text = $1`,
      [id, status, paymentStatus]
    );
    if (paymentStatus) {
      const pay = paymentStatus === "confirmed" ? "paid" : paymentStatus === "pending_payment" ? "pending" : paymentStatus;
      await query("update payments set status = $2 where order_public_id = $1", [id, ["pending", "submitted", "paid", "failed"].includes(pay) ? pay : "submitted"]).catch(() => {});
    }
    send(res, 200, { ok: true });
  } catch {
    send(res, 500, { ok: false, message: "Failed to update order." });
  }
};
