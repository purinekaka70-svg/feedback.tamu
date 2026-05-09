const { getPool, tableExists } = require("../_lib/db");
const { body, method, number, send, text } = require("../_lib/http");

function publicId(value) {
  return text(value, 80) || `order-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

module.exports = async function handler(req, res) {
  if (!method(req, res, "POST")) return;
  const payload = await body(req).catch(() => null);
  const items = Array.isArray(payload?.items) ? payload.items : [];
  if (!payload || !items.length) {
    send(res, 422, { ok: false, message: "Order items are required." });
    return;
  }

  const pool = getPool();
  const connection = await pool.getConnection();
  const id = publicId(payload.id);
  try {
    await connection.beginTransaction();
    const [orderResult] = await connection.execute(
      `INSERT INTO orders
       (public_id, customer_name, customer_phone, buyer_location, buyer_latitude, buyer_longitude,
        payment_method, payment_status, mpesa_name, mpesa_number, mpesa_reference, notes,
        store_summary, subtotal, delivery_fee, total, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        text(payload.customer, 120),
        text(payload.phone, 40),
        text(payload.buyerLocation, 220),
        number(payload.buyerLatitude),
        number(payload.buyerLongitude),
        text(payload.paymentMethod, 40),
        text(payload.paymentStatus || "pending", 40),
        text(payload.mpesaName, 120),
        text(payload.mpesaNumber || payload.phone, 40),
        text(payload.mpesaReference, 120),
        text(payload.note, 500),
        text(payload.storeName, 220),
        number(payload.subtotal),
        number(payload.deliveryFee),
        number(payload.total),
        text(payload.status || "pending_payment", 40)
      ]
    );
    const orderId = orderResult.insertId;
    for (const item of items) {
      await connection.execute(
        `INSERT INTO order_items (order_id, product_public_id, product_name, store_public_id, store_name, quantity, unit_price, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [orderId, text(item.productId, 120), text(item.productName, 150), text(item.storeId, 120), text(item.storeName, 150), Math.max(1, Number(item.quantity || 1)), number(item.unitPrice), number(item.lineTotal)]
      );
    }
    const routeBreakdown = Array.isArray(payload.routeBreakdown) ? payload.routeBreakdown : [];
    for (const route of routeBreakdown) {
      await connection.execute(
        `INSERT INTO order_route_breakdown (order_id, store_public_id, store_name, distance_km, route_fee, quantity, subtotal)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [orderId, text(route.storeId, 120), text(route.storeName, 150), number(route.distanceKm), number(route.fee), Number(route.quantity || 0), number(route.subtotal)]
      );
    }
    if (await tableExists("deliveries")) {
      const maxDistance = routeBreakdown.reduce((max, route) => Math.max(max, number(route.distanceKm)), 0);
      await connection.execute(
        "INSERT INTO deliveries (order_public_id, status, distance_km, delivery_fee) VALUES (?, ?, ?, ?)",
        [id, text(payload.deliveryStatus || "pending", 40), maxDistance, number(payload.deliveryFee)]
      );
    }
    if (payload.sessionId) {
      await connection.execute("DELETE FROM cart WHERE session_id = ?", [String(payload.sessionId)]);
    }
    await connection.commit();
    send(res, 200, { ok: true, message: "Order saved.", order: { id: orderId, publicId: id } });
  } catch {
    await connection.rollback().catch(() => undefined);
    send(res, 500, { ok: false, message: "Failed to save order." });
  } finally {
    connection.release();
  }
};
