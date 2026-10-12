const { claims } = require("../_lib/auth");
const { query } = require("../_lib/db");
const { method, send, text } = require("../_lib/http");

function phoneDigits(value) {
  return String(value || "").replace(/\D/g, "").slice(-12);
}

function phoneTail(value) {
  return String(value || "").replace(/\D/g, "").slice(-9);
}

function publicOrder(row, items = [], routes = []) {
  const businessPayments = row.business_payments || [];
  const rawStatus = String(row.status || "pending_payment").toLowerCase();
  const rawPaymentStatus = String(row.payment_status || "").toLowerCase();
  const displayStatus = ["paid", "confirmed"].includes(rawPaymentStatus) && ["pending", "pending_payment", "paid"].includes(rawStatus)
    ? "paid"
    : rawStatus;
  const deliveryPaymentRecord = businessPayments.find((payment) => payment.isDelivery) || null;
  const sellerPayments = businessPayments.filter((payment) => !payment.isDelivery);
  const paymentStoreIds = new Set(sellerPayments.map((payment) => String(payment.storeId || payment.businessId || "")));
  items.forEach((item) => {
    const storeId = String(item.storeId || item.businessId || "");
    if (!storeId || paymentStoreIds.has(storeId)) return;
    businessPayments.push({
      storeId,
      businessId: storeId,
      storeName: item.storeName || "Business",
      method: row.payment_method || "Business direct payment",
      reference: "",
      amount: items
        .filter((entry) => String(entry.storeId || entry.businessId || "") === storeId)
        .reduce((sum, entry) => sum + Number(entry.lineTotal || 0), 0),
      status: ["paid", "confirmed"].includes(rawPaymentStatus) ? "paid" : "pending_payment"
    });
    paymentStoreIds.add(storeId);
  });
  const sellerPaymentStatus = sellerPayments.reduce((statusMap, payment) => {
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
    paymentStatus: row.payment_status === "pending" ? "pending_payment" : row.payment_status,
    mpesaName: row.mpesa_name || "",
    mpesaNumber: row.mpesa_number || "",
    mpesaReference: "",
    note: row.notes || "",
    storeName: row.store_summary || "",
    subtotal: Number(row.subtotal || 0),
    deliveryFee: Number(row.delivery_fee || 0),
    total: Number(row.total || 0),
    status: displayStatus,
    deliveryStatus: rawStatus,
    createdAt: row.created_at || "",
    items,
    routeBreakdown: routes,
    businessPayments: sellerPayments,
    sellerPaymentStatus,
    deliveryPayment: {
      tillNumber: "7312380",
      amount: Number(row.delivery_fee || 0),
      reference: deliveryPaymentRecord?.reference || "",
      status: deliveryPaymentRecord?.status || "pending_payment"
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
    const normalizedPhone = phoneDigits(phone);
    const normalizedPhoneTail = phoneTail(phone);
    const params = [];
    let fromWhere = "from orders o";
    if (businessId) {
      if (!["admin", "seller"].includes(String(session?.role || ""))) {
        send(res, 403, { ok: false, message: "Authenticated seller or admin access is required." });
        return;
      }
      if (session.role === "seller" && Number(session.businessId || 0) !== businessId) {
        send(res, 403, { ok: false, message: "Unauthorized seller order access." });
        return;
      }
      fromWhere += " join order_items oi on oi.order_id = o.id where (oi.business_id = $1 or oi.store_public_id = $2)";
      params.push(businessId, String(businessId));
    } else if (session?.role !== "admin") {
      if (!normalizedPhone) {
        send(res, 200, { ok: true, orders: [] });
        return;
      }
      fromWhere += ` where (
        right(regexp_replace(coalesce(o.customer_phone, ''), '\\D', '', 'g'), 12) = $1
        or right(regexp_replace(coalesce(o.customer_phone, ''), '\\D', '', 'g'), 9) = $2
      )`;
      params.push(normalizedPhone, normalizedPhoneTail);
    }
    const requestedLimit = Number.parseInt(url.searchParams.get("limit") || "50", 10);
    const paginated = session?.role === "seller" || url.searchParams.has("limit");
    const limit = Math.min(200, Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : 50));
    const requestedOffset = Number.parseInt(url.searchParams.get("offset") || "0", 10);
    const offset = Math.max(0, Number.isFinite(requestedOffset) ? requestedOffset : 0);
    const countRows = paginated
      ? await query(
        `select count(*)::int as total,
                count(*) filter (where coalesce(status, 'pending') not in ('delivered', 'cancelled'))::int as active,
                count(*) filter (where status = 'processing')::int as processing,
                count(*) filter (where payment_status = 'paid')::int as paid,
                coalesce(sum(total), 0) as revenue,
                coalesce(sum(delivery_fee), 0) as delivery
           from (select distinct o.id, o.status::text as status, o.payment_status, o.total, o.delivery_fee ${fromWhere}) scoped_orders`,
        params
      )
      : [];
    let sql = `select distinct o.* ${fromWhere} order by o.created_at desc, o.id desc`;
    const queryParams = [...params];
    if (paginated) {
      queryParams.push(limit, offset);
      sql += ` limit $${queryParams.length - 1} offset $${queryParams.length}`;
    }
    const orders = await query(sql, queryParams);
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
      const isDeliveryPayment = String(payment.method || "").toLowerCase().includes("delivery");
      list.push({
        id: payment.id,
        storeId: String(payment.business_id || matchingItem?.store_public_id || (isDeliveryPayment ? "delivery" : "")),
        businessId: String(payment.business_id || matchingItem?.store_public_id || (isDeliveryPayment ? "delivery" : "")),
        storeName: isDeliveryPayment ? "Tamu Express Delivery" : matchingItem?.store_name || "Business",
        method: payment.method || "Direct payment",
        reference: payment.reference || "",
        amount: Number(payment.amount || 0),
        status: payment.status === "pending" ? "pending_payment" : payment.status || "pending_payment",
        isDelivery: isDeliveryPayment
      });
      paymentsByPublicOrder.set(payment.order_public_id, list);
    });
    const payload = {
      ok: true,
      orders: orders.map((order) => publicOrder(
        { ...order, business_payments: paymentsByPublicOrder.get(order.public_id || String(order.id)) || [] },
        itemsByOrder.get(order.id) || [],
        routesByOrder.get(order.id) || []
      ))
    };
    if (paginated) {
      const total = Number(countRows[0]?.total || 0);
      payload.page = {
        limit,
        offset,
        returned: orders.length,
        total,
        active: Number(countRows[0]?.active || 0),
        processing: Number(countRows[0]?.processing || 0),
        paid: Number(countRows[0]?.paid || 0),
        revenue: Number(countRows[0]?.revenue || 0),
        delivery: Number(countRows[0]?.delivery || 0),
        hasMore: offset + orders.length < total
      };
    }
    send(res, 200, payload);
  } catch {
    send(res, 500, { ok: false, message: "Failed to load orders." });
  }
};
