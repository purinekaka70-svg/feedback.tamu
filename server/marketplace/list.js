const { query } = require("../_lib/db");
const { method, send } = require("../_lib/http");
const { DEFAULT_CATEGORIES, key, sellerFromBusiness, slug } = require("../_lib/market");

module.exports = async function handler(req, res) {
  if (!method(req, res, "GET")) return;
  try {
    const businessRows = await query(
      `select id, user_id, name, owner_name, phone, email, type, location_name, latitude, longitude,
              payment_methods, till_number, pochi_number, bank_account, delivery_availability,
              delivery_notes, logo, logo_image, rating, status, created_at
         from businesses
        where status = 'approved'
        order by name asc`
    );
    const businesses = businessRows.map(sellerFromBusiness).map((business) => ({ ...business, status: "approved" }));
    const businessById = Object.fromEntries(businesses.map((business) => [String(business.id), business]));

    const productRows = await query(
      `select p.id, p.business_id, p.category_id, p.name, p.image, p.price, p.offer_flag, p.stock, p.description, p.created_at,
              c.name as category_name
         from products p
         left join categories c on c.id = p.category_id
        order by p.created_at desc`
    );
    const products = productRows.flatMap((row) => {
      const business = businessById[String(row.business_id)];
      if (!business) return [];
      const categoryName = row.category_name || row.category_id || "Other";
      const stockCount = Number(row.stock || 0);
      const stock = stockCount <= 0 ? "Out of stock" : stockCount <= 5 ? "Limited stock" : "In stock";
      return [{
        id: String(row.id),
        businessId: String(row.business_id),
        sellerId: String(row.business_id),
        storeId: String(row.business_id),
        businessName: business.storeName,
        sellerName: business.storeName,
        storeName: business.storeName,
        categoryId: String(row.category_id || slug(categoryName)),
        categoryName,
        productCategory: categoryName,
        name: row.name,
        productName: row.name,
        image: row.image || "",
        productImage: row.image || "",
        price: Number(row.price || 0),
        productPrice: Number(row.price || 0),
        stock,
        stockCount,
        productStock: stock,
        offerFlag: Boolean(row.offer_flag),
        productOffer: row.offer_flag ? "Offer" : "",
        description: row.description || "",
        createdAt: row.created_at || ""
      }];
    });

    const categoryMap = new Map();
    DEFAULT_CATEGORIES.forEach((name) => categoryMap.set(`default-${key(name)}`, {
      id: slug(name),
      businessId: "",
      name,
      image: "",
      default: true
    }));
    const categoryRows = await query("select id, business_id, name, image from categories order by name asc");
    categoryRows.forEach((row) => categoryMap.set(`${row.business_id || ""}-${key(row.name)}`, {
      id: String(row.id),
      businessId: row.business_id ? String(row.business_id) : "",
      name: row.name,
      image: row.image || ""
    }));
    products.forEach((product) => {
      const mapKey = `${product.businessId}-${key(product.productCategory)}`;
      if (!categoryMap.has(mapKey)) {
        categoryMap.set(mapKey, {
          id: product.categoryId,
          businessId: product.businessId,
          name: product.productCategory,
          image: product.productImage
        });
      }
    });

    const locations = new Map();
    businesses.forEach((business) => {
      if (!locations.has(business.locationId)) {
        locations.set(business.locationId, {
          id: business.locationId,
          name: business.location,
          image: business.logoImage,
          description: "Live marketplace location",
          businessCount: 0
        });
      }
      locations.get(business.locationId).businessCount += 1;
    });

    const offers = products.filter((product) => product.offerFlag).map((product) => ({
      id: `product-offer-${product.id}`,
      storeId: product.storeId,
      sellerId: product.storeId,
      businessId: product.storeId,
      storeName: product.storeName,
      title: product.productName,
      offerTitle: product.productName,
      note: product.productOffer,
      offerNote: product.productOffer,
      expires: "Store offer",
      offerExpiry: "Store offer",
      image: product.productImage,
      offerImage: product.productImage,
      productId: product.id
    }));
    const sellerOffers = await query("select public_id, seller_public_id, store_name, offer_title, offer_note, offer_expiry, offer_image, created_at from seller_offers order by created_at desc");
    sellerOffers.forEach((row) => {
      const business = businessById[String(row.seller_public_id)];
      if (!business) return;
      offers.push({
        id: row.public_id,
        storeId: String(row.seller_public_id),
        sellerId: String(row.seller_public_id),
        businessId: String(row.seller_public_id),
        storeName: row.store_name || business.storeName,
        title: row.offer_title,
        offerTitle: row.offer_title,
        note: row.offer_note,
        offerNote: row.offer_note,
        expires: row.offer_expiry,
        offerExpiry: row.offer_expiry,
        image: row.offer_image || "",
        offerImage: row.offer_image || "",
        createdAt: row.created_at || ""
      });
    });

    send(res, 200, {
      ok: true,
      locations: [...locations.values()],
      businesses,
      categories: [...categoryMap.values()],
      products,
      offers
    });
  } catch {
    send(res, 500, { ok: false, message: "Failed to load live marketplace data." });
  }
};
