const { Pool } = require("pg");

let pool;

function connectionString() {
  return process.env.SUPABASE_DB_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    "";
}

function connectionSource() {
  if (process.env.SUPABASE_DB_URL) return "SUPABASE_DB_URL";
  if (process.env.DATABASE_URL) return "DATABASE_URL";
  if (process.env.POSTGRES_URL) return "POSTGRES_URL";
  if (process.env.SUPABASE_DB_HOST) return "SUPABASE_DB_HOST";
  return "none";
}

function connectionSummary() {
  const url = connectionString();
  if (url) {
    try {
      const parsed = new URL(url);
      return {
        source: connectionSource(),
        host: parsed.hostname,
        port: parsed.port || "",
        database: parsed.pathname.replace(/^\/+/, "") || "",
        user: decodeURIComponent(parsed.username || "")
      };
    } catch (error) {
      return {
        source: connectionSource(),
        host: "invalid_connection_string",
        error: String(error?.message || error).slice(0, 120)
      };
    }
  }
  return {
    source: connectionSource(),
    host: process.env.SUPABASE_DB_HOST || "",
    port: process.env.SUPABASE_DB_PORT || "",
    database: process.env.SUPABASE_DB_NAME || "postgres",
    user: process.env.SUPABASE_DB_USER || "postgres"
  };
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

async function tableColumns(table) {
  const rows = await query(
    "select column_name from information_schema.columns where table_schema = 'public' and table_name = $1",
    [table]
  );
  return new Set(rows.map((row) => row.column_name));
}

module.exports = { connectionSummary, getPool, query, run, tableColumns, tableExists };
