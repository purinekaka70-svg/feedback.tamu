const { query } = require("../_lib/db");
const { method, send, text } = require("../_lib/http");

module.exports = async function handler(req, res) {
  if (!method(req, res, "GET")) return;
  try {
    const email = text(new URL(req.url, "http://local").searchParams.get("email"), 180).toLowerCase();
    if (!email) {
      send(res, 422, { ok: false, message: "Add ?email=seller@example.com" });
      return;
    }
    const rows = await query(
      `select b.id as business_id, b.email as business_email, b.status as business_status,
              b.user_id, u.email as user_email, u.role as user_role, u.status as user_status,
              length(coalesce(u.password, '')) as password_length
         from businesses b
         left join users u on u.id = b.user_id or lower(u.email) = lower(b.email)
        where lower(b.email) = lower($1) or lower(u.email) = lower($1)
        order by b.id desc
        limit 5`,
      [email]
    );
    send(res, 200, { ok: true, sellers: rows });
  } catch (error) {
    send(res, 500, {
      ok: false,
      message: "Seller login diagnostic failed.",
      error: String(error?.message || error).slice(0, 220)
    });
  }
};
