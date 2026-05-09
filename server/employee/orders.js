const { query } = require("../_lib/db");
const { employeeFromRequest, employeeIsAllowed } = require("../_lib/firebase-admin");
const { body, method, send, text } = require("../_lib/http");

async function loadOrders(county) {
  const params = [];
  let sql = "select * from orders";
  if (county) {
    params.push(`%${county}%`);
    sql += " where buyer_location ilike $1";
  }
  sql += " order by created_at desc";
  return query(sql, params);
}

module.exports = async function handler(req, res) {
  if (!method(req, res, ["GET", "POST"])) return;
  try {
    const employee = await employeeFromRequest(req);
    if (!employeeIsAllowed(employee)) {
      send(res, 401, { ok: false, message: "Approved Firebase employee access is required." });
      return;
    }
    const allowedCounty = text(employee.county || employee.location || employee.assignedCounty, 120);
    if (req.method === "GET") {
      const requestedCounty = text(new URL(req.url, "http://local").searchParams.get("county"), 120);
      const county = requestedCounty && requestedCounty.toLowerCase() === allowedCounty.toLowerCase() ? requestedCounty : allowedCounty;
      const rows = await loadOrders(county);
      send(res, 200, { ok: true, orders: rows.map((row) => ({
        id: row.public_id || String(row.id),
        publicId: row.public_id || String(row.id),
        customer: row.customer_name,
        customerName: row.customer_name,
        phone: row.customer_phone,
        buyerLocation: row.buyer_location,
        paymentStatus: row.payment_status,
        deliveryStatus: row.status,
        status: row.status,
        total: Number(row.total || 0),
        createdAt: row.created_at
      })) });
      return;
    }
    const payload = await body(req);
    const id = text(payload.id || payload.publicId, 120);
    const status = text(payload.status || payload.deliveryStatus, 40);
    await query("update orders set status = $2 where (public_id = $1 or id::text = $1) and buyer_location ilike $3", [id, status, `%${allowedCounty}%`]);
    await query("update deliveries set status = $2 where order_public_id = $1", [id, status]).catch(() => {});
    send(res, 200, { ok: true });
  } catch {
    send(res, 500, { ok: false, message: "Failed to load employee orders." });
  }
};
