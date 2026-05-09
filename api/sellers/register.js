const bcrypt = require("bcryptjs");
const { getPool } = require("../_lib/db");
const { body, method, number, send, text } = require("../_lib/http");

module.exports = async function handler(req, res) {
  if (!method(req, res, "POST")) return;
  const payload = await body(req).catch(() => null);
  const email = text(payload?.email, 180).toLowerCase();
  const password = String(payload?.password || "");
  if (!email || !password || password.length < 8) {
    send(res, 422, { ok: false, message: "Enter a valid email and password with at least 8 characters." });
    return;
  }
  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    const [existing] = await connection.execute(
      `SELECT b.id AS business_id, u.id AS user_id
       FROM businesses b
       LEFT JOIN users u ON u.email = b.email
       WHERE b.email = ? OR u.email = ?
       LIMIT 1`,
      [email, email]
    );
    if (existing.length) {
      send(res, 400, { ok: false, message: "Email already registered." });
      return;
    }
    await connection.beginTransaction();
    const hash = await bcrypt.hash(password, 10);
    const [userResult] = await connection.execute(
      "INSERT INTO users (name, phone, email, password, role, status) VALUES (?, ?, ?, ?, 'seller', 'pending')",
      [text(payload.ownerName || payload.storeName, 120), text(payload.phone, 40), email, hash]
    );
    const paymentMethods = JSON.stringify(Array.isArray(payload.paymentMethods) ? payload.paymentMethods : []);
    const [businessResult] = await connection.execute(
      `INSERT INTO businesses
       (user_id, name, owner_name, phone, email, type, location_name, latitude, longitude,
        payment_methods, till_number, pochi_number, bank_account, logo, logo_image, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        userResult.insertId,
        text(payload.storeName, 150),
        text(payload.ownerName, 120),
        text(payload.phone, 40),
        email,
        text(payload.businessType || "retail", 50),
        text(payload.location || "Nairobi", 120),
        number(payload.latitude),
        number(payload.longitude),
        paymentMethods,
        text(payload.tillNumber, 80),
        text(payload.pochiNumber, 80),
        text(payload.bankAccount || payload.cardAccount, 120),
        "",
        ""
      ]
    );
    await connection.commit();
    send(res, 200, { ok: true, seller: { id: String(businessResult.insertId), storeName: text(payload.storeName, 150), email, status: "pending" } });
  } catch {
    await connection.rollback().catch(() => undefined);
    send(res, 500, { ok: false, message: "Database error." });
  } finally {
    connection.release();
  }
};
