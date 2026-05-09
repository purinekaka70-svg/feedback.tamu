const { query } = require("../_lib/db");
const { body, method, number, send, text } = require("../_lib/http");

module.exports = async function handler(req, res) {
  if (!method(req, res, ["GET", "POST", "DELETE"])) return;
  try {
    if (req.method === "GET") {
      const sessionId = text(new URL(req.url, "http://local").searchParams.get("sessionId"), 120);
      const items = sessionId ? await query("select * from cart where session_id = $1 order by created_at desc", [sessionId]) : [];
      send(res, 200, { ok: true, items });
      return;
    }
    const payload = await body(req);
    const sessionId = text(payload.sessionId, 120);
    if (!sessionId) {
      send(res, 422, { ok: false, message: "Cart session is required." });
      return;
    }
    if (req.method === "DELETE" || payload.action === "clear") {
      await query("delete from cart where session_id = $1", [sessionId]);
      send(res, 200, { ok: true });
      return;
    }
    const productId = text(payload.productId, 120);
    const storeId = text(payload.storeId || payload.businessId, 120);
    await query("delete from cart where session_id = $1 and product_public_id = $2 and store_public_id = $3", [sessionId, productId, storeId]);
    await query(
      `insert into cart (session_id, product_public_id, product_name, store_public_id, store_name, quantity, unit_price, image)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        sessionId,
        productId,
        text(payload.productName || payload.name, 150),
        storeId,
        text(payload.storeName, 150),
        Math.max(1, Math.trunc(number(payload.quantity || 1))),
        number(payload.unitPrice || payload.price),
        text(payload.image || payload.productImage, 153600)
      ]
    );
    send(res, 200, { ok: true });
  } catch {
    send(res, 500, { ok: false, message: "Cart update failed." });
  }
};
