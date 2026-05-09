const { requireRole } = require("../_lib/auth");
const { query } = require("../_lib/db");
const { body, method, number, send, text } = require("../_lib/http");

async function resolveCategoryId(businessId, payload) {
  const rawId = text(payload.categoryId, 100);
  if (/^\d+$/.test(rawId)) return Number(rawId);
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

module.exports = async function handler(req, res) {
  if (!method(req, res, "POST")) return;
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
    const params = [
      businessId,
      categoryId,
      text(payload.name, 150),
      text(payload.image, 230400),
      number(payload.price),
      Boolean(payload.offerFlag),
      text(payload.productOffer || payload.offerText || payload.offer, 500),
      Math.max(0, Math.trunc(number(payload.stock))),
      text(payload.description, 500)
    ];
    const hasOfferText = await columnExists("products", "offer_text");
    let rows;
    if (payload.id && /^\d+$/.test(String(payload.id))) {
      rows = hasOfferText
        ? await query(
            `update products set business_id=$1, category_id=$2, name=$3, image=$4, price=$5, offer_flag=$6, offer_text=$7, stock=$8, description=$9
              where id=$10 returning id`,
            [...params, Number(payload.id)]
          )
        : await query(
            `update products set business_id=$1, category_id=$2, name=$3, image=$4, price=$5, offer_flag=$6, stock=$7, description=$8
              where id=$9 returning id`,
            [params[0], params[1], params[2], params[3], params[4], params[5], params[7], params[8], Number(payload.id)]
          );
    } else {
      rows = hasOfferText
        ? await query(
            "insert into products (business_id, category_id, name, image, price, offer_flag, offer_text, stock, description) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id",
            params
          )
        : await query(
            "insert into products (business_id, category_id, name, image, price, offer_flag, stock, description) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id",
            [params[0], params[1], params[2], params[3], params[4], params[5], params[7], params[8]]
          );
    }
    send(res, 201, { ok: true, product: { id: rows[0]?.id || payload.id } });
  } catch {
    send(res, 500, { ok: false, message: "Failed to save product." });
  }
};
