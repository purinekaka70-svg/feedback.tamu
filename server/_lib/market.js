const DEFAULT_CATEGORIES = ["Supermarket", "Retail", "Wholesale"];

function slug(value) {
  return String(value || "item")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item";
}

function key(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function parseJson(value, fallback = []) {
  if (Array.isArray(value) || (value && typeof value === "object")) return value;
  try {
    return JSON.parse(String(value || ""));
  } catch {
    return fallback;
  }
}

function sellerFromBusiness(row) {
  const location = row.location_name || row.location || "Location pending";
  const logo = row.logo_image || row.logo || "";
  return {
    id: String(row.id),
    businessId: String(row.id),
    userId: row.user_id || "",
    locationId: slug(location),
    name: row.name || row.store_name || "",
    storeName: row.name || row.store_name || "",
    type: row.type || row.business_type || "retail",
    businessType: row.type || row.business_type || "retail",
    logo,
    logoImage: logo,
    rating: Number(row.rating || 4.5),
    ownerName: row.owner_name || "",
    phone: row.phone || "",
    email: row.email || "",
    location,
    county: location,
    latitude: Number(row.latitude || 0),
    longitude: Number(row.longitude || 0),
    paymentOptions: parseJson(row.payment_methods, []),
    tillNumber: row.till_number || "",
    pochiNumber: row.pochi_number || "",
    bankAccount: row.bank_account || "",
    deliveryAvailability: row.delivery_availability || "",
    deliveryNotes: row.delivery_notes || "",
    status: row.status || "pending",
    subscriptionStatus: row.subscription_status || "",
    subscriptionStartedAt: row.subscription_started_at || "",
    subscriptionExpiresAt: row.subscription_expires_at || "",
    expiresAt: row.subscription_expires_at || row.expires_at || "",
    createdAt: row.created_at || ""
  };
}

function normalizeStatus(value, allowed, fallback) {
  const normalized = key(value).replace(/-/g, "_");
  return allowed.includes(normalized) ? normalized : fallback;
}

module.exports = { DEFAULT_CATEGORIES, key, normalizeStatus, parseJson, sellerFromBusiness, slug };
