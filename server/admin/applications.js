const { requireRole } = require("../_lib/auth");
const { query, tableColumns } = require("../_lib/db");
const { body, method, send, text } = require("../_lib/http");
const { normalizeStatus, sellerFromBusiness } = require("../_lib/market");
const { rateLimit } = require("../_lib/security");

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
  return tableColumns("businesses");
}

function businessSelect(columns) {
  const subscriptionColumns = [
    "subscription_started_at",
    "subscription_expires_at",
    "subscription_status"
  ].filter((column) => columns.has(column));
  return [
    "id", "user_id", "name", "owner_name", "phone", "email", "type", "location_name",
    "latitude", "longitude", "payment_methods", "till_number", "pochi_number",
    "bank_account", "delivery_availability", "delivery_notes", "logo", "logo_image",
    "rating", "status", "created_at",
    ...subscriptionColumns
  ].join(", ");
}

module.exports = async function handler(req, res) {
  if (!method(req, res, ["GET", "POST"])) return;
  if (req.method === "POST" && !rateLimit(req, res, "admin-applications-write", { limit: 80, windowMs: 10 * 60 * 1000 })) return;
  const session = requireRole(req, res, "admin");
  if (!session) return;
  try {
    const columns = await ensureBusinessSubscriptionColumns();
    if (req.method === "GET") {
      const rows = await query(
        `select ${businessSelect(columns)}
           from businesses
          order by created_at desc`
      );
      send(res, 200, { ok: true, applications: rows.map(sellerFromBusiness), sellers: rows.map(sellerFromBusiness) });
      return;
    }
    const payload = await body(req);
    const id = Number(payload.id || payload.businessId || 0);
    const action = text(payload.status || payload.action, 40).toLowerCase();
    if (action === "expired" || action === "expire") {
      const rows = await query(
        `update businesses
            set subscription_expires_at = now(),
                subscription_status = 'expired'
          where id = $1
          returning id, user_id`,
        [id]
      );
      send(res, 200, { ok: true, seller: { id, status: "expired" }, updated: Boolean(rows[0]) });
      return;
    }
    const status = normalizeStatus(action, ["pending", "approved", "rejected", "blocked"], "pending");
    const rows = status === "approved"
      ? await query(
          `update businesses
              set status = 'approved',
                  subscription_started_at = now(),
                  subscription_expires_at = now() + interval '1 month',
                  subscription_status = 'active'
            where id = $1
            returning id, user_id`,
          [id]
        )
      : await query(
          `update businesses
              set status = $2,
                  subscription_status = case when $2 = 'blocked' then 'blocked' else subscription_status end
            where id = $1
            returning id, user_id`,
          [id, status]
        );
    if (rows[0]?.user_id) {
      await query("update users set status = $2 where id = $1", [rows[0].user_id, status === "approved" ? "approved" : status]);
    }
    send(res, 200, { ok: true, seller: { id, status } });
  } catch (error) {
    send(res, 500, {
      ok: false,
      message: req.method === "GET" ? "Failed to load seller applications." : "Failed to update seller application.",
      error: String(error?.message || error).slice(0, 220)
    });
  }
};
