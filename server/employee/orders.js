const { query } = require("../_lib/db");
const { claims } = require("../_lib/auth");
const { employeeFromRequest, employeeIsAllowed } = require("../_lib/firebase-admin");
const { body, method, send, text } = require("../_lib/http");

async function loadOrders(county) {
  const params = [];
  let sql = "select * from orders";
  const allCounties = ["all", "allcounties", "countrywide", "national"].includes(
    String(county || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "")
  );
  if (county && !allCounties) {
    params.push(`%${county}%`);
    sql += " where buyer_location ilike $1";
  }
  sql += " order by created_at desc";
  return query(sql, params);
}

module.exports = async function handler(req, res) {
  if (!method(req, res, ["GET", "POST"])) return;
  try {
    const session = claims(req);
    const employee = session?.role === "employee"
      ? {
          id: session.employeeId || session.userId || session.email,
          email: session.email,
          role: "employee",
          status: session.status || "approved",
          county: session.county || session.assignedCounty || session.location,
          active: true,
          approved: true
        }
      : await employeeFromRequest(req);
    if (!employeeIsAllowed(employee)) {
      send(res, 401, { ok: false, message: "Approved employee access is required." });
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
    const updated = allCounties
      ? await query(
          "update orders set status = $2 where (public_id = $1 or id::text = $1) returning public_id",
          [id, status]
        )
      : await query(
          "update orders set status = $2 where (public_id = $1 or id::text = $1) and buyer_location ilike $3 returning public_id",
          [id, status, `%${allowedCounty}%`]
        );
    if (!updated.length) {
      send(res, 403, { ok: false, message: "Order is outside your assigned county." });
      return;
    }
    await query("update deliveries set status = $2 where order_public_id = $1", [updated[0].public_id || id, status]).catch(() => {});
    send(res, 200, { ok: true });
  } catch {
    send(res, 500, { ok: false, message: "Failed to load employee orders." });
  }
};
