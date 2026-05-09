const { requireRole } = require("../_lib/auth");
const { body, method, send, text } = require("../_lib/http");
const { query } = require("../_lib/db");

function offerId(value) {
  return text(value, 80) || `offer-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

module.exports = async function handler(req, res) {
  const session = requireRole(req, res, ["admin", "seller"]);
  if (!session) return;
  if (!method(req, res, "POST")) return;
  try {
    const payload = await body(req);
    if (session.role === "seller" && String(session.businessId || "") !== String(payload.storeId || "")) {
      send(res, 403, { ok: false, message: "You can only manage offers for your approved business." });
      return;
    }
    const id = offerId(payload.id);
    await query(
      `INSERT INTO seller_offers (public_id, seller_public_id, store_name, offer_title, offer_note, offer_expiry, offer_image)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE seller_public_id = VALUES(seller_public_id), store_name = VALUES(store_name), offer_title = VALUES(offer_title), offer_note = VALUES(offer_note), offer_expiry = VALUES(offer_expiry), offer_image = VALUES(offer_image)`,
      [id, text(payload.storeId, 120), text(payload.storeName, 150), text(payload.offerTitle, 150), text(payload.offerNote, 500), text(payload.offerExpiry, 80), text(payload.offerImage, 1048576)]
    );
    send(res, 200, { ok: true, message: "Seller offer saved.", offer: { publicId: id } });
  } catch {
    send(res, 500, { ok: false, message: "Failed to save seller offer." });
  }
};
