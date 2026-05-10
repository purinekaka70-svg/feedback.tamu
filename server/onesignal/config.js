const { method, send } = require("../_lib/http");

const DEFAULT_APP_ID = "7c0a3b0d-53b6-4b67-9b42-266f49bfabcc";

module.exports = async function handler(req, res) {
  if (!method(req, res, "GET")) return;
  send(res, 200, {
    ok: true,
    appId: process.env.ONESIGNAL_APP_ID || DEFAULT_APP_ID,
    sendingConfigured: Boolean(process.env.ONESIGNAL_REST_API_KEY || process.env.ONESIGNAL_API_KEY)
  });
};
