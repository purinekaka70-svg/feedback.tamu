const { requireRole } = require("../_lib/auth");
const { query } = require("../_lib/db");
const { body, method, send, text } = require("../_lib/http");

module.exports = async function handler(req, res) {
  if (!method(req, res, "POST")) return;
  const session = requireRole(req, res, ["admin", "seller"]);
  if (!session) return;
  try {
    const payload = await body(req);
    const businessId = Number(payload.id || payload.businessId || session.businessId || 0);
    if (session.role === "seller" && Number(session.businessId) !== businessId) {
      send(res, 403, { ok: false, message: "You can only update your own business." });
      return;
    }
    const rows = await query(
      `update businesses
          set name = coalesce(nullif($2,''), name),
              owner_name = coalesce(nullif($3,''), owner_name),
              phone = coalesce(nullif($4,''), phone),
              type = coalesce(nullif($5,''), type),
              location_name = coalesce(nullif($6,''), location_name),
              till_number = coalesce(nullif($7,''), till_number),
              pochi_number = coalesce(nullif($8,''), pochi_number),
              bank_account = coalesce(nullif($9,''), bank_account),
              delivery_availability = coalesce(nullif($10,''), delivery_availability),
              delivery_notes = coalesce(nullif($11,''), delivery_notes),
              logo_image = coalesce(nullif($12,''), logo_image)
        where id = $1
        returning id`,
      [
        businessId,
        text(payload.storeName || payload.name, 150),
        text(payload.ownerName, 150),
        text(payload.phone, 40),
        text(payload.businessType || payload.type, 80),
        text(payload.location || payload.county, 180),
        text(payload.tillNumber, 80),
        text(payload.pochiNumber, 80),
        text(payload.bankAccount, 120),
        text(payload.deliveryAvailability, 80),
        text(payload.deliveryNotes, 500),
        text(payload.logoImage || payload.logo, 204800)
      ]
    );
    send(res, 200, { ok: true, seller: { id: rows[0]?.id || businessId } });
  } catch {
    send(res, 500, { ok: false, message: "Failed to update seller profile." });
  }
};
