const { query } = require("../_lib/db");
const { method, send } = require("../_lib/http");
const { DEFAULT_CATEGORIES, key, sellerFromBusiness, slug } = require("../_lib/market");

async function columnExists(table, column) {
  const rows = await query(
    "select 1 from information_schema.columns where table_schema = 'public' and table_name = $1 and column_name = $2 limit 1",
    [table, column]
  );
  return rows.length > 0;
}

async function tableExists(table) {
  const rows = await query(
    "select 1 from information_schema.tables where table_schema = 'public' and table_name = $1 limit 1",
    [table]
  );
  return rows.length > 0;
}

async function safeColumns(table, columns) {
  const checks = await Promise.all(columns.map(async (column) => [column, await columnExists(table, column)]));
  return Object.fromEntries(checks);
}

async function ensureBusinessSubscriptionColumns() {
  await query("alter table businesses add column if not exists subscription_started_at timestamptz").catch(() => {});
  await query("alter table businesses add column if not exists subscription_expires_at timestamptz").catch(() => {});
  await query("alter table businesses add column if not exists subscription_status text not null default 'inactive'").catch(() => {});
  await query(
    `update businesses
        set subscription_started_at = coalesce(subscription_started_at, now()),
            subscription_expires_at = coalesce(subscription_expires_at, now() + interval '1 month'),
            subscription_status = case
              when subscription_expires_at is not null and subscription_expires_at <= now() then 'expired'
              else 'active'
            end
      where status = 'approved'
        and (subscription_expires_at is null or coalesce(subscription_status, '') = '')`
  ).catch(() => {});
}

function selectColumn(columns, name, fallback = "''") {
  return columns[name] ? name : `${fallback} as ${name}`;
}

function actualOfferText(...values) {
  return values
    .map((value) => String(value || "").trim())
    .find((value) => value && !/^(offer|store offer|special offer)$/i.test(value)) || "";
}

module.exports = async function handler(req, res) {
  if (!method(req, res, "GET")) return;
  try {
    const databaseConfigured = Boolean(
      process.env.SUPABASE_DB_URL ||
      process.env.DATABASE_URL ||
      process.env.POSTGRES_URL ||
      process.env.SUPABASE_DB_HOST
    );
    if (!databaseConfigured) {
      send(res, 200, {
        ok: true,
        locations: [],
        businesses: [],
        categories: [],
        products: [],
        offers: [],
        message: "Database connection is not configured."
      });
      return;
    }

    const hasBusinesses = await tableExists("businesses");
    if (!hasBusinesses) {
      send(res, 200, {
        ok: true,
        locations: [],
        businesses: [],
        categories: [],
        products: [],
        offers: [],
        message: "No businesses table is available yet."
      });
      return;
    }
    await ensureBusinessSubscriptionColumns();

    const businessColumns = await safeColumns("businesses", [
      "id",
      "user_id",
      "name",
      "store_name",
      "owner_name",
      "phone",
      "email",
      "type",
      "business_type",
      "location_name",
      "location",
      "county",
      "latitude",
      "longitude",
      "payment_methods",
      "till_number",
      "pochi_number",
      "bank_account",
      "delivery_availability",
      "delivery_notes",
      "logo",
      "logo_image",
      "rating",
      "status",
      "subscription_started_at",
      "subscription_expires_at",
      "subscription_status",
      "created_at"
    ]);
    const filters = [];
    if (businessColumns.status) filters.push("status = 'approved'");
    if (businessColumns.subscription_expires_at) {
      filters.push("(subscription_expires_at is null or subscription_expires_at > now())");
    }
    if (businessColumns.subscription_status) {
      filters.push("(subscription_status is null or subscription_status <> 'expired')");
    }
    const statusFilter = filters.length ? `where ${filters.join(" and ")}` : "";
    const businessRows = await query(
      `select ${selectColumn(businessColumns, "id", "0")},
              ${selectColumn(businessColumns, "user_id")},
              ${businessColumns.name ? "name" : selectColumn(businessColumns, "store_name", "'Business'")},
              ${selectColumn(businessColumns, "owner_name")},
              ${selectColumn(businessColumns, "phone")},
              ${selectColumn(businessColumns, "email")},
              ${businessColumns.type ? "type" : selectColumn(businessColumns, "business_type", "'Retail'")},
              ${businessColumns.location_name ? "location_name" : businessColumns.location ? "location as location_name" : businessColumns.county ? "county as location_name" : "'' as location_name"},
              ${selectColumn(businessColumns, "latitude", "0")},
              ${selectColumn(businessColumns, "longitude", "0")},
              ${selectColumn(businessColumns, "payment_methods", "'[]'")},
              ${selectColumn(businessColumns, "till_number")},
              ${selectColumn(businessColumns, "pochi_number")},
              ${selectColumn(businessColumns, "bank_account")},
              ${selectColumn(businessColumns, "delivery_availability")},
              ${selectColumn(businessColumns, "delivery_notes")},
              ${selectColumn(businessColumns, "logo")},
              ${selectColumn(businessColumns, "logo_image")},
              ${selectColumn(businessColumns, "rating", "4.5")},
              ${selectColumn(businessColumns, "status", "'approved'")},
              ${selectColumn(businessColumns, "subscription_started_at", "null")},
              ${selectColumn(businessColumns, "subscription_expires_at", "null")},
              ${selectColumn(businessColumns, "subscription_status", "''")},
              ${selectColumn(businessColumns, "created_at", "now()")}
         from businesses
        ${statusFilter}
        order by name asc`
    );
    const businesses = businessRows.map(sellerFromBusiness).map((business) => ({ ...business, status: "approved" }));
    const businessById = Object.fromEntries(businesses.map((business) => [String(business.id), business]));

    const hasProducts = await tableExists("products");
    const hasCategories = await tableExists("categories");
    const productRows = hasProducts
      ? await query(
          `select p.*, ${hasCategories ? "c.name" : "null"} as category_name
             from products p
             ${hasCategories ? "left join categories c on c.id = p.category_id" : ""}
            order by p.created_at desc`
        )
      : [];
    const products = productRows.flatMap((row) => {
      const business = businessById[String(row.business_id)];
      if (!business) return [];
      const categoryName = row.category_name || row.category_id || "Other";
      const stockCount = Number(row.stock || 0);
      const stock = stockCount <= 0 ? "Out of stock" : stockCount <= 5 ? "Limited stock" : "In stock";
      const offerText = actualOfferText(row.offer_text, row.offer_note, row.offer, row.description);
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
        offerFlag: Boolean(row.offer_flag || offerText),
        productOffer: offerText,
        offerText,
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
    const categoryRows = hasCategories
      ? await query("select id, business_id, name, image from categories order by name asc")
      : [];
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
    const hasSellerOffers = await tableExists("seller_offers");
    const sellerOffers = hasSellerOffers
      ? await query("select public_id, seller_public_id, store_name, offer_title, offer_note, offer_expiry, offer_image, created_at from seller_offers order by created_at desc")
      : [];
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
  } catch (error) {
    send(res, 500, {
      ok: false,
      message: "Failed to load live marketplace data.",
      error: String(error?.message || error).slice(0, 180)
    });
  }
};
