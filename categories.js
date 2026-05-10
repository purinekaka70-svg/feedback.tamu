let cachedApplications = [];
let cachedProducts = [];
let cachedCategories = [];
let cachedOffers = [];
let marketLoadError = "";
const STORAGE_KEYS = {
  cartSession: "tamu_market_cart_session",
  cartItems: "tamu_market_cart_items",
  buyerProfile: "tamu_market_buyer_profile",
  adminSession: "tamu_market_admin_session",
  previewState: "tamu_market_preview_state"
};

const fallbackLocationImages = [
  "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=70",
  "https://images.unsplash.com/photo-1543168256-418811576931?auto=format&fit=crop&w=900&q=70",
  "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?auto=format&fit=crop&w=900&q=70",
  "https://images.unsplash.com/photo-1516594798947-e65505dbb29d?auto=format&fit=crop&w=900&q=70"
];
const businessTypeImagePools = {
  clothes: [
    "https://images.unsplash.com/photo-1445205170230-053b83016050?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?auto=format&fit=crop&w=900&q=72"
  ],
  hotel: [
    "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=900&q=72"
  ],
  electronics: [
    "https://images.unsplash.com/photo-1498049794561-7780e7231661?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1550009158-9ebf69173e03?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1588508065123-287b28e013da?auto=format&fit=crop&w=900&q=72"
  ],
  hardware: [
    "https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1586864387967-d02ef85d93e8?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1562259929-b4e1fd3aef09?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1581783898377-1c85bf937427?auto=format&fit=crop&w=900&q=72"
  ],
  cosmetics: [
    "https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1571781926291-c477ebfd024b?auto=format&fit=crop&w=900&q=72"
  ],
  pharmacy: [
    "https://images.unsplash.com/photo-1587854692152-cbe660dbde88?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1471864190281-a93a3070b6de?auto=format&fit=crop&w=900&q=72"
  ],
  supermarket: [
    "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1578916171728-46686eac8d58?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1534723452862-4c874018d66d?auto=format&fit=crop&w=900&q=72"
  ],
  retail: [
    "https://images.unsplash.com/photo-1515706886582-54c73c5eaf41?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1601598851547-4302969d0614?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1556741533-6e6a62bd8b49?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=900&q=72"
  ],
  wholesale: [
    "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1580674285054-bed31e145f59?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1587293852726-70cdb56c2866?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1565891741441-64926e441838?auto=format&fit=crop&w=900&q=72"
  ],
  mixed: [
    "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1543168256-418811576931?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1516594798947-e65505dbb29d?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1533900298318-6b8da08a523e?auto=format&fit=crop&w=900&q=72"
  ]
};
const categoryImagePools = {
  grocery: [
    "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1578916171728-46686eac8d58?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?auto=format&fit=crop&w=900&q=72"
  ],
  fresh: [
    "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1516594798947-e65505dbb29d?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1543168256-418811576931?auto=format&fit=crop&w=900&q=72"
  ],
  beverage: [
    "https://images.unsplash.com/photo-1532634922-8fe0b757fb13?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1563223771-5fe4038fbfc9?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=900&q=72"
  ],
  household: [
    "https://images.unsplash.com/photo-1585421514738-01798e348b17?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=900&q=72"
  ],
  snack: [
    "https://images.unsplash.com/photo-1621939514649-280e2ee25f60?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1599490659213-e2b9527bd087?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1604882406195-d94d4888564d?auto=format&fit=crop&w=900&q=72"
  ],
  wholesale: businessTypeImagePools.wholesale
};

const state = {
  selectedType: "all",
  selectedCategory: "all",
  focusedLocation: readStorage(STORAGE_KEYS.previewState, {}).focusedLocation || "all",
  focusedStoreId: readStorage(STORAGE_KEYS.previewState, {}).focusedStoreId || "all",
  focusedBusinessCategory: readStorage(STORAGE_KEYS.previewState, {}).focusedBusinessCategory || "all",
  activeShopStoreId: readStorage(STORAGE_KEYS.previewState, {}).activeShopStoreId || "",
  shopQuery: readStorage(STORAGE_KEYS.previewState, {}).shopQuery || "",
  locationSearch: "",
  businessSearch: readStorage(STORAGE_KEYS.previewState, {}).businessSearch || "",
  search: "",
  cart: []
};
let shopSearchRenderTimer = null;

function cartSessionId() {
  let id = window.localStorage.getItem(STORAGE_KEYS.cartSession);
  if (!id) {
    id = createId("cart-session");
    window.localStorage.setItem(STORAGE_KEYS.cartSession, id);
  }
  return id;
}

function readStorage(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    return;
  }
}

async function postJson(url, payload) {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, data };
  } catch (error) {
    return { ok: false, data: { ok: false, message: "Backend service is unavailable." } };
  }
}

async function loadCartFromBackend() {
  try {
    const response = await fetch(`./api/cart/index.php?sessionId=${encodeURIComponent(cartSessionId())}`, { cache: "no-store" });
    const data = await response.json();
    const backendCart = response.ok && data.ok
      ? (data.items || []).map((item) => ({
          productId: String(item.product_public_id || item.product_id || item.productId || ""),
          quantity: Number(item.quantity || 1)
        })).filter((item) => item.productId)
      : [];
    state.cart = backendCart.length ? backendCart : readStorage(STORAGE_KEYS.cartItems, []);
  } catch (error) {
    state.cart = readStorage(STORAGE_KEYS.cartItems, []);
  }
  writeStorage(STORAGE_KEYS.cartItems, state.cart);
}

async function saveCartItemToBackend(productId, quantity) {
  const product = getProduct(productId);
  if (!product) return;
  writeStorage(STORAGE_KEYS.cartItems, state.cart);
  await postJson("./api/cart/index.php", {
    sessionId: cartSessionId(),
    productId,
    businessId: product.storeId,
    productName: product.productName,
    storeName: product.storeName || getStore(product.storeId)?.storeName || "",
    unitPrice: product.productPrice,
    image: product.productImage,
    quantity
  });
}

async function clearCartBackend() {
  try {
    await fetch("./api/cart/index.php", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: cartSessionId() })
    });
  } catch (error) {
    // Backend errors are surfaced when cart reloads.
  }
  writeStorage(STORAGE_KEYS.cartItems, []);
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item";
}

function normalizeBusinessRecord(record = {}) {
  const name = String(record.name || record.storeName || record.businessName || record.email || "Business").trim();
  const location = String(record.location || record.county || record.locationName || record.locationId || "Unknown location").trim();
  const type = String(record.type || record.businessType || "retail").trim().toLowerCase();
  const logo = record.logo || record.logoImage || record.businessImage || record.image || "";

  return {
    ...record,
    name,
    storeName: record.storeName || name,
    locationId: record.locationId || slugify(location),
    location,
    county: record.county || location,
    type,
    businessType: record.businessType || type,
    logo,
    logoImage: record.logoImage || logo,
    rating: Number(record.rating) || 4.5,
    subscriptionStatus: record.subscriptionStatus || record.subscription_status || "",
    subscriptionStartedAt: record.subscriptionStartedAt || record.subscription_started_at || "",
    subscriptionExpiresAt: record.subscriptionExpiresAt || record.subscription_expires_at || record.expiresAt || "",
    expiresAt: record.expiresAt || record.subscriptionExpiresAt || record.subscription_expires_at || ""
  };
}

function normalizeProductRecord(product = {}) {
  const businessId = String(product.businessId || product.storeId || product.sellerId || "").trim();
  const categoryName = String(product.categoryName || product.productCategory || product.category || "Other").trim();
  const categoryId = product.categoryId || `${businessId || "business"}-${slugify(categoryName)}`;
  const name = String(product.name || product.productName || "Product").trim();
  const image = product.image || product.productImage || "";
  const price = Number(product.price ?? product.productPrice) || 0;
  const stock = String(product.stock || product.productStock || "In stock").trim();
  const rawOffer = product.offerText || product.productOffer || product.offer || product.description || "";
  const productOffer = /^(offer|store offer|special offer)$/i.test(String(rawOffer).trim()) ? "" : rawOffer;
  const offerFlag = Boolean(product.offerFlag || product.isOffer || productOffer);

  return {
    ...product,
    businessId,
    sellerId: product.sellerId || businessId,
    storeId: product.storeId || businessId,
    businessName: product.businessName || product.storeName || product.sellerName || "",
    sellerName: product.sellerName || product.storeName || product.businessName || "",
    storeName: product.storeName || product.businessName || product.sellerName || "",
    categoryId,
    categoryName,
    productCategory: product.productCategory || categoryName,
    name,
    productName: product.productName || name,
    image,
    productImage: product.productImage || image,
    price,
    productPrice: price,
    stock,
    productStock: stock,
    offerFlag,
    productOffer
  };
}

function savePreviewState() {
  writeStorage(STORAGE_KEYS.previewState, {
    selectedType: state.selectedType,
    selectedCategory: state.selectedCategory,
    focusedLocation: state.focusedLocation,
    focusedStoreId: state.focusedStoreId,
    focusedBusinessCategory: state.focusedBusinessCategory,
    activeShopStoreId: state.activeShopStoreId,
    shopQuery: state.shopQuery,
    businessSearch: state.businessSearch,
    search: state.search,
    updatedAt: new Date().toISOString()
  });
}

function currency(value) {
  return `KSh ${Number(value).toLocaleString()}`;
}

function isBogoOffer(product) {
  return /buy\s*1\s*get\s*1|buy\s*one\s*get\s*one|bogo|one\s*free/i.test(String(product?.productOffer || ""));
}

function paidQuantityForProduct(product, quantity) {
  const qty = Math.max(0, Number(quantity) || 0);
  return isBogoOffer(product) ? Math.ceil(qty / 2) : qty;
}

function productLineTotal(product, quantity) {
  return product ? product.productPrice * paidQuantityForProduct(product, quantity) : 0;
}

function offerMessage(product) {
  return product?.productOffer || "";
}

function offerCardMessage(offer) {
  return offer?.note || offer?.title || "";
}

function offerToastDuration(message) {
  const length = String(message || "").length;
  return Math.min(12000, Math.max(5200, 2600 + length * 45));
}

function bindHoldToast(element, messageFactory) {
  if (!element) return;
  let holdTimer = null;
  let hoverTimer = null;
  let lastShownAt = 0;
  const clearHold = () => {
    if (holdTimer) {
      window.clearTimeout(holdTimer);
      holdTimer = null;
    }
  };
  const clearHover = () => {
    if (hoverTimer) {
      window.clearTimeout(hoverTimer);
      hoverTimer = null;
    }
  };
  const showOfferToast = () => {
    const message = String(messageFactory() || "").trim();
    const now = Date.now();
    if (now - lastShownAt < 900) {
      return;
    }
    lastShownAt = now;
    if (message) {
      showToast(message, "info", offerToastDuration(message));
    }
  };
  element.addEventListener("pointerdown", (event) => {
    if (event.currentTarget !== event.target && event.target.closest("button, a, input, select, textarea")) {
      return;
    }
    clearHold();
    holdTimer = window.setTimeout(showOfferToast, 520);
  });
  ["pointerup", "pointerleave", "pointercancel"].forEach((eventName) => {
    element.addEventListener(eventName, clearHold);
  });
  element.addEventListener("pointerenter", () => {
    clearHover();
    hoverTimer = window.setTimeout(showOfferToast, 120);
  });
  element.addEventListener("pointerleave", clearHover);
  element.addEventListener("focusin", () => {
    clearHover();
    hoverTimer = window.setTimeout(showOfferToast, 120);
  });
  element.addEventListener("focusout", clearHover);
  element.addEventListener("click", (event) => {
    clearHold();
    if (event.target.closest("button, a, input, select, textarea")) {
      return;
    }
    showOfferToast();
  });
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function normalizePaymentOptions(options) {
  const cleaned = Array.isArray(options)
    ? options.map((entry) => String(entry).trim()).filter(Boolean)
    : [];
  return cleaned.length ? cleaned : ["M-Pesa", "Cash on Delivery"];
}

function applications() {
  const byId = new Map();
  [...cachedApplications].forEach((application) => {
    const key = application.id || application.email;
    if (!key) return;
    const current = byId.get(key) || {};
    const merged = { ...current, ...application };
    if (current.status === "approved" || application.status === "approved") {
      merged.status = "approved";
    }
    byId.set(key, merged);
  });
  return [...byId.values()].map(normalizeBusinessRecord);
}

async function loadMarketData() {
  try {
    const res = await fetch('./api/marketplace/list.php', { cache: 'no-store' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      marketLoadError = data.message || "Marketplace data could not load.";
      return;
    }
    const data = await res.json();
    if (data.ok) {
      marketLoadError = data.message || "";
      cachedApplications = data.businesses || [];
      cachedProducts = (data.products || []).map(normalizeProductRecord);
      cachedCategories = data.categories || [];
      cachedOffers = data.offers || [];
    } else {
      marketLoadError = data.message || "Marketplace data could not load.";
    }
  } catch (error) {
    marketLoadError = "Marketplace backend is unavailable.";
    cachedApplications = [];
    cachedProducts = [];
    cachedCategories = [];
    cachedOffers = [];
  }
}

function sellerProducts() {
  const approvedStoreIds = new Set(approvedStores().map((store) => store.id));
  const merged = cachedProducts.filter((product) => approvedStoreIds.has(product.storeId));
  return merged.filter((product, index, list) =>
    list.findIndex((item) => item.id === product.id) === index
  );
}

function sellerOffers() {
  const approvedStoreIds = new Set(approvedStores().map((store) => store.id));
  return cachedOffers.map((offer) => ({
    ...offer,
    storeId: String(offer.storeId || offer.sellerId || offer.businessId || ""),
    title: offer.title || offer.offerTitle || "",
    note: offer.note || offer.offerNote || "",
    image: offer.image || offer.offerImage || ""
  })).filter((offer) => approvedStoreIds.has(offer.storeId));
}

function buyerProfile() {
  return readStorage(STORAGE_KEYS.buyerProfile, {
    latitude: "",
    longitude: ""
  });
}

function approvedStores() {
  return applications().filter((application) => {
    if (application.status !== "approved") {
      return false;
    }
    if (String(application.subscriptionStatus || "").toLowerCase() === "expired") {
      return false;
    }
    if (!application.expiresAt) {
      return true;
    }
    const expiry = new Date(application.expiresAt).getTime();
    return Number.isFinite(expiry) ? expiry > Date.now() : true;
  });
}

function getStore(storeId) {
  return approvedStores().find((store) => store.id === storeId);
}

function getProduct(productId) {
  return sellerProducts().find((product) => product.id === productId);
}

function storePrimaryImage(storeId) {
  const productImage = sellerProducts().find((product) => product.storeId === storeId && product.productImage)?.productImage;
  if (productImage) {
    return productImage;
  }

  return sellerOffers().find((offer) => offer.storeId === storeId && offer.image)?.image || "";
}

function locationPrimaryImage(stores, storeProducts = []) {
  const imageByStoreId = new Map(stores.map((store) => [store.id, storePrimaryImage(store.id)]));
  const productImage = storeProducts.find((product) => product.productImage)?.productImage;
  return stores.map((store) => imageByStoreId.get(store.id)).find(Boolean) || productImage || "";
}

function fallbackImageFor(value, pool = fallbackLocationImages) {
  const text = String(value || "market");
  const index = [...text].reduce((sum, char) => sum + char.charCodeAt(0), 0) % pool.length;
  return pool[index];
}

function businessImageGroup(value) {
  const type = String(value || "").toLowerCase();
  if (type.includes("cloth") || type.includes("fashion") || type.includes("boutique") || type.includes("wear") || type.includes("shoe")) return "clothes";
  if (type.includes("hotel") || type.includes("restaurant") || type.includes("food") || type.includes("cafe") || type.includes("eatery")) return "hotel";
  if (type.includes("elect") || type.includes("phone") || type.includes("computer") || type.includes("gadget")) return "electronics";
  if (type.includes("hard") || type.includes("tool") || type.includes("build") || type.includes("paint") || type.includes("plumb")) return "hardware";
  if (type.includes("cosmetic") || type.includes("beauty") || type.includes("salon") || type.includes("makeup")) return "cosmetics";
  if (type.includes("pharma") || type.includes("chemist") || type.includes("drug") || type.includes("medicine")) return "pharmacy";
  if (type.includes("super") || type.includes("grocery") || type.includes("mini market")) return "supermarket";
  if (type.includes("whole") || type.includes("bulk")) return "wholesale";
  return "retail";
}

function fallbackBusinessImageFor(store) {
  const group = businessImageGroup(`${store.businessType || ""} ${store.storeName || ""}`);
  return fallbackImageFor(`${store.id || store.storeName || ""}-${group}`, businessTypeImagePools[group] || businessTypeImagePools.retail);
}

function escapeAttribute(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtml(value) {
  return escapeAttribute(value).replace(/'/g, "&#39;");
}

function normalizeSearchValue(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function searchTerms(value) {
  return normalizeSearchValue(value)
    .split(" ")
    .filter(Boolean);
}

function productSearchText(product, store) {
  return normalizeSearchValue([
    product.productName,
    product.name,
    product.productCategory,
    product.categoryName,
    product.description,
    product.productDescription,
    product.productOffer,
    product.offerTitle,
    product.sku,
    product.brand,
    product.productPrice,
    product.price,
    store?.storeName,
    store?.businessType,
    store?.location,
    store?.county
  ].filter((value) => value !== undefined && value !== null).join(" "));
}

function productMatchesSearch(product, store, query) {
  const terms = searchTerms(query);
  if (!terms.length) {
    return true;
  }

  const text = productSearchText(product, store);
  return terms.every((term) => text.includes(term));
}

function storeSearchText(store, products = []) {
  return normalizeSearchValue([
    store?.storeName,
    store?.name,
    store?.businessName,
    store?.businessType,
    store?.type,
    store?.location,
    store?.county,
    store?.locationName,
    store?.phone,
    store?.email,
    store?.deliveryAvailability,
    store?.deliveryNotes,
    products.map((product) => productSearchText(product, store)).join(" ")
  ].filter((value) => value !== undefined && value !== null).join(" "));
}

function matchesSearchTerms(text, query) {
  const terms = searchTerms(query);
  if (!terms.length) {
    return true;
  }

  const searchable = normalizeSearchValue(text);
  return terms.every((term) => searchable.includes(term));
}

function storeMatchesSearch(store, products, query) {
  return matchesSearchTerms(storeSearchText(store, products), query);
}

function cardImageHtml(src, alt, fallbackSeed = "market image") {
  const image = src || fallbackImageFor(fallbackSeed);
  const safeImage = escapeAttribute(image);
  const safeAlt = escapeAttribute(alt || "Marketplace image");
  const fallback = escapeAttribute(fallbackImageFor(fallbackSeed));
  return `
    <img src="${safeImage}" alt="${safeAlt}" loading="lazy" decoding="async" data-fallback-src="${fallback}" data-view-image data-image-title="${safeAlt}">
    <button class="image-view-button" type="button" data-view-image data-image-src="${safeImage}" data-image-title="${safeAlt}" aria-label="View ${safeAlt} image">View</button>
  `;
}

function normalizeBusinessType(value) {
  const type = String(value || "").toLowerCase();
  if (businessTypeImagePools[businessImageGroup(type)]) return businessImageGroup(type);
  if (type.includes("super")) return "supermarket";
  if (type.includes("whole")) return "wholesale";
  if (type.includes("retail") || type.includes("shop") || type.includes("mini")) return "retail";
  return "retail";
}

function dominantBusinessType(stores) {
  const counts = stores.reduce((summary, store) => {
    const type = normalizeBusinessType(store.businessType);
    summary[type] = (summary[type] || 0) + 1;
    return summary;
  }, {});
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!sorted.length) {
    return "mixed";
  }
  if (sorted.length > 1 && sorted[0][1] === sorted[1][1]) {
    return "mixed";
  }
  return sorted[0][0];
}

function normalizeCategoryGroup(value) {
  const category = String(value || "").toLowerCase();
  if (category.includes("whole") || category.includes("bulk")) return "wholesale";
  if (category.includes("fresh") || category.includes("food") || category.includes("dairy") || category.includes("meat") || category.includes("vegetable")) return "fresh";
  if (category.includes("drink") || category.includes("beverage") || category.includes("juice") || category.includes("water")) return "beverage";
  if (category.includes("house") || category.includes("clean") || category.includes("home")) return "household";
  if (category.includes("snack") || category.includes("sweet") || category.includes("biscuit")) return "snack";
  if (category.includes("grocery") || category.includes("grocer") || category.includes("super")) return "grocery";
  return "";
}

function dominantCategoryGroup(products) {
  const counts = products.reduce((summary, product) => {
    const group = normalizeCategoryGroup(product.productCategory || product.category);
    if (!group) return summary;
    summary[group] = (summary[group] || 0) + 1;
    return summary;
  }, {});
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!sorted.length) {
    return "";
  }
  if (sorted.length > 1 && sorted[0][1] === sorted[1][1]) {
    return "mixed";
  }
  return sorted[0][0];
}

function ecosystemImagePool(type, categoryGroup) {
  if (categoryGroup && categoryGroup !== "mixed" && categoryImagePools[categoryGroup]) {
    return categoryImagePools[categoryGroup];
  }
  return businessTypeImagePools[type] || businessTypeImagePools.mixed;
}

function ecosystemLabel(type, categoryGroup, uploadedImage) {
  if (uploadedImage) {
    return `${capitalize(type)} live hub`;
  }
  if (categoryGroup && categoryGroup !== "mixed") {
    return `${capitalize(categoryGroup)} hub`;
  }
  return `${capitalize(type)} hub`;
}

function locationCardImage(location, stores, storeProducts = []) {
  const type = dominantBusinessType(stores);
  const categoryGroup = dominantCategoryGroup(storeProducts);
  const uploadedImage = locationPrimaryImage(stores, storeProducts);
  const shouldUseUploadedImage = Boolean(uploadedImage && stores.length <= 2 && categoryGroup !== "mixed");

  if (shouldUseUploadedImage) {
    return {
      image: uploadedImage,
      type,
      categoryGroup,
      label: ecosystemLabel(type, categoryGroup, true)
    };
  }

  const pool = ecosystemImagePool(type, categoryGroup);
  return {
    image: fallbackImageFor(`${location}-${type}-${categoryGroup}-${stores.length}-${storeProducts.length}`, pool),
    type,
    categoryGroup,
    label: ecosystemLabel(type, categoryGroup, false)
  };
}

function currentCategories() {
  const storedCategories = cachedCategories
    .map((category) => typeof category === "string" ? category : category?.name)
    .filter(Boolean);
  const approvedStoreIds = new Set(approvedStores().map((store) => store.id));
  const liveCategories = sellerProducts()
    .filter((product) => approvedStoreIds.has(product.storeId))
    .map((product) => product.productCategory)
    .filter(Boolean);
  return ["all", ...new Set([...storedCategories, ...liveCategories])];
}

function visibleStores() {
  const query = state.search;
  const businessQuery = state.businessSearch.trim();
  const products = sellerProducts();

  return approvedStores().filter((store) => {
    const storeLocation = String(store.location || store.county || "Unknown location");
    const matchesType = state.selectedType === "all" || store.businessType === state.selectedType;
    const matchesLocation = state.focusedLocation === "all" || storeLocation === state.focusedLocation;
    const productCategories = products
      .filter((product) => product.storeId === store.id)
      .map((product) => product.productCategory);
    const matchesCategory =
      state.selectedCategory === "all" || productCategories.includes(state.selectedCategory);
    const storeProducts = products.filter((product) => product.storeId === store.id);
    const matchesSearch = storeMatchesSearch(store, storeProducts, query);
    const matchesBusinessSearch = storeMatchesSearch(store, storeProducts, businessQuery);

    return matchesType && matchesLocation && matchesCategory && matchesSearch && matchesBusinessSearch;
  });
}

function visibleProducts() {
  const allowedStoreIds = new Set(visibleStores().map((store) => store.id));
  const query = state.search.toLowerCase();

  return sellerProducts().filter((product) => {
    const inVisibleStore = allowedStoreIds.has(product.storeId);
    const matchesCategory =
      state.selectedCategory === "all" || product.productCategory === state.selectedCategory;
    const matchesFocusedStore =
      state.focusedStoreId === "all" || product.storeId === state.focusedStoreId;
    const matchesFocusedBusinessCategory =
      state.focusedBusinessCategory === "all" || product.productCategory === state.focusedBusinessCategory;
    const matchesSearch =
      !query ||
      product.productName.toLowerCase().includes(query) ||
      product.productCategory.toLowerCase().includes(query) ||
      (product.productOffer || "").toLowerCase().includes(query);

    return inVisibleStore && matchesCategory && matchesFocusedStore && matchesFocusedBusinessCategory && matchesSearch;
  });
}

function catalogOffers() {
  const approvedStoreIds = new Set(approvedStores().map((store) => store.id));
  const productOffers = sellerProducts()
    .filter((product) => approvedStoreIds.has(product.storeId) && product.productOffer)
    .map((product) => ({
      id: `product-offer-${product.id}`,
      storeId: product.storeId,
      title: product.productName,
      note: product.productOffer,
      expires: "Store offer",
      image: product.productImage || "",
      productId: product.id
    }));
  const standaloneOffers = sellerOffers()
    .filter((offer) => approvedStoreIds.has(offer.storeId))
    .map((offer) => ({
      id: offer.id,
      storeId: offer.storeId,
      title: offer.title,
      note: offer.note,
      expires: offer.expires || offer.offerExpiry || "Active offer",
      image: offer.image || "",
      productId: offer.productId || ""
    }));
  return [...productOffers, ...standaloneOffers].filter((offer, index, list) =>
    list.findIndex((item) => item.id === offer.id) === index
  );
}

function visibleOffers() {
  const allowedStoreIds = new Set(visibleStores().map((store) => store.id));
  const query = state.search.toLowerCase();

  return catalogOffers().filter((offer) => {
    const matchesStore = allowedStoreIds.has(offer.storeId);
    const matchesFocusedStore =
      state.focusedStoreId === "all" || offer.storeId === state.focusedStoreId;
    const matchesSearch =
      !query ||
      offer.title.toLowerCase().includes(query) ||
      offer.note.toLowerCase().includes(query);

    return matchesStore && matchesFocusedStore && matchesSearch;
  });
}

function haversineDistanceKm(from, to) {
  const toRadians = (value) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);

  const a =
    Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2) +
    Math.cos(fromLatitude) *
      Math.cos(toLatitude) *
      Math.sin(longitudeDelta / 2) *
      Math.sin(longitudeDelta / 2);

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 1.25;
}

function formatDistance(distanceKm) {
  const distance = Number(distanceKm);
  if (!Number.isFinite(distance)) {
    return "Distance pending";
  }
  if (distance < 1) {
    return `${Math.round(distance * 1000)} m`;
  }
  return `${distance.toFixed(1)} km`;
}

const COUNTY_REGIONS = {
  coast: ["mombasa", "kwale", "kilifi", "tana river", "lamu", "taita taveta"],
  "nairobi metro": ["nairobi", "kiambu", "kajiado", "machakos", "muranga"],
  central: ["nyeri", "kirinyaga", "muranga", "nyandarua", "kiambu"],
  "rift valley": ["turkana", "west pokot", "samburu", "trans nzoia", "uasin gishu", "elgeyo marakwet", "nandi", "baringo", "laikipia", "nakuru", "narok", "kajiado", "kericho", "bomet"],
  western: ["kakamega", "vihiga", "bungoma", "busia"],
  nyanza: ["kisumu", "siaya", "homa bay", "migori", "kisii", "nyamira"],
  eastern: ["marsabit", "isiolo", "meru", "tharaka nithi", "embu", "kitui", "makueni", "machakos"],
  "north eastern": ["garissa", "wajir", "mandera"]
};

const COUNTY_ALIASES = {
  "taita-taveta": "taita taveta",
  "elgeyo-marakwet": "elgeyo marakwet",
  "homa-bay": "homa bay",
  "trans-nzoia": "trans nzoia",
  "tharaka-nithi": "tharaka nithi",
  "west-pokot": "west pokot"
};

function normalizeCountyName(value = "") {
  const cleaned = String(value || "").toLowerCase().replace(/county/g, "").replace(/[^a-z\s-]/g, " ").replace(/\s+/g, " ").trim();
  return COUNTY_ALIASES[cleaned] || cleaned;
}

function allCountyNames() {
  return [...new Set(Object.values(COUNTY_REGIONS).flat())];
}

function countyFromText(value = "") {
  const text = normalizeCountyName(value);
  return text ? allCountyNames().find((county) => text.includes(county)) || "" : "";
}

function storeCounty(store) {
  return countyFromText(`${store?.county || ""} ${store?.location || ""} ${store?.locationName || ""}`);
}

function buyerCounty(profile = buyerProfile()) {
  return countyFromText(profile.location || "");
}

function countyRegion(county = "") {
  const normalized = normalizeCountyName(county);
  return Object.entries(COUNTY_REGIONS).find(([, counties]) => counties.includes(normalized))?.[0] || "";
}

function likelySameCounty(store, profile = buyerProfile()) {
  const buyerText = `${profile.location || ""}`.toLowerCase();
  const storeText = `${store?.county || ""} ${store?.location || ""} ${store?.locationName || ""}`.toLowerCase();
  if (!buyerText || !storeText) return false;
  return buyerText.split(/[,\s-]+/).filter((part) => part.length >= 4).some((part) => storeText.includes(part));
}

function routeClassification(distanceKm, store, profile = buyerProfile()) {
  const distance = Math.max(0, Number(distanceKm) || 0);
  const fromCounty = storeCounty(store);
  const toCounty = buyerCounty(profile);
  const sameCounty = Boolean(fromCounty && toCounty && fromCounty === toCounty) || likelySameCounty(store, profile);
  const sameRegion = Boolean(fromCounty && toCounty && countyRegion(fromCounty) && countyRegion(fromCounty) === countyRegion(toCounty));
  if (distance <= 5 || (sameCounty && distance <= 12)) return { key: "local", sameCounty, sameRegion };
  if (sameCounty || distance <= 80) return { key: "same-county", sameCounty: true, sameRegion };
  if (sameRegion || distance <= 160) return { key: "nearby-county", sameCounty: false, sameRegion: true };
  return { key: "regional", sameCounty: false, sameRegion: false };
}

function productWeightKg(product) {
  const text = `${product?.productName || ""} ${product?.productCategory || ""}`.toLowerCase();
  if (/furniture|sofa|bed|mattress|table|chair/.test(text)) return 8;
  if (/hardware|cement|paint|metal|tile|tool/.test(text)) return 3;
  if (/electronics|speaker|tv|fridge|woofer/.test(text)) return 2;
  if (/water|drink|flour|rice|sugar|grocery|food|fresh/.test(text)) return 1.2;
  if (/shoes|bag|cosmetic|beauty/.test(text)) return 0.8;
  if (/cloth|fashion|collection|wear|shirt|dress/.test(text)) return 0.45;
  return 0.7;
}

function calculateMarketplaceDeliveryFee(distanceKm, store, group, profile = buyerProfile()) {
  const distance = Math.max(0, Number(distanceKm) || 0);
  const route = routeClassification(distance, store, profile);
  const quantity = Math.max(1, Number(group.quantity) || 1);
  const weightKg = Math.max(0.5, Number(group.weightKg) || quantity * 0.7);
  const bulkFee = Math.round((Math.min(80, Math.max(0, quantity - 2) * 6) + (weightKg > 5 ? Math.min(250, (weightKg - 5) * 12) : 0)) / 10) * 10;
  let baseFee;
  let cap;
  if (route.key === "local") {
    baseFee = distance <= 2 ? 25 + distance * 5 : 35 + distance * 6;
    cap = 70;
  } else if (route.key === "same-county") {
    baseFee = distance <= 25 ? 55 + distance * 5 : 95 + distance * 4;
    cap = 220;
  } else if (route.key === "nearby-county") {
    baseFee = 160 + distance * 2;
    cap = 350;
  } else {
    baseFee = 280 + distance * 1.4;
    cap = weightKg > 25 || quantity > 15 ? 1200 : 900;
  }
  return Math.max(30, Math.round(Math.min(cap, baseFee + bulkFee) / 10) * 10);
}

function estimateFallbackDeliveryFee(storeCount = 1, sameCountyCount = 0, quantity = 1) {
  const count = Math.max(1, Number(storeCount) || 1);
  const sameCounty = Math.max(0, Number(sameCountyCount) || 0);
  const qty = Math.max(1, Number(quantity) || 1);
  const base = 50 + (count - 1) * 20 + Math.min(60, Math.max(0, qty - 2) * 6);
  const discount = Math.min(20, sameCounty * 10);
  return Math.min(250, Math.max(40, base - discount));
}

function buildDeliverySummary(cartItems, profile = buyerProfile()) {
  if (!cartItems.length) {
    return {
      subtotal: 0,
      fee: 0,
      label: currency(0)
    };
  }

  const subtotal = cartItems.reduce((sum, item) => {
    const product = getProduct(item.productId);
    return sum + productLineTotal(product, item.quantity);
  }, 0);

  const latitude = Number(profile.latitude);
  const longitude = Number(profile.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    const stores = [...new Set(
      cartItems
        .map((item) => getProduct(item.productId))
        .filter(Boolean)
        .map((product) => product.storeId)
    )].map((storeId) => getStore(storeId)).filter(Boolean);
    const estimatedFee = estimateFallbackDeliveryFee(
      stores.length,
      stores.filter((store) => likelySameCounty(store, profile)).length,
      cartItems.reduce((sum, item) => sum + Number(item.quantity || 1), 0)
    );
    return {
      subtotal,
      fee: estimatedFee,
      estimated: true,
      total: subtotal + estimatedFee,
      breakdown: [],
      consolidationFee: 0,
      label: `${currency(estimatedFee)} est.`
    };
  }

  const buyerPoint = { latitude, longitude };
  const uniqueStoreIds = [...new Set(
    cartItems
      .map((item) => getProduct(item.productId))
      .filter(Boolean)
      .map((product) => product.storeId)
  )];

  const breakdown = uniqueStoreIds.map((storeId) => {
    const store = getStore(storeId);
    if (!store) {
      return null;
    }
    const storeItems = cartItems.filter((item) => getProduct(item.productId)?.storeId === storeId);
    const group = storeItems.reduce((summary, item) => {
      const product = getProduct(item.productId);
      const quantity = Number(item.quantity || 1);
      summary.quantity += quantity;
      summary.weightKg += productWeightKg(product) * quantity;
      return summary;
    }, { quantity: 0, weightKg: 0 });
    const storeLatitude = Number(store.latitude);
    const storeLongitude = Number(store.longitude);
    const hasStoreCoordinates = Number.isFinite(storeLatitude) && Number.isFinite(storeLongitude) && storeLatitude !== 0 && storeLongitude !== 0;
    const distanceKm = hasStoreCoordinates
      ? haversineDistanceKm(buyerPoint, {
          latitude: storeLatitude,
          longitude: storeLongitude
        })
      : null;
    const fee = hasStoreCoordinates
      ? calculateMarketplaceDeliveryFee(distanceKm, store, group, profile)
      : estimateFallbackDeliveryFee(1, likelySameCounty(store, profile) ? 1 : 0, group.quantity);
    return {
      storeId: store.id,
      storeName: store.storeName,
      distanceKm,
      distanceText: hasStoreCoordinates ? formatDistance(distanceKm) : "Distance estimate",
      fee,
      estimated: !hasStoreCoordinates
    };
  }).filter(Boolean);

  const consolidationFee = breakdown.length > 1 ? Math.min(50, (breakdown.length - 1) * 10) : 0;
  const fee = breakdown.reduce((sum, entry) => sum + entry.fee, 0) + consolidationFee;

  return {
    subtotal,
    fee,
    estimated: breakdown.some((entry) => entry.estimated),
    breakdown,
    consolidationFee,
    label: currency(fee)
  };
}

function availableCheckoutMethods(cartItems) {
  const methodsByStore = [...new Set(
    cartItems
      .map((item) => getProduct(item.productId))
      .filter(Boolean)
      .map((product) => product.storeId)
  )]
    .map((storeId) => getStore(storeId))
    .filter(Boolean)
    .map((store) => normalizePaymentOptions(store.paymentOptions));

  if (!methodsByStore.length) {
    return [];
  }

  const first = methodsByStore[0];
  return first.filter((method) => methodsByStore.every((storeMethods) => storeMethods.includes(method)));
}

async function createLocalOrderFromStore(storeId) {
  const store = getStore(storeId);
  const storeCart = state.cart.filter((item) => {
    const product = getProduct(item.productId);
    return product && product.storeId === storeId;
  });

  if (!store || !storeCart.length) {
    showToast("Add an item from this business first.", "warn");
    return;
  }

  const profile = buyerProfile();
  const delivery = buildDeliverySummary(storeCart, profile);
  const items = storeCart
    .map((item) => {
      const product = getProduct(item.productId);
      if (!product) return null;
      return {
        productId: product.id,
        businessId: store.id,
        categoryId: product.categoryId,
        name: product.productName,
        productName: product.productName,
        categoryName: product.productCategory,
        storeId: store.id,
        storeName: store.storeName,
        quantity: item.quantity,
        price: product.productPrice,
        unitPrice: product.productPrice,
        total: productLineTotal(product, item.quantity),
        lineTotal: productLineTotal(product, item.quantity),
        offer: product.productOffer || "",
        paidQuantity: paidQuantityForProduct(product, item.quantity)
      };
    })
    .filter(Boolean);
  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const mpesaRef = profile.mpesaReference || "";
  const order = {
    id: createId("order"),
    userId: profile.userId || profile.phone || "guest",
    customer: profile.fullName || "Customer",
    mpesaName: profile.mpesaName || profile.fullName || "Customer",
    mpesaNumber: profile.phone || "",
    paymentRef: mpesaRef,
    mpesaReference: mpesaRef,
    phone: profile.phone || "",
    buyerLocation: profile.location || "Location pending",
    buyerLatitude: Number(profile.latitude) || "",
    buyerLongitude: Number(profile.longitude) || "",
    paymentMethod: "Business direct payment",
    paymentStatus: "pending_payment",
    status: "pending_payment",
    deliveryStatus: "pending",
    storeName: store.storeName,
    stores: [store.storeName],
    subtotal,
    deliveryFee: delivery.fee || 0,
    total: subtotal + Number(delivery.fee || 0),
    routeBreakdown: delivery.breakdown || [],
    businessPayments: [{
      storeId: store.id,
      storeName: store.storeName,
      amount: subtotal,
      method: "M-Pesa",
      reference: mpesaRef,
      tillNumber: storeTillNumber(store),
      pochiNumber: storePochiNumber(store),
      bankAccount: storeCardAccount(store),
      status: mpesaRef ? "submitted" : "pending_payment"
    }],
    sellerPaymentStatus: {
      [store.id]: mpesaRef ? "submitted" : "pending_payment"
    },
    deliveryPayment: {
      tillNumber: "7312380",
      amount: delivery.fee || 0,
      reference: mpesaRef,
      status: mpesaRef ? "submitted" : "pending_payment"
    },
    items,
    sessionId: cartSessionId(),
    createdAt: new Date().toISOString()
  };

  const response = await postJson('./api/orders/create.php', order);
  if (!response.ok || response.data?.ok === false) {
    showToast(response.data?.message || "Order submission failed.", "warn");
    return;
  }
  state.cart = [];
  await clearCartBackend();
  renderCartSummary();
  showToast("Order placed. Admin and seller can see it now.", "success");
}

function storeTillNumber(store) {
  return String((store && store.tillNumber) || "").trim();
}

function storePochiNumber(store) {
  return String((store && store.pochiNumber) || "").trim();
}

function storeCardAccount(store) {
  return String((store && (store.bankAccount || store.cardAccount)) || "").trim();
}

function sanitizeCart() {
  const validProducts = new Set(
    sellerProducts()
      .filter((product) => getStore(product.storeId))
      .map((product) => product.id)
  );

  const cleanCart = state.cart.filter((item) => validProducts.has(item.productId));
  if (cleanCart.length !== state.cart.length) {
    state.cart = cleanCart;
    writeStorage(STORAGE_KEYS.cartItems, state.cart);
  }
}

function showToast(message, tone = "success", duration = 2600) {
  const container = document.getElementById("toastContainer");
  if (!container || !message) return;
  const toast = document.createElement("div");
  toast.className = `toast toast--${tone}`;
  toast.textContent = message;
  container.appendChild(toast);

  window.setTimeout(() => {
    toast.remove();
  }, duration);
}

function initReveal() {
  const items = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) {
    items.forEach((item) => item.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.14 }
  );

  items.forEach((item) => observer.observe(item));
}

function initAdminTrigger() {
  const footer = document.getElementById("footerTrigger");
  const modal = document.getElementById("adminLoginModal");
  const form = document.getElementById("adminLoginForm");
  const status = document.getElementById("adminLoginStatus");
  const usernameInput = document.getElementById("adminUsernameInput");
  const passwordInput = document.getElementById("adminPasswordInput");
  function openModal() {
    modal.classList.remove("is-hidden");
    modal.setAttribute("aria-hidden", "false");
    status.textContent = "";
    form.reset();
    window.setTimeout(() => usernameInput.focus(), 30);
  }

  function closeModal() {
    modal.classList.add("is-hidden");
    modal.setAttribute("aria-hidden", "true");
    status.textContent = "";
  }

  document.querySelectorAll("[data-footer-link]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.stopPropagation();
    });
  });

  footer.addEventListener("click", (event) => {
    if (event.target.closest("[data-footer-link]")) {
      return;
    }
    window.location.href = "./admin.html";
  });

  document.querySelectorAll("[data-close-admin-modal]").forEach((button) => {
    button.addEventListener("click", closeModal);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    try {
      const response = await fetch('./api/admin/login.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        status.textContent = result.message || "Invalid admin credentials.";
        return;
      }
      window.localStorage.setItem(STORAGE_KEYS.adminSession, "active");
      status.textContent = "Login successful. Redirecting...";
      window.setTimeout(() => {
        window.location.href = "./admin.html";
      }, 450);
    } catch (error) {
      status.textContent = "Admin login service is unavailable.";
    }
  });
}

async function addToCart(productId) {
  const product = getProduct(productId);
  if (!product || !getStore(product.storeId)) {
    showToast("This product is not available right now.", "warn");
    return;
  }

  const addQuantity = isBogoOffer(product) ? 2 : 1;
  const existing = state.cart.find((item) => item.productId === productId);
  if (existing) {
    existing.quantity += addQuantity;
  } else {
    state.cart.push({ productId, quantity: addQuantity });
  }

  const nextQuantity = state.cart.find((item) => item.productId === productId)?.quantity || 1;
  writeStorage(STORAGE_KEYS.cartItems, state.cart);
  await saveCartItemToBackend(productId, nextQuantity);
  savePreviewState();
  renderCartSummary();
  showToast(product.productOffer || "Item added to cart.", product.productOffer ? "info" : "success", product.productOffer ? offerToastDuration(product.productOffer) : 2600);
}

function renderTypeFilters() {
  const container = document.getElementById("storeTypeFilters");
  const options = [
    { value: "all", label: "All stores" },
    { value: "supermarket", label: "Supermarkets" },
    { value: "retail", label: "Retailers" },
    { value: "wholesale", label: "Wholesalers" }
  ];

  container.innerHTML = options
    .map(
      (option) => `
        <button class="filter-chip ${state.selectedType === option.value ? "is-active" : ""}" data-type="${option.value}" type="button">
          ${option.label}
        </button>
      `
    )
    .join("");

  container.querySelectorAll("[data-type]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedType = button.dataset.type;
      state.focusedLocation = "all";
      state.focusedStoreId = "all";
      state.focusedBusinessCategory = "all";
      savePreviewState();
      renderMarket();
    });
  });
}

function renderCategoryFilters() {
  const container = document.getElementById("categoryFilters");
  container.innerHTML = currentCategories()
    .map((category) => {
      const label = category === "all" ? "All categories" : category;
      return `
        <button class="filter-chip ${state.selectedCategory === category ? "is-active" : ""}" data-category="${category}" type="button">
          ${label}
        </button>
      `;
    })
    .join("");

  container.querySelectorAll("[data-category]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedCategory = button.dataset.category;
      state.focusedLocation = "all";
      state.focusedStoreId = "all";
      state.focusedBusinessCategory = "all";
      savePreviewState();
      renderMarket();
    });
  });
}

function renderDeals() {
  const container = document.getElementById("dealGrid");
  const list = visibleOffers();

  if (!list.length) {
    container.innerHTML = '<div class="card">No seller offers yet.</div>';
    return;
  }

  container.innerHTML = list
    .map((offer) => {
      const store = getStore(offer.storeId);
      const button = offer.productId
        ? `<button class="button button-primary button-small" data-offer-product="${offer.productId}" type="button">Add offer</button>`
        : `<button class="button button-outline button-small" data-offer-store="${offer.storeId}" type="button">Open store</button>`;

      return `
        <article class="deal-card" data-offer-card="${offer.id}">
          <div class="deal-visual">
            ${cardImageHtml(offer.image, offer.title, offer.title)}
          </div>
          <div class="deal-copy">
            <div class="deal-head">
              <div>
                <h4>${offer.title}</h4>
                <p>${store ? store.storeName : "Approved seller"}</p>
              </div>
              <span class="status-pill status-pill--timed">${offer.expires}</span>
            </div>
            <p>${offer.note}</p>
            ${button}
          </div>
        </article>
      `;
    })
    .join("");

  container.querySelectorAll("[data-offer-card]").forEach((card) => {
    const offer = list.find((item) => String(item.id) === String(card.dataset.offerCard));
    bindHoldToast(card, () => offerCardMessage(offer));
  });

  container.querySelectorAll("[data-offer-product]").forEach((button) => {
    button.addEventListener("click", async () => {
      await addToCart(button.dataset.offerProduct);
    });
  });

  container.querySelectorAll("[data-offer-store]").forEach((button) => {
    const offer = list.find((item) => String(item.storeId) === String(button.dataset.offerStore) && !item.productId);
    bindHoldToast(button, () => offerCardMessage(offer));
    button.addEventListener("click", () => {
      const store = getStore(button.dataset.offerStore);
      state.focusedLocation = store ? String(store.location || store.county || state.focusedLocation) : state.focusedLocation;
      state.focusedStoreId = button.dataset.offerStore;
      state.focusedBusinessCategory = "all";
      savePreviewState();
      renderMarket();
      document.getElementById("productBrowserSection")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function storeRating(store, productCount) {
  const seed = String(store.id || store.storeName || "").split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const rating = 4.2 + ((seed + productCount) % 7) / 10;
  return Math.min(4.9, rating).toFixed(1);
}

function renderStores() {
  const container = document.getElementById("storeGrid");
  const summary = document.getElementById("browseSummary");
  const list = visibleStores();
  const products = sellerProducts();
  const allStores = approvedStores().filter((store) => {
    const matchesType = state.selectedType === "all" || store.businessType === state.selectedType;
    const businessQuery = state.businessSearch.trim().toLowerCase();
    const storeProducts = products.filter((product) => product.storeId === store.id);
    return matchesType &&
      storeMatchesSearch(store, storeProducts, state.search) &&
      storeMatchesSearch(store, storeProducts, businessQuery);
  });
  const locationQuery = state.locationSearch.trim().toLowerCase();
  const profile = buyerProfile();
  const hasBuyerCoordinates =
    Number.isFinite(Number(profile.latitude)) && Number.isFinite(Number(profile.longitude));

  summary.textContent = state.focusedStoreId !== "all"
    ? "Business selected"
    : state.focusedLocation === "all"
      ? `${new Set(allStores.map((store) => String(store.location || store.county || "Unknown location")).filter((location) => !locationQuery || location.toLowerCase().includes(locationQuery))).size} locations`
      : `${list.length} businesses`;

  if (state.focusedStoreId !== "all") {
    container.innerHTML = "";
    return;
  }

  if (state.focusedLocation === "all") {
    if (!approvedStores().length) {
      container.innerHTML = `
        <div class="card location-empty-state">
          <p>${marketLoadError || "No approved businesses are available yet."}</p>
        </div>
      `;
      return;
    }

    const grouped = allStores.reduce((map, store) => {
      const key = String(store.location || store.county || "Unknown location");
      const current = map.get(key) || [];
      current.push(store);
      map.set(key, current);
      return map;
    }, new Map());

    const locationEntries = [...grouped.entries()].filter(([location, stores]) => {
      if (!locationQuery) {
        return true;
      }

      const storeProducts = products.filter((product) => stores.some((store) => store.id === product.storeId));
      const locationText = [
        location,
        stores.map((store) => storeSearchText(store, storeProducts.filter((product) => product.storeId === store.id))).join(" "),
        storeProducts.map((product) => productSearchText(product, getStore(product.storeId))).join(" ")
      ].join(" ");
      return matchesSearchTerms(locationText, locationQuery);
    });

    if (!locationEntries.length) {
      container.innerHTML = `
        <div class="card location-empty-state">
          <p>No locations match your search.</p>
          <button class="button button-outline button-small" data-clear-location-search type="button">Show all locations</button>
        </div>
      `;
      container.querySelector("[data-clear-location-search]")?.addEventListener("click", () => {
        state.locationSearch = "";
        state.search = "";
        const locationInput = document.getElementById("locationSearchInput");
        const searchInput = document.getElementById("searchInput");
        if (locationInput) locationInput.value = "";
        if (searchInput) searchInput.value = "";
        savePreviewState();
        renderMarket();
      });
      return;
    }

    container.innerHTML = locationEntries.map(([location, stores]) => {
      const storeProducts = sellerProducts().filter((product) => stores.some((store) => store.id === product.storeId));
      const productCount = storeProducts.length;
      const locationImage = locationCardImage(location, stores, storeProducts);
      const image = locationImage.image;
      const categories = [...new Set(
        storeProducts.map((product) => product.productCategory)
      )];
      return `
        <article class="store-card location-card" data-focus-location="${escapeAttribute(location)}" role="button" tabindex="0" aria-label="Open businesses in ${escapeAttribute(location)}">
          <div class="location-card-media">
            ${cardImageHtml(image, `${location} businesses`, location)}
          </div>
          <div class="compact-card-body">
            <div>
              <h3>${location}</h3>
            </div>
            <div class="compact-card-footer">
              <span class="summary-chip">${stores.length} businesses</span>
              <button class="button button-primary button-small" type="button">Open</button>
            </div>
          </div>
        </article>
      `;
    }).join("");

    container.querySelectorAll("[data-focus-location]").forEach((card) => {
      const openLocation = (event) => {
        if (event.target.closest("[data-view-image]")) {
          return;
        }

        state.focusedLocation = card.dataset.focusLocation;
        state.locationSearch = "";
        state.businessSearch = "";
        state.focusedStoreId = "all";
        state.focusedBusinessCategory = "all";
        state.activeShopStoreId = "";
        state.shopQuery = "";
        savePreviewState();
        renderMarket();
        document.getElementById("marketBrowserSection")?.scrollIntoView({ behavior: "smooth", block: "start" });
      };

      card.addEventListener("click", openLocation);
      card.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }

        event.preventDefault();
        openLocation(event);
      });
    });
    return;
  }

  if (!list.length) {
    container.innerHTML = '<div class="card">No approved sellers match the current filters yet.</div>';
    return;
  }

  container.innerHTML = `
    ${list
    .map((store) => {
      const paymentLabel = storeTillNumber(store)
        ? `Till ${storeTillNumber(store)}`
        : storePochiNumber(store)
          ? `Pochi ${storePochiNumber(store)}`
          : storeCardAccount(store)
            ? `Bank ${storeCardAccount(store)}`
            : "Payment details pending";
      const phoneLabel = store.phone || store.mpesaNumber || store.pochiNumber || "Phone pending";
      const image = store.logoImage || store.businessImage || store.image || storePrimaryImage(store.id) || fallbackBusinessImageFor(store);
      const storeProducts = sellerProducts().filter((product) => product.storeId === store.id);
      const productCount = storeProducts.length;
      const deliveryLabel = store.deliveryAvailability || store.deliveryStatus || "Delivery available";
      const categories = [...new Set(storeProducts.map((product) => product.productCategory).filter(Boolean))];
      const description = store.description || store.deliveryNotes || `${categories.slice(0, 3).join(", ") || "Retail and wholesale items"} from ${store.storeName}.`;
      return `
        <article class="store-card business-directory-card ${state.focusedStoreId === store.id ? "is-active" : ""}" data-focus-store-card="${escapeAttribute(store.id)}" role="button" tabindex="0" aria-label="Open ${escapeAttribute(store.storeName)}">
          <div class="business-logo">
              ${cardImageHtml(image, store.storeName, store.storeName)}
          </div>
          <div class="compact-card-body">
            <div class="business-card-title-row">
              <h3>${store.storeName}</h3>
              <span class="business-rating">★ ${storeRating(store, productCount)}</span>
            </div>
            <div class="business-meta-row">
              <span>${productCount} items</span>
              <span>${deliveryLabel}</span>
            </div>
            <span class="market-type-badge">${store.businessType || "Retail"}</span>
            <div class="compact-card-footer">
              <a class="business-cart-button" href="./cart.html" aria-label="Open cart for ${store.storeName}">Cart</a>
              <button class="button button-primary business-open-button" data-open-business="${escapeAttribute(store.id)}" type="button">Open Business</button>
            </div>
            <button class="button button-outline button-small shop-here-button" data-shop-store="${store.id}" type="button">Shop Here</button>
          </div>
        </article>
      `;
    })
    .join("")}`;

  container.querySelector("[data-clear-location]")?.addEventListener("click", () => {
    state.focusedLocation = "all";
    state.focusedStoreId = "all";
    state.focusedBusinessCategory = "all";
    savePreviewState();
    renderMarket();
  });

  container.querySelectorAll("[data-focus-store-card]").forEach((card) => {
    const openStore = (event) => {
      if (event.target.closest("a, button, input, select, textarea, [data-view-image]")) {
        return;
      }

      state.focusedStoreId = state.focusedStoreId === card.dataset.focusStoreCard ? "all" : card.dataset.focusStoreCard;
      state.focusedBusinessCategory = "all";
      state.activeShopStoreId = "";
      state.shopQuery = "";
      savePreviewState();
      renderMarket();
      document.getElementById("productBrowserSection")?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    card.addEventListener("click", openStore);
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      event.preventDefault();
      openStore(event);
    });
  });

  container.querySelectorAll("[data-open-business], [data-focus-store]").forEach((button) => {
    button.addEventListener("click", () => {
      const storeId = button.dataset.openBusiness || button.dataset.focusStore;
      state.focusedStoreId = storeId;
      state.focusedBusinessCategory = "all";
      state.activeShopStoreId = "";
      state.shopQuery = "";
      savePreviewState();
      renderMarket();
      document.getElementById("productBrowserSection")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  container.querySelectorAll("[data-shop-store]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeShopStoreId = button.dataset.shopStore;
      state.focusedStoreId = button.dataset.shopStore;
      state.focusedBusinessCategory = "all";
      state.shopQuery = "";
      savePreviewState();
      renderMarket();
      document.getElementById("productBrowserSection")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function renderProducts() {
  const container = document.getElementById("productGrid");
  const summary = document.getElementById("productCountSummary");
  const productSection = container?.closest(".section-stack");
  if (productSection) {
    productSection.classList.toggle("is-hidden", state.focusedStoreId === "all");
  }
  if (state.focusedStoreId === "all") {
    if (summary) {
      summary.textContent = "Choose a business";
    }
    if (container) {
      container.innerHTML = "";
    }
    return;
  }
  const selectedStore = getStore(state.focusedStoreId);
  const isShopMode = state.activeShopStoreId === state.focusedStoreId;
  if (isShopMode && selectedStore) {
    const query = normalizeSearchValue(state.shopQuery);
    const matches = sellerProducts().filter((product) => {
      if (product.storeId !== selectedStore.id) {
        return false;
      }
      return productMatchesSearch(product, selectedStore, state.shopQuery);
    });
    const offerMatches = matches.filter((product) => product.productOffer);
    const regularMatches = matches.filter((product) => !product.productOffer);

    summary.textContent = `${matches.length} item${matches.length === 1 ? "" : "s"} in ${selectedStore.storeName}`;
    container.innerHTML = `
      <section class="shop-mode-panel">
        <div class="shop-mode-head">
          <div>
            <p class="eyebrow">Shop Here</p>
            <h3>${selectedStore.storeName}</h3>
            <p class="tiny">${selectedStore.location || selectedStore.county || "Selected business"} | Search this store only</p>
          </div>
          <button class="button button-primary button-small" data-shop-place-order="${selectedStore.id}" type="button">Place Order</button>
        </div>
        <label class="field shop-mode-search">
          <span class="field-label">What do you want to buy?</span>
          <span class="shop-search-row">
            <input class="input shop-here-input" data-shop-search="${selectedStore.id}" type="search" value="${escapeAttribute(state.shopQuery)}" placeholder="Search rice, sugar, phone, drinks..." />
            <button class="button button-outline button-small" data-shop-search-clear="${selectedStore.id}" type="button">Clear</button>
          </span>
          <span class="tiny">${query ? `${matches.length} result${matches.length === 1 ? "" : "s"} for "${escapeHtml(state.shopQuery)}"` : "Type a product name to filter this store."}</span>
        </label>
      </section>
      ${offerMatches.length ? `
        <section class="business-offers-first">
          <div class="section-head shelf-head">
            <div>
              <p class="eyebrow">Offers</p>
              <h3>Promotions</h3>
            </div>
            <span class="summary-chip">${offerMatches.length} deal${offerMatches.length === 1 ? "" : "s"}</span>
          </div>
          <div class="product-grid product-grid--shelf">
            ${offerMatches.map((product) => productCardHtml(product)).join("")}
          </div>
        </section>
      ` : ""}
      ${regularMatches.length ? `
        <section class="standard-products-section">
          <div class="section-head shelf-head">
            <div>
              <p class="eyebrow">Products</p>
              <h3>Regular items</h3>
            </div>
            <span class="summary-chip">${regularMatches.length} item${regularMatches.length === 1 ? "" : "s"}</span>
          </div>
          <div class="product-grid product-grid--shelf shop-mode-grid">
            ${regularMatches.map((product) => productCardHtml(product)).join("")}
          </div>
        </section>
      ` : ""}
      ${!matches.length ? `
        <div class="card empty-shop-result">
          <strong>No matching products in this business.</strong>
          <p class="tiny">Try another word or clear the search to see everything from this seller.</p>
          <button class="button button-outline button-small" data-shop-search-clear="${selectedStore.id}" type="button">View all products</button>
        </div>
      ` : ""}
    `;
    bindProductCardActions(container);
    bindShopModeActions(container);
    window.setTimeout(() => {
      const input = container.querySelector(`[data-shop-search="${state.activeShopStoreId}"]`);
      input?.focus();
      input?.setSelectionRange(input.value.length, input.value.length);
    }, 0);
    return;
  }
  const list = visibleProducts();
  const offerProducts = list.filter((product) => product.productOffer);
  const regularProducts = list.filter((product) => !product.productOffer);
  summary.textContent =
    state.focusedStoreId === "all"
      ? `${list.length} products`
      : state.focusedBusinessCategory === "all"
        ? `${new Set(list.map((product) => product.productCategory || "Other")).size} categories from selected seller`
        : `${list.length} products in ${state.focusedBusinessCategory}`;

  if (!list.length) {
    container.innerHTML = '<div class="card">No products match the current filters yet.</div>';
    return;
  }

  if (state.focusedStoreId !== "all") {
    const grouped = list.reduce((map, product) => {
      const key = product.productCategory || "Other";
      const current = map.get(key) || [];
      current.push(product);
      map.set(key, current);
      return map;
    }, new Map());

    if (state.focusedBusinessCategory === "all") {
      container.innerHTML = `
        ${offerProducts.length ? `
          <section class="business-offers-first">
            <div class="section-head shelf-head">
              <div>
                <p class="eyebrow">Offers</p>
                <h3>Deals from this business</h3>
              </div>
              <span class="summary-chip">${offerProducts.length} offer${offerProducts.length === 1 ? "" : "s"}</span>
            </div>
            <div class="product-grid product-grid--shelf">
              ${offerProducts.map((product) => productCardHtml(product)).join("")}
            </div>
          </section>
        ` : ""}
        ${grouped.size ? `
          <div class="category-card-grid">
            ${[...grouped.entries()].map(([category, products]) => {
            const imageProduct = products.find((product) => product.productImage) || products[0];
            return `
              <article class="category-market-card" role="button" tabindex="0" data-open-business-category="${escapeAttribute(category)}">
                <div class="category-card-image">
                  ${cardImageHtml(imageProduct?.productImage || "", category, category)}
                </div>
                <div class="category-card-copy">
                  <strong>${category}</strong>
                  <span>${products.length} item${products.length === 1 ? "" : "s"}</span>
                  <button class="button button-primary button-small category-open-button" type="button">Open Category</button>
                </div>
              </article>
            `;
            }).join("")}
          </div>
        ` : ""}
      `;
      bindProductCardActions(container);
      bindCategoryCardActions(container);
      return;
    }

    const shelfEntries = state.focusedBusinessCategory === "all"
      ? [...grouped.entries()]
      : [[state.focusedBusinessCategory, list]];

    container.innerHTML = shelfEntries.map(([category, products]) => `
      <section class="category-shelf supermarket-shelf">
        <div class="section-head shelf-head">
          <div>
            <p class="eyebrow">Aisle</p>
            <h3>${category}</h3>
          </div>
          <span class="summary-chip">${products.length} item${products.length === 1 ? "" : "s"}</span>
        </div>
        <div class="product-grid product-grid--shelf product-row-scroll">
          ${products.map((product) => productCardHtml(product)).join("")}
        </div>
      </section>
    `).join("");
  } else {
    container.innerHTML = regularProducts.length
      ? regularProducts.map(productCardHtml).join("")
      : '<div class="card">No regular products match the current filters.</div>';
  }

  bindProductCardActions(container);
}

function bindCategoryCardActions(container) {
  container.querySelectorAll("[data-open-business-category]").forEach((button) => {
    const openCategory = (event) => {
      if (event.target.closest("[data-view-image]")) {
        return;
      }
      state.focusedBusinessCategory = button.dataset.openBusinessCategory;
      savePreviewState();
      renderMarket();
      document.getElementById("productBrowserSection")?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    button.addEventListener("click", openCategory);
    button.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openCategory(event);
      }
    });
  });
}

function bindProductCardActions(container) {
  container.querySelectorAll("[data-product-offer-card]").forEach((card) => {
    const productId = card.dataset.productOfferCard;
    if (!productId) return;
    bindHoldToast(card, () => offerMessage(getProduct(productId)));
  });

  container.querySelectorAll("[data-add-product], [data-shop-add-product]").forEach((button) => {
    const productId = button.dataset.addProduct || button.dataset.shopAddProduct;
    button.addEventListener("click", async () => {
      await addToCart(productId);
    });
  });
  container.querySelectorAll("[data-view-product]").forEach((button) => {
    button.addEventListener("click", () => {
      const product = getProduct(button.dataset.viewProduct);
      if (!product) return;
      openImageViewer(product.productImage || fallbackImageFor(product.productName || product.productCategory), product.productName);
    });
  });
}

function bindShopModeActions(container) {
  const runShopSearch = (storeId, value, shouldRenderNow = false) => {
    state.activeShopStoreId = storeId;
    state.focusedStoreId = storeId;
    state.shopQuery = String(value || "");
    savePreviewState();

    if (shopSearchRenderTimer) {
      window.clearTimeout(shopSearchRenderTimer);
      shopSearchRenderTimer = null;
    }

    if (shouldRenderNow) {
      renderMarket();
      return;
    }

    shopSearchRenderTimer = window.setTimeout(() => {
      shopSearchRenderTimer = null;
      renderMarket();
    }, 120);
  };

  container.querySelectorAll("[data-shop-search]").forEach((input) => {
    input.addEventListener("input", () => {
      runShopSearch(input.dataset.shopSearch, input.value);
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        runShopSearch(input.dataset.shopSearch, input.value, true);
      }
    });
  });

  container.querySelectorAll("[data-shop-search-clear]").forEach((button) => {
    button.addEventListener("click", () => {
      runShopSearch(button.dataset.shopSearchClear, "", true);
    });
  });

  container.querySelectorAll("[data-shop-place-order]").forEach((button) => {
    button.addEventListener("click", async () => {
      await createLocalOrderFromStore(button.dataset.shopPlaceOrder);
    });
  });
}

function openImageViewer(src, title) {
  if (!src) {
    return;
  }
  let modal = document.getElementById("imageViewerModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "imageViewerModal";
    modal.className = "image-viewer is-closed";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
      <div class="image-viewer-overlay" data-close-image-viewer></div>
      <figure class="image-viewer-dialog" role="dialog" aria-modal="true" aria-label="Image preview">
        <button class="image-viewer-close" type="button" data-close-image-viewer aria-label="Close image preview">X</button>
        <img id="imageViewerImage" src="" alt="">
        <figcaption id="imageViewerCaption"></figcaption>
      </figure>
    `;
    document.body.appendChild(modal);
  }

  const image = modal.querySelector("#imageViewerImage");
  const caption = modal.querySelector("#imageViewerCaption");
  image.src = src;
  image.alt = title || "Marketplace image";
  caption.textContent = title || "Marketplace image";
  window.requestAnimationFrame(() => {
    modal.classList.remove("is-closed");
  });
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("is-image-viewing");
}

function closeImageViewer() {
  const modal = document.getElementById("imageViewerModal");
  if (!modal) {
    return;
  }
  modal.classList.add("is-closed");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("is-image-viewing");
}

function initImageViewer() {
  document.addEventListener("click", (event) => {
    const closeTrigger = event.target.closest("[data-close-image-viewer]");
    if (closeTrigger) {
      closeImageViewer();
      return;
    }

    const trigger = event.target.closest("[data-view-image]");
    if (!trigger) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const src = trigger.dataset.imageSrc || trigger.currentSrc || trigger.src;
    openImageViewer(src, trigger.dataset.imageTitle || trigger.alt || "Marketplace image");
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeImageViewer();
    }
  });

  document.addEventListener("error", (event) => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement) || !image.dataset.fallbackSrc || image.dataset.fallbackApplied) {
      return;
    }
    image.dataset.fallbackApplied = "true";
    image.src = image.dataset.fallbackSrc;
  }, true);
}

function productCardHtml(product) {
  const store = getStore(product.storeId);
  const isOffer = Boolean(product.productOffer);
  const badge = isOffer ? "HOT DEAL" : "New";
  return `
    <article class="product-card supermarket-product-card ${isOffer ? "is-offer-product" : ""}" data-product-offer-card="${isOffer ? product.id : ""}">
      <div class="product-visual">
        ${cardImageHtml(product.productImage, product.productName, product.productName || product.productCategory)}
        <span class="product-card-badge">${badge}</span>
      </div>
      <div class="product-head">
        <div>
          <h3>${product.productName}</h3>
          <p class="tiny">${product.productCategory || "Product"}</p>
        </div>
      </div>
      <strong class="product-price">${currency(product.productPrice)}</strong>
      ${product.productOffer ? `<p class="product-offer-label">${product.productOffer}</p>` : ""}
      <div class="product-card-actions">
        <button class="button button-primary button-small" data-add-product="${product.id}" type="button">Add</button>
        <button class="button button-outline button-small" data-view-product="${product.id}" type="button">View</button>
      </div>
    </article>
  `;
}

function renderCartSummary() {
  const subtotal = state.cart.reduce((sum, item) => {
    const product = getProduct(item.productId);
    return sum + productLineTotal(product, item.quantity);
  }, 0);
  const itemCount = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  const delivery = buildDeliverySummary(state.cart);
  const methods = availableCheckoutMethods(state.cart);

  const cartCountBadge = document.getElementById("cartCountBadge");
  const floatingCartCount = document.getElementById("floatingCartCount");
  const subtotalValue = document.getElementById("cartSubtotalValue");
  const deliveryFeeValue = document.getElementById("deliveryFeeValue");

  if (cartCountBadge) {
    cartCountBadge.textContent = String(itemCount);
  }
  if (floatingCartCount) {
    floatingCartCount.textContent = String(itemCount);
    floatingCartCount.classList.toggle("is-empty", itemCount === 0);
  }
  if (subtotalValue) {
    subtotalValue.textContent = currency(subtotal);
  }
  if (deliveryFeeValue) {
    deliveryFeeValue.textContent = itemCount ? delivery.label : currency(0);
  }

  const infoBox = document.querySelector(".cart-summary-card .info-box");
  if (!infoBox) {
    return;
  }
  if (!itemCount) {
    infoBox.textContent = "Add seller products to start building your cart.";
    return;
  }

  infoBox.textContent = methods.length
    ? `Accepted across selected sellers: ${methods.join(", ")}.`
    : "Save buyer location in the cart so delivery can be calculated.";
}

function renderMarket() {
  sanitizeCart();

  if (
    state.focusedStoreId !== "all" &&
    !approvedStores().some((store) => store.id === state.focusedStoreId)
  ) {
    state.focusedStoreId = "all";
    state.focusedBusinessCategory = "all";
    state.activeShopStoreId = "";
    state.shopQuery = "";
    savePreviewState();
  }

  if (
    state.focusedBusinessCategory !== "all" &&
    !sellerProducts().some((product) =>
      product.storeId === state.focusedStoreId && product.productCategory === state.focusedBusinessCategory
    )
  ) {
    state.focusedBusinessCategory = "all";
    savePreviewState();
  }

  renderTypeFilters();
  renderCategoryFilters();
  renderDeals();
  renderStores();
  renderProducts();
  renderCartSummary();
  updateMarketplaceViewShell();
  savePreviewState();
}

function updateMarketplaceViewShell() {
  const browseControlsSection = document.getElementById("browseControlsSection");
  const filters = document.querySelector(".filter-stack")?.closest(".hero, .card, article");
  const offersSection = document.getElementById("offersSection");
  const marketSection = document.getElementById("marketBrowserSection");
  const productSection = document.getElementById("productBrowserSection");
  const marketTitle = marketSection?.querySelector(".section-title");
  const marketEyebrow = marketSection?.querySelector(".eyebrow");
  const locationSearchWrap = document.getElementById("locationSearchWrap");
  const businessSearchWrap = document.getElementById("businessSearchWrap");
  const productTitle = productSection?.querySelector(".section-title");
  const productBackButton = document.getElementById("productBackButton");
  const marketBackButton = document.getElementById("marketBackButton");
  const selectedStore = getStore(state.focusedStoreId);

  browseControlsSection?.classList.add("is-hidden");
  offersSection?.classList.add("is-hidden");
  filters?.classList.add("is-hidden");
  marketSection?.classList.toggle("is-hidden", state.focusedStoreId !== "all");
  productSection?.classList.toggle("is-hidden", state.focusedStoreId === "all");
  locationSearchWrap?.classList.toggle("is-hidden", state.focusedLocation !== "all" || state.focusedStoreId !== "all");
  businessSearchWrap?.classList.toggle("is-hidden", state.focusedLocation === "all" || state.focusedStoreId !== "all");

  if (marketTitle) {
    marketTitle.textContent = state.focusedLocation === "all" ? "Choose your location." : "Choose a business.";
  }
  if (marketEyebrow) {
    marketEyebrow.textContent = state.focusedLocation === "all" ? "Locations" : state.focusedLocation;
  }
  if (productTitle) {
    productTitle.textContent = selectedStore && state.activeShopStoreId === selectedStore.id
      ? `Shop ${selectedStore.storeName}.`
      : selectedStore && state.focusedBusinessCategory !== "all"
        ? `${state.focusedBusinessCategory}.`
      : selectedStore
        ? `${selectedStore.storeName} categories.`
        : "Products.";
  }
  if (productBackButton) {
    productBackButton.textContent = state.focusedBusinessCategory !== "all" ? "Back to categories" : "Back to businesses";
  }
  marketBackButton?.classList.toggle("is-hidden", state.focusedLocation === "all" || state.focusedStoreId !== "all");
}

function bindEvents() {
  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.value = state.search;
  }

  document.getElementById("searchInput").addEventListener("input", (event) => {
    state.search = event.target.value.trim();
    savePreviewState();
    renderMarket();
  });

  document.getElementById("resetFiltersButton").addEventListener("click", () => {
    state.selectedType = "all";
    state.selectedCategory = "all";
    state.focusedLocation = "all";
    state.focusedStoreId = "all";
    state.focusedBusinessCategory = "all";
    state.locationSearch = "";
    state.businessSearch = "";
    state.search = "";
    document.getElementById("searchInput").value = "";
    const businessSearch = document.getElementById("businessSearchInput");
    if (businessSearch) {
      businessSearch.value = "";
    }
    savePreviewState();
    renderMarket();
  });

  document.getElementById("marketBackButton")?.addEventListener("click", () => {
    state.focusedLocation = "all";
    state.locationSearch = "";
    state.businessSearch = "";
    state.focusedStoreId = "all";
    state.focusedBusinessCategory = "all";
    state.activeShopStoreId = "";
    state.shopQuery = "";
    savePreviewState();
    renderMarket();
  });

  document.getElementById("productBackButton")?.addEventListener("click", () => {
    if (state.focusedBusinessCategory !== "all") {
      state.focusedBusinessCategory = "all";
    } else {
      state.focusedStoreId = "all";
      state.activeShopStoreId = "";
      state.shopQuery = "";
    }
    savePreviewState();
    renderMarket();
  });

  const locationSearchInput = document.getElementById("locationSearchInput");
  if (locationSearchInput) {
    locationSearchInput.value = state.locationSearch;
    locationSearchInput.addEventListener("input", (event) => {
      state.locationSearch = event.target.value;
      renderMarket();
      window.setTimeout(() => {
        const input = document.getElementById("locationSearchInput");
        input?.focus();
        input?.setSelectionRange(input.value.length, input.value.length);
      }, 0);
    });
  }

  const businessSearchInput = document.getElementById("businessSearchInput");
  if (businessSearchInput) {
    businessSearchInput.value = state.businessSearch;
    businessSearchInput.addEventListener("input", (event) => {
      state.businessSearch = event.target.value;
      savePreviewState();
      renderMarket();
      window.setTimeout(() => {
        const input = document.getElementById("businessSearchInput");
        input?.focus();
        input?.setSelectionRange(input.value.length, input.value.length);
      }, 0);
    });
  }

  const clearCartButton = document.getElementById("clearCartButton");
  if (clearCartButton) {
    clearCartButton.addEventListener("click", async () => {
      state.cart = [];
      await clearCartBackend();
      savePreviewState();
      renderCartSummary();
      showToast("Cart cleared.", "warn");
    });
  }

  window.addEventListener("storage", () => {
    const savedState = readStorage(STORAGE_KEYS.previewState, {});
    state.focusedLocation = savedState.focusedLocation || state.focusedLocation;
    state.focusedStoreId = savedState.focusedStoreId || state.focusedStoreId;
    state.focusedBusinessCategory = savedState.focusedBusinessCategory || state.focusedBusinessCategory;
    state.activeShopStoreId = savedState.activeShopStoreId || "";
    state.shopQuery = savedState.shopQuery || "";
    state.businessSearch = savedState.businessSearch || "";
    state.selectedType = "all";
    state.selectedCategory = "all";
    state.search = "";
    const search = document.getElementById("searchInput");
    if (search) {
      search.value = state.search;
    }
    const businessSearch = document.getElementById("businessSearchInput");
    if (businessSearch) {
      businessSearch.value = state.businessSearch;
    }
    renderMarket();
  });
}

async function boot() {
  await loadMarketData();
  await loadCartFromBackend();
  initReveal();
  initAdminTrigger();
  initImageViewer();
  bindEvents();
  renderMarket();
}

boot();
