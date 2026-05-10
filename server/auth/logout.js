const { clearAuth } = require("../_lib/auth");
const { method, send } = require("../_lib/http");
const { requireSameOrigin } = require("../_lib/security");

module.exports = async function handler(req, res) {
  if (!method(req, res, ["GET", "POST"])) return;
  if (req.method === "POST" && !requireSameOrigin(req, res)) return;
  clearAuth(res);
  send(res, 200, { ok: true });
};
