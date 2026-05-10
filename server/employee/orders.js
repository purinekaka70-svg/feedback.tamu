const { query, tableExists } = require("../_lib/db");
const { employeeFromRequest, employeeIsAllowed } = require("../_lib/firebase-admin");
const { body, method, send, text } = require("../_lib/http");

const KENYA_COUNTIES = [
  "mombasa", "kwale", "kilifi", "tana river", "lamu", "taita taveta",
  "garissa", "wajir", "mandera", "marsabit", "isiolo", "meru",
  "tharaka nithi", "embu", "kitui", "machakos", "makueni", "nyandarua",
  "nyeri", "kirinyaga", "muranga", "kiambu", "turkana", "west pokot",
  "samburu", "trans nzoia", "uasin gishu", "elgeyo marakwet", "nandi",
  "baringo", "laikipia", "nakuru", "narok", "kajiado", "kericho",
  "bomet", "kakamega", "vihiga", "bungoma", "busia", "siaya", "kisumu",
  "homa bay", "migori", "kisii", "nyamira", "nairobi"
];

const COUNTY_ALIASES = {
  "taita-taveta": "taita taveta",
  "elgeyo-marakwet": "elgeyo marakwet",
  "homa-bay": "homa bay",
  "trans-nzoia": "trans nzoia",
  "tharaka-nithi": "tharaka nithi",
  "west-pokot": "west pokot"
};

function countyKey(value) {
  const cleaned = String(value || "")
    .toLowerCase()
    .replace(/county/g, "")
    .replace(/[^a-z0-9\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const normalized = COUNTY_ALIASES[cleaned] || cleaned;
  return normalized.replace(/[^a-z0-9]+/g, "");
}

function countyFromText(value) {
  const normalized = String(value || "")
    .toLowerCase()
    .replace(/county/g, "")
    .replace(/[^a-z0-9\s-]+/g, " ")
    .replace(/\s+/g, " ");
  const direct = KENYA_COUNTIES.find((county) => normalized.includes(county));
  return direct || "";
}

function isAllCounties(value) {
  return ["all", "allcounties", "countrywide", "national"].includes(
    String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "")
  );
}

function orderCountyText(row) {
  const parts = [
    row.buyer_location,
    row.store_summary,
    row.business_locations,
    JSON.stringify(row.items || []),
    JSON.stringify(row.route_breakdown || [])
  ];
  return parts.filter(Boolean).join(" ");
}

function orderMatchesCounty(row, county) {
  if (!county || isAllCounties(county)) return true;
  const target = countyKey(countyFromText(county) || county);
  const textValue = orderCountyText(row);
  const derivedCounty = countyFromText(textValue);
  const normalizedText = countyKey(textValue);
  const derivedKey = countyKey(derivedCounty);
  return derivedKey === target
    || normalizedText.includes(target)
    || Boolean(derivedKey && target.includes(derivedKey));
}

async function loadOrders() {
  const orders = await query("select * from orders order by created_at desc limit 300");
  const ids = orders.map((order) => order.id);
  const publicIds = orders.map((order) => order.public_id || String(order.id));
  if (!ids.length) return [];

  const [hasItems, hasRoutes, hasPayments, hasBusinesses] = await Promise.all([
    tableExists("order_items").catch(() => false),
    tableExists("order_route_breakdown").catch(() => false),
    tableExists("payments").catch(() => false),
    tableExists("businesses").catch(() => false)
  ]);

  const items = hasItems
    ? await query("select * from order_items where order_id = any($1::bigint[]) order by id asc", [ids]).catch(() => [])
    : [];
  const routes = hasRoutes
    ? await query("select * from order_route_breakdown where order_id = any($1::bigint[]) order by id asc", [ids]).catch(() => [])
    : [];
  const payments = hasPayments
    ? await query("select * from payments where order_public_id = any($1::text[]) order by id asc", [publicIds]).catch(() => [])
    : [];
  const businessIds = [...new Set(items.map((item) => Number(item.business_id || 0)).filter(Boolean))];
  const businesses = hasBusinesses && businessIds.length
    ? await query("select id, name, location_name from businesses where id = any($1::bigint[])", [businessIds]).catch(() => [])
    : [];
  const businessById = new Map(businesses.map((business) => [Number(business.id), business]));

  const itemsByOrder = new Map();
  items.forEach((item) => {
    const business = businessById.get(Number(item.business_id || 0));
    const list = itemsByOrder.get(item.order_id) || [];
    list.push({
      productId: item.product_public_id || "",
      productName: item.product_name || "",
      storeId: item.store_public_id || String(item.business_id || ""),
      businessId: String(item.business_id || item.store_public_id || ""),
      storeName: item.store_name || business?.name || "",
      storeCounty: business?.location_name || "",
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
      routeFee: Number(route.route_fee || 0),
      quantity: Number(route.quantity || 0),
      subtotal: Number(route.subtotal || 0)
    });
    routesByOrder.set(route.order_id, list);
  });

  const paymentsByOrder = new Map();
  payments.forEach((payment) => {
    const list = paymentsByOrder.get(payment.order_public_id) || [];
    list.push({
      businessId: String(payment.business_id || ""),
      method: payment.method || "",
      reference: payment.reference || "",
      amount: Number(payment.amount || 0),
      status: payment.status || "pending"
    });
    paymentsByOrder.set(payment.order_public_id, list);
  });

  return orders.map((order) => {
    const orderItems = itemsByOrder.get(order.id) || [];
    return {
      ...order,
      business_locations: orderItems.map((item) => item.storeCounty).filter(Boolean).join(" "),
      items: orderItems,
      route_breakdown: routesByOrder.get(order.id) || [],
      business_payments: paymentsByOrder.get(order.public_id || String(order.id)) || []
    };
  });
}

function normalizeOrderStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  if (["pending_payment", "paid", "confirmed", "processing", "delivering", "delivered", "cancelled"].includes(status)) {
    return status;
  }
  if (["assigned", "picked_up", "on_the_way"].includes(status)) {
    return "delivering";
  }
  return "processing";
}

function normalizeDeliveryStatus(value, fallback) {
  const status = String(value || fallback || "").trim().toLowerCase();
  if (["pending", "assigned", "picked_up", "delivered", "cancelled"].includes(status)) {
    return status;
  }
  if (["processing", "delivering", "on_the_way"].includes(status)) {
    return "picked_up";
  }
  return "assigned";
}

module.exports = async function handler(req, res) {
  if (!method(req, res, ["GET", "POST"])) return;
  try {
    const employee = await employeeFromRequest(req);
    if (!employeeIsAllowed(employee)) {
      send(res, 401, { ok: false, message: "Approved Firebase employee access is required." });
      return;
    }
    const allowedCounty = text(employee.county || employee.location || employee.assignedCounty || "All", 120);
    const allCounties = isAllCounties(allowedCounty);
    if (req.method === "GET") {
      const requestedCounty = text(new URL(req.url, "http://local").searchParams.get("county"), 120);
      const county = allCounties
        ? ""
        : requestedCounty && countyKey(requestedCounty) === countyKey(allowedCounty)
          ? countyFromText(requestedCounty) || requestedCounty
          : countyFromText(allowedCounty) || allowedCounty;
      const allRows = await loadOrders();
      const matchedRows = allRows.filter((row) => orderMatchesCounty(row, county));
      const rows = matchedRows.length || !county ? matchedRows : allRows;
      send(res, 200, { ok: true, orders: rows.map((row) => ({
        id: row.public_id || String(row.id),
        publicId: row.public_id || String(row.id),
        customer: row.customer_name,
        customerName: row.customer_name,
        phone: row.customer_phone,
        customerPhone: row.customer_phone,
        buyerLocation: row.buyer_location,
        buyerCounty: countyFromText(orderCountyText(row)) || county || "",
        buyerLatitude: Number(row.buyer_latitude || 0),
        buyerLongitude: Number(row.buyer_longitude || 0),
        paymentMethod: row.payment_method,
        paymentStatus: row.payment_status,
        mpesaName: row.mpesa_name,
        mpesaNumber: row.mpesa_number,
        mpesaReference: row.mpesa_reference,
        notes: row.notes,
        storeSummary: row.store_summary,
        items: row.items || [],
        routeBreakdown: row.route_breakdown || [],
        businessPayments: row.business_payments || [],
        deliveryStatus: row.status,
        status: row.status,
        subtotal: Number(row.subtotal || 0),
        deliveryFee: Number(row.delivery_fee || 0),
        total: Number(row.total || 0),
        createdAt: row.created_at
      })) });
      return;
    }
    const payload = await body(req);
    const id = text(payload.id || payload.publicId, 120);
    const status = normalizeOrderStatus(payload.status || payload.deliveryStatus);
    const deliveryStatus = normalizeDeliveryStatus(payload.deliveryStatus, status);
    const updated = allCounties
      ? await query(
          "update orders set status = $2::order_status where (public_id = $1 or id::text = $1) returning public_id",
          [id, status]
        )
      : await query(
          `update orders set status = $2::order_status
            where (public_id = $1 or id::text = $1)
              and exists (
                select 1
                  from orders eo
                  left join order_items eoi on eoi.order_id = eo.id
                  left join businesses eb on eb.id = eoi.business_id or eb.id::text = eoi.store_public_id
                 where eo.id = orders.id
                   and (
                     eo.buyer_location ilike $3
                     or eo.store_summary ilike $3
                     or eb.location_name ilike $3
                     or eoi.store_name ilike $3
                   )
              )
            returning public_id`,
          [id, status, `%${countyFromText(allowedCounty) || allowedCounty}%`]
        );
    if (!updated.length) {
      send(res, 403, { ok: false, message: "Order is outside your assigned county." });
      return;
    }
    await query("update deliveries set status = $2::delivery_status where order_public_id = $1", [updated[0].public_id || id, deliveryStatus]).catch(() => {});
    send(res, 200, { ok: true });
  } catch {
    send(res, 500, { ok: false, message: "Failed to load employee orders." });
  }
};
