const { requireRole } = require("../_lib/auth");
const { body, method, send, text } = require("../_lib/http");
const { query, tableExists } = require("../_lib/db");

module.exports = async function handler(req, res) {
  const session = requireRole(req, res, ["admin", "seller"]);
  if (!session) return;
  if (!method(req, res, "POST")) return;

  try {
    const payload = await body(req);
    const id = text(payload.id, 80);
    const status = text(payload.status, 40);
    const paymentStatus = text(payload.paymentStatus, 40);
    const paymentRef = text(payload.paymentRef || payload.mpesaReference, 120);
    const sets = [];
    const params = [];

    if (!id) {
      send(res, 422, { ok: false, message: "Order id is required." });
      return;
    }
    if (status) {
      if (!["pending_payment", "paid", "processing", "delivered", "cancelled"].includes(status)) {
        send(res, 422, { ok: false, message: "Invalid order status." });
        return;
      }
      sets.push("status = ?");
      params.push(status);
    }
    if (paymentStatus) {
      if (!["pending", "pending_payment", "submitted", "partially_paid", "paid", "confirmed", "failed", "refunded"].includes(paymentStatus)) {
        send(res, 422, { ok: false, message: "Invalid payment status." });
        return;
      }
      sets.push("payment_status = ?");
      params.push(paymentStatus);
    }
    if (paymentRef) {
      sets.push("mpesa_reference = ?");
      params.push(paymentRef);
    }
    if (!sets.length) {
      send(res, 422, { ok: false, message: "No updates provided." });
      return;
    }

    params.push(id);
    await query(`UPDATE orders SET ${sets.join(", ")} WHERE public_id = ?`, params);
    if (paymentStatus && await tableExists("payments")) {
      await query("UPDATE payments SET status = ? WHERE order_public_id = ?", [paymentStatus, id]);
    }
    if (status && await tableExists("deliveries")) {
      const deliveryStatus = status === "delivered" ? "delivered" : status === "cancelled" ? "cancelled" : "processing";
      await query("UPDATE deliveries SET status = ? WHERE order_public_id = ?", [deliveryStatus, id]);
    }
    send(res, 200, { ok: true });
  } catch {
    send(res, 500, { ok: false, message: "Failed to update order." });
  }
};
