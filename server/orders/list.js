const { claims } = require("../_lib/auth");
const { query } = require("../_lib/db");
const { method, send, text } = require("../_lib/http");

function publicOrder(row, items = [], routes = []) {
  const businessPayments = row.business_payments || [];
  const sellerPaymentStatus = businessPayments.reduce((statusMap, payment) => {
    statusMap[String(payment.storeId || payment.businessId || "")] = payment.status || "pending_payment";
    return statusMap;
  }, {});
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
    ,
    businessPayments,
    sellerPaymentStatus,
    deliveryPayment: {
      tillNumber: "7312380",
      amount: Number(row.delivery_fee || 0),
      reference: row.mpesa_reference || "",
      status: row.mpesa_reference ? (row.payment_status === "paid" ? "paid" : "submitted") : "pending_payment"
    }
  };
}

module.exports = async function handler(req, res) {
  if (!method(req, res, "GET")) return;
  try {
    const url = new URL(req.url, "http://local");
    const session = claims(req);
    const businessId = Number(url.searchParams.get("businessId") || (session?.role === "seller" ? session.businessId : 0) || 0);
    const phone = text(url.searchParams.get("phone"), 40);
    const params = [];
    let sql = "select distinct o.* from orders o";
    if (businessId) {
      if (!["admin", "seller"].includes(String(session?.role || ""))) {
        send(res, 403, { ok: false, message: "Authenticated seller or admin access is required." });
        return;
      }
      if (session.role === "seller" && Number(session.businessId || 0) !== businessId) {
        send(res, 403, { ok: false, message: "Unauthorized seller order access." });
        return;
      }
      sql += " join order_items oi on oi.order_id = o.id where (oi.business_id = $1 or oi.store_public_id = $2)";
      params.push(businessId, String(businessId));
    } else if (session?.role !== "admin") {
      if (!phone) {
        send(res, 200, { ok: true, orders: [] });
        return;
      }
      sql += " where o.customer_phone = $1";
      params.push(phone);
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
    const payments = ids.length
      ? await query("select * from payments where order_public_id = any($1::text[]) order by id asc", [orders.map((order) => order.public_id || String(order.id))])
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
    const paymentsByPublicOrder = new Map();
    payments.forEach((payment) => {
      const list = paymentsByPublicOrder.get(payment.order_public_id) || [];
      const order = orders.find((entry) => String(entry.public_id || entry.id) === String(payment.order_public_id));
      const matchingItem = items.find((item) =>
        Number(item.order_id || 0) === Number(order?.id || 0)
        && Number(item.business_id || 0) === Number(payment.business_id || 0)
      );
      list.push({
        id: payment.id,
        storeId: String(payment.business_id || matchingItem?.store_public_id || ""),
        businessId: String(payment.business_id || matchingItem?.store_public_id || ""),
        storeName: matchingItem?.store_name || "Business",
        method: payment.method || "Direct payment",
        reference: payment.reference || "",
        amount: Number(payment.amount || 0),
        status: payment.status === "pending" ? "pending_payment" : payment.status || "pending_payment"
      });
      paymentsByPublicOrder.set(payment.order_public_id, list);
    });
    send(res, 200, {
      ok: true,
      orders: orders.map((order) => publicOrder(
        { ...order, business_payments: paymentsByPublicOrder.get(order.public_id || String(order.id)) || [] },
        itemsByOrder.get(order.id) || [],
        routesByOrder.get(order.id) || []
      ))
    });
  } catch {
    send(res, 500, { ok: false, message: "Failed to load orders." });
  }
};
