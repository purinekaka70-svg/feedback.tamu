const { issueAuth, verifyPassword } = require("../_lib/auth");
const { query } = require("../_lib/db");
const { body, method, send, text } = require("../_lib/http");

function sellerPayload(row) {
  return {
    id: String(row.id),
    businessId: String(row.id),
    name: row.name,
    storeName: row.name,
    ownerName: row.owner_name || "",
    phone: row.phone || "",
    email: row.email || "",
    type: row.type || "retail",
    businessType: row.type || "retail",
    location: row.location_name || "",
    county: row.location_name || "",
    latitude: Number(row.latitude || 0),
    longitude: Number(row.longitude || 0),
    paymentOptions: row.payment_methods ? JSON.parse(row.payment_methods) : [],
    tillNumber: row.till_number || "",
    pochiNumber: row.pochi_number || "",
    bankAccount: row.bank_account || "",
    logo: row.logo_image || row.logo || "",
    logoImage: row.logo_image || row.logo || "",
    status: row.status || "pending"
  };
}

module.exports = async function handler(req, res) {
  if (!method(req, res, "POST")) return;
  try {
    const payload = await body(req);
    const email = text(payload.email, 180).toLowerCase();
    const password = text(payload.password, 255);
    const rows = await query(
      `SELECT b.*, u.password, u.status AS user_status
       FROM businesses b
       LEFT JOIN users u ON u.id = b.user_id OR u.email = b.email
       WHERE b.email = ?
       LIMIT 1`,
      [email]
    );
    const seller = rows[0];
    if (!seller || !seller.password || !(await verifyPassword(password, seller.password))) {
      send(res, 401, { ok: false, message: "Invalid seller credentials." });
      return;
    }
    const sellerStatus = String(seller.status || "pending");
    if (sellerStatus !== "approved" || String(seller.user_status || "approved").toLowerCase() !== "approved") {
      send(res, 403, { ok: false, message: "Your business account is not approved yet.", status: sellerStatus });
      return;
    }
    issueAuth(res, { userId: seller.user_id || null, businessId: seller.id, role: "seller" });
    send(res, 200, { ok: true, seller: sellerPayload(seller) });
  } catch {
    send(res, 500, { ok: false, message: "Seller login failed." });
  }
};
