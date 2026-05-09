const { findUserByEmail } = require("../_lib/auth");
const { query } = require("../_lib/db");
const { method, send } = require("../_lib/http");

module.exports = async function handler(req, res) {
  if (!method(req, res, "GET")) return;
  const email = "AdminTamuEpress@gmail.com";
  try {
    const user = await findUserByEmail(email);
    const cryptCheck = user?.password
      ? await query("select crypt($1, $2) = $2 as ok", ["Admin@Tamu@2025", user.password])
      : [];
    send(res, 200, {
      ok: true,
      databaseConfigured: Boolean(process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.SUPABASE_DB_HOST),
      admin: user ? {
        found: true,
        id: user.id,
        email: user.email,
        role: user.role,
        status: user.status,
        passwordHashLength: String(user.password || "").length,
        defaultPasswordMatches: cryptCheck[0]?.ok === true
      } : {
        found: false
      }
    });
  } catch (error) {
    send(res, 500, {
      ok: false,
      message: "Admin login diagnostic failed.",
      error: String(error?.message || error).slice(0, 240)
    });
  }
};
