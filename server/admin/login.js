const { findUserByEmail, issueAuth, verifyPassword } = require("../_lib/auth");
const { query } = require("../_lib/db");
const { body, method, send, text } = require("../_lib/http");
const { rateLimit } = require("../_lib/security");

const DEFAULT_ADMIN_EMAIL = "AdminTamuEpress@gmail.com";

function configuredAdminEmail() {
  return process.env.TAMU_ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL;
}

function adminCredentialPairs() {
  const password = process.env.TAMU_ADMIN_PASSWORD || "";
  const pairs = [
    {
      email: configuredAdminEmail(),
      password
    }
  ];
  return pairs.filter((pair, index) =>
    pair.email &&
    pair.password &&
    pairs.findIndex((candidate) =>
      candidate.email.toLowerCase() === pair.email.toLowerCase() &&
      candidate.password === pair.password
    ) === index
  );
}

async function verifySupabasePassword(password, hash) {
  if (!hash) return false;
  if (await verifyPassword(password, hash)) return true;
  const rows = await query("select crypt($1, $2) = $2 as ok", [String(password || ""), String(hash || "")]);
  return rows[0]?.ok === true;
}

async function repairConfiguredAdmin(email, password) {
  const matched = adminCredentialPairs().find((pair) =>
    email.toLowerCase() === pair.email.toLowerCase() &&
    password === pair.password
  );
  if (!matched) {
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
    [matched.email, matched.password]
  );
  return rows[0] || null;
}

function matchedConfiguredAdmin(email, password) {
  return adminCredentialPairs().find((pair) =>
    email.toLowerCase() === pair.email.toLowerCase() &&
    password === pair.password
  ) || null;
}

async function adminDiagnostic(email, password, existingAdmin, active, valid) {
  const adminAnyRole = await findUserByEmail(email);
  const bootstrapAllowed = adminCredentialPairs().some((pair) =>
    email.toLowerCase() === pair.email.toLowerCase() &&
    password === pair.password
  );
  return {
    reason: !adminAnyRole
      ? "admin_email_not_found"
      : String(adminAnyRole.role || "").toLowerCase() !== "admin"
        ? "email_exists_but_role_is_not_admin"
        : !active
          ? "admin_status_not_approved"
          : existingAdmin && !valid
            ? "password_does_not_match"
            : "admin_login_not_allowed",
    emailFound: Boolean(adminAnyRole),
    role: adminAnyRole?.role || null,
    status: adminAnyRole?.status || null,
    bootstrapAllowed,
    expectedEmail: DEFAULT_ADMIN_EMAIL,
    passwordLength: password.length
  };
}

module.exports = async function handler(req, res) {
  if (!method(req, res, "POST")) return;
  if (!rateLimit(req, res, "admin-login", { limit: 8, windowMs: 10 * 60 * 1000 })) return;
  try {
    const payload = await body(req);
    const email = text(payload.email || payload.username, 180).trim().toLowerCase();
    const password = String(payload.password || "").trim();
    const configuredAdmin = matchedConfiguredAdmin(email, password);
    if (configuredAdmin) {
      const admin = await repairConfiguredAdmin(email, password).catch(() => ({
        id: 0,
        name: "Admin",
        email: configuredAdmin.email,
        role: "admin",
        status: "approved"
      }));
      issueAuth(res, { userId: admin.id || 0, role: "admin", email: configuredAdmin.email });
      send(res, 200, { ok: true, user: { id: admin.id || 0, name: admin.name || "Admin", email: configuredAdmin.email, role: "admin" } });
      return;
    }
    let admin = await findUserByEmail(email, "admin");
    const active = ["approved", "active"].includes(String(admin?.status || "").toLowerCase());
    const valid = admin && active && await verifySupabasePassword(password, admin.password);
    if (!valid) {
      admin = await repairConfiguredAdmin(email, password);
    }
    if (!admin) {
      await adminDiagnostic(email, password, admin, active, valid).catch(() => null);
      send(res, 401, {
        ok: false,
        message: "Invalid admin credentials."
      });
      return;
    }
    issueAuth(res, { userId: admin.id, role: "admin", email: admin.email });
    send(res, 200, { ok: true, user: { id: admin.id, name: admin.name, email: admin.email, role: "admin" } });
  } catch {
    send(res, 500, { ok: false, message: "Admin login failed." });
  }
};
