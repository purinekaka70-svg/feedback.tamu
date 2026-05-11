const { findUserByEmail, issueAuth, verifyPassword } = require("../_lib/auth");
const { query, tableColumns } = require("../_lib/db");
const { body, method, send, text } = require("../_lib/http");
const { sellerFromBusiness } = require("../_lib/market");
const { rateLimit } = require("../_lib/security");

async function verifySupabasePassword(password, hash) {
  if (!hash) return false;
  if (await verifyPassword(password, hash)) return true;
  const rows = await query("select crypt($1, $2) = $2 as ok", [String(password || ""), String(hash || "")]);
  return rows[0]?.ok === true;
}

async function ensureBusinessSubscriptionColumns() {
  await query("alter table businesses add column if not exists subscription_started_at timestamptz").catch(() => {});
  await query("alter table businesses add column if not exists subscription_expires_at timestamptz").catch(() => {});
  await query("alter table businesses add column if not exists subscription_status text not null default 'inactive'").catch(() => {});
  await query(
    `update businesses
        set subscription_started_at = coalesce(subscription_started_at, now()),
            subscription_expires_at = coalesce(subscription_expires_at, now() + interval '1 month'),
            subscription_status = case
              when subscription_expires_at is not null and subscription_expires_at <= now() then 'expired'
              else 'active'
            end
      where status = 'approved'
        and (subscription_expires_at is null or coalesce(subscription_status, '') = '')`
  ).catch(() => {});
}

function passwordSelect(columns) {
  const column = ["password", "password_hash", "password_digest", "hash"].find((candidate) => columns.has(candidate));
  return column ? `u.${column} as account_password` : "null as account_password";
}

module.exports = async function handler(req, res) {
  if (!method(req, res, "POST")) return;
  if (!rateLimit(req, res, "seller-login", { limit: 12, windowMs: 10 * 60 * 1000 })) return;
  try {
    const payload = await body(req);
    const email = text(payload.email, 180).toLowerCase();
    const password = String(payload.password || "");
    await ensureBusinessSubscriptionColumns();
    const businessColumns = await tableColumns("businesses").catch(() => new Set());
    const userColumns = await tableColumns("users").catch(() => new Set());
    const subscriptionSelect = [
      businessColumns.has("subscription_expires_at") ? "b.subscription_expires_at" : "null as subscription_expires_at",
      businessColumns.has("subscription_status") ? "b.subscription_status" : "'' as subscription_status"
    ].join(", ");
    const accountPasswordSelect = passwordSelect(userColumns);
    const sellerRows = await query(
      `select b.id, b.user_id, b.name, b.owner_name, b.phone, b.email, b.type, b.location_name,
              b.latitude, b.longitude, b.payment_methods, b.till_number, b.pochi_number,
              b.bank_account, b.delivery_availability, b.delivery_notes, b.logo, b.logo_image,
              b.rating, b.status as business_status, ${subscriptionSelect}, b.created_at,
              ${accountPasswordSelect}, u.status as user_status, u.id as account_user_id
         from businesses b
         left join users u on u.id = b.user_id or lower(u.email) = lower(b.email)
        where lower(b.email) = lower($1)
        limit 1`,
      [email]
    );
    const row = sellerRows[0];
    const fallbackAccount = row?.account_password ? null : await findUserByEmail(email, "seller");
    const accountPassword = row?.account_password
      || fallbackAccount?.password
      || fallbackAccount?.password_hash
      || fallbackAccount?.password_digest
      || fallbackAccount?.hash
      || "";
    if (!row || !accountPassword || !(await verifySupabasePassword(password, accountPassword))) {
      send(res, 401, { ok: false, message: "Invalid seller credentials." });
      return;
    }
    const sellerStatus = String(row.business_status || "pending").toLowerCase();
    const userStatus = String(row.user_status || fallbackAccount?.status || "approved").toLowerCase();
    if (sellerStatus !== "approved" || userStatus !== "approved") {
      const message = sellerStatus === "rejected"
          ? "Your business account was rejected. Contact admin for help."
        : sellerStatus === "blocked"
          ? "Your business account is blocked. Contact admin for help."
          : "Your account is not approved by admin yet.";
      send(res, 403, { ok: false, message, status: sellerStatus });
      return;
    }
    const expiry = row.subscription_expires_at ? new Date(row.subscription_expires_at).getTime() : 0;
    if (String(row.subscription_status || "").toLowerCase() === "expired" || (expiry && expiry <= Date.now())) {
      send(res, 403, {
        ok: false,
        message: "Your business subscription has expired. Contact admin to activate it.",
        status: "expired"
      });
      return;
    }
    row.status = sellerStatus;
    issueAuth(res, {
      userId: row.account_user_id || row.user_id,
      businessId: row.id,
      role: "seller",
      status: "approved",
      email: row.email
    });
    send(res, 200, { ok: true, seller: sellerFromBusiness(row) });
  } catch {
    send(res, 500, { ok: false, message: "Seller login failed." });
  }
};
