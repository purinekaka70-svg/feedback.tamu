const bcrypt = require("bcryptjs");
const { getPool } = require("../_lib/db");
const { body, method, send, text } = require("../_lib/http");

module.exports = async function handler(req, res) {
  if (!method(req, res, "POST")) return;
  const pool = getPool();
  const client = await pool.connect();
  try {
    const payload = await body(req);
    const email = text(payload.email, 180).toLowerCase();
    const password = String(payload.password || "");
    const businessName = text(payload.businessName || payload.storeName || payload.name, 150);
    const ownerName = text(payload.sellerName || payload.ownerName, 150);
    const phone = text(payload.phone, 40);
    const type = text(payload.businessType || payload.type, 80);
    const location = text(payload.location || payload.county || payload.locationName, 180);
    if (!email || !password || !businessName || !ownerName) {
      send(res, 422, { ok: false, message: "Business name, seller name, email and password are required." });
      return;
    }
    const exists = await client.query("select id from users where lower(email) = lower($1) limit 1", [email]);
    if (exists.rows.length) {
      send(res, 409, { ok: false, message: "This seller email is already registered." });
      return;
    }
    await client.query("begin");
    const hash = await bcrypt.hash(password, 10);
    const userResult = await client.query(
      "insert into users (name, email, password, role, status) values ($1, $2, $3, 'seller', 'pending') returning id",
      [ownerName, email, hash]
    );
    const businessResult = await client.query(
      `insert into businesses
       (user_id, name, owner_name, phone, email, type, location_name, latitude, longitude, payment_methods,
        till_number, pochi_number, bank_account, delivery_availability, delivery_notes, logo, logo_image, status)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,$16,$17,'pending')
       returning id`,
      [
        userResult.rows[0].id,
        businessName,
        ownerName,
        phone,
        email,
        type || "Retail",
        location,
        Number(payload.latitude || 0),
        Number(payload.longitude || 0),
        JSON.stringify(payload.paymentOptions || []),
        text(payload.tillNumber, 80),
        text(payload.pochiNumber, 80),
        text(payload.bankAccount, 120),
        text(payload.deliveryAvailability, 80),
        text(payload.deliveryNotes, 500),
        text(payload.logo || payload.logoImage, 204800),
        text(payload.logoImage || payload.logo, 204800)
      ]
    );
    await client.query("commit");
    send(res, 201, {
      ok: true,
      message: "Your account has been submitted successfully. Please wait for admin approval.",
      seller: { id: businessResult.rows[0].id, status: "pending" }
    });
  } catch (error) {
    await client.query("rollback").catch(() => {});
    send(res, 500, {
      ok: false,
      message: "Seller registration failed.",
      error: String(error?.message || error).slice(0, 220)
    });
  } finally {
    client.release();
  }
};
