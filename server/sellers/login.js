const { findUserByEmail, issueAuth, verifyPassword } = require("../_lib/auth");
const { query } = require("../_lib/db");
const { body, method, send, text } = require("../_lib/http");
const { sellerFromBusiness } = require("../_lib/market");

async function verifySupabasePassword(password, hash) {
  if (!hash) return false;
  if (await verifyPassword(password, hash)) return true;
  const rows = await query("select crypt($1, $2) = $2 as ok", [String(password || ""), String(hash || "")]);
  return rows[0]?.ok === true;
}

module.exports = async function handler(req, res) {
  if (!method(req, res, "POST")) return;
  try {
    const payload = await body(req);
    const email = text(payload.email, 180).toLowerCase();
    const password = String(payload.password || "");
    const sellerRows = await query(
      `select b.*, u.password, u.status as user_status, u.id as account_user_id
         from businesses b
         left join users u on u.id = b.user_id or lower(u.email) = lower(b.email)
        where lower(b.email) = lower($1)
        limit 1`,
      [email]
    );
    const row = sellerRows[0];
    const account = row?.password ? row : await findUserByEmail(email, "seller");
    if (!row || !account?.password || !(await verifySupabasePassword(password, account.password))) {
      send(res, 401, { ok: false, message: "Invalid seller credentials." });
      return;
    }
    const sellerStatus = String(row.status || "pending").toLowerCase();
    const userStatus = String(row.user_status || "approved").toLowerCase();
    if (sellerStatus !== "approved" || userStatus !== "approved") {
      const message = sellerStatus === "rejected"
        ? "Your business account was rejected. Contact admin for help."
        : sellerStatus === "blocked"
          ? "Your business account is blocked. Contact admin for help."
          : "Your business account is waiting for admin approval.";
      send(res, 403, { ok: false, message, status: sellerStatus });
      return;
    }
    issueAuth(res, { userId: row.account_user_id || row.user_id, businessId: row.id, role: "seller", email: row.email });
    send(res, 200, { ok: true, seller: sellerFromBusiness(row) });
  } catch {
    send(res, 500, { ok: false, message: "Seller login failed." });
  }
};
