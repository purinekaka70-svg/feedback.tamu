const { requireRole } = require("../_lib/auth");
const { query } = require("../_lib/db");
const { body, method, number, send, text } = require("../_lib/http");

module.exports = async function handler(req, res) {
  const session = requireRole(req, res, ["admin", "seller"]);
  if (!session) return;
  if (!method(req, res, "POST")) return;
  try {
    const payload = await body(req);
    const id = String(payload.id || "");
    if (session.role === "seller" && String(session.businessId || "") !== id) {
      send(res, 403, { ok: false, message: "You can only update your own business settings." });
      return;
    }
    const map = {
      location: ["location_name", text(payload.location, 500)],
      latitude: ["latitude", number(payload.latitude)],
      longitude: ["longitude", number(payload.longitude)],
      tillNumber: ["till_number", text(payload.tillNumber, 80)],
      pochiNumber: ["pochi_number", text(payload.pochiNumber, 80)],
      bankAccount: ["bank_account", text(payload.bankAccount, 120)],
      deliveryAvailability: ["delivery_availability", text(payload.deliveryAvailability, 80)],
      deliveryNotes: ["delivery_notes", text(payload.deliveryNotes, 500)]
    };
    const sets = [];
    const params = [];
    Object.entries(map).forEach(([key, [column, value]]) => {
      if (Object.prototype.hasOwnProperty.call(payload, key)) {
        sets.push(`${column} = ?`);
        params.push(value);
      }
    });
    if (Object.prototype.hasOwnProperty.call(payload, "paymentMethods")) {
      sets.push("payment_methods = ?");
      params.push(JSON.stringify(Array.isArray(payload.paymentMethods) ? payload.paymentMethods : []));
    }
    if (!sets.length) {
      send(res, 422, { ok: false, message: "No supported seller fields were provided." });
      return;
    }
    params.push(Number(id));
    await query(`UPDATE businesses SET ${sets.join(", ")} WHERE id = ?`, params);
    const rows = await query("SELECT * FROM businesses WHERE id = ? LIMIT 1", [Number(id)]);
    const seller = rows[0] || {};
    send(res, 200, { ok: true, seller: { ...seller, id: String(seller.id || id), businessId: String(seller.id || id), storeName: seller.name || "", location: seller.location_name || "", county: seller.location_name || "" } });
  } catch {
    send(res, 500, { ok: false, message: "Failed to update seller." });
  }
};
