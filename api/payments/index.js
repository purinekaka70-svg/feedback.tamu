const { requireRole } = require("../_lib/auth");
const { query } = require("../_lib/db");
const { method, send } = require("../_lib/http");

module.exports = async function handler(req, res) {
  if (!method(req, res, "GET")) return;
  const session = requireRole(req, res, ["admin", "seller"]);
  if (!session) return;
  try {
    const businessId = req.url.includes("?") ? new URL(req.url, "http://local").searchParams.get("businessId") : "";
    const params = [];
    let sql = "select * from payments";
    if (session.role === "seller" || businessId) {
      params.push(Number(session.businessId || businessId));
      sql += " where business_id = $1";
    }
    sql += " order by created_at desc";
    const payments = await query(sql, params);
    send(res, 200, { ok: true, payments });
  } catch {
    send(res, 500, { ok: false, message: "Failed to load payments." });
  }
};
