const { body, method, send } = require("../_lib/http");
const { query } = require("../_lib/db");

module.exports = async function handler(req, res) {
  if (!method(req, res, ["GET", "POST", "DELETE"])) return;
  try {
    if (req.method === "GET") {
      const sessionId = String(req.query?.sessionId || "").trim();
      if (!sessionId) {
        send(res, 422, { ok: false, message: "sessionId is required." });
        return;
      }
      const rows = await query(
        `SELECT c.*, p.name, p.price, p.image, p.category_id, b.name AS business_name
         FROM cart c
         JOIN products p ON p.id = c.product_id
         LEFT JOIN businesses b ON b.id = c.business_id
         WHERE c.session_id = ?
         ORDER BY c.updated_at DESC`,
        [sessionId]
      );
      send(res, 200, { ok: true, items: rows });
      return;
    }

    const payload = await body(req);
    const sessionId = String(payload.sessionId || "").trim();
    if (!sessionId) {
      send(res, 422, { ok: false, message: "sessionId is required." });
      return;
    }

    if (req.method === "POST") {
      await query(
        `INSERT INTO cart (user_id, session_id, product_id, business_id, quantity)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), business_id = VALUES(business_id)`,
        [payload.userId || null, sessionId, Number(payload.productId), Number(payload.businessId), Math.max(1, Number(payload.quantity || 1))]
      );
      send(res, 200, { ok: true });
      return;
    }

    if (payload.productId) {
      await query("DELETE FROM cart WHERE session_id = ? AND product_id = ?", [sessionId, Number(payload.productId)]);
    } else {
      await query("DELETE FROM cart WHERE session_id = ?", [sessionId]);
    }
    send(res, 200, { ok: true });
  } catch {
    send(res, 500, { ok: false, message: "Cart request failed." });
  }
};
