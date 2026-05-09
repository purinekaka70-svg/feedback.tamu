const { method, send } = require("./_lib/http");
const { connectionSummary } = require("./_lib/db");

module.exports = async function handler(req, res) {
  if (!method(req, res, "GET")) return;
  send(res, 200, {
    ok: true,
    service: "tamu-express-api",
    databaseConfigured: Boolean(process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.SUPABASE_DB_HOST),
    database: connectionSummary()
  });
};
