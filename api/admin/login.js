const { findUserByEmail, issueAuth, verifyPassword } = require("../_lib/auth");
const { body, method, send, text } = require("../_lib/http");

module.exports = async function handler(req, res) {
  if (!method(req, res, "POST")) return;

  try {
    const payload = await body(req);
    const username = text(payload.username, 180).toLowerCase();
    const password = text(payload.password, 255);
    if (!username || !password || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username)) {
      send(res, 422, { ok: false, message: "Enter a valid admin email and password." });
      return;
    }

    const admin = await findUserByEmail(username, "admin");
    const active = ["approved", "active"].includes(String(admin?.status || "").toLowerCase());
    if (!admin || !active || !(await verifyPassword(password, admin.password))) {
      send(res, 401, { ok: false, message: "Invalid admin credentials." });
      return;
    }

    issueAuth(res, { userId: admin.id, role: "admin" });
    send(res, 200, {
      ok: true,
      message: "Admin login successful.",
      admin: {
        id: admin.id,
        username: admin.email,
        displayName: admin.name
      }
    });
  } catch (error) {
    send(res, 500, { ok: false, message: "Database connection failed for admin login." });
  }
};
