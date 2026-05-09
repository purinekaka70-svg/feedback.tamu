const { requireRole } = require("../_lib/auth");
const { query } = require("../_lib/db");
const { body, method, send, text } = require("../_lib/http");
const { normalizeStatus, sellerFromBusiness } = require("../_lib/market");

module.exports = async function handler(req, res) {
  if (!method(req, res, ["GET", "POST"])) return;
  const session = requireRole(req, res, "admin");
  if (!session) return;
  try {
    if (req.method === "GET") {
      const rows = await query(
        `select id, user_id, name, owner_name, phone, email, type, location_name, latitude, longitude,
                payment_methods, till_number, pochi_number, bank_account, delivery_availability,
                delivery_notes, logo, logo_image, rating, status, created_at
           from businesses
          order by created_at desc`
      );
      send(res, 200, { ok: true, applications: rows.map(sellerFromBusiness), sellers: rows.map(sellerFromBusiness) });
      return;
    }
    const payload = await body(req);
    const id = Number(payload.id || payload.businessId || 0);
    const status = normalizeStatus(payload.status || payload.action, ["pending", "approved", "rejected", "blocked"], "pending");
    const rows = await query("update businesses set status = $2 where id = $1 returning id, user_id", [id, status]);
    if (rows[0]?.user_id) {
      await query("update users set status = $2 where id = $1", [rows[0].user_id, status === "approved" ? "approved" : status]);
    }
    send(res, 200, { ok: true, seller: { id, status } });
  } catch {
    send(res, 500, { ok: false, message: "Failed to update seller application." });
  }
};
