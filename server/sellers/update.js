const { requireRole } = require("../_lib/auth");
const { query } = require("../_lib/db");
const { body, method, send, text } = require("../_lib/http");
const { touchRealtime } = require("../_lib/realtime");

async function paymentColumnUpdate(payload) {
  const rows = await query(
    `select column_name, data_type
       from information_schema.columns
      where table_schema = 'public'
        and table_name = 'businesses'
        and column_name in ('payment_methods', 'payment_options')
      order by case column_name when 'payment_methods' then 1 else 2 end
      limit 1`
  );
  const column = rows[0];
  if (!column) return { sql: "", value: null };
  const methods = Array.isArray(payload.paymentOptions)
    ? payload.paymentOptions
    : Array.isArray(payload.paymentMethods)
      ? payload.paymentMethods
      : [];
  const cast = column.data_type === "json" ? "::json" : column.data_type === "jsonb" ? "::jsonb" : "";
  return {
    sql: `, ${column.column_name} = $13${cast}`,
    value: JSON.stringify(methods)
  };
}

module.exports = async function handler(req, res) {
  if (!method(req, res, "POST")) return;
  const session = requireRole(req, res, ["admin", "seller"]);
  if (!session) return;
  try {
    const payload = await body(req);
    const businessId = Number(payload.id || payload.businessId || session.businessId || 0);
    if (session.role === "seller" && Number(session.businessId) !== businessId) {
      send(res, 403, { ok: false, message: "You can only update your own business." });
      return;
    }
    const paymentUpdate = await paymentColumnUpdate(payload);
    const params = [
      businessId,
      text(payload.storeName || payload.name, 150),
      text(payload.ownerName, 150),
      text(payload.phone, 40),
      text(payload.businessType || payload.type, 80),
      text(payload.location || payload.county, 180),
      text(payload.tillNumber, 80),
      text(payload.pochiNumber, 80),
      text(payload.bankAccount, 120),
      text(payload.deliveryAvailability, 80),
      text(payload.deliveryNotes, 500),
      text(payload.logoImage || payload.logo, 204800)
    ];
    if (paymentUpdate.sql) {
      params.push(paymentUpdate.value);
    }
    const rows = await query(
      `update businesses
          set name = coalesce(nullif($2,''), name),
              owner_name = coalesce(nullif($3,''), owner_name),
              phone = coalesce(nullif($4,''), phone),
              type = coalesce(nullif($5,''), type),
              location_name = coalesce(nullif($6,''), location_name),
              till_number = coalesce(nullif($7,''), till_number),
              pochi_number = coalesce(nullif($8,''), pochi_number),
              bank_account = coalesce(nullif($9,''), bank_account),
              delivery_availability = coalesce(nullif($10,''), delivery_availability),
              delivery_notes = coalesce(nullif($11,''), delivery_notes),
              logo_image = coalesce(nullif($12,''), logo_image)
              ${paymentUpdate.sql}
        where id = $1
        returning id`,
      params
    );
    await touchRealtime("marketplace", "seller-updated");
    send(res, 200, { ok: true, seller: { id: rows[0]?.id || businessId } });
  } catch {
    send(res, 500, { ok: false, message: "Failed to update seller profile." });
  }
};
