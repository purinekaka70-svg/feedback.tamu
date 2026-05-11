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

const PASSWORD_COLUMNS = ["password", "password_hash", "password_digest", "hash"];
const BUSINESS_EMAIL_COLUMNS = ["email", "business_email", "owner_email"];

function selectColumn(alias, columns, names, output, fallback = "null") {
  const column = names.find((candidate) => columns.has(candidate));
  return column ? `${alias}.${column} as ${output}` : `${fallback} as ${output}`;
}

function passwordSelect(alias, columns, output) {
  return selectColumn(alias, columns, PASSWORD_COLUMNS, output);
}

function businessEmailColumns(columns) {
  return BUSINESS_EMAIL_COLUMNS.filter((candidate) => columns.has(candidate));
}

function businessEmailWhere(columns, paramIndex) {
  const candidates = businessEmailColumns(columns);
  if (!candidates.length) return "";
  return candidates.map((column) => `lower(b.${column}) = lower($${paramIndex})`).join(" or ");
}

function userJoinWhere(businessColumns, userColumns) {
  const parts = [];
  if (businessColumns.has("user_id") && userColumns.has("id")) {
    parts.push("u.id = b.user_id");
  }
  if (userColumns.has("email")) {
    parts.push(...businessEmailColumns(businessColumns).map((column) => `lower(u.email) = lower(b.${column})`));
  }
  return parts.length ? parts.join(" or ") : "false";
}

function sellerSelect(businessColumns, userColumns, includeUser = true) {
  const userPassword = includeUser ? passwordSelect("u", userColumns, "account_password") : "null as account_password";
  const userStatus = includeUser && userColumns.has("status") ? "u.status as user_status" : "null as user_status";
  const accountUserId = includeUser && userColumns.has("id") ? "u.id as account_user_id" : "null as account_user_id";
  return [
    selectColumn("b", businessColumns, ["id"], "id"),
    selectColumn("b", businessColumns, ["user_id"], "user_id"),
    selectColumn("b", businessColumns, ["name", "store_name", "business_name"], "name", "''"),
    selectColumn("b", businessColumns, ["owner_name", "seller_name"], "owner_name", "''"),
    selectColumn("b", businessColumns, ["phone"], "phone", "''"),
    selectColumn("b", businessColumns, BUSINESS_EMAIL_COLUMNS, "email", "''"),
    selectColumn("b", businessColumns, ["type", "business_type"], "type", "''"),
    selectColumn("b", businessColumns, ["location_name", "location", "county"], "location_name", "''"),
    selectColumn("b", businessColumns, ["latitude", "lat"], "latitude", "0"),
    selectColumn("b", businessColumns, ["longitude", "lng"], "longitude", "0"),
    selectColumn("b", businessColumns, ["payment_methods", "payment_options"], "payment_methods"),
    selectColumn("b", businessColumns, ["till_number"], "till_number", "''"),
    selectColumn("b", businessColumns, ["pochi_number"], "pochi_number", "''"),
    selectColumn("b", businessColumns, ["bank_account", "card_account"], "bank_account", "''"),
    selectColumn("b", businessColumns, ["delivery_availability"], "delivery_availability", "''"),
    selectColumn("b", businessColumns, ["delivery_notes"], "delivery_notes", "''"),
    selectColumn("b", businessColumns, ["logo"], "logo", "''"),
    selectColumn("b", businessColumns, ["logo_image"], "logo_image", "''"),
    selectColumn("b", businessColumns, ["rating"], "rating", "4.5"),
    selectColumn("b", businessColumns, ["status"], "business_status", "'pending'"),
    selectColumn("b", businessColumns, ["subscription_expires_at"], "subscription_expires_at"),
    selectColumn("b", businessColumns, ["subscription_status"], "subscription_status", "''"),
    selectColumn("b", businessColumns, ["created_at"], "created_at"),
    passwordSelect("b", businessColumns, "business_password"),
    userPassword,
    userStatus,
    accountUserId
  ].join(", ");
}

async function findBusinessForSeller(email, account, businessColumns, userColumns) {
  const select = sellerSelect(businessColumns, userColumns, true);
  const byEmail = businessEmailWhere(businessColumns, 1);
  if (byEmail) {
    const rows = await query(
      `select ${select}
         from businesses b
         left join users u on ${userJoinWhere(businessColumns, userColumns)}
        where ${byEmail}
        limit 1`,
      [email]
    );
    if (rows[0]) return rows[0];
  }
  if (!account?.id || !businessColumns.has("user_id")) {
    return null;
  }
  const rows = await query(
    `select ${sellerSelect(businessColumns, userColumns, false)}
       from businesses b
      where b.user_id = $1
      limit 1`,
    [account.id]
  );
  const row = rows[0] || null;
  if (row) {
    row.account_user_id = account.id;
    row.user_status = account.status || row.user_status;
  }
  return row;
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
    const fallbackAccount = await findUserByEmail(email, "seller");
    const row = await findBusinessForSeller(email, fallbackAccount, businessColumns, userColumns);
    const accountPassword = row?.account_password
      || row?.business_password
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
