const { claims } = require("../_lib/auth");
const { query } = require("../_lib/db");
const { method, send } = require("../_lib/http");

module.exports = async function handler(req, res) {
  if (!method(req, res, "GET")) return;
  const session = claims(req);
  if (session?.role !== "seller" || !Number.isInteger(Number(session.businessId)) || Number(session.businessId) < 1) {
    send(res, 403, { ok: false, message: "Sign in as a seller to view this catalog." });
    return;
  }

  try {
    const url = new URL(req.url, "http://local");
    const requestedLimit = Number.parseInt(url.searchParams.get("limit") || "50", 10);
    const limit = Math.min(100, Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : 50));
    const requestedOffset = Number.parseInt(url.searchParams.get("offset") || "0", 10);
    const offset = Math.max(0, Number.isFinite(requestedOffset) ? requestedOffset : 0);
    const businessId = Number(session.businessId);

    const [productRows, countRows, categoryRows, offerRows] = await Promise.all([
      query(
        `select p.id, p.business_id, p.category_id, p.name, p.image, p.price, p.stock,
                p.description, p.created_at, c.name as category_name
           from products p
           left join categories c on c.id = p.category_id
          where p.business_id = $1
          order by p.created_at desc, p.id desc
          limit $2 offset $3`,
        [businessId, limit, offset]
      ),
      query("select count(*)::int as total from products where business_id = $1", [businessId]),
      query(
        `select id, business_id, name, image
           from categories
          where business_id is null or business_id = $1
          order by name asc
          limit 500`,
        [businessId]
      ),
      query(
        `select public_id, seller_public_id, store_name, offer_title, offer_note,
                offer_before_price, offer_now_price, offer_expiry, offer_image, created_at
           from seller_offers
          where seller_public_id = $1
          order by created_at desc
          limit 200`,
        [String(businessId)]
      )
    ]);

    const products = productRows.map((row) => {
      const categoryName = row.category_name || "Other";
      const stockCount = Number(row.stock || 0);
      const price = Number(row.price || 0);
      return {
        itemType: "product",
        id: String(row.id),
        businessId: String(row.business_id),
        sellerId: String(row.business_id),
        storeId: String(row.business_id),
        categoryId: String(row.category_id || ""),
        categoryName,
        productCategory: categoryName,
        name: row.name,
        productName: row.name,
        image: row.image || "",
        productImage: row.image || "",
        price,
        productPrice: price,
        stock: stockCount <= 0 ? "Out of stock" : stockCount <= 5 ? "Limited stock" : "In stock",
        stockCount,
        productStock: stockCount <= 0 ? "Out of stock" : stockCount <= 5 ? "Limited stock" : "In stock",
        offerFlag: false,
        offerText: "",
        description: row.description || "",
        productDescription: row.description || "",
        createdAt: row.created_at || ""
      };
    });

    const offers = offerRows.map((row) => ({
      itemType: "offer",
      id: row.public_id,
      sellerId: String(row.seller_public_id),
      storeId: String(row.seller_public_id),
      businessId: String(row.seller_public_id),
      storeName: row.store_name || "",
      offerTitle: row.offer_title || "",
      offerNote: row.offer_note || "",
      beforePrice: Number(row.offer_before_price || 0),
      nowPrice: Number(row.offer_now_price || 0),
      offerExpiry: row.offer_expiry || "",
      offerImage: row.offer_image || "",
      createdAt: row.created_at || ""
    }));

    const total = Number(countRows[0]?.total || 0);
    send(res, 200, {
      ok: true,
      categories: categoryRows.map((row) => ({
        id: String(row.id),
        businessId: String(row.business_id || ""),
        name: row.name,
        image: row.image || ""
      })),
      products,
      offers,
      page: { limit, offset, returned: products.length, total, hasMore: offset + products.length < total }
    });
  } catch (error) {
    send(res, 500, {
      ok: false,
      message: "Seller catalog could not be loaded.",
      error: String(error?.message || error).slice(0, 180)
    });
  }
};
