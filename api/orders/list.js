const { query, tableExists } = require("../_lib/db");
const { method, send } = require("../_lib/http");

function normalizeOrder(row, items = [], routes = []) {
  return {
    id: row.public_id || String(row.id),
    userId: row.customer_phone || row.user_id || "guest",
    customer: row.customer_name || "Customer",
    customerName: row.customer_name || "Customer",
    phone: row.customer_phone || "",
    customerPhone: row.customer_phone || "",
    buyerLocation: row.buyer_location || "",
    paymentMethod: row.payment_method || "",
    paymentStatus: row.payment_status || "pending",
    paymentRef: row.mpesa_reference || row.mpesa_ref || "",
    mpesaReference: row.mpesa_reference || row.mpesa_ref || "",
    note: row.notes || "",
    storeName: row.store_summary || "",
    subtotal: Number(row.subtotal || 0),
    deliveryFee: Number(row.delivery_fee || 0),
    total: Number(row.total || 0),
    status: row.status || "pending_payment",
    items,
    routeBreakdown: routes,
    createdAt: row.created_at
  };
}

module.exports = async function handler(req, res) {
  if (!method(req, res, "GET")) return;
  try {
    if (!(await tableExists("orders"))) {
      send(res, 200, { ok: true, orders: [] });
      return;
    }
    const businessId = String(req.query?.businessId || "").trim();
    const rows = await query("SELECT * FROM orders ORDER BY created_at DESC");
    const ids = rows.map((row) => row.id);
    const itemsByOrder = new Map();
    const routesByOrder = new Map();
    if (ids.length && await tableExists("order_items")) {
      const placeholders = ids.map(() => "?").join(",");
      const items = await query(`SELECT * FROM order_items WHERE order_id IN (${placeholders})`, ids);
      items.forEach((item) => {
        if (!itemsByOrder.has(item.order_id)) itemsByOrder.set(item.order_id, []);
        itemsByOrder.get(item.order_id).push({
          productId: item.product_public_id || item.product_id || "",
          productName: item.product_name,
          name: item.product_name,
          businessId: String(item.business_id || item.store_public_id || ""),
          storeId: String(item.business_id || item.store_public_id || ""),
          storeName: item.store_name || item.business_name || "",
          quantity: Number(item.quantity || 1),
          price: Number(item.unit_price || 0),
          unitPrice: Number(item.unit_price || 0),
          total: Number(item.line_total || 0),
          lineTotal: Number(item.line_total || 0)
        });
      });
    }
    if (ids.length && await tableExists("order_route_breakdown")) {
      const placeholders = ids.map(() => "?").join(",");
      const routes = await query(`SELECT * FROM order_route_breakdown WHERE order_id IN (${placeholders})`, ids);
      routes.forEach((route) => {
        if (!routesByOrder.has(route.order_id)) routesByOrder.set(route.order_id, []);
        routesByOrder.get(route.order_id).push(route);
      });
    }
    let orders = rows.map((row) => normalizeOrder(row, itemsByOrder.get(row.id) || [], routesByOrder.get(row.id) || []));
    if (businessId) {
      orders = orders.filter((order) => order.items.some((item) => String(item.businessId) === businessId || String(item.storeId) === businessId));
    }
    send(res, 200, { ok: true, orders });
  } catch {
    send(res, 500, { ok: false, message: "Failed to load orders." });
  }
};
