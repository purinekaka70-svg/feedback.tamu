const { Pool } = require("pg");

let pool;

function connectionString() {
  return process.env.SUPABASE_DB_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    "";
}

function getPool() {
  if (!pool) {
    const url = connectionString();
    if (url) {
      pool = new Pool({
        connectionString: url,
        ssl: { rejectUnauthorized: false }
      });
    } else {
      pool = new Pool({
        host: process.env.SUPABASE_DB_HOST,
        port: Number(process.env.SUPABASE_DB_PORT || 5432),
        database: process.env.SUPABASE_DB_NAME || "postgres",
        user: process.env.SUPABASE_DB_USER || "postgres",
        password: process.env.SUPABASE_DB_PASS || "",
        ssl: { rejectUnauthorized: false }
      });
    }
  }
  return pool;
}

async function query(sql, params = []) {
  const result = await getPool().query(sql, params);
  return result.rows;
}

async function run(sql, params = []) {
  return getPool().query(sql, params);
}

async function tableExists(table) {
  const rows = await query(
    "select count(*)::int as count from information_schema.tables where table_schema = 'public' and table_name = $1",
    [table]
  );
  return Number(rows[0]?.count || 0) > 0;
}

module.exports = { getPool, query, run, tableExists };
