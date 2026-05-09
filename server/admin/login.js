const { findUserByEmail, issueAuth, verifyPassword } = require("../_lib/auth");
const { body, method, send, text } = require("../_lib/http");

module.exports = async function handler(req, res) {
  if (!method(req, res, "POST")) return;
  try {
    const payload = await body(req);
    const email = text(payload.email || payload.username, 180).toLowerCase();
    const password = String(payload.password || "");
    const admin = await findUserByEmail(email, "admin");
    const active = ["approved", "active"].includes(String(admin?.status || "").toLowerCase());
    if (!admin || !active || !(await verifyPassword(password, admin.password))) {
      send(res, 401, { ok: false, message: "Invalid admin credentials." });
      return;
    }
    issueAuth(res, { userId: admin.id, role: "admin", email: admin.email });
    send(res, 200, { ok: true, user: { id: admin.id, name: admin.name, email: admin.email, role: "admin" } });
  } catch {
    send(res, 500, { ok: false, message: "Admin login failed." });
  }
};
