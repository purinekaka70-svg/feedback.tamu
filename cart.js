const STORAGE_KEYS = {
  cartSession: "tamu_market_cart_session",
  buyerProfile: "tamu_market_buyer_profile",
  adminSession: "tamu_market_admin_session"
};

const API_ENDPOINTS = {
  createOrder: "./api/orders/create.php",
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
  const offerFlag = Boolean(product.offerFlag || product.isOffer || product.productOffer);
  const productOffer = product.productOffer || product.offerText || product.offer || (offerFlag ? "Offer" : "");

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
    const res = await fetch('./api/orders/list.php', { cache: 'no-store' });
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
    cart = response.ok && data.ok
      ? (data.items || []).map((item) => ({
          productId: String(item.product_id || item.productId || ""),
          quantity: Number(item.quantity || 1)
        })).filter((item) => item.productId)
      : [];
  } catch (error) {
    cart = [];
  }
}

async function saveCartItem(productId, quantity) {
  const product = getProduct(productId);
  if (!product) return;
  await postJson(API_ENDPOINTS.cart, {
    sessionId: cartSessionId(),
    productId,
    businessId: product.storeId,
    quantity
  });
}

async function deleteCartItem(productId = "") {
  try {
    await fetch(API_ENDPOINTS.cart, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: cartSessionId(), productId })
    });
  } catch (error) {
    // Backend errors are handled by the next cart reload.
  }
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
    current.subtotal += product.productPrice * item.quantity;
    groupedByStore.set(store.id, current);
  });

  return [...groupedByStore.values()];
}

function currency(value) {
  return `KSh ${Number(value).toLocaleString()}`;
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

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calculateAffordableDeliveryFee(distanceKm) {
  const distance = Math.max(0, Number(distanceKm) || 0);
  let fee;

  if (distance <= 2) {
    fee = 40 + distance * 20;
  } else if (distance <= 5) {
    fee = 80 + (distance - 2) * 20;
  } else if (distance <= 10) {
    fee = 150 + (distance - 5) * 25;
  } else if (distance <= 20) {
    fee = 300 + (distance - 10) * 18;
  } else {
    fee = 500 + (distance - 20) * 20;
  }

  return Math.min(1000, Math.max(40, Math.round(fee / 10) * 10));
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
    return sum + (product ? product.productPrice * item.quantity : 0);
  }, 0);

  const latitude = Number(profile.latitude);
  const longitude = Number(profile.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return {
      hasCoordinates: false,
      fee: 0,
      subtotal,
      total: subtotal,
      breakdown: [],
      consolidationFee: 0,
      label: "Pin map location"
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
      subtotal: 0
    };

    current.quantity += item.quantity;
    current.subtotal += product.productPrice * item.quantity;
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
      if (!Number.isFinite(storeLatitude) || !Number.isFinite(storeLongitude)) {
        return null;
      }

      const distanceKm = haversineDistanceKm(buyerPoint, {
        latitude: storeLatitude,
        longitude: storeLongitude
      });
      const routeFee = calculateAffordableDeliveryFee(distanceKm);

      return {
        storeId: store.id,
        storeName: store.storeName,
        distanceKm,
        distanceText: formatDistance(distanceKm),
        fee: routeFee,
        quantity: group.quantity,
        subtotal: group.subtotal
      };
    })
    .filter(Boolean);

  const consolidationFee = breakdown.length > 1 ? (breakdown.length - 1) * 25 : 0;
  const fee = breakdown.reduce((sum, entry) => sum + entry.fee, 0) + consolidationFee;

  return {
    hasCoordinates: true,
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
      data: null
    };
  }
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
    await deleteCartItem(productId);
  } else {
    current.quantity = nextQuantity;
    await saveCartItem(productId, nextQuantity);
  }

  renderCart();
}

function fillCheckoutForm() {
  const profile = buyerProfile();
  document.getElementById("buyerNameInput").value = profile.fullName || "";
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
      const ref = entry.querySelector("[data-business-payment-ref]")?.value.trim() || "";
      const method = entry.querySelector("[data-business-payment-method]")?.value || "M-Pesa";
      return { storeId: entry.dataset.businessPaymentStore, method, ref };
    });

  return {
    fullName: document.getElementById("buyerNameInput").value.trim(),
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

function saveBuyerProfileFromForm() {
  const profile = readCheckoutForm();
  writeStorage(STORAGE_KEYS.buyerProfile, profile);
  renderSummaryPanels();
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
        const existingRef = (profile.businessPayments || []).find((payment) => payment.storeId === store.id)?.ref || "";
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
            <input class="input" data-business-payment-ref name="businessPaymentRef_${escapeAttr(store.id)}" value="${escapeAttr(existingRef)}" placeholder="Reference paid to ${escapeAttr(store.storeName)}" required />
            <input type="hidden" data-business-payment-method value="${storeTillNumber(store) ? "M-Pesa Till" : storePochiNumber(store) ? "M-Pesa Pochi" : storeCardAccount(store) ? "Bank Account" : "Direct payment"}" />
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
  instruction.textContent = `Delivery fee: ${items.length ? delivery.label : currency(0)}. Pay separately to delivery till ${DELIVERY_TILL_NUMBER}, then enter that delivery reference above.`;
}

function renderDeliveryBreakdown(items) {
  const container = document.getElementById("deliveryBreakdown");
  const delivery = buildDeliverySummary(items);

  if (!items.length) {
    container.innerHTML = '<div class="breakdown-card"><p>Add products to see the route breakdown.</p></div>';
    return delivery;
  }

  if (!delivery.hasCoordinates) {
    container.innerHTML = '<div class="breakdown-card"><p>Pin buyer location on the map to calculate delivery from each seller.</p></div>';
    return delivery;
  }

  container.innerHTML = `
    ${delivery.breakdown
      .map(
        (entry) => `
          <article class="breakdown-card">
            <strong>${entry.storeName}</strong>
            <p>${formatDistance(entry.distanceKm)} | ${entry.quantity} item(s)</p>
            <p>Subtotal ${currency(entry.subtotal)} | Delivery ${currency(entry.fee)}</p>
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
    info.textContent = "Use your location to calculate delivery.";
    status.textContent = "Waiting for customer location.";
    return;
  }

  info.textContent =
    delivery.breakdown.length > 1
      ? `${delivery.breakdown.length} pickup routes included.`
      : "Delivery fee calculated.";
  status.textContent = `Subtotal ${currency(delivery.subtotal)} + delivery ${currency(delivery.fee)} = ${currency(delivery.total)}.`;
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
          <p>${currency(product.productPrice)} each | Total ${currency(product.productPrice * item.quantity)}</p>
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

  container.innerHTML = list.map((order) => `
    <article class="cart-item">
      <div class="section-head">
        <div>
          <strong>${order.id}</strong>
          <p class="tiny">${order.customer || "Customer"} | ${order.phone || "Phone pending"}</p>
        </div>
        <span class="summary-chip">${String(order.status || "pending_payment").replace("_", " ")}</span>
      </div>
      <p class="tiny">Items: ${Array.isArray(order.items) ? order.items.map((item) => `${item.productName} x${item.quantity}`).join(", ") : "Items pending"}</p>
      <p class="tiny">Products ${currency(order.subtotal || 0)} | Delivery ${currency(order.deliveryFee || 0)} | Total ${currency(order.total || 0)}</p>
      <p class="tiny">Delivery: Till ${order.deliveryPayment?.tillNumber || DELIVERY_TILL_NUMBER} | Ref ${order.deliveryPayment?.reference || "pending"}</p>
      ${Array.isArray(order.businessPayments) && order.businessPayments.length
        ? `<p class="tiny">Business refs: ${order.businessPayments.map((payment) => `${payment.storeName}: ${payment.reference || "pending"}`).join(" | ")}</p>`
        : ""}
      <div class="button-row">
        <a class="button button-outline button-small" href="./seller.html">Business portal confirms</a>
        <a class="button button-ghost button-small" href="./admin.html">Admin orders</a>
      </div>
    </article>
  `).join("");
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
        total: product.productPrice * item.quantity,
        lineTotal: product.productPrice * item.quantity
      };
    })
    .filter(Boolean);

  const uniqueStores = [...new Set(items.map((item) => item.storeId))];
  const uniqueStoreNames = [...new Set(items.map((item) => item.storeName))];
  const storeSummaries = selectedStoreSummaries(cart);
  const businessPayments = storeSummaries.map(({ store, subtotal }) => {
    const submitted = profile.businessPayments.find((payment) => payment.storeId === store.id) || {};
    return {
      storeId: store.id,
      storeName: store.storeName,
      amount: subtotal,
      method: submitted.method || "",
      reference: submitted.ref || "",
      tillNumber: storeTillNumber(store),
      pochiNumber: storePochiNumber(store),
      bankAccount: storeCardAccount(store),
      status: submitted.ref ? "submitted" : "pending_payment"
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
  const latitude = Number(profile.latitude);
  const longitude = Number(profile.longitude);
  const delivery = buildDeliverySummary(cart, profile);

  if (!profile.fullName || !profile.mpesaName || !profile.phone || !profile.location) {
    showToast("Fill in checkout details before submitting.", "warn");
    return;
  }

  if (!profile.deliveryPaymentRef) {
    showToast(`Enter the delivery payment reference for till ${DELIVERY_TILL_NUMBER}.`, "warn");
    return;
  }

  const missingBusinessPayment = profile.businessPayments.find((payment) => !payment.ref);
  if (missingBusinessPayment) {
    showToast("Enter each business payment reference before submitting.", "warn");
    return;
  }

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    showToast("Use your location to calculate delivery.", "warn");
    return;
  }

  if (!delivery.hasCoordinates) {
    showToast("Customer location is required for delivery pricing.", "warn");
    return;
  }

  if (!profile.mpesaReference) {
    showToast("Enter the M-Pesa reference code.", "warn");
    return;
  }

  const order = buildOrderPayload(profile, delivery);
  order.sessionId = cartSessionId();
  writeStorage(STORAGE_KEYS.buyerProfile, profile);

  const response = await postJson(API_ENDPOINTS.createOrder, order);
  document.getElementById("checkoutStatus").textContent = response.ok
    ? "Order submitted."
    : "Order submission failed.";

  if (!response.ok || response.data?.ok === false) {
    showToast(response.data?.message || "Could not save order.", "warn");
    return;
  }

  cart = [];
  await deleteCartItem();
  document.getElementById("checkoutSection")?.classList.add("is-hidden");
  renderCart();
  await loadOrders();
  renderPlacedOrders();
  showToast("Order placed successfully.", "success");
}

function bindEvents() {
  document.getElementById("clearCartButton").addEventListener("click", async () => {
    cart = [];
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

  document.getElementById("submitOrderButton").addEventListener("click", () => {
    handleCheckout();
  });

  document.getElementById("checkoutForm").addEventListener("input", () => {
    saveBuyerProfileFromForm();
  });

  document.getElementById("checkoutForm").addEventListener("change", () => {
    saveBuyerProfileFromForm();
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
  renderCart();
  renderPlacedOrders();
}

boot();
