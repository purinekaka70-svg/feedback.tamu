const { query, tableExists } = require("../_lib/db");
const { body, method, send, text } = require("../_lib/http");

function normalizeCounty(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function matchesCounty(order, items, county) {
  const target = normalizeCounty(county);
  if (!target) return false;
  const values = [order.buyer_location, order.store_summary, ...items.flatMap((item) => [item.store_name, item.business_name])];
  return values.some((value) => {
    const normalized = normalizeCounty(value);
    return normalized === target || normalized.includes(target);
  });
}

module.exports = async function handler(req, res) {
  if (!method(req, res, ["GET", "POST"])) return;
  const county = text(req.query?.county || "", 80);
  if (!req.headers.authorization?.startsWith("Bearer ")) {
    send(res, 401, { ok: false, message: "Valid Firebase employee token is required." });
    return;
  }
  if (!county) {
    send(res, 403, { ok: false, message: "Employee county is not configured." });
    return;
  }

  try {
    if (req.method === "POST") {
      const payload = await body(req);
      const id = text(payload.id, 80);
      const status = text(payload.status || payload.deliveryStatus, 40);
      if (!id || !["processing", "delivered", "cancelled"].includes(status)) {
        send(res, 422, { ok: false, message: "Invalid employee order update." });
        return;
      }
      await query("UPDATE orders SET status = ? WHERE public_id = ?", [status, id]);
      if (await tableExists("deliveries")) {
        await query("UPDATE deliveries SET status = ? WHERE order_public_id = ?", [status, id]);
      }
      send(res, 200, { ok: true, county });
      return;
    }

    const rows = await query("SELECT * FROM orders ORDER BY created_at DESC");
    const ids = rows.map((row) => row.id);
    const itemsByOrder = new Map();
    if (ids.length && await tableExists("order_items")) {
      const placeholders = ids.map(() => "?").join(",");
      const items = await query(`SELECT * FROM order_items WHERE order_id IN (${placeholders})`, ids);
      items.forEach((item) => {
        if (!itemsByOrder.has(item.order_id)) itemsByOrder.set(item.order_id, []);
        itemsByOrder.get(item.order_id).push(item);
      });
    }
    const orders = rows
      .filter((row) => matchesCounty(row, itemsByOrder.get(row.id) || [], county))
      .map((row) => {
        const items = itemsByOrder.get(row.id) || [];
        return {
          id: row.public_id || String(row.id),
          customer: row.customer_name,
          customerName: row.customer_name,
          phone: row.customer_phone,
          customerPhone: row.customer_phone,
          buyerLocation: row.buyer_location,
          county,
          paymentStatus: row.payment_status,
          storeName: row.store_summary,
          subtotal: Number(row.subtotal || 0),
          deliveryFee: Number(row.delivery_fee || 0),
          total: Number(row.total || 0),
          status: row.status,
          deliveryStatus: row.status === "delivered" ? "delivered" : row.status === "processing" ? "processing" : "pending",
          items: items.map((item) => ({
            productId: item.product_public_id,
            productName: item.product_name,
            name: item.product_name,
            storeId: item.store_public_id || item.business_id,
            businessId: item.store_public_id || item.business_id,
            storeName: item.store_name || item.business_name,
            quantity: Number(item.quantity || 1),
            unitPrice: Number(item.unit_price || 0),
            price: Number(item.unit_price || 0),
            lineTotal: Number(item.line_total || 0)
          })),
          createdAt: row.created_at
        };
      });
    send(res, 200, { ok: true, orders, county });
  } catch {
    send(res, 500, { ok: false, message: "Failed to load employee orders." });
  }
};
