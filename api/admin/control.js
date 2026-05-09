const { requireRole } = require("../_lib/auth");
const { body, method, send, text } = require("../_lib/http");
const { getPool, query } = require("../_lib/db");

module.exports = async function handler(req, res) {
  const session = requireRole(req, res, "admin");
  if (!session) return;
  if (!method(req, res, "POST")) return;

  const payload = await body(req).catch(() => null);
  const entity = text(payload?.entity, 40);
  const id = text(payload?.id, 100);
  if (!entity || !id) {
    send(res, 422, { ok: false, message: "Record id is required." });
    return;
  }

  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const numericId = Number(id) || 0;
    if (entity === "order") {
      await connection.execute("DELETE FROM payments WHERE order_public_id = ?", [id]);
      await connection.execute("DELETE FROM deliveries WHERE order_public_id = ?", [id]);
      await connection.execute("DELETE FROM orders WHERE public_id = ? OR id = ?", [id, numericId]);
    } else if (entity === "payment") {
      await connection.execute("DELETE FROM payments WHERE id = ? OR order_public_id = ? OR reference = ?", [numericId, id, id]);
    } else if (entity === "business" || entity === "seller") {
      const [rows] = await connection.execute("SELECT user_id FROM businesses WHERE id = ? LIMIT 1", [numericId]);
      await connection.execute("DELETE FROM businesses WHERE id = ?", [numericId]);
      if (entity === "seller" && rows[0]?.user_id) {
        await connection.execute("DELETE FROM users WHERE id = ? AND role = 'seller'", [rows[0].user_id]);
      }
    } else if (entity === "category") {
      await connection.execute("DELETE FROM categories WHERE id = ? OR name = ?", [numericId, id]);
    } else if (entity === "product") {
      await connection.execute("DELETE FROM products WHERE id = ?", [numericId]);
    } else if (entity === "offer") {
      await connection.execute("DELETE FROM seller_offers WHERE id = ? OR public_id = ?", [numericId, id]);
    } else if (entity === "location") {
      await connection.execute("DELETE FROM locations WHERE id = ? OR name = ?", [numericId, id]);
    } else if (entity === "user" || entity === "employee") {
      await connection.execute(`DELETE FROM users WHERE id = ?${entity === "employee" ? " AND role = 'employee'" : ""}`, [numericId]);
    } else {
      await connection.rollback();
      send(res, 422, { ok: false, message: "Unsupported admin entity." });
      return;
    }
    await connection.commit();
    send(res, 200, { ok: true, message: "Record deleted." });
  } catch {
    await connection.rollback().catch(() => undefined);
    send(res, 500, { ok: false, message: "Admin delete failed." });
  } finally {
    connection.release();
  }
};
