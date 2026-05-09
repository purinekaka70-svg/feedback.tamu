const { getPool } = require("../_lib/db");
const { method, send } = require("../_lib/http");

async function columns(client, table) {
  const result = await client.query(
    `select column_name, data_type, is_nullable, column_default
       from information_schema.columns
      where table_schema = 'public'
        and table_name = $1
      order by ordinal_position`,
    [table]
  );
  return result.rows;
}

module.exports = async function handler(req, res) {
  if (!method(req, res, "GET")) return;
  let client;
  try {
    client = await getPool().connect();
    const userColumns = await columns(client, "users");
    const businessColumns = await columns(client, "businesses");
    const businessCount = await client.query("select count(*)::int as count from businesses");
    const userCount = await client.query("select count(*)::int as count from users");
    send(res, 200, {
      ok: true,
      databaseConfigured: Boolean(process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.SUPABASE_DB_HOST),
      users: {
        count: userCount.rows[0]?.count || 0,
        columns: userColumns.map((column) => ({
          name: column.column_name,
          type: column.data_type,
          nullable: column.is_nullable === "YES",
          hasDefault: Boolean(column.column_default)
        }))
      },
      businesses: {
        count: businessCount.rows[0]?.count || 0,
        columns: businessColumns.map((column) => ({
          name: column.column_name,
          type: column.data_type,
          nullable: column.is_nullable === "YES",
          hasDefault: Boolean(column.column_default)
        }))
      }
    });
  } catch (error) {
    send(res, 500, {
      ok: false,
      message: "Seller registration diagnostic failed.",
      error: String(error?.message || error).slice(0, 240)
    });
  } finally {
    if (client) {
      client.release();
    }
  }
};
