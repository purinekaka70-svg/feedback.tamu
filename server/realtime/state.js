const { method, send } = require("../_lib/http");
const { realtimeState } = require("../_lib/realtime");
const { rateLimit } = require("../_lib/security");

module.exports = async function handler(req, res) {
  if (!method(req, res, "GET")) return;
  if (!rateLimit(req, res, "realtime-state", { limit: 240, windowMs: 60_000 })) return;
  try {
    const state = await realtimeState();
    send(res, 200, { ok: true, ...state });
  } catch {
    send(res, 503, {
      ok: false,
      message: "Realtime database state is unavailable."
    });
  }
};
