const { requireRole } = require("../_lib/auth");
const { query } = require("../_lib/db");
const { body, method, send, text } = require("../_lib/http");

function publicId(value) {
  return text(value, 120) || `offer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

module.exports = async function handler(req, res) {
  if (!method(req, res, "POST")) return;
  const session = requireRole(req, res, ["admin", "seller"]);
  if (!session) return;
  try {
    const payload = await body(req);
    const sellerId = Number(payload.businessId || payload.sellerId || payload.storeId || session.businessId || 0);
    if (session.role === "seller" && Number(session.businessId) !== sellerId) {
      send(res, 403, { ok: false, message: "You can only manage offers for your business." });
      return;
    }
    const id = publicId(payload.id || payload.publicId);
    const params = [
      id,
      String(sellerId),
      text(payload.storeName, 150),
      text(payload.title || payload.offerTitle, 150),
      text(payload.note || payload.offerNote, 500),
      text(payload.expires || payload.offerExpiry, 80),
      text(payload.image || payload.offerImage, 230400)
    ];
    await query(
      `insert into seller_offers (public_id, seller_public_id, store_name, offer_title, offer_note, offer_expiry, offer_image)
       values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (public_id) do update set
         seller_public_id=excluded.seller_public_id,
         store_name=excluded.store_name,
         offer_title=excluded.offer_title,
         offer_note=excluded.offer_note,
         offer_expiry=excluded.offer_expiry,
         offer_image=excluded.offer_image`,
      params
    );
    send(res, 201, { ok: true, offer: { id } });
  } catch {
    send(res, 500, { ok: false, message: "Failed to save offer." });
  }
};
