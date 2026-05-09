const { requireRole } = require("../_lib/auth");
const { body, method, number, send, text } = require("../_lib/http");
const { query } = require("../_lib/db");

module.exports = async function handler(req, res) {
  const session = requireRole(req, res, ["admin", "seller"]);
  if (!session) return;
  if (!method(req, res, "POST")) return;
  try {
    const payload = await body(req);
    const businessId = Number(payload.businessId);
    if (session.role === "seller" && Number(session.businessId || 0) !== businessId) {
      send(res, 403, { ok: false, message: "You can only manage products for your approved business." });
      return;
    }
    const categoryName = text(payload.categoryName || payload.productCategory || payload.categoryId, 100);
    if (!categoryName) {
      send(res, 422, { ok: false, message: "Select a valid product category." });
      return;
    }
    let categoryId = Number(payload.categoryId) || 0;
    if (!categoryId) {
      const result = await query(
        "INSERT INTO categories (business_id, name, image) VALUES (?, ?, '') ON DUPLICATE KEY UPDATE name = VALUES(name)",
        [businessId, categoryName]
      );
      categoryId = result.insertId || 0;
      if (!categoryId) {
        const rows = await query("SELECT id FROM categories WHERE business_id = ? AND name = ? LIMIT 1", [businessId, categoryName]);
        categoryId = Number(rows[0]?.id || 0);
      }
    }
    const productId = Number(payload.id) || 0;
    const params = [
      businessId,
      categoryId,
      text(payload.name, 150),
      text(payload.image, 1048576),
      number(payload.price),
      payload.offerFlag ? 1 : 0,
      Math.max(0, Number(payload.stock || 0)),
      text(payload.description, 500)
    ];
    if (productId) {
      await query(
        `UPDATE products SET business_id = ?, category_id = ?, name = ?, image = ?, price = ?, offer_flag = ?, stock = ?, description = ? WHERE id = ?`,
        [...params, productId]
      );
      send(res, 200, { ok: true, product: { id: String(productId) } });
      return;
    }
    const result = await query(
      "INSERT INTO products (business_id, category_id, name, image, price, offer_flag, stock, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      params
    );
    send(res, 200, { ok: true, product: { id: String(result.insertId) } });
  } catch {
    send(res, 500, { ok: false, message: "Failed to save product." });
  }
};
