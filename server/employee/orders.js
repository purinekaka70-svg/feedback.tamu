const { query } = require("../_lib/db");
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
  const target = countyKey(county);
  const textValue = orderCountyText(row);
  const derivedCounty = countyFromText(textValue);
  const normalizedText = countyKey(textValue);
  return countyKey(derivedCounty) === target || normalizedText.includes(target);
}

async function loadOrders() {
  let sql = `
    select o.*,
           string_agg(distinct coalesce(b.location_name, ''), ' ') as business_locations,
           coalesce(
             json_agg(
               distinct jsonb_build_object(
                 'productId', oi.product_public_id,
                 'productName', oi.product_name,
                 'storeId', oi.store_public_id,
                 'businessId', oi.business_id,
                 'storeName', oi.store_name,
                 'storeCounty', b.location_name,
                  'quantity', oi.quantity,
                  'unitPrice', oi.unit_price,
                  'lineTotal', oi.line_total
               )
             ) filter (where oi.id is not null),
             '[]'
           ) as items,
           coalesce(
             json_agg(
               distinct jsonb_build_object(
                 'storeId', rb.store_public_id,
                 'storeName', rb.store_name,
                 'distanceKm', rb.distance_km,
                 'routeFee', rb.route_fee,
                 'quantity', rb.quantity,
                 'subtotal', rb.subtotal
               )
             ) filter (where rb.id is not null),
             '[]'
           ) as route_breakdown,
           coalesce(
             json_agg(
               distinct jsonb_build_object(
                 'businessId', p.business_id,
                 'method', p.method,
                 'reference', p.reference,
                 'amount', p.amount,
                 'status', p.status
               )
             ) filter (where p.id is not null),
             '[]'
           ) as business_payments
      from orders o
      left join order_items oi on oi.order_id = o.id
      left join businesses b on b.id = oi.business_id or b.id::text = oi.store_public_id
      left join order_route_breakdown rb on rb.order_id = o.id
      left join payments p on p.order_public_id = o.public_id`;
  sql += " group by o.id order by o.created_at desc limit 300";
  return query(sql);
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
          ? requestedCounty
          : allowedCounty;
      const rows = (await loadOrders()).filter((row) => orderMatchesCounty(row, county));
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
          [id, status, `%${allowedCounty}%`]
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
