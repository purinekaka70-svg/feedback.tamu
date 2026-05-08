const STORAGE_KEYS = {
  cart: "tamu_market_cart",
  sellers: "tamu_market_sellers",
  sellerApplications: "tamu_market_seller_applications",
  sellerProducts: "tamu_market_seller_products",
  sellerDrafts: "tamu_market_seller_drafts",
  buyerProfile: "tamu_market_buyer_profile",
  adminOrders: "tamu_market_admin_orders",
  adminSession: "tamu_market_admin_session"
};

const API_ENDPOINTS = {
  createOrder: "./api/orders/create.php",
  adminLogin: "./api/admin/login.php"
};

const LOCAL_ADMIN_CREDENTIALS = {
  username: "TamuAdmin@2025",
  password: "ummeats"
};
const DELIVERY_TILL_NUMBER = "7312380";

let cart = readStorage(STORAGE_KEYS.cart, []);
let buyerMap;
let buyerMarker;

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

function migrateLegacyProducts() {
  const currentProducts = readStorage(STORAGE_KEYS.sellerProducts, null);
  if (currentProducts !== null) {
    return;
  }

  const legacyDrafts = readStorage(STORAGE_KEYS.sellerDrafts, []);
  const convertedProducts = legacyDrafts.map((draft) => ({
    id: draft.id,
    storeId: draft.storeId || "",
    storeName: draft.storeName || "",
    productName: draft.productName || "",
    productCategory: draft.productCategory || "",
    productPrice: Number(draft.productPrice) || 0,
    productStock: draft.productStock || "",
    productOffer: draft.productDeal || "",
    createdAt: draft.createdAt || new Date().toISOString(),
    updatedAt: draft.updatedAt || draft.createdAt || new Date().toISOString()
  }));

  writeStorage(STORAGE_KEYS.sellerProducts, convertedProducts);
}

function applications() {
  const localApplications = readStorage(STORAGE_KEYS.sellerApplications, []);
  const localSellers = readStorage(STORAGE_KEYS.sellers, []);
  const byKey = new Map();
  [...localApplications, ...localSellers].forEach((application) => {
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
  return [...byKey.values()];
}

function sellerProducts() {
  return readStorage(STORAGE_KEYS.sellerProducts, []).map((product) => ({
    ...product,
    storeId: product.storeId || product.sellerId || "",
    storeName: product.storeName || product.sellerName || ""
  }));
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
    mpesaReference: ""
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

function isLocalAdmin(username, password) {
  return username === LOCAL_ADMIN_CREDENTIALS.username && password === LOCAL_ADMIN_CREDENTIALS.password;
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

      const distanceKm = haversineDistanceKm(buyerPoint, {
        latitude: Number(store.latitude),
        longitude: Number(store.longitude)
      });
      const routeFee = Math.max(120, Math.round((90 + distanceKm * 28) / 10) * 10);

      return {
        storeId: store.id,
        storeName: store.storeName,
        distanceKm,
        fee: routeFee,
        quantity: group.quantity,
        subtotal: group.subtotal
      };
    })
    .filter(Boolean);

  const consolidationFee = breakdown.length > 1 ? (breakdown.length - 1) * 40 : 0;
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
    writeStorage(STORAGE_KEYS.cart, cart);
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
  let clickCount = 0;
  let resetTimer;

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

  footer.addEventListener("click", () => {
    clickCount += 1;
    window.clearTimeout(resetTimer);
    resetTimer = window.setTimeout(() => {
      clickCount = 0;
    }, 1200);

    if (clickCount === 4) {
      clickCount = 0;
      window.location.href = "./admin.html";
    }
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

    if (isLocalAdmin(username, password)) {
      openAdminDashboard(status);
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
      status.textContent = "Could not reach admin login service. Use the local admin credentials.";
    }
  });
}

function updateQuantity(productId, nextQuantity) {
  const current = cart.find((item) => item.productId === productId);
  if (!current) {
    return;
  }

  if (nextQuantity <= 0) {
    cart = cart.filter((item) => item.productId !== productId);
  } else {
    current.quantity = nextQuantity;
  }

  writeStorage(STORAGE_KEYS.cart, cart);
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
  const refInput = document.getElementById("mpesaReferenceInput");
  if (refInput) {
    refInput.value = profile.mpesaReference || profile.deliveryPaymentRef || "";
  }
}

function readCheckoutForm() {
  const mpesaReference = document.getElementById("mpesaReferenceInput")?.value.trim() || "";
  const businessPayments = [...document.querySelectorAll("[data-business-payment-store]")]
    .map((entry) => ({ storeId: entry.dataset.businessPaymentStore, method: "M-Pesa", ref: mpesaReference }));

  return {
    fullName: document.getElementById("buyerNameInput").value.trim(),
    mpesaName: document.getElementById("mpesaNameInput")?.value.trim() || "",
    phone: document.getElementById("buyerPhoneInput").value.trim(),
    location: document.getElementById("buyerLocationInput").value.trim(),
    latitude: document.getElementById("buyerLatitudeInput").value.trim(),
    longitude: document.getElementById("buyerLongitudeInput").value.trim(),
    note: "",
    mpesaReference,
    deliveryPaymentRef: mpesaReference,
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

  if (!selectedStores.length) {
    container.innerHTML = '<div class="breakdown-card"><p>No business payment needed until products are in cart.</p></div>';
    return;
  }

  container.innerHTML = selectedStores
    .map(
      ({ store, subtotal }) => {
        return `
          <article class="breakdown-card" data-business-payment-store="${store.id}">
            <strong>${store.storeName}</strong>
            <p>Products: ${currency(subtotal)}</p>
            <p class="tiny">
              ${storeTillNumber(store) ? `Till: ${storeTillNumber(store)} | ` : ""}
              ${storePochiNumber(store) ? `Pochi la Biashara: ${storePochiNumber(store)} | ` : ""}
              ${storeCardAccount(store) ? `Bank account: ${storeCardAccount(store)}` : ""}
            </p>
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
  instruction.textContent = `Delivery fee: ${items.length ? delivery.label : currency(0)}. Pay separately to till ${DELIVERY_TILL_NUMBER}.`;
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
    button.addEventListener("click", () => {
      const productId = button.dataset.productId;
      const item = cart.find((entry) => entry.productId === productId);
      if (!item) {
        return;
      }

      if (button.dataset.cartAction === "increase") {
        updateQuantity(productId, item.quantity + 1);
      }

      if (button.dataset.cartAction === "decrease") {
        updateQuantity(productId, item.quantity - 1);
      }

      if (button.dataset.cartAction === "remove") {
        updateQuantity(productId, 0);
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

  const list = readStorage(STORAGE_KEYS.adminOrders, []).slice().reverse();
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
        productName: product.productName,
        storeId: store.id,
        storeName: store.storeName,
        quantity: item.quantity,
        unitPrice: product.productPrice,
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
    customer: profile.fullName,
    mpesaName: profile.mpesaName,
    mpesaNumber: profile.phone,
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
  const existingOrders = readStorage(STORAGE_KEYS.adminOrders, []);
  writeStorage(STORAGE_KEYS.adminOrders, [...existingOrders, order]);
  writeStorage(STORAGE_KEYS.buyerProfile, profile);

  const response = await postJson(API_ENDPOINTS.createOrder, order);
  document.getElementById("checkoutStatus").textContent = response.ok
    ? "Order submitted."
    : "Order submitted locally.";

  cart = [];
  writeStorage(STORAGE_KEYS.cart, cart);
  document.getElementById("checkoutSection")?.classList.add("is-hidden");
  renderCart();
  renderPlacedOrders();
  showToast(
    response.ok ? "Order placed successfully." : "Order placed locally and queued for backend setup.",
    response.ok ? "success" : "info"
  );
}

function bindEvents() {
  document.getElementById("clearCartButton").addEventListener("click", () => {
    cart = [];
    writeStorage(STORAGE_KEYS.cart, cart);
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

  window.addEventListener("storage", () => {
    cart = readStorage(STORAGE_KEYS.cart, []);
    fillCheckoutForm();
    renderCart();
    renderPlacedOrders();
  });
}

function boot() {
  migrateLegacyProducts();
  initReveal();
  initAdminTrigger();
  fillCheckoutForm();
  initBuyerMap();
  bindEvents();
  renderCart();
  renderPlacedOrders();
}

boot();
