const STORAGE_KEYS = {
  cartSession: "tamu_market_cart_session",
  cartItems: "tamu_market_cart_items",
  buyerProfile: "tamu_market_buyer_profile",
  adminSession: "tamu_market_admin_session"
};

const API_ENDPOINTS = {
  createOrder: "./api/orders/create.php",
  deleteOrder: "./api/orders/delete.php",
  cart: "./api/cart/index.php",
  adminLogin: "./api/admin/login.php"
};

const DELIVERY_TILL_NUMBER = "7312380";

let cart = [];
let buyerMap;
let buyerMarker;
let cachedApplications = [];
let cachedProducts = [];
let cachedOrders = [];

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

function cartSessionId() {
  let id = window.localStorage.getItem(STORAGE_KEYS.cartSession);
  if (!id) {
    id = createId("cart-session");
    window.localStorage.setItem(STORAGE_KEYS.cartSession, id);
  }
  return id;
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
    rating: Number(record.rating) || 4.5
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
  const description = String(product.description || product.productDescription || product.details || "").trim();
  const rawOffer = product.offerText || product.productOffer || product.offer || "";
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
    productOffer,
    description,
    productDescription: description
  };
}

function applications() {
  const byKey = new Map();
  [...cachedApplications].forEach((application) => {
    const key = String(application.email || application.id || "").trim().toLowerCase();
    if (!key) return;
    const current = byKey.get(key) || {};
    const merged = { ...current, ...application };
    if (current.status === "approved" || application.status === "approved") {
      merged.status = "approved";
      merged.approvedAt = application.approvedAt || current.approvedAt;
      merged.expiresAt = application.expiresAt || current.expiresAt;
    }
    byKey.set(key, merged);
  });
  return [...byKey.values()].map(normalizeBusinessRecord);
}

function sellerProducts() {
  return cachedProducts.map(normalizeProductRecord);
}

async function loadMarketData() {
  try {
    const res = await fetch('./api/marketplace/list.php', { cache: 'no-store' });
    const data = await res.json();
    if (res.ok && data.ok) {
      cachedApplications = data.businesses || [];
      cachedProducts = data.products || [];
    }
  } catch (error) {
    cachedApplications = [];
    cachedProducts = [];
  }
}

async function loadOrders() {
  try {
    const phone = String(buyerProfile().phone || "").trim();
    if (!phone) {
      cachedOrders = [];
      return;
    }
    const res = await fetch(`./api/orders/list.php?phone=${encodeURIComponent(phone)}`, { cache: 'no-store' });
    const data = await res.json();
    cachedOrders = res.ok && data.ok ? (data.orders || []) : [];
  } catch (error) {
    cachedOrders = [];
  }
}

async function loadCartFromBackend() {
  try {
    const response = await fetch(`${API_ENDPOINTS.cart}?sessionId=${encodeURIComponent(cartSessionId())}`, { cache: "no-store" });
    const data = await response.json();
    const backendCart = response.ok && data.ok
      ? (data.items || []).map((item) => ({
          productId: String(item.product_public_id || item.product_id || item.productId || ""),
          quantity: Number(item.quantity || 1)
        })).filter((item) => item.productId)
      : [];
    cart = backendCart.length ? backendCart : readStorage(STORAGE_KEYS.cartItems, []);
  } catch (error) {
    cart = readStorage(STORAGE_KEYS.cartItems, []);
  }
  writeStorage(STORAGE_KEYS.cartItems, cart);
}

async function saveCartItem(productId, quantity) {
  const product = getProduct(productId);
  if (!product) return;
  writeStorage(STORAGE_KEYS.cartItems, cart);
  await postJson(API_ENDPOINTS.cart, {
    sessionId: cartSessionId(),
    productId,
    businessId: product.storeId,
    productName: product.productName,
    storeName: product.storeName || getStore(product.storeId)?.storeName || "",
    unitPrice: product.productPrice,
    image: product.productImage,
    quantity
  });
  notifyRealtime("cart", "cart-updated");
}

async function deleteCartItem(productId = "") {
  writeStorage(STORAGE_KEYS.cartItems, cart);
  try {
    await fetch(API_ENDPOINTS.cart, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: cartSessionId(), productId })
    });
  } catch (error) {
    // Backend errors are handled by the next cart reload.
  }
  notifyRealtime("cart", productId ? "cart-item-deleted" : "cart-cleared");
}

function approvedStores() {
  return applications().filter((application) => {
    if (application.status !== "approved") {
      return false;
    }
    if (!application.expiresAt) {
      return true;
    }
    const expiry = new Date(application.expiresAt).getTime();
    return Number.isFinite(expiry) ? expiry > Date.now() : true;
  });
}

function buyerProfile() {
  return readStorage(STORAGE_KEYS.buyerProfile, {
    fullName: "",
    mpesaName: "",
    phone: "",
    location: "",
    latitude: "",
    longitude: "",
    mpesaReference: "",
    deliveryPaymentRef: "",
    businessPayments: []
  });
}

function getStore(storeId) {
  return approvedStores().find((store) => store.id === storeId);
}

function getProduct(productId) {
  return sellerProducts().find((product) => product.id === productId);
}

function normalizePaymentOptions(options) {
  const cleaned = Array.isArray(options)
    ? options.map((entry) => String(entry).trim()).filter(Boolean)
    : [];
  return cleaned.length ? cleaned : ["M-Pesa", "Cash on Delivery"];
}

function storePaymentOptions(store) {
  if (!store) {
    return normalizePaymentOptions([]);
  }
  return normalizePaymentOptions(store.paymentOptions || store.paymentMethods);
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

function selectedStoreSummaries(items) {
  const groupedByStore = new Map();
  items.forEach((item) => {
    const product = getProduct(item.productId);
    const store = product ? getStore(product.storeId) : null;
    if (!product || !store) {
      return;
    }

    const current = groupedByStore.get(store.id) || {
      store,
      quantity: 0,
      subtotal: 0
    };
    current.quantity += item.quantity;
    current.subtotal += productLineTotal(product, item.quantity);
    groupedByStore.set(store.id, current);
  });

  return [...groupedByStore.values()];
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

function formatOrderTime(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) {
    return "Time pending";
  }
  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
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

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function openAdminDashboard(status) {
  window.localStorage.setItem(STORAGE_KEYS.adminSession, "active");
  status.textContent = "Login successful. Redirecting...";
  window.setTimeout(() => {
    window.location.href = "./admin.html";
  }, 450);
}

function setBuyerMapStatus(message) {
  const status = document.getElementById("buyerMapSearchStatus");
  if (!status) {
    return;
  }
  status.textContent = message;
}

function setBuyerCoordinates(latitude, longitude, options = {}) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return;
  }

  const label = String(options.label || "").trim();
  const setLocationText = options.setLocationText === true;
  const forceLocationText = options.forceLocationText === true;
  const skipRender = options.skipRender === true;
  const fallbackLabel = `Pinned at ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  const locationInput = document.getElementById("buyerLocationInput");
  const latitudeInput = document.getElementById("buyerLatitudeInput");
  const longitudeInput = document.getElementById("buyerLongitudeInput");

  if (latitudeInput) {
    latitudeInput.value = lat.toFixed(6);
  }
  if (longitudeInput) {
    longitudeInput.value = lng.toFixed(6);
  }

  if (setLocationText && locationInput) {
    if (forceLocationText || !locationInput.value.trim()) {
      locationInput.value = label || fallbackLabel;
    }
  }

  if (buyerMap) {
    if (buyerMarker) {
      buyerMarker.setLatLng([lat, lng]);
    } else {
      buyerMarker = L.marker([lat, lng]).addTo(buyerMap);
    }
    buyerMap.setView([lat, lng], 15);
  }

  setBuyerMapStatus(label ? `Pinned: ${label}` : fallbackLabel);

  if (!skipRender) {
    saveBuyerProfileFromForm();
  }
}

async function searchBuyerMapLocation() {
  const input = document.getElementById("buyerMapSearchInput");
  if (!input) {
    return;
  }

  const query = input.value.trim();
  if (!query) {
    setBuyerMapStatus("Type a location to search first.");
    return;
  }

  setBuyerMapStatus("Searching location...");

  try {
    const response = await window.fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`,
      {
        headers: {
          Accept: "application/json"
        }
      }
    );
    const results = await response.json().catch(() => []);
    const match = Array.isArray(results) ? results[0] : null;
    if (!match) {
      setBuyerMapStatus("No location match found. Try a nearby town or landmark.");
      return;
    }

    const lat = Number(match.lat);
    const lng = Number(match.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setBuyerMapStatus("Location found but coordinates were invalid. Try another search.");
      return;
    }

    setBuyerCoordinates(lat, lng, {
      label: match.display_name || query,
      setLocationText: true,
      forceLocationText: true
    });
  } catch (error) {
    setBuyerMapStatus("Search failed. Check internet and try again.");
  }
}

function useCurrentLocation() {
  if (!navigator.geolocation) {
    showToast("Location is not supported on this browser.", "warn");
    return;
  }

  setBuyerMapStatus("Getting your location...");
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      setBuyerCoordinates(latitude, longitude, {
        label: `Current location: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
        setLocationText: true
      });
      showToast("Location added.", "success");
    },
    () => {
      setBuyerMapStatus("Location permission denied. Enter location and try again.");
      showToast("Could not get location.", "warn");
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
  );
}

function initBuyerMap() {
  const mapElement = document.getElementById("buyerLocationMap");
  if (!mapElement || typeof L === "undefined") {
    return;
  }

  const defaultLat = -1.2921;
  const defaultLng = 36.8219;
  buyerMap = L.map("buyerLocationMap").setView([defaultLat, defaultLng], 10);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "(c) OpenStreetMap contributors"
  }).addTo(buyerMap);

  buyerMap.on("click", (event) => {
    const { lat, lng } = event.latlng;
    setBuyerCoordinates(lat, lng, {
      label: `Pinned at ${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      setLocationText: true
    });
  });

  const searchButton = document.getElementById("buyerMapSearchButton");
  const searchInput = document.getElementById("buyerMapSearchInput");

  if (searchButton && searchButton.dataset.bound !== "true") {
    searchButton.addEventListener("click", () => {
      searchBuyerMapLocation();
    });
    searchButton.dataset.bound = "true";
  }

  if (searchInput && searchInput.dataset.bound !== "true") {
    searchInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        searchBuyerMapLocation();
      }
    });
    searchInput.dataset.bound = "true";
  }

  const profile = buyerProfile();
  const profileLat = Number(profile.latitude);
  const profileLng = Number(profile.longitude);
  if (Number.isFinite(profileLat) && Number.isFinite(profileLng)) {
    setBuyerCoordinates(profileLat, profileLng, { skipRender: true });
  } else if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition((position) => {
      const { latitude, longitude } = position.coords;
      if (buyerMap) {
        buyerMap.setView([latitude, longitude], 13);
      }
    });
  }
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
  const cleaned = String(value || "")
    .toLowerCase()
    .replace(/county/g, "")
    .replace(/[^a-z\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return COUNTY_ALIASES[cleaned] || cleaned;
}

function allCountyNames() {
  return [...new Set(Object.values(COUNTY_REGIONS).flat())];
}

function countyFromText(value = "") {
  const text = normalizeCountyName(value);
  if (!text) return "";
  return allCountyNames().find((county) => text.includes(county)) || "";
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

function routeClassification(distanceKm, store, profile = buyerProfile()) {
  const distance = Math.max(0, Number(distanceKm) || 0);
  const fromCounty = storeCounty(store);
  const toCounty = buyerCounty(profile);
  const sameCounty = Boolean(fromCounty && toCounty && fromCounty === toCounty) || likelySameCounty(store, profile);
  const sameRegion = Boolean(fromCounty && toCounty && countyRegion(fromCounty) && countyRegion(fromCounty) === countyRegion(toCounty));

  if (distance <= 5 || (sameCounty && distance <= 12)) {
    return { key: "local", label: "Same business area", sameCounty, sameRegion };
  }
  if (sameCounty || distance <= 80) {
    return { key: "same-county", label: "Same county", sameCounty: true, sameRegion };
  }
  if (sameRegion || distance <= 160) {
    return { key: "nearby-county", label: "Nearby county", sameCounty: false, sameRegion: true };
  }
  return { key: "regional", label: "Different region", sameCounty: false, sameRegion: false };
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

function groupBulkSummary(group) {
  const quantity = Math.max(1, Number(group.quantity) || 1);
  const weightKg = Math.max(0.5, Number(group.weightKg) || quantity * 0.7);
  const quantityFee = Math.min(80, Math.max(0, quantity - 2) * 6);
  const weightFee = weightKg > 5 ? Math.min(250, (weightKg - 5) * 12) : 0;
  return {
    quantity,
    weightKg,
    fee: Math.round((quantityFee + weightFee) / 10) * 10
  };
}

function calculateMarketplaceDeliveryFee(distanceKm, store, group, profile = buyerProfile()) {
  const distance = Math.max(0, Number(distanceKm) || 0);
  const route = routeClassification(distance, store, profile);
  const bulk = groupBulkSummary(group);
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
    cap = bulk.weightKg > 25 || bulk.quantity > 15 ? 1200 : 900;
  }

  const fee = Math.round(Math.min(cap, baseFee + bulk.fee) / 10) * 10;
  return {
    fee: Math.max(30, fee),
    routeKey: route.key,
    routeLabel: route.label,
    sameCounty: route.sameCounty,
    sameRegion: route.sameRegion,
    estimatedWeightKg: bulk.weightKg
  };
}

function likelySameCounty(store, profile = buyerProfile()) {
  const buyerText = `${profile.location || ""}`.toLowerCase();
  const storeText = `${store?.county || ""} ${store?.location || ""} ${store?.locationName || ""}`.toLowerCase();
  if (!buyerText || !storeText) {
    return false;
  }
  return buyerText
    .split(/[,\s-]+/)
    .filter((part) => part.length >= 4)
    .some((part) => storeText.includes(part));
}

function estimateFallbackDeliveryFee(storeCount = 1, sameCountyCount = 0, quantity = 1) {
  const count = Math.max(1, Number(storeCount) || 1);
  const sameCounty = Math.max(0, Number(sameCountyCount) || 0);
  const qty = Math.max(1, Number(quantity) || 1);
  const base = 50 + (count - 1) * 20 + Math.min(60, Math.max(0, qty - 2) * 6);
  const discount = Math.min(20, sameCounty * 10);
  return Math.min(250, Math.max(40, base - discount));
}

function buildDeliverySummary(items, profile = buyerProfile()) {
  if (!items.length) {
    return {
      hasCoordinates: false,
      fee: 0,
      subtotal: 0,
      total: 0,
      breakdown: [],
      consolidationFee: 0,
      label: currency(0)
    };
  }

  const subtotal = items.reduce((sum, item) => {
    const product = getProduct(item.productId);
    return sum + productLineTotal(product, item.quantity);
  }, 0);

  const latitude = Number(profile.latitude);
  const longitude = Number(profile.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    const stores = [...new Set(
      items
        .map((item) => getProduct(item.productId))
        .filter(Boolean)
        .map((product) => product.storeId)
    )].map((storeId) => getStore(storeId)).filter(Boolean);
    const estimatedFee = estimateFallbackDeliveryFee(
      stores.length,
      stores.filter((store) => likelySameCounty(store, profile)).length,
      items.reduce((sum, item) => sum + Number(item.quantity || 1), 0)
    );
    return {
      hasCoordinates: false,
      estimated: true,
      fee: estimatedFee,
      subtotal,
      total: subtotal + estimatedFee,
      breakdown: [],
      consolidationFee: 0,
      label: `${currency(estimatedFee)} est.`
    };
  }

  const buyerPoint = { latitude, longitude };
  const groupedByStore = new Map();

  items.forEach((item) => {
    const product = getProduct(item.productId);
    if (!product || !getStore(product.storeId)) {
      return;
    }

    const current = groupedByStore.get(product.storeId) || {
      storeId: product.storeId,
      quantity: 0,
      weightKg: 0,
      subtotal: 0
    };

    current.quantity += item.quantity;
    current.weightKg += productWeightKg(product) * item.quantity;
    current.subtotal += productLineTotal(product, item.quantity);
    groupedByStore.set(product.storeId, current);
  });

  const breakdown = [...groupedByStore.values()]
    .map((group) => {
      const store = getStore(group.storeId);
      if (!store) {
        return null;
      }
      const storeLatitude = Number(store.latitude);
      const storeLongitude = Number(store.longitude);
      const hasStoreCoordinates = Number.isFinite(storeLatitude) && Number.isFinite(storeLongitude) && storeLatitude !== 0 && storeLongitude !== 0;
      const distanceKm = hasStoreCoordinates
        ? haversineDistanceKm(buyerPoint, {
            latitude: storeLatitude,
            longitude: storeLongitude
          })
        : null;
      const pricing = hasStoreCoordinates
        ? calculateMarketplaceDeliveryFee(distanceKm, store, group, profile)
        : {
            fee: estimateFallbackDeliveryFee(1, likelySameCounty(store, profile) ? 1 : 0, group.quantity),
            routeKey: likelySameCounty(store, profile) ? "same-county" : "estimate",
            routeLabel: likelySameCounty(store, profile) ? "Same county estimate" : "Affordable estimate",
            sameCounty: likelySameCounty(store, profile),
            sameRegion: false,
            estimatedWeightKg: group.weightKg
          };

      return {
        storeId: store.id,
        storeName: store.storeName,
        distanceKm,
        distanceText: hasStoreCoordinates ? formatDistance(distanceKm) : "Distance estimate",
        fee: pricing.fee,
        routeType: pricing.routeKey,
        routeLabel: pricing.routeLabel,
        estimatedWeightKg: pricing.estimatedWeightKg,
        estimated: !hasStoreCoordinates,
        sameCounty: pricing.sameCounty,
        sameRegion: pricing.sameRegion,
        quantity: group.quantity,
        subtotal: group.subtotal
      };
    })
    .filter(Boolean);

  const consolidationFee = breakdown.length > 1 ? Math.min(50, (breakdown.length - 1) * 10) : 0;
  const fee = breakdown.reduce((sum, entry) => sum + entry.fee, 0) + consolidationFee;

  return {
    hasCoordinates: true,
    estimated: breakdown.some((entry) => entry.estimated),
    fee,
    subtotal,
    total: subtotal + fee,
    breakdown,
    consolidationFee,
    label: currency(fee)
  };
}

function availableCheckoutMethods(items) {
  const methodsByStore = [...new Set(
    items
      .map((item) => getProduct(item.productId))
      .filter(Boolean)
      .map((product) => product.storeId)
  )]
    .map((storeId) => getStore(storeId))
    .filter(Boolean)
    .map((store) => storePaymentOptions(store));

  if (!methodsByStore.length) {
    return [];
  }

  const first = methodsByStore[0];
  return first.filter((method) => methodsByStore.every((methods) => methods.includes(method)));
}

function sanitizeCart() {
  const validProducts = new Set(
    sellerProducts()
      .filter((product) => getStore(product.storeId))
      .map((product) => product.id)
  );
  const cleanCart = cart.filter((item) => validProducts.has(item.productId));
  if (cleanCart.length !== cart.length) {
    cart = cleanCart;
    writeStorage(STORAGE_KEYS.cartItems, cart);
  }
}

async function postJson(url, payload) {
  try {
    const response = await window.fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));
    return {
      ok: response.ok,
      status: response.status,
      data
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: {
        message: error?.message || "Network error. Please check the connection and try again."
      }
    };
  }
}

function notifyRealtime(channel, reason) {
  window.TamuRealtime?.notify(channel, { reason, source: "cart" });
}

function showToast(message, tone = "success") {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast toast--${tone}`;
  toast.textContent = message;
  container.appendChild(toast);

  window.setTimeout(() => {
    toast.remove();
  }, 2600);
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

    if (!username || !password) {
      status.textContent = "Enter username and password.";
      return;
    }

    status.textContent = "Checking credentials...";

    try {
      const response = await window.fetch(API_ENDPOINTS.adminLogin, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ username, password })
      });
      const data = await response.json().catch(() => ({}));

      if (response.ok && data && data.ok) {
        openAdminDashboard(status);
        return;
      }

      status.textContent = data && data.message ? data.message : "Invalid admin credentials.";
    } catch (error) {
      status.textContent = "Could not reach admin login service.";
    }
  });
}

async function updateQuantity(productId, nextQuantity) {
  const current = cart.find((item) => item.productId === productId);
  if (!current) {
    return;
  }

  if (nextQuantity <= 0) {
    cart = cart.filter((item) => item.productId !== productId);
    writeStorage(STORAGE_KEYS.cartItems, cart);
    await deleteCartItem(productId);
  } else {
    current.quantity = nextQuantity;
    writeStorage(STORAGE_KEYS.cartItems, cart);
    await saveCartItem(productId, nextQuantity);
  }

  renderCart();
}

function fillCheckoutForm() {
  const profile = buyerProfile();
  const buyerNameInput = document.getElementById("buyerNameInput");
  if (buyerNameInput) {
    buyerNameInput.value = profile.fullName || profile.mpesaName || "";
  }
  const mpesaNameInput = document.getElementById("mpesaNameInput");
  if (mpesaNameInput) {
    mpesaNameInput.value = profile.mpesaName || profile.fullName || "";
  }
  document.getElementById("buyerPhoneInput").value = profile.phone || "";
  document.getElementById("buyerLocationInput").value = profile.location || "";
  document.getElementById("buyerLatitudeInput").value = profile.latitude || "";
  document.getElementById("buyerLongitudeInput").value = profile.longitude || "";
  const deliveryRefInput = document.getElementById("deliveryReferenceInput");
  if (deliveryRefInput) {
    deliveryRefInput.value = profile.deliveryPaymentRef || profile.mpesaReference || "";
  }
}

function readCheckoutForm() {
  const deliveryPaymentRef = document.getElementById("deliveryReferenceInput")?.value.trim() || "";
  const businessPayments = [...document.querySelectorAll("[data-business-payment-store]")]
    .map((entry) => {
      const method = entry.querySelector("[data-business-payment-method]")?.value || "M-Pesa";
      const ref = entry.querySelector("[data-business-payment-ref]")?.value.trim() || "";
      const paid = Boolean(entry.querySelector("[data-business-payment-paid]")?.checked);
      return { storeId: entry.dataset.businessPaymentStore, method, ref, paid };
    });

  return {
    fullName: document.getElementById("buyerNameInput")?.value.trim() || document.getElementById("mpesaNameInput")?.value.trim() || "",
    mpesaName: document.getElementById("mpesaNameInput")?.value.trim() || "",
    phone: document.getElementById("buyerPhoneInput").value.trim(),
    location: document.getElementById("buyerLocationInput").value.trim(),
    latitude: document.getElementById("buyerLatitudeInput").value.trim(),
    longitude: document.getElementById("buyerLongitudeInput").value.trim(),
    note: "",
    mpesaReference: deliveryPaymentRef,
    deliveryPaymentRef,
    businessPayments
  };
}

function saveBuyerProfileFromForm(options = {}) {
  const profile = readCheckoutForm();
  writeStorage(STORAGE_KEYS.buyerProfile, profile);
  if (!options.skipRender) {
    renderSummaryPanels();
  }
}

function renderPaymentOptions(items) {
  const container = document.getElementById("sellerPaymentMethods");
  const selectedStores = selectedStoreSummaries(items);
  const profile = buyerProfile();

  if (!selectedStores.length) {
    container.innerHTML = '<div class="breakdown-card"><p>No business payment needed until products are in cart.</p></div>';
    return;
  }

  container.innerHTML = selectedStores
    .map(
      ({ store, subtotal }) => {
        const savedPayment = (profile.businessPayments || []).find((payment) => String(payment.storeId) === String(store.id)) || {};
        const savedRef = savedPayment.ref || savedPayment.reference || "";
        const isPaid = Boolean(savedPayment.paid || savedRef);
        const method = storeTillNumber(store) ? "M-Pesa Till" : storePochiNumber(store) ? "M-Pesa Pochi" : storeCardAccount(store) ? "Bank Account" : "Direct payment";
        return `
          <article class="breakdown-card" data-business-payment-store="${store.id}">
            <strong>${store.storeName}</strong>
            <p>Products: ${currency(subtotal)}</p>
            <p class="tiny">
              ${storeTillNumber(store) ? `Till: ${storeTillNumber(store)} | ` : ""}
              ${storePochiNumber(store) ? `Pochi la Biashara: ${storePochiNumber(store)} | ` : ""}
              ${storeCardAccount(store) ? `Bank account: ${storeCardAccount(store)}` : ""}
              ${!storeTillNumber(store) && !storePochiNumber(store) && !storeCardAccount(store) ? "Payment details pending from seller." : ""}
            </p>
            <label class="payment-confirm-row">
              <input type="checkbox" data-business-payment-paid ${isPaid ? "checked" : ""} />
              <span>I have paid this business directly</span>
            </label>
            <label class="field">
              <span class="field-label">Business M-Pesa Reference</span>
              <input class="input" data-business-payment-ref value="${escapeAttr(savedRef)}" placeholder="Paste M-Pesa code for ${escapeAttr(store.storeName)}" />
            </label>
            <p class="tiny">Leave blank if payment is still pending. Seller or admin can confirm later.</p>
            <input type="hidden" data-business-payment-method value="${method}" />
          </article>
        `;
      }
    )
    .join("");
}

function syncPaymentMethodSelect(items) {
  const instruction = document.getElementById("deliveryPaymentInstruction");
  if (!instruction) {
    return;
  }
  const delivery = buildDeliverySummary(items);
  instruction.textContent = `Pay delivery ${items.length ? delivery.label : currency(0)} to Tamu Express Till ${DELIVERY_TILL_NUMBER}. You may submit now and add the delivery reference later if payment is pending.`;
}

function renderDeliveryBreakdown(items) {
  const container = document.getElementById("deliveryBreakdown");
  const delivery = buildDeliverySummary(items);

  if (!items.length) {
    container.innerHTML = '<div class="breakdown-card"><p>Add products to see the route breakdown.</p></div>';
    return delivery;
  }

  if (!delivery.hasCoordinates) {
    container.innerHTML = `
      <div class="breakdown-card">
        <strong>Affordable delivery estimate</strong>
        <p>Search your area, tap the map, or use your location for exact distance pricing.</p>
        <p>Estimated fee now: ${delivery.label}</p>
      </div>
    `;
    return delivery;
  }

  container.innerHTML = `
    ${delivery.breakdown
      .map(
        (entry) => `
          <article class="breakdown-card">
            <strong>${entry.storeName}</strong>
            <div class="delivery-metric-row">
              <span>${entry.routeLabel || "Delivery route"}</span>
              <strong>${currency(entry.fee)}${entry.estimated ? " est." : ""}</strong>
            </div>
            <p>${entry.distanceText || formatDistance(entry.distanceKm)} | ${entry.quantity} item(s) | approx. ${Number(entry.estimatedWeightKg || 0).toFixed(1)} kg</p>
            <p>Products ${currency(entry.subtotal)} | ${entry.sameCounty ? "same-county affordable rate" : entry.sameRegion ? "nearby-region rate" : "marketplace rate"}</p>
          </article>
        `
      )
      .join("")}
    ${delivery.consolidationFee > 0
      ? `<article class="breakdown-card">
          <strong>Multi-store coordination</strong>
          <p>Tamu Express pickup coordination for ${delivery.breakdown.length} stores.</p>
          <p>${currency(delivery.consolidationFee)}</p>
        </article>`
      : ""}
  `;

  return delivery;
}

function renderSummaryPanels() {
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const delivery = renderDeliveryBreakdown(cart);
  renderPaymentOptions(cart);
  syncPaymentMethodSelect(cart);

  document.getElementById("cartCountBadge").textContent = String(itemCount);
  document.getElementById("cartSubtotalValue").textContent = currency(delivery.subtotal);
  document.getElementById("deliveryFeeValue").textContent = itemCount ? delivery.label : currency(0);
  document.getElementById("grandTotalValue").textContent = currency(delivery.total);

  const info = document.getElementById("deliverySummaryInfo");
  const status = document.getElementById("checkoutStatus");

  if (!cart.length) {
    info.textContent = "Add items, checkout, then seller confirms payment.";
    status.textContent = "Add products to continue.";
    return;
  }

  if (!delivery.hasCoordinates) {
    info.textContent = `Estimated affordable delivery is ${delivery.label}. Add map location for exact distance.`;
    status.textContent = `Subtotal ${currency(delivery.subtotal)} + estimated delivery ${currency(delivery.fee)} = ${currency(delivery.total)}.`;
    return;
  }

  info.textContent =
    delivery.breakdown.length > 1
      ? `${delivery.breakdown.length} pickup routes included with affordable marketplace pricing.`
      : "Affordable marketplace delivery fee calculated.";
  status.textContent = `Subtotal ${currency(delivery.subtotal)} + ${delivery.estimated ? "estimated " : ""}delivery ${currency(delivery.fee)} = ${currency(delivery.total)}.`;
}

function renderCart() {
  sanitizeCart();
  const container = document.getElementById("cartItems");

  if (!cart.length) {
    container.innerHTML = '<div class="card">Your cart is empty. Go back to categories and add products first.</div>';
    renderSummaryPanels();
    return;
  }

  container.innerHTML = cart
    .map((item) => {
      const product = getProduct(item.productId);
      const store = product ? getStore(product.storeId) : null;
      if (!product || !store) {
        return "";
      }

      return `
        <article class="cart-item">
          <strong>${product.productName}</strong>
          <p>${store.storeName}</p>
          <p class="tiny">${product.productCategory || "Product"}${product.description ? ` | ${product.description}` : ""}</p>
          ${product.productOffer ? `<p class="tiny">Offer: ${product.productOffer}</p>` : ""}
          <p>${currency(product.productPrice)} each | Total ${currency(productLineTotal(product, item.quantity))}</p>
          ${isBogoOffer(product) ? `<p class="tiny">Buy one get one free applied: ${item.quantity} item(s), pay for ${paidQuantityForProduct(product, item.quantity)}.</p>` : ""}
          <div class="button-row">
            <button class="button button-ghost button-small" data-cart-action="decrease" data-product-id="${product.id}" type="button">-</button>
            <span class="summary-chip">${item.quantity}</span>
            <button class="button button-ghost button-small" data-cart-action="increase" data-product-id="${product.id}" type="button">+</button>
            <button class="button button-outline button-small" data-cart-action="remove" data-product-id="${product.id}" type="button">Remove</button>
          </div>
        </article>
      `;
    })
    .join("");

  document.querySelectorAll("[data-cart-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const productId = button.dataset.productId;
      const item = cart.find((entry) => entry.productId === productId);
      if (!item) {
        return;
      }

      if (button.dataset.cartAction === "increase") {
        await updateQuantity(productId, item.quantity + 1);
      }

      if (button.dataset.cartAction === "decrease") {
        await updateQuantity(productId, item.quantity - 1);
      }

      if (button.dataset.cartAction === "remove") {
        await updateQuantity(productId, 0);
        showToast("Item removed from cart.", "info");
      }
    });
  });

  renderSummaryPanels();
}

function renderPlacedOrders() {
  const container = document.getElementById("placedOrderList");
  if (!container) {
    return;
  }

  const list = cachedOrders.slice().reverse();
  if (!list.length) {
    container.innerHTML = '<div class="cart-item">No orders placed yet. Submit checkout and the order will appear here.</div>';
    return;
  }

  container.innerHTML = list.map((order) => {
    const paidSignals = [
      order.status,
      order.paymentStatus,
      order.deliveryPayment?.status,
      ...(Array.isArray(order.businessPayments) ? order.businessPayments.map((payment) => payment.status) : [])
    ].map((value) => String(value || "").toLowerCase());
    const orderStatus = paidSignals.some((status) => status === "paid" || status === "confirmed")
      ? "paid"
      : String(order.status || "pending_payment");
    return `
    <article class="cart-item">
      <div class="section-head">
        <div>
          <strong>${order.id}</strong>
          <p class="tiny">${order.customer || "Customer"} | ${order.phone || "Phone pending"}</p>
          <p class="tiny">Placed: ${formatOrderTime(order.createdAt || order.created_at)}</p>
        </div>
        <span class="summary-chip">${orderStatus.replace("_", " ")}</span>
      </div>
      <p class="tiny">Items: ${Array.isArray(order.items) ? order.items.map((item) => `${item.productName} x${item.quantity}`).join(", ") : "Items pending"}</p>
      <p class="tiny">Products ${currency(order.subtotal || 0)} | Delivery ${currency(order.deliveryFee || 0)} | Total ${currency(order.total || 0)}</p>
      <p class="tiny">Delivery: Till ${order.deliveryPayment?.tillNumber || DELIVERY_TILL_NUMBER} | Ref ${order.deliveryPayment?.reference || "pending"}</p>
      ${Array.isArray(order.businessPayments) && order.businessPayments.length
        ? `<p class="tiny">Business refs: ${order.businessPayments.map((payment) => `${payment.storeName}: ${payment.reference || "pending"}`).join(" | ")}</p>`
        : ""}
      <div class="button-row">
        <button class="button button-outline button-small" type="button" data-change-order="${escapeAttr(order.id)}">Change order</button>
        <button class="button button-ghost button-small" type="button" data-delete-order="${escapeAttr(order.id)}">Delete order</button>
      </div>
    </article>
  `;
  }).join("");
}

async function changePlacedOrder(orderId) {
  const order = cachedOrders.find((entry) => String(entry.id || entry.publicId) === String(orderId));
  if (!order || !Array.isArray(order.items) || !order.items.length) {
    showToast("Order items are not available to change.", "warn");
    return;
  }

  cart = order.items
    .map((item) => ({
      productId: String(item.productId || ""),
      quantity: Math.max(1, Math.trunc(Number(item.quantity || 1)))
    }))
    .filter((item) => item.productId && getProduct(item.productId));

  if (!cart.length) {
    showToast("Products from this order are no longer available.", "warn");
    return;
  }

  writeStorage(STORAGE_KEYS.cartItems, cart);
  await deleteCartItem();
  for (const item of cart) {
    await saveCartItem(item.productId);
  }
  document.getElementById("checkoutSection")?.classList.remove("is-hidden");
  renderCart();
  document.getElementById("checkoutSection")?.scrollIntoView({ behavior: "smooth", block: "start" });
  showToast("Order loaded into cart. Update it and submit again.", "success");
}

async function deletePlacedOrder(orderId) {
  const profile = buyerProfile();
  const response = await postJson(API_ENDPOINTS.deleteOrder, {
    id: orderId,
    phone: profile.phone
  });

  if (!response.ok || response.data?.ok === false) {
    const message = response.data?.detail
      ? `${response.data?.message || "Failed to delete order."} ${response.data.detail}`
      : response.data?.message || "Failed to delete order.";
    showToast(message, "warn");
    return;
  }

  await loadOrders();
  renderPlacedOrders();
  notifyRealtime("orders", "order-deleted");
  showToast("Order deleted.", "success");
}

function buildOrderPayload(profile, delivery) {
  const items = cart
    .map((item) => {
      const product = getProduct(item.productId);
      const store = product ? getStore(product.storeId) : null;
      if (!product || !store) {
        return null;
      }

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

  const uniqueStores = [...new Set(items.map((item) => item.storeId))];
  const uniqueStoreNames = [...new Set(items.map((item) => item.storeName))];
  const storeSummaries = selectedStoreSummaries(cart);
  const businessPayments = storeSummaries.map(({ store, subtotal }) => {
    const submitted = profile.businessPayments.find((payment) => payment.storeId === store.id) || {};
    const reference = String(submitted.ref || "").trim();
    const paid = Boolean(reference);
    return {
      storeId: store.id,
      storeName: store.storeName,
      amount: subtotal,
      method: submitted.method || "",
      reference,
      tillNumber: storeTillNumber(store),
      pochiNumber: storePochiNumber(store),
      bankAccount: storeCardAccount(store),
      status: paid ? "submitted" : "pending_payment"
    };
  });
  const sellerPaymentStatus = uniqueStores.reduce((statusMap, storeId) => {
    const payment = businessPayments.find((item) => item.storeId === storeId);
    statusMap[storeId] = payment?.reference ? "submitted" : "pending_payment";
    return statusMap;
  }, {});

  return {
    id: createId("order"),
    userId: profile.userId || profile.phone || "guest",
    customer: profile.fullName,
    mpesaName: profile.mpesaName,
    mpesaNumber: profile.phone,
    paymentRef: profile.mpesaReference,
    mpesaReference: profile.mpesaReference,
    phone: profile.phone,
    buyerLocation: profile.location,
    buyerLatitude: Number(profile.latitude),
    buyerLongitude: Number(profile.longitude),
    paymentMethod: "Business direct payment",
    paymentStatus: "pending_payment",
    businessPayments,
    sellerPaymentStatus,
    deliveryPayment: {
      tillNumber: DELIVERY_TILL_NUMBER,
      amount: delivery.fee,
      reference: profile.deliveryPaymentRef,
      status: profile.deliveryPaymentRef ? "submitted" : "pending_payment"
    },
    note: profile.note,
    storeName: uniqueStoreNames.join(" + "),
    stores: uniqueStoreNames,
    subtotal: delivery.subtotal,
    deliveryFee: delivery.fee,
    total: delivery.total,
    routeBreakdown: delivery.breakdown,
    status: "pending_payment",
    items,
    createdAt: new Date().toISOString()
  };
}

async function handleCheckout() {
  sanitizeCart();

  if (!cart.length) {
    showToast("Add products before checkout.", "warn");
    return;
  }

  const profile = readCheckoutForm();
  const delivery = buildDeliverySummary(cart, profile);

  if (!profile.mpesaName || !profile.phone || !profile.location) {
    showToast("Fill M-Pesa name, M-Pesa number, and delivery location before submitting.", "warn");
    return;
  }

  const order = buildOrderPayload(profile, delivery);
  order.sessionId = cartSessionId();
  writeStorage(STORAGE_KEYS.buyerProfile, profile);
  await Promise.race([
    Promise.resolve(window.tamuPushRememberCustomer?.(profile.phone)),
    new Promise((resolve) => window.setTimeout(resolve, 1500))
  ]).catch(() => {});

  const submitButton = document.getElementById("submitOrderButton");
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "Submitting...";
  }
  document.getElementById("checkoutStatus").textContent = "Submitting order...";
  const response = await postJson(API_ENDPOINTS.createOrder, order);
  const failureMessage = response.data?.detail
    ? `${response.data?.message || "Order submission failed."} ${response.data.detail}`
    : response.data?.message || (response.status ? `Order submission failed. Status ${response.status}.` : "Order submission failed. Check your connection.");
  document.getElementById("checkoutStatus").textContent = response.ok
    ? "Order submitted."
    : failureMessage;

  if (!response.ok || response.data?.ok === false) {
    showToast(failureMessage, "warn");
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = "Submit order";
    }
    return;
  }

  cart = [];
  writeStorage(STORAGE_KEYS.cartItems, cart);
  window.tamuPushRememberCustomer?.(profile.phone);
  await deleteCartItem();
  notifyRealtime("orders", "order-created");
  notifyRealtime("cart", "cart-cleared");
  document.getElementById("checkoutSection")?.classList.add("is-hidden");
  renderCart();
  await loadOrders();
  renderPlacedOrders();
  showToast("Order placed successfully.", "success");
  if (submitButton) {
    submitButton.disabled = false;
    submitButton.textContent = "Submit order";
  }
}

function bindRealtimeUpdates() {
  if (window.__tamuCartRealtimeBound) return;
  window.__tamuCartRealtimeBound = true;
  const refreshCartPage = async () => {
    await loadMarketData();
    await loadCartFromBackend();
    await loadOrders();
    fillCheckoutForm();
    renderCart();
    renderPlacedOrders();
  };
  if (window.TamuRealtime?.subscribe) {
    window.TamuRealtime.subscribe("orders", refreshCartPage, { visibleMs: 6000, hiddenMs: 22000 });
    window.TamuRealtime.subscribe("marketplace", refreshCartPage, { poll: false });
    window.TamuRealtime.subscribe("cart", refreshCartPage, { poll: false });
    return;
  }
  window.setInterval(refreshCartPage, 12000);
}

function bindEvents() {
  document.getElementById("clearCartButton").addEventListener("click", async () => {
    cart = [];
    writeStorage(STORAGE_KEYS.cartItems, cart);
    await deleteCartItem();
    renderCart();
    showToast("Cart cleared.", "warn");
  });

  document.getElementById("checkoutButton").addEventListener("click", () => {
    const section = document.getElementById("checkoutSection");
    document.getElementById("placedOrdersSection")?.classList.remove("is-hidden");
    section.classList.remove("is-hidden");
    section.scrollIntoView({ behavior: "smooth", block: "start" });
    if (buyerMap) {
      window.setTimeout(() => buyerMap.invalidateSize(), 250);
    }
  });

  document.getElementById("useMyLocationButton")?.addEventListener("click", () => {
    useCurrentLocation();
  });

  document.getElementById("submitOrderButton").addEventListener("click", async () => {
    await handleCheckout();
  });

  document.getElementById("checkoutForm").addEventListener("input", (event) => {
    saveBuyerProfileFromForm({
      skipRender: Boolean(event.target.closest("[data-business-payment-ref]"))
    });
  });

  document.getElementById("checkoutForm").addEventListener("change", (event) => {
    saveBuyerProfileFromForm({
      skipRender: Boolean(event.target.closest("[data-business-payment-ref], [data-business-payment-paid]"))
    });
  });

  document.getElementById("placedOrderList")?.addEventListener("click", async (event) => {
    const changeButton = event.target.closest("[data-change-order]");
    if (changeButton) {
      await changePlacedOrder(changeButton.dataset.changeOrder);
      return;
    }

    const deleteButton = event.target.closest("[data-delete-order]");
    if (deleteButton) {
      await deletePlacedOrder(deleteButton.dataset.deleteOrder);
    }
  });

  window.addEventListener("storage", async () => {
    await loadCartFromBackend();
    fillCheckoutForm();
    renderCart();
    renderPlacedOrders();
  });
}

async function boot() {
  await loadMarketData();
  await loadCartFromBackend();
  await loadOrders();
  initReveal();
  initAdminTrigger();
  fillCheckoutForm();
  initBuyerMap();
  bindEvents();
  bindRealtimeUpdates();
  renderCart();
  renderPlacedOrders();
}

boot();
