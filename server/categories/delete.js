const { requireRole } = require("../_lib/auth");
const { query } = require("../_lib/db");
const { body, method, send } = require("../_lib/http");

module.exports = async function handler(req, res) {
  if (!method(req, res, "POST")) return;
  if (!requireRole(req, res, ["admin", "seller"])) return;
  try {
    const payload = await body(req);
    await query("delete from categories where id = $1", [Number(payload.id)]);
    send(res, 200, { ok: true });
  } catch {
    send(res, 500, { ok: false, message: "Failed to delete category." });
  }
};
