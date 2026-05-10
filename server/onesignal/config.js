const { method, send } = require("../_lib/http");

module.exports = async function handler(req, res) {
  if (!method(req, res, "GET")) return;
  send(res, 200, {
    ok: true,
    appId: process.env.ONESIGNAL_APP_ID || ""
  });
};
