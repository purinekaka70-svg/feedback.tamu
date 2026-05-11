const { requireRole } = require("../_lib/auth");
const { query } = require("../_lib/db");
const { body, method, number, send, text } = require("../_lib/http");
const { rateLimit } = require("../_lib/security");

async function resolveCategoryId(businessId, payload) {
  const rawId = text(payload.categoryId, 100);
  if (/^\d+$/.test(rawId)) {
    const rows = await query(
      "select id from categories where id = $1 and (business_id = $2 or business_id is null) limit 1",
      [Number(rawId), businessId]
    );
    return rows[0]?.id || null;
  }
  const name = text(payload.categoryName || payload.productCategory || rawId, 100);
  if (!name) return null;
  const found = await query("select id from categories where business_id = $1 and lower(name) = lower($2) limit 1", [businessId, name]);
  if (found[0]) return found[0].id;
  const rows = await query("insert into categories (business_id, name, image) values ($1, $2, '') returning id", [businessId, name]);
  return rows[0].id;
}

async function columnExists(table, column) {
  const rows = await query(
    "select 1 from information_schema.columns where table_schema = 'public' and table_name = $1 and column_name = $2 limit 1",
    [table, column]
  );
  return rows.length > 0;
}

async function ensureProductDetailColumns() {
  await query("alter table products add column if not exists offer_text text not null default ''");
  await query("alter table products add column if not exists compare_at_price numeric(12, 2) not null default 0");
  await query("alter table products add column if not exists description text not null default ''");
}

module.exports = async function handler(req, res) {
  if (!method(req, res, "POST")) return;
  if (!rateLimit(req, res, "product-save", { limit: 80, windowMs: 10 * 60 * 1000 })) return;
  const session = requireRole(req, res, ["admin", "seller"]);
  if (!session) return;
  try {
    const payload = await body(req);
    const businessId = Number(payload.businessId || 0);
    if (session.role === "seller" && Number(session.businessId) !== businessId) {
      send(res, 403, { ok: false, message: "You can only manage products for your approved business." });
      return;
    }
    const categoryId = await resolveCategoryId(businessId, payload);
    if (!businessId || !categoryId || !text(payload.name, 150)) {
      send(res, 422, { ok: false, message: "Business, product name and category are required." });
      return;
    }
    await ensureProductDetailColumns().catch(() => {});
    const offerText = text(payload.productOffer || payload.offerText || payload.offer, 500);
    const descriptionText = text(payload.description || payload.productDescription || payload.details, 800);
    const price = number(payload.price);
    const compareAtPrice = number(payload.beforePrice || payload.compareAtPrice || payload.productBeforePrice || payload.compare_at_price);
    if (price < 0 || compareAtPrice < 0) {
      send(res, 422, { ok: false, message: "Product prices must be zero or more." });
      return;
    }
    if (compareAtPrice && compareAtPrice <= price) {
      send(res, 422, { ok: false, message: "Before price must be higher than the now price." });
      return;
    }
    const offerFlag = Boolean(payload.offerFlag || offerText || (compareAtPrice && compareAtPrice > price));
    const hasOfferText = await columnExists("products", "offer_text");
    const hasCompareAtPrice = await columnExists("products", "compare_at_price");
    const fields = [
      ["business_id", businessId],
      ["category_id", categoryId],
      ["name", text(payload.name, 150)],
      ["image", text(payload.image, 230400)],
      ["price", price]
    ];
    if (hasCompareAtPrice) {
      fields.push(["compare_at_price", compareAtPrice]);
    }
    fields.push(["offer_flag", offerFlag]);
    if (hasOfferText) {
      fields.push(["offer_text", offerText]);
    }
    fields.push(
      ["stock", Math.max(0, Math.trunc(number(payload.stock)))],
      ["description", descriptionText]
    );
    const columns = fields.map(([column]) => column);
    const params = fields.map(([, value]) => value);
    let rows;
    if (payload.id && /^\d+$/.test(String(payload.id))) {
      const id = Number(payload.id);
      const setClause = columns.map((column, index) => `${column}=$${index + 1}`).join(", ");
      rows = await query(
        `update products set ${setClause}
          where id=$${params.length + 1} ${session.role === "seller" ? "and business_id=$1" : ""} returning id`,
        [...params, id]
      );
    } else {
      const placeholders = params.map((_, index) => `$${index + 1}`).join(",");
      rows = await query(
        `insert into products (${columns.join(", ")}) values (${placeholders}) returning id`,
        params
      );
    }
    if (payload.id && !rows.length) {
      send(res, 403, { ok: false, message: "Product was not found for your business." });
      return;
    }
    send(res, 201, { ok: true, product: { id: rows[0]?.id || payload.id } });
  } catch {
    send(res, 500, { ok: false, message: "Failed to save product." });
  }
};
