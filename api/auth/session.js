const { claims } = require("../_lib/auth");
const { method, send } = require("../_lib/http");

module.exports = async function handler(req, res) {
  if (!method(req, res, "GET")) return;
  const session = claims(req);
  send(res, 200, { ok: true, session: session || null });
};
