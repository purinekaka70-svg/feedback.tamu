const { query } = require("../_lib/db");
const { employeeFromRequest, employeeIsAllowed } = require("../_lib/firebase-admin");
const { body, method, send, text } = require("../_lib/http");

async function loadOrders(county) {
  const params = [];
  let sql = `
    select o.*,
           coalesce(
             json_agg(
               distinct jsonb_build_object(
                 'productId', oi.product_public_id,
                 'productName', oi.product_name,
                 'storeId', oi.store_public_id,
                 'businessId', oi.business_id,
                 'storeName', oi.store_name,
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
      left join order_route_breakdown rb on rb.order_id = o.id
      left join payments p on p.order_public_id = o.public_id`;
  const allCounties = ["all", "allcounties", "countrywide", "national"].includes(
    String(county || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "")
  );
  if (county && !allCounties) {
    params.push(`%${county}%`);
    sql += " where o.buyer_location ilike $1";
  }
  sql += " group by o.id order by o.created_at desc";
  return query(sql, params);
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
    const allCounties = ["all", "allcounties", "countrywide", "national"].includes(
      allowedCounty.toLowerCase().replace(/[^a-z0-9]+/g, "")
    );
    if (req.method === "GET") {
      const requestedCounty = text(new URL(req.url, "http://local").searchParams.get("county"), 120);
      const county = allCounties
        ? ""
        : requestedCounty && requestedCounty.toLowerCase() === allowedCounty.toLowerCase()
          ? requestedCounty
          : allowedCounty;
      const rows = await loadOrders(county);
      send(res, 200, { ok: true, orders: rows.map((row) => ({
        id: row.public_id || String(row.id),
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
          "update orders set status = $2::order_status where (public_id = $1 or id::text = $1) and buyer_location ilike $3 returning public_id",
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
