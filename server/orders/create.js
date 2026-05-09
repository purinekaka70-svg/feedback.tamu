const { getPool } = require("../_lib/db");
const { body, method, number, send, text } = require("../_lib/http");
const { normalizeStatus } = require("../_lib/market");

function publicId(value) {
  return text(value, 120) || `order-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function paymentStatus(value) {
  const normalized = String(value || "pending").toLowerCase().replace(/-/g, "_");
  if (normalized === "pending_payment") return "pending";
  if (normalized === "confirmed") return "paid";
  if (normalized === "partially_paid") return "submitted";
  return ["pending", "submitted", "paid", "failed"].includes(normalized) ? normalized : "pending";
}

async function existingBusinessId(client, value) {
  const id = Number(value || 0);
  if (!Number.isInteger(id) || id <= 0) return null;
  const result = await client.query("select id from businesses where id = $1 limit 1", [id]);
  return result.rows.length ? id : null;
}

module.exports = async function handler(req, res) {
  if (!method(req, res, "POST")) return;
  const client = await getPool().connect();
  try {
    const payload = await body(req);
    const items = Array.isArray(payload.items) ? payload.items : [];
    if (!items.length) {
      send(res, 422, { ok: false, message: "Order items are required." });
      return;
    }
    const id = publicId(payload.id);
    await client.query("begin");
    const businessIdCache = new Map();
    const businessIdFor = async (value) => {
      const key = String(value || "");
      if (!businessIdCache.has(key)) {
        businessIdCache.set(key, await existingBusinessId(client, value));
      }
      return businessIdCache.get(key);
    };
    const orderResult = await client.query(
      `insert into orders
       (public_id, customer_name, customer_phone, buyer_location, buyer_latitude, buyer_longitude,
        payment_method, payment_status, mpesa_name, mpesa_number, mpesa_reference, notes, store_summary,
        subtotal, delivery_fee, total, status)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       returning id`,
      [
        id,
        text(payload.customer, 120),
        text(payload.phone, 40),
        text(payload.buyerLocation, 220),
        number(payload.buyerLatitude),
        number(payload.buyerLongitude),
        text(payload.paymentMethod, 40),
        text(payload.paymentStatus || "pending_payment", 40),
        text(payload.mpesaName, 120),
        text(payload.mpesaNumber || payload.phone, 40),
        text(payload.mpesaReference, 120),
        text(payload.note, 500),
        text(payload.storeName, 220),
        number(payload.subtotal),
        number(payload.deliveryFee),
        number(payload.total),
        normalizeStatus(payload.status || "pending_payment", ["pending_payment", "paid", "confirmed", "processing", "delivering", "delivered", "cancelled"], "pending_payment")
      ]
    );
    const orderId = orderResult.rows[0].id;
    for (const item of items) {
      const businessId = await businessIdFor(item.businessId || item.storeId);
      const itemValues = [
        orderId,
        text(item.productId, 120),
        text(item.productName, 150),
        text(item.storeId, 120),
        businessId,
        text(item.storeName, 150),
        Math.max(1, Math.trunc(number(item.quantity))),
        number(item.unitPrice),
        number(item.lineTotal)
      ];
      try {
        await client.query(
          `insert into order_items
           (order_id, product_public_id, product_name, store_public_id, business_id, store_name, quantity, unit_price, line_total)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          itemValues
        );
      } catch (error) {
        if (error?.code !== "42703") throw error;
        await client.query(
          `insert into order_items
           (order_id, product_public_id, product_name, store_public_id, store_name, quantity, unit_price, line_total)
           values ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [itemValues[0], itemValues[1], itemValues[2], itemValues[3], itemValues[5], itemValues[6], itemValues[7], itemValues[8]]
        );
      }
    }
    for (const route of Array.isArray(payload.routeBreakdown) ? payload.routeBreakdown : []) {
      await client.query(
        `insert into order_route_breakdown (order_id, store_public_id, store_name, distance_km, route_fee, quantity, subtotal)
         values ($1,$2,$3,$4,$5,$6,$7)`,
        [orderId, text(route.storeId, 120), text(route.storeName, 150), number(route.distanceKm), number(route.fee), Math.trunc(number(route.quantity)), number(route.subtotal)]
      ).catch(() => {});
    }
    for (const payment of Array.isArray(payload.businessPayments) ? payload.businessPayments : []) {
      const reference = text(payment.reference || payload.mpesaReference, 120);
      if (!reference) continue;
      const businessId = await businessIdFor(payment.storeId || payment.businessId);
      const paymentValues = [id, businessId, text(payment.method || payload.paymentMethod, 40), reference, number(payment.amount), paymentStatus(payment.status)];
      try {
        await client.query(
          "insert into payments (order_public_id, business_id, method, reference, amount, status) values ($1,$2,$3,$4,$5,$6)",
          paymentValues
        );
      } catch (error) {
        if (error?.code !== "42703") throw error;
        await client.query(
          "insert into payments (order_public_id, method, reference, amount, status) values ($1,$2,$3,$4,$5)",
          [paymentValues[0], paymentValues[2], paymentValues[3], paymentValues[4], paymentValues[5]]
        );
      }
    }
    await client.query(
      "insert into deliveries (order_public_id, status, distance_km, delivery_fee) values ($1,$2,$3,$4)",
      [id, normalizeStatus(payload.deliveryStatus || "pending", ["pending", "assigned", "picked_up", "delivered", "cancelled"], "pending"), 0, number(payload.deliveryFee)]
    ).catch(() => {});
    if (payload.sessionId) {
      await client.query("delete from cart where session_id = $1", [text(payload.sessionId, 120)]).catch(() => {});
    }
    await client.query("commit");
    send(res, 201, { ok: true, message: "Order saved.", order: { id: orderId, publicId: id } });
  } catch (error) {
    await client.query("rollback").catch(() => {});
    console.error("Order create failed:", error);
    send(res, 500, { ok: false, message: "Failed to save order." });
  } finally {
    client.release();
  }
};
