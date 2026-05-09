const { findUserByEmail, issueAuth, verifyPassword } = require("../_lib/auth");
const { query } = require("../_lib/db");
const { body, method, send, text } = require("../_lib/http");

const DEFAULT_ADMIN_EMAIL = "AdminTamuEpress@gmail.com";
const DEFAULT_ADMIN_PASSWORD = "Admin@Tamu@2025";

function configuredAdminEmail() {
  return process.env.TAMU_ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL;
}

function configuredAdminPassword() {
  return process.env.TAMU_ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;
}

async function verifySupabasePassword(password, hash) {
  if (!hash) return false;
  if (await verifyPassword(password, hash)) return true;
  const rows = await query("select crypt($1, $2) = $2 as ok", [String(password || ""), String(hash || "")]);
  return rows[0]?.ok === true;
}

async function repairConfiguredAdmin(email, password) {
  const adminEmail = configuredAdminEmail();
  const adminPassword = configuredAdminPassword();
  if (email.toLowerCase() !== adminEmail.toLowerCase() || password !== adminPassword) {
    return null;
  }
  const rows = await query(
    `insert into users (name, email, password, role, status)
     values ('Admin', $1, crypt($2, gen_salt('bf')), 'admin', 'approved')
     on conflict (email) do update set
       name = excluded.name,
       password = excluded.password,
       role = excluded.role,
       status = excluded.status
     returning id, name, email, role, status`,
    [adminEmail, adminPassword]
  );
  return rows[0] || null;
}

module.exports = async function handler(req, res) {
  if (!method(req, res, "POST")) return;
  try {
    const payload = await body(req);
    const email = text(payload.email || payload.username, 180).toLowerCase();
    const password = String(payload.password || "").trim();
    let admin = await findUserByEmail(email, "admin");
    const active = ["approved", "active"].includes(String(admin?.status || "").toLowerCase());
    const valid = admin && active && await verifySupabasePassword(password, admin.password);
    if (!valid) {
      admin = await repairConfiguredAdmin(email, password);
    }
    if (!admin) {
      send(res, 401, { ok: false, message: "Invalid admin credentials." });
      return;
    }
    issueAuth(res, { userId: admin.id, role: "admin", email: admin.email });
    send(res, 200, { ok: true, user: { id: admin.id, name: admin.name, email: admin.email, role: "admin" } });
  } catch {
    send(res, 500, { ok: false, message: "Admin login failed." });
  }
};
