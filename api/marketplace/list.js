const { columnExists, query, tableExists } = require("../_lib/db");
const { method, send } = require("../_lib/http");

const DEFAULT_CATEGORIES = ["Supermarket", "Retail", "Wholesale"];

function slug(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "item";
}

function key(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

module.exports = async function handler(req, res) {
  if (!method(req, res, "GET")) return;

  try {
    const businesses = [];
    const businessById = new Map();
    if (await tableExists("businesses")) {
      const rows = await query("SELECT * FROM businesses WHERE status = 'approved' ORDER BY created_at DESC");
      rows.forEach((row) => {
        const business = {
          ...row,
          id: String(row.id),
          storeId: String(row.id),
          sellerId: String(row.id),
          businessId: String(row.id),
          storeName: row.name,
          businessName: row.name,
          ownerName: row.owner_name || "",
          location: row.location_name || "Location pending",
          county: row.location_name || "",
          locationId: slug(row.location_name || row.id),
          businessType: row.type || "retail",
          type: row.type || "retail",
          logoImage: row.logo_image || row.logo || "",
          rating: Number(row.rating || 4.5),
          latitude: Number(row.latitude || 0),
          longitude: Number(row.longitude || 0),
          paymentMethods: row.payment_methods ? String(row.payment_methods).split(",").map((item) => item.trim()).filter(Boolean) : [],
          tillNumber: row.till_number || "",
          pochiNumber: row.pochi_number || "",
          bankAccount: row.bank_account || "",
          status: row.status
        };
        businesses.push(business);
        businessById.set(String(row.id), business);
      });
    }

    const products = [];
    if (await tableExists("products")) {
      const rows = await query(
        `SELECT p.*, c.name AS category_name
         FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
         ORDER BY p.created_at DESC`
      );
      rows.forEach((row) => {
        const business = businessById.get(String(row.business_id));
        if (!business) return;
        const categoryName = row.category_name || "Other";
        const stock = Number(row.stock || 0);
        products.push({
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
          stockCount: stock,
          productStock: stock <= 0 ? "Out of stock" : stock <= 5 ? "Limited stock" : "In stock",
          offerFlag: Boolean(row.offer_flag),
          productOffer: row.offer_flag ? "Offer" : "",
          description: row.description || "",
          createdAt: row.created_at
        });
      });
    }

    const categories = new Map();
    DEFAULT_CATEGORIES.forEach((name) => categories.set(`default-${key(name)}`, {
      id: slug(name),
      businessId: "",
      name,
      image: "",
      default: true
    }));
    if (await tableExists("categories")) {
      const imageColumn = await columnExists("categories", "image") ? ", image" : "";
      const rows = await query(`SELECT id, business_id, name${imageColumn} FROM categories ORDER BY name ASC`);
      rows.forEach((row) => categories.set(`${row.business_id || ""}-${key(row.name)}`, {
        id: String(row.id),
        businessId: String(row.business_id || ""),
        name: row.name,
        image: row.image || ""
      }));
    }
    products.forEach((product) => {
      const categoryMapKey = `${product.businessId}-${key(product.productCategory)}`;
      if (!categories.has(categoryMapKey)) {
        categories.set(categoryMapKey, {
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

    send(res, 200, {
      ok: true,
      locations: [...locations.values()],
      businesses,
      categories: [...categories.values()],
      products,
      offers
    });
  } catch (error) {
    send(res, 500, { ok: false, message: "Failed to load live marketplace data." });
  }
};
