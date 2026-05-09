const { claims } = require("../_lib/auth");
const { query } = require("../_lib/db");
const { method, send } = require("../_lib/http");

function publicOrder(row, items = [], routes = []) {
  return {
    id: row.public_id || String(row.id),
    numericId: row.id,
    publicId: row.public_id || String(row.id),
    customer: row.customer_name,
    customerName: row.customer_name,
    phone: row.customer_phone,
    customerPhone: row.customer_phone,
    buyerLocation: row.buyer_location,
    buyerLatitude: Number(row.buyer_latitude || 0),
    buyerLongitude: Number(row.buyer_longitude || 0),
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    mpesaName: row.mpesa_name || "",
    mpesaNumber: row.mpesa_number || "",
    mpesaReference: row.mpesa_reference || "",
    note: row.notes || "",
    storeName: row.store_summary || "",
    subtotal: Number(row.subtotal || 0),
    deliveryFee: Number(row.delivery_fee || 0),
    total: Number(row.total || 0),
    status: row.status || "pending_payment",
    createdAt: row.created_at || "",
    items,
    routeBreakdown: routes
  };
}

module.exports = async function handler(req, res) {
  if (!method(req, res, "GET")) return;
  try {
    const url = new URL(req.url, "http://local");
    const session = claims(req);
    const businessId = Number(url.searchParams.get("businessId") || (session?.role === "seller" ? session.businessId : 0) || 0);
    const params = [];
    let sql = "select distinct o.* from orders o";
    if (businessId) {
      sql += " join order_items oi on oi.order_id = o.id where oi.business_id = $1 or oi.store_public_id = $2";
      params.push(businessId, String(businessId));
    }
    sql += " order by o.created_at desc";
    const orders = await query(sql, params);
    const ids = orders.map((order) => order.id);
    const items = ids.length
      ? await query("select * from order_items where order_id = any($1::bigint[]) order by id asc", [ids])
      : [];
    const routes = ids.length
      ? await query("select * from order_route_breakdown where order_id = any($1::bigint[]) order by id asc", [ids])
      : [];
    const itemsByOrder = new Map();
    items.forEach((item) => {
      const list = itemsByOrder.get(item.order_id) || [];
      list.push({
        productId: item.product_public_id || "",
        productName: item.product_name || "",
        storeId: item.store_public_id || String(item.business_id || ""),
        businessId: String(item.business_id || item.store_public_id || ""),
        storeName: item.store_name || "",
        quantity: Number(item.quantity || 0),
        unitPrice: Number(item.unit_price || 0),
        lineTotal: Number(item.line_total || 0)
      });
      itemsByOrder.set(item.order_id, list);
    });
    const routesByOrder = new Map();
    routes.forEach((route) => {
      const list = routesByOrder.get(route.order_id) || [];
      list.push({
        storeId: route.store_public_id || "",
        storeName: route.store_name || "",
        distanceKm: Number(route.distance_km || 0),
        fee: Number(route.route_fee || 0),
        quantity: Number(route.quantity || 0),
        subtotal: Number(route.subtotal || 0)
      });
      routesByOrder.set(route.order_id, list);
    });
    send(res, 200, { ok: true, orders: orders.map((order) => publicOrder(order, itemsByOrder.get(order.id) || [], routesByOrder.get(order.id) || [])) });
  } catch {
    send(res, 500, { ok: false, message: "Failed to load orders." });
  }
};
