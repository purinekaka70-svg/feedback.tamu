const mysql = require("mysql2/promise");

let pool;

function dbConfig() {
  return {
    host: process.env.TAMU_DB_HOST || process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.TAMU_DB_PORT || process.env.MYSQL_PORT || 3306),
    database: process.env.TAMU_DB_NAME || process.env.MYSQL_DATABASE || "tamu_express_market",
    user: process.env.TAMU_DB_USER || process.env.MYSQL_USER || "root",
    password: process.env.TAMU_DB_PASS || process.env.MYSQL_PASSWORD || "",
    waitForConnections: true,
    connectionLimit: 5,
    charset: "utf8mb4"
  };
}

function getPool() {
  if (!pool) {
    pool = mysql.createPool(dbConfig());
  }
  return pool;
}

async function query(sql, params = []) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}

async function tableExists(table) {
  const rows = await query(
    "SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?",
    [table]
  );
  return Number(rows[0]?.count || 0) > 0;
}

async function columnExists(table, column) {
  const rows = await query(
    "SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?",
    [table, column]
  );
  return Number(rows[0]?.count || 0) > 0;
}

module.exports = { columnExists, getPool, query, tableExists };
