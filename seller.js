const STORAGE_KEYS = {
  currentSeller: "tamu_market_current_seller",
  adminSession: "tamu_market_admin_session"
};

const DEFAULT_BUSINESS_CATEGORIES = ["Supermarket", "Retail", "Wholesale"];
const IMAGE_PRESETS = {
  product: { maxWidth: 300, maxHeight: 300, quality: 0.74, maxBytes: 120 * 1024 },
  business: { maxWidth: 400, maxHeight: 400, quality: 0.76, maxBytes: 160 * 1024 },
  offer: { maxWidth: 600, maxHeight: 300, quality: 0.72, maxBytes: 180 * 1024 },
  location: { maxWidth: 600, maxHeight: 300, quality: 0.72, maxBytes: 180 * 1024 }
};
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SOURCE_IMAGE_BYTES = 8 * 1024 * 1024;

let map;
let marker;
let cachedProducts = [];
let cachedOrders = [];
let cachedCategories = [];
let cachedOffers = [];
const sellerOrderFilters = {
  search: "",
  status: "all",
  payment: "all",
  date: "all"
};

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
    // ignore storage failures
  }
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item";
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

function normalizeOrderItem(item = {}) {
  const businessId = item.businessId || item.storeId || item.sellerId || "";
  const name = item.name || item.productName || "Product";
  const price = Number(item.price ?? item.unitPrice ?? item.productPrice) || 0;
  const quantity = Number(item.quantity || 1);
  const total = Number(item.total ?? item.lineTotal ?? price * quantity) || 0;

  return {
    ...item,
    productId: item.productId || item.id || "",
    businessId,
    sellerId: item.sellerId || businessId,
    storeId: item.storeId || businessId,
    categoryId: item.categoryId || "",
    name,
    productName: item.productName || name,
    quantity,
    price,
    unitPrice: Number(item.unitPrice ?? price) || 0,
    total,
    lineTotal: Number(item.lineTotal ?? total) || 0
  };
}

async function postJson(url, payload) {
  try {
    const response = await window.fetch(url, {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const raw = await response.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch (error) {
      data = {
        ok: false,
        message: `Server returned ${response.status}.`,
        error: raw.replace(/\s+/g, " ").slice(0, 220)
      };
    }
    return {
      ok: response.ok,
      status: response.status,
      data,
      raw
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: {
        ok: false,
        message: "Network request failed.",
        error: String(error?.message || error).slice(0, 220)
      }
    };
  }
}

async function verifySellerSession(seller = currentSeller()) {
  if (!seller) {
    return false;
  }

  try {
    const response = await fetch("./api/auth/session.php", { cache: "no-store", credentials: "same-origin" });
    const result = await response.json().catch(() => ({}));
    const session = result.session || {};
    return response.ok
      && result.ok
      && session.role === "seller"
      && session.status === "approved"
      && String(session.businessId || "") === String(seller.id || seller.businessId || "");
  } catch (error) {
    return false;
  }
}

function currency(value) {
  return `KSh ${Number(value || 0).toLocaleString()}`;
}

function labelize(value) {
  return String(value || "pending")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeOrderStatus(status) {
  const value = String(status || "pending").toLowerCase();
  if (value === "completed") return "delivered";
  if (value === "dispatch" || value === "sourcing") return "processing";
  if (value === "pending") return "pending_payment";
  return ["pending_payment", "paid", "processing", "delivered", "cancelled"].includes(value) ? value : "pending_payment";
}

function showToast(message, variant = "info") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${variant}`;
  toast.textContent = message;
  container.appendChild(toast);

  window.setTimeout(() => {
    toast.classList.add("toast-exit");
    window.setTimeout(() => {
      if (toast.parentNode === container) {
        container.removeChild(toast);
      }
    }, 300);
  }, 3800);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function setSellerMapStatus(message) {
  const status = document.getElementById("sellerMapSearchStatus");
  if (status) {
    status.textContent = message;
  }
}

function setSellerCoordinates(latitude, longitude, options = {}) {
  const lat = Number(latitude);
  const lng = Number(longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    setSellerMapStatus("Coordinates were invalid. Try again.");
    return false;
  }

  document.getElementById("latitude").value = lat.toFixed(6);
  document.getElementById("longitude").value = lng.toFixed(6);

  if (map) {
    if (marker) {
      marker.setLatLng([lat, lng]);
    } else {
      marker = L.marker([lat, lng]).addTo(map);
    }
    map.setView([lat, lng], options.zoom || 15);
  }

  setSellerMapStatus(options.label ? `Pinned: ${options.label}` : `Pinned coordinates: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
  return true;
}

async function searchSellerMapLocation() {
  const input = document.getElementById("sellerMapSearchInput");
  const query = input ? input.value.trim() : "";

  if (!query) {
    setSellerMapStatus("Type a place, town, stage, or landmark to search.");
    return;
  }

  setSellerMapStatus("Searching location...");

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(`${query}, Kenya`)}`,
      { headers: { Accept: "application/json" } }
    );
    const matches = await response.json();
    const match = Array.isArray(matches) ? matches[0] : null;

    if (!match) {
      setSellerMapStatus("No location match found. Try a nearby town or landmark.");
      return;
    }

    setSellerCoordinates(match.lat, match.lon, {
      label: match.display_name || query,
      zoom: 16
    });
  } catch (error) {
    setSellerMapStatus("Search failed. Check internet and try again.");
  }
}

function initMap() {
  const defaultLat = -1.2921;
  const defaultLng = 36.8219;

  if (!document.getElementById("locationMap") || typeof L === "undefined") {
    setSellerMapStatus("Map could not load. Check internet and refresh.");
    return;
  }

  map = L.map("locationMap").setView([defaultLat, defaultLng], 10);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors"
  }).addTo(map);

  map.on("click", function (e) {
    const { lat, lng } = e.latlng;
    setSellerCoordinates(lat, lng);
  });

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(function (position) {
      const { latitude, longitude } = position.coords;
      map.setView([latitude, longitude], 15);
    });
  }

  const searchButton = document.getElementById("sellerMapSearchButton");
  const searchInput = document.getElementById("sellerMapSearchInput");
  const coordinatesButton = document.getElementById("sellerUseCoordinatesButton");

  searchButton?.addEventListener("click", searchSellerMapLocation);
  searchInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      searchSellerMapLocation();
    }
  });

  coordinatesButton?.addEventListener("click", () => {
    if (!navigator.geolocation) {
      setSellerMapStatus("Your browser does not support location access.");
      return;
    }

    setSellerMapStatus("Getting your current coordinates...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setSellerCoordinates(latitude, longitude, { label: "Current device location", zoom: 16 });
      },
      () => {
        setSellerMapStatus("Could not get your coordinates. Allow location access or search manually.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

function toggleForms(showRegistration) {
  const registrationForm = document.getElementById("registrationForm");
  const loginForm = document.getElementById("loginForm");
  const formTitle = document.getElementById("formTitle");
  const loginStatus = document.getElementById("loginStatus");
  document.body.classList.toggle("seller-register-active", showRegistration);

  if (showRegistration) {
    registrationForm.classList.remove("is-hidden");
    loginForm.classList.add("is-hidden");
    formTitle.textContent = "Seller Registration";
    if (loginStatus) loginStatus.textContent = "";
    window.setTimeout(() => {
      if (map) {
        map.invalidateSize();
      }
    }, 80);
    return;
  }

  registrationForm.classList.add("is-hidden");
  loginForm.classList.remove("is-hidden");
  formTitle.textContent = "Seller Login";
}

function showDashboard() {
  const seller = currentSeller();
  if (!seller) {
    hideDashboard();
    return;
  }

  if (!isSellerActive(seller)) {
    setCurrentSeller(null);
    toggleForms(false);
    document.getElementById("loginStatus").textContent = "Your seller account is not approved yet.";
    return;
  }

  document.body.classList.add("seller-dashboard-active");
  document.body.classList.remove("seller-auth-only");
  document.body.classList.remove("seller-register-active");
  document.getElementById("sellerAuthSection").classList.add("is-hidden");
  document.getElementById("sellerDashboard").classList.remove("is-hidden");
  document.getElementById("registrationForm").classList.add("is-hidden");
  document.getElementById("loginForm").classList.add("is-hidden");
  document.getElementById("formTitle").textContent = "Seller Dashboard";
  document.getElementById("sellerWelcomeTitle").textContent = `${seller.storeName || "Your store"} dashboard`;

  renderCounts();
  renderSellerCategories();
  renderProducts();
  renderOffers();
  renderOrders();
  renderSellerNotifications();
  renderSellerPaymentOrders();
  renderSellerCustomers();
  renderSellerHomeSummary();
  renderSellerAnalytics();
  fillSellerSettingsForms();
  setSellerView("overview");
}

function hideDashboard() {
  document.body.classList.add("seller-auth-only");
  document.body.classList.remove("seller-dashboard-active");
  document.body.classList.remove("seller-menu-open");
  closeSellerMenu();
  document.getElementById("sellerDashboard").classList.add("is-hidden");
  document.getElementById("sellerAuthSection").classList.remove("is-hidden");
  setCurrentSeller(null);
  toggleForms(false);
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

function currentSeller() {
  return readStorage(STORAGE_KEYS.currentSeller, null);
}

async function loadSellerData() {
  const seller = currentSeller();
  try {
    const [marketRes, orderRes] = await Promise.all([
      fetch('./api/marketplace/list.php', { cache: 'no-store' }),
      seller
        ? fetch(`./api/orders/list.php?businessId=${encodeURIComponent(seller.id)}`, { cache: 'no-store' })
        : Promise.resolve(null)
    ]);
    const marketData = await marketRes.json();
    const orderData = orderRes ? await orderRes.json() : { orders: [] };
    cachedProducts = marketRes.ok && marketData.ok ? (marketData.products || []) : [];
    cachedCategories = marketRes.ok && marketData.ok ? (marketData.categories || []) : [];
    cachedOffers = marketRes.ok && marketData.ok ? (marketData.offers || []) : [];
    cachedOrders = orderRes && orderRes.ok && orderData.ok ? (orderData.orders || []) : [];
  } catch (error) {
    cachedProducts = [];
    cachedCategories = [];
    cachedOffers = [];
    cachedOrders = [];
  }
}

function isSellerActive(seller) {
  if (!seller || seller.status !== "approved") {
    return false;
  }
  if (!seller.expiresAt) {
    return true;
  }
  const expiry = new Date(seller.expiresAt).getTime();
  return Number.isFinite(expiry) ? expiry > Date.now() : true;
}

function setCurrentSeller(seller) {
  if (!seller) {
    window.localStorage.removeItem(STORAGE_KEYS.currentSeller);
    return;
  }
  writeStorage(STORAGE_KEYS.currentSeller, seller);
}

function products() {
  const seller = currentSeller();
  return cachedProducts
    .map(normalizeProductRecord)
    .filter((product) => !seller || product.storeId === seller.id || product.businessId === seller.id);
}

function offers() {
  return cachedOffers.map((offer) => ({
    ...offer,
    id: String(offer.id || offer.publicId || ""),
    sellerId: String(offer.sellerId || offer.storeId || offer.businessId || ""),
    storeId: String(offer.storeId || offer.sellerId || offer.businessId || ""),
    storeName: offer.storeName || offer.businessName || "",
    offerTitle: offer.offerTitle || offer.title || offer.productName || "Offer",
    offerNote: offer.offerNote || offer.note || offer.productOffer || "Store offer",
    offerExpiry: offer.offerExpiry || offer.expires || "Active offer",
    offerImage: offer.offerImage || offer.image || offer.productImage || ""
  }));
}

function sellerCategories() {
  const seller = currentSeller();
  return cachedCategories
    .map((category) => ({
      id: category.id || category.name,
      businessId: category.businessId || "",
      sellerId: category.businessId || "",
      storeName: seller?.storeName || "",
      name: category.name || category,
      image: category.image || ""
    }))
    .filter((category) => !seller || !category.businessId || category.businessId === seller.id);
}

function normalizeCategoryName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function categoryKey(value) {
  return normalizeCategoryName(value).toLowerCase();
}

function categoryLabelFromValue(value) {
  const normalized = normalizeCategoryName(value);
  if (!normalized) return "";
  const defaultMatch = DEFAULT_BUSINESS_CATEGORIES.find((item) => categoryKey(item) === categoryKey(normalized));
  if (defaultMatch) return defaultMatch;
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function uniqueCategoryNames(names) {
  const seen = new Set();
  const result = [];
  names.forEach((name) => {
    const label = categoryLabelFromValue(name);
    const key = categoryKey(label);
    if (!label || seen.has(key)) return;
    seen.add(key);
    result.push(label);
  });
  return result;
}

function categoriesForSeller(seller = currentSeller()) {
  const globalCategories = cachedCategories.map((category) => category.name || category).filter(Boolean);
  const storeCategories = sellerCategories()
    .filter((category) => !seller || category.sellerId === seller.id)
    .map((category) => category.name);
  const dynamicCategories = uniqueCategoryNames([...globalCategories, ...storeCategories])
    .filter((category) => !DEFAULT_BUSINESS_CATEGORIES.some((defaultCategory) => categoryKey(defaultCategory) === categoryKey(category)))
    .sort((left, right) => left.localeCompare(right));
  return [...DEFAULT_BUSINESS_CATEGORIES, ...dynamicCategories];
}

function renderSmartCategorySelect(selectId, searchId, selectedValue = "") {
  const select = document.getElementById(selectId);
  if (!select) return;

  const search = document.getElementById(searchId);
  const query = categoryKey(search?.value || "");
  const allCategories = categoriesForSeller();
  const selected = normalizeCategoryName(selectedValue || select.value);
  const visibleCategories = allCategories.filter((category) => !query || categoryKey(category).includes(query));
  const categoriesToRender = visibleCategories.length ? visibleCategories : allCategories;
  const configuredStoreCategories = selectId === "sellerCategorySelect"
    ? new Set(sellerCategories()
      .filter((category) => category.sellerId === currentSeller()?.id)
      .map((category) => categoryKey(category.name)))
    : new Set();

  select.innerHTML = [
    '<option value="">Select category</option>',
    ...categoriesToRender.map((category) => {
      const disabled = configuredStoreCategories.has(categoryKey(category)) ? " disabled" : "";
      const label = disabled ? `${category} (already added)` : category;
      return `<option value="${escapeAttribute(category)}"${disabled}>${escapeHtml(label)}</option>`;
    })
  ].join("");

  const selectedMatch = allCategories.find((category) => categoryKey(category) === categoryKey(selected));
  if (selectedMatch && !configuredStoreCategories.has(categoryKey(selectedMatch))) {
    select.value = selectedMatch;
  } else if (!select.value && categoriesToRender.length) {
    select.value = categoriesToRender.find((category) => !configuredStoreCategories.has(categoryKey(category))) || "";
  }
}

function renderAllCategorySelects() {
  renderSmartCategorySelect("sellerCategorySelect", "sellerCategorySearch");
  renderSmartCategorySelect("productCategorySelect", "productCategorySearch");
}

function bindSmartCategorySearches() {
  [
    ["sellerCategorySearch", "sellerCategorySelect"],
    ["productCategorySearch", "productCategorySelect"]
  ].forEach(([searchId, selectId]) => {
    const search = document.getElementById(searchId);
    if (!search || search.dataset.bound === "true") return;
    search.dataset.bound = "true";
    search.addEventListener("input", () => renderSmartCategorySelect(selectId, searchId));
  });
}

function orders() {
  return cachedOrders.map((order) => ({
    ...order,
    userId: order.userId || order.customerId || order.phone || "guest",
    paymentRef: order.paymentRef || order.mpesaReference || order.deliveryPayment?.reference || "",
    mpesaReference: order.mpesaReference || order.paymentRef || order.deliveryPayment?.reference || "",
    items: Array.isArray(order.items) ? order.items.map(normalizeOrderItem) : []
  }));
}

function sellerOrders(seller) {
  return orders().filter((order) => {
    if (order.sellerId === seller.id || order.businessId === seller.id) {
      return true;
    }

    if (Array.isArray(order.items)) {
      return order.items.some((item) => item.sellerId === seller.id || item.storeId === seller.id || item.businessId === seller.id);
    }

    return false;
  });
}

function renderCounts() {
  const seller = currentSeller();
  if (!seller) return;

  const sellerProducts = products().filter((product) => product.sellerId === seller.id);
  const sellerOffers = offers().filter((offer) => offer.sellerId === seller.id);
  const sellerOrderList = sellerOrders(seller);

  document.getElementById("productCount").textContent = sellerProducts.length;
  document.getElementById("offerCount").textContent = sellerOffers.length;
  document.getElementById("orderCount").textContent = sellerOrderList.filter((order) =>
    !["delivered", "cancelled"].includes(normalizeOrderStatus(order.status))
  ).length;
}

function renderProducts() {
  const seller = currentSeller();
  const container = document.getElementById("productList");
  if (!container) return;

  if (!seller) {
    container.innerHTML = '<div class="list-card">Login to manage your products.</div>';
    return;
  }

  const sellerProducts = products().filter((product) => product.sellerId === seller.id).slice().reverse();
  if (!sellerProducts.length) {
    container.innerHTML = '<div class="list-card">No products yet. Add your first product above.</div>';
    return;
  }

  container.innerHTML = sellerProducts
    .map((product) => `
      <article class="list-card seller-catalog-card">
        <div class="seller-product-media">
          ${product.productImage ? `<img src="${product.productImage}" alt="${product.productName}" loading="lazy" decoding="async" width="300" height="300">` : product.productCategory}
          <span class="seller-catalog-badge">${product.productOffer ? "Offer" : "New"}</span>
        </div>
        <div class="seller-catalog-copy">
          <strong>${product.productName}</strong>
          <p class="tiny">${product.productCategory} | ${product.productStock}</p>
          <span class="seller-catalog-price">${currency(product.productPrice)}</span>
          ${product.productOffer ? `<p class="tiny seller-catalog-tag">${product.productOffer}</p>` : '<p class="tiny seller-catalog-tag">Everyday item</p>'}
        </div>
        <div class="button-row">
          <button class="button button-outline button-small" data-edit-product="${product.id}" type="button">Edit</button>
          <button class="button button-ghost button-small" data-delete-product="${product.id}" type="button">Delete</button>
        </div>
      </article>
    `)
    .join("");

  container.querySelectorAll("[data-edit-product]").forEach((button) => {
    button.addEventListener("click", () => {
      const product = products().find((item) => item.id === button.dataset.editProduct);
      if (!product) return;

      document.getElementById("productId").value = product.id;
      document.querySelector('[name="productName"]').value = product.productName;
      renderSmartCategorySelect("productCategorySelect", "productCategorySearch", product.productCategory);
      document.querySelector('[name="productPrice"]').value = product.productPrice;
      document.querySelector('[name="productStock"]').value = product.productStock;
      document.querySelector('[name="productDeal"]').value = product.productOffer || "";
      document.querySelector('[name="productImageUrl"]').value = product.productImage || "";
      document.getElementById("saveProductBtn").textContent = "Update Product";
      showToast("Product loaded for editing.", "info");
    });
  });

  container.querySelectorAll("[data-delete-product]").forEach((button) => {
    button.addEventListener("click", async () => {
      const response = await postJson('./api/products/delete.php', { id: button.dataset.deleteProduct });
      if (!response.ok || response.data?.ok === false) {
        showToast(response.data?.message || "Product delete failed.", "warn");
        return;
      }
      await loadSellerData();
      renderCounts();
      renderProducts();
      renderSellerAnalytics();
      showToast("Product deleted.", "warn");
    });
  });
}

function renderSellerCategories() {
  const seller = currentSeller();
  const container = document.getElementById("sellerCategoryList");
  if (!seller || !container) return;

  const list = sellerCategories().filter((category) => category.sellerId === seller.id);
  renderAllCategorySelects();

  container.innerHTML = list.length
    ? list.map((category) => `
        <article class="list-card">
          <div class="section-head">
            <strong>${category.name}</strong>
            <button class="button button-ghost button-small" data-delete-category="${category.id}" type="button">Delete</button>
          </div>
        </article>
      `).join("")
    : '<div class="list-card">No custom categories yet. Add your first store aisle above.</div>';

  container.querySelectorAll("[data-delete-category]").forEach((button) => {
    button.addEventListener("click", async () => {
      const response = await postJson('./api/categories/delete.php', { id: button.dataset.deleteCategory });
      if (!response.ok || response.data?.ok === false) {
        showToast(response.data?.message || "Category delete failed.", "warn");
        return;
      }
      await loadSellerData();
      renderSellerCategories();
      showToast("Category deleted.", "warn");
    });
  });
}

function renderOffers() {
  const seller = currentSeller();
  const container = document.getElementById("offerList");
  if (!container) return;

  if (!seller) {
    container.innerHTML = '<div class="list-card">Login to manage your offers.</div>';
    return;
  }

  const sellerOffers = offers().filter((offer) => offer.sellerId === seller.id).slice().reverse();
  if (!sellerOffers.length) {
    container.innerHTML = '<div class="list-card">No offers yet. Create one above.</div>';
    return;
  }

  container.innerHTML = sellerOffers
    .map((offer) => `
      <article class="list-card seller-catalog-card seller-offer-card">
        <div class="seller-product-media">
          ${offer.offerImage ? `<img src="${offer.offerImage}" alt="${offer.offerTitle}" loading="lazy" decoding="async" width="600" height="300">` : "Offer"}
        </div>
        <div class="seller-catalog-copy">
          <strong>${offer.offerTitle}</strong>
          <p class="tiny">${offer.offerNote}</p>
          <span class="status-pill status-pill--pending">${offer.offerExpiry}</span>
        </div>
        <div class="button-row">
          <button class="button button-outline button-small" data-edit-offer="${offer.id}" type="button">Edit</button>
          <button class="button button-ghost button-small" data-delete-offer="${offer.id}" type="button">Delete</button>
        </div>
      </article>
    `)
    .join("");

  container.querySelectorAll("[data-edit-offer]").forEach((button) => {
    button.addEventListener("click", () => {
      const offer = offers().find((item) => item.id === button.dataset.editOffer);
      if (!offer) return;

      document.getElementById("offerId").value = offer.id;
      document.querySelector('[name="offerTitle"]').value = offer.offerTitle;
      document.querySelector('[name="offerNote"]').value = offer.offerNote;
      document.querySelector('[name="offerExpiry"]').value = offer.offerExpiry;
      document.querySelector('[name="offerImageUrl"]').value = offer.offerImage || "";
      document.getElementById("saveOfferBtn").textContent = "Update Offer";
      showToast("Offer loaded for editing.", "info");
    });
  });

  container.querySelectorAll("[data-delete-offer]").forEach((button) => {
    button.addEventListener("click", async () => {
      const response = await postJson('./api/offers/delete.php', { id: button.dataset.deleteOffer });
      if (!response.ok || response.data?.ok === false) {
        showToast(response.data?.message || "Offer delete failed.", "warn");
        return;
      }
      await loadSellerData();
      renderCounts();
      renderOffers();
      renderSellerAnalytics();
      showToast("Offer deleted.", "warn");
    });
  });
}

function renderOrders() {
  const seller = currentSeller();
  const container = document.getElementById("orderList");
  if (!container) return;

  if (!seller) {
    container.innerHTML = '<div class="list-card">Login to view your orders.</div>';
    return;
  }

  const allSellerOrders = sellerOrders(seller);
  const sellerOrderList = filteredSellerOrders(seller).slice().reverse();
  if (!sellerOrderList.length) {
    container.innerHTML = '<div class="list-card">No orders match the current filters for your store.</div>';
    return;
  }

  container.innerHTML = sellerOrderList
    .map((order) => {
      const businessPayment = Array.isArray(order.businessPayments)
        ? order.businessPayments.find((payment) => payment.storeId === seller.id)
        : null;
      const sellerStatus = order.sellerPaymentStatus?.[seller.id] || businessPayment?.status || "pending";
      const paymentStatus = sellerStatus === "paid" ? "paid" : sellerStatus;
      const orderStatus = normalizeOrderStatus(order.status);
      const sellerItems = Array.isArray(order.items)
        ? order.items.filter((item) => item.storeId === seller.id || item.sellerId === seller.id)
        : [];
      const sellerTotal = businessPayment?.amount || sellerItems.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0);
      const paymentRef = order.mpesaReference || businessPayment?.reference || "No reference submitted";
      return `
      <article class="list-card">
        <div class="section-head">
          <div>
            <strong>${order.id}</strong>
            <p class="tiny">${order.createdAt ? new Date(order.createdAt).toLocaleString() : "Date pending"}</p>
          </div>
          <span class="status-pill status-pill--${orderStatus}">
            ${labelize(orderStatus)}
          </span>
        </div>
        <p>${order.customer || "Customer"} | ${order.phone || ""}</p>
        <p class="tiny">Payment: ${order.paymentMethod || "Business direct payment"} | M-Pesa: ${order.mpesaName || order.customer || "Name pending"} | ${order.mpesaNumber || order.phone || "Number pending"} | Ref: ${paymentRef}</p>
        <p class="tiny">${sellerItems.map((item) => `${item.productName} x${item.quantity}`).join(", ") || "Products pending"}</p>
        <p class="tiny">Business amount: ${currency(sellerTotal)} | Ref: ${businessPayment?.reference || "No reference submitted"} | ${labelize(paymentStatus)}</p>
        <p class="tiny">Customer location: ${order.buyerLocation || "Location pending"}</p>
        <p class="tiny">Distance: ${sellerOrderDistance(order, seller.id)}</p>
        <p class="tiny">Delivery: ${currency(order.deliveryFee || 0)} to till ${order.deliveryPayment?.tillNumber || "7312380"} | Ref: ${order.deliveryPayment?.reference || "Pending"}</p>
        <p class="tiny">Delivery status: ${labelize(order.deliveryStatus || order.status || "pending")} | Employee: ${order.assignedEmployeeName || order.assignedEmployeeEmail || "Not assigned"}</p>
        <div class="order-detail-panel is-hidden" data-seller-order-detail="${order.id}">
          <p class="tiny">Items: ${sellerItems.map((item) => `${item.productName} x${item.quantity} (${currency(item.lineTotal || 0)})`).join(" | ") || "Items pending"}</p>
          <p class="tiny">Order total: Products ${currency(order.subtotal || sellerTotal)} + Delivery ${currency(order.deliveryFee || 0)} = ${currency(order.total || sellerTotal)}</p>
          <p class="tiny">Payment status: ${labelize(paymentStatus)} | Order status: ${labelize(orderStatus)}</p>
        </div>
        <div class="button-row">
          <button class="button button-outline button-small" data-view-seller-order="${order.id}" type="button">View details</button>
          ${paymentStatus !== "paid" ? `<button class="button button-primary button-small" data-mark-paid="${order.id}" type="button">Confirm Paid</button>` : ""}
          ${orderStatus !== "processing" && !["delivered", "cancelled"].includes(orderStatus) ? `<button class="button button-outline button-small" data-mark-processing="${order.id}" type="button">Processing</button>` : ""}
          ${orderStatus !== "delivered" ? `<button class="button button-outline button-small" data-mark-delivered="${order.id}" type="button">Delivered</button>` : ""}
          ${orderStatus !== "cancelled" ? `<button class="button button-outline button-small" data-mark-cancelled="${order.id}" type="button">Cancel</button>` : ""}
          <button class="button button-ghost button-small" data-delete-order="${order.id}" type="button">Delete</button>
        </div>
      </article>
    `;
    })
    .join("");

  container.querySelectorAll("[data-view-seller-order]").forEach((button) => {
    button.addEventListener("click", () => {
      container.querySelector(`[data-seller-order-detail="${button.dataset.viewSellerOrder}"]`)?.classList.toggle("is-hidden");
    });
  });

  container.querySelectorAll("[data-mark-paid]").forEach((button) => {
    button.addEventListener("click", () => {
      const orderId = button.dataset.markPaid;
      const updated = orders().map((order) => {
        if (order.id !== orderId) return order;
        const sellerPaymentStatus = {
          ...(order.sellerPaymentStatus || {}),
          [seller.id]: "paid"
        };
        const businessPayments = Array.isArray(order.businessPayments)
          ? order.businessPayments.map((payment) => payment.storeId === seller.id ? { ...payment, status: "paid", confirmedAt: new Date().toISOString() } : payment)
          : order.businessPayments;
        const allBusinessPaid = Array.isArray(businessPayments)
          ? businessPayments.every((payment) => payment.status === "paid")
          : false;
        const deliveryPaid = order.deliveryPayment?.status === "paid";
        return {
          ...order,
          sellerPaymentStatus,
          businessPayments,
          paymentStatus: allBusinessPaid && deliveryPaid ? "paid" : "partially_paid",
          status: ["pending", "pending_payment"].includes(normalizeOrderStatus(order.status)) ? "paid" : normalizeOrderStatus(order.status),
          updatedAt: new Date().toISOString()
        };
      });
      cachedOrders = updated;
      postJson('./api/orders/update.php', { id: orderId, status: "paid", paymentStatus: "paid" });
      renderCounts();
      renderOrders();
      renderSellerNotifications();
      renderSellerPaymentOrders();
      renderSellerCustomers();
      renderSellerAnalytics();
      showToast("Business payment confirmed.", "success");
    });
  });

  container.querySelectorAll("[data-mark-processing]").forEach((button) => {
    button.addEventListener("click", () => {
      updateSellerOrderStatus(button.dataset.markProcessing, "processing");
    });
  });

  container.querySelectorAll("[data-mark-delivered]").forEach((button) => {
    button.addEventListener("click", () => {
      updateSellerOrderStatus(button.dataset.markDelivered, "delivered");
    });
  });

  container.querySelectorAll("[data-mark-cancelled]").forEach((button) => {
    button.addEventListener("click", () => {
      updateSellerOrderStatus(button.dataset.markCancelled, "cancelled");
    });
  });

  container.querySelectorAll("[data-delete-order]").forEach((button) => {
    button.addEventListener("click", async () => {
      const updated = orders().filter((order) => order.id !== button.dataset.deleteOrder);
      cachedOrders = updated;
      await postJson('./api/orders/delete.php', { id: button.dataset.deleteOrder });
      renderCounts();
      renderOrders();
      renderSellerNotifications();
      renderSellerPaymentOrders();
      renderSellerCustomers();
      renderSellerAnalytics();
      showToast("Order deleted.", "warn");
    });
  });
}

function sellerOrderDistance(order, sellerId) {
  const route = Array.isArray(order.routeBreakdown)
    ? order.routeBreakdown.find((entry) => entry.storeId === sellerId) || order.routeBreakdown[0]
    : null;
  return route ? `${Number(route.distanceKm || 0).toFixed(1)} km` : "Distance pending";
}

function sellerOrderSearchText(order, seller) {
  return [
    order.id,
    order.customer,
    order.phone,
    order.buyerLocation,
    order.mpesaReference,
    order.deliveryPayment?.reference,
    order.paymentMethod,
    Array.isArray(order.items) ? order.items.filter((item) => item.storeId === seller.id || item.sellerId === seller.id).map((item) => item.productName).join(" ") : "",
    Array.isArray(order.businessPayments) ? order.businessPayments.map((payment) => `${payment.storeName} ${payment.reference}`).join(" ") : ""
  ].join(" ").toLowerCase();
}

function sellerOrderInDateRange(order, range) {
  if (range === "all") return true;
  const created = new Date(order.createdAt || order.updatedAt || 0).getTime();
  if (!Number.isFinite(created) || created <= 0) return false;
  if (range === "today") {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return created >= start;
  }
  const days = Number(range);
  return Number.isFinite(days) ? created >= Date.now() - days * 24 * 60 * 60 * 1000 : true;
}

function filteredSellerOrders(seller) {
  const query = sellerOrderFilters.search.trim().toLowerCase();
  return sellerOrders(seller).filter((order) => {
    const businessPayment = Array.isArray(order.businessPayments)
      ? order.businessPayments.find((payment) => payment.storeId === seller.id)
      : null;
    const sellerStatus = order.sellerPaymentStatus?.[seller.id] || businessPayment?.status || "pending";
    const paymentStatus = sellerStatus === "paid" ? "paid" : sellerStatus;
    const orderStatus = normalizeOrderStatus(order.status);
    const matchesSearch = !query || sellerOrderSearchText(order, seller).includes(query);
    const matchesStatus = sellerOrderFilters.status === "all" || orderStatus === sellerOrderFilters.status;
    const matchesPayment = sellerOrderFilters.payment === "all" || paymentStatus === sellerOrderFilters.payment;
    const matchesDate = sellerOrderInDateRange(order, sellerOrderFilters.date);
    return matchesSearch && matchesStatus && matchesPayment && matchesDate;
  });
}

function updateSellerOrderStatus(orderId, status) {
  const updated = orders().map((order) => order.id === orderId
    ? {
        ...order,
        status,
        deliveryStatus: status === "delivered" ? "delivered" : order.deliveryStatus,
        deliveredAt: status === "delivered" ? new Date().toISOString() : order.deliveredAt,
        updatedAt: new Date().toISOString()
      }
    : order);
  cachedOrders = updated;
  postJson('./api/orders/update.php', { id: orderId, status });
  renderCounts();
  renderOrders();
  renderSellerNotifications();
  renderSellerPaymentOrders();
  renderSellerCustomers();
  renderSellerAnalytics();
  showToast(`Order marked as ${labelize(status)}.`, status === "cancelled" ? "warn" : "success");
}

function renderSellerNotifications() {
  const seller = currentSeller();
  const container = document.getElementById("sellerNotificationList");
  if (!seller || !container) return;

  const list = sellerOrders(seller).slice().reverse().map((order) => {
    const payment = Array.isArray(order.businessPayments)
      ? order.businessPayments.find((item) => item.storeId === seller.id)
      : null;
    return {
      title: `Order ${order.id}`,
      detail: `${order.customer || "Customer"} | ${payment?.reference || "Payment ref pending"} | ${order.deliveryStatus || order.status || "pending"}`
    };
  });

  container.innerHTML = list.length
    ? list.map((item) => `<article class="list-card"><strong>${item.title}</strong><p class="tiny">${item.detail}</p></article>`).join("")
    : '<div class="list-card">No notifications yet. New orders and payment refs will appear here.</div>';
}

function renderSellerPaymentOrders() {
  const seller = currentSeller();
  const container = document.getElementById("sellerPaidOrderList");
  if (!seller || !container) return;

  const paid = sellerOrders(seller).filter((order) => order.sellerPaymentStatus?.[seller.id] === "paid");
  container.innerHTML = paid.length
    ? paid.map((order) => `<article class="list-card"><strong>${order.id}</strong><p class="tiny">${order.customer || "Customer"} paid and confirmed.</p></article>`).join("")
    : '<div class="list-card">Confirmed paid orders will appear here.</div>';
}

function renderSellerCustomers() {
  const seller = currentSeller();
  const container = document.getElementById("sellerCustomerList");
  if (!seller || !container) return;

  const customers = [...new Map(sellerOrders(seller).map((order) => [
    `${order.phone || ""}-${order.customer || ""}`,
    order
  ])).values()];

  container.innerHTML = customers.length
    ? customers.slice().reverse().map((order) => `
        <article class="mini-list-card">
          <div>
            <strong>${order.customer || "Customer"}</strong>
            <p class="tiny">${order.phone || "Phone pending"} | ${order.buyerLocation || "Location pending"}</p>
          </div>
          <span class="summary-chip">${currency(order.total || 0)}</span>
        </article>
      `).join("")
    : '<div class="list-card">Customers will appear after they place orders.</div>';
}

function renderSellerAnalytics() {
  const seller = currentSeller();
  const container = document.getElementById("sellerAnalyticsStats");
  if (!seller || !container) return;

  const sellerProductList = products().filter((product) => product.sellerId === seller.id);
  const sellerOfferList = offers().filter((offer) => offer.sellerId === seller.id);
  const sellerOrderList = sellerOrders(seller);
  const paidOrders = sellerOrderList.filter((order) => order.sellerPaymentStatus?.[seller.id] === "paid");
  const revenue = sellerOrderList.reduce((sum, order) => {
    const businessPayment = Array.isArray(order.businessPayments)
      ? order.businessPayments.find((payment) => payment.storeId === seller.id)
      : null;
    return sum + Number(businessPayment?.amount || 0);
  }, 0);

  container.innerHTML = `
    <article class="card stat-card"><span class="stat-label">Revenue</span><strong>${currency(revenue)}</strong></article>
    <article class="card stat-card"><span class="stat-label">Orders</span><strong>${sellerOrderList.length}</strong></article>
    <article class="card stat-card"><span class="stat-label">Paid orders</span><strong>${paidOrders.length}</strong></article>
    <article class="card stat-card"><span class="stat-label">Products</span><strong>${sellerProductList.length}</strong></article>
    <article class="card stat-card"><span class="stat-label">Offers</span><strong>${sellerOfferList.length}</strong></article>
  `;
}

function renderSellerHomeSummary() {
  const seller = currentSeller();
  const container = document.getElementById("sellerHomeSummary");
  if (!seller || !container) return;

  const sellerProductList = products().filter((product) => product.sellerId === seller.id);
  const sellerOrderList = sellerOrders(seller);
  const activeOrders = sellerOrderList.filter((order) => !["delivered", "cancelled"].includes(normalizeOrderStatus(order.status)));
  const latestOrder = sellerOrderList[0];
  const lowStockProducts = sellerProductList.filter((product) => String(product.productStock || product.stock || "").toLowerCase() !== "in stock");
  const notifications = [
    ...activeOrders.slice(0, 2).map((order) => `Order ${order.id || "pending"} needs attention`),
    ...lowStockProducts.slice(0, 2).map((product) => `${product.productName || "Product"} is ${product.productStock || product.stock}`)
  ];

  container.innerHTML = `
    <article class="seller-summary-card">
      <span class="summary-chip">Orders</span>
      <strong>${activeOrders.length} active</strong>
      <p class="tiny">${latestOrder ? `Latest: ${latestOrder.customer || "Customer"} | ${currency(latestOrder.total || 0)}` : "No orders yet."}</p>
    </article>
    <article class="seller-summary-card">
      <span class="summary-chip">Products</span>
      <strong>${sellerProductList.length} listed</strong>
      <p class="tiny">${lowStockProducts.length ? `${lowStockProducts.length} product${lowStockProducts.length === 1 ? "" : "s"} need stock review.` : "Inventory is ready for buyers."}</p>
    </article>
    <article class="seller-summary-card">
      <span class="summary-chip">Notifications</span>
      <strong>${notifications.length} update${notifications.length === 1 ? "" : "s"}</strong>
      <p class="tiny">${notifications[0] || "No urgent notifications."}</p>
    </article>
  `;
}

function fillSellerSettingsForms() {
  const seller = currentSeller();
  if (!seller) return;

  const locationInput = document.getElementById("sellerLocationInput");
  const latitudeInput = document.getElementById("sellerLatitudeInput");
  const longitudeInput = document.getElementById("sellerLongitudeInput");
  const tillInput = document.getElementById("sellerTillInput");
  const pochiInput = document.getElementById("sellerPochiInput");
  const bankInput = document.getElementById("sellerBankInput");
  const deliveryAvailabilityInput = document.getElementById("sellerDeliveryAvailabilityInput");
  const deliveryNotesInput = document.getElementById("sellerDeliveryNotesInput");

  if (locationInput) locationInput.value = seller.location || seller.county || "";
  if (latitudeInput) latitudeInput.value = seller.latitude || "";
  if (longitudeInput) longitudeInput.value = seller.longitude || "";
  if (tillInput) tillInput.value = seller.tillNumber || "";
  if (pochiInput) pochiInput.value = seller.pochiNumber || "";
  if (bankInput) bankInput.value = seller.bankAccount || seller.cardAccount || "";
  if (deliveryAvailabilityInput) deliveryAvailabilityInput.value = seller.deliveryAvailability || "Available";
  if (deliveryNotesInput) deliveryNotesInput.value = seller.deliveryNotes || "";
}

function buildSellerPayload(formData) {
  const email = String(formData.get("email")).trim().toLowerCase();
  const password = String(formData.get("password"));
  const selectedLocation = String(formData.get("county")).trim();
  const latitude = parseFloat(formData.get("latitude"));
  const longitude = parseFloat(formData.get("longitude"));
  const safeLatitude = Number.isFinite(latitude) ? latitude : 0;
  const safeLongitude = Number.isFinite(longitude) ? longitude : 0;
  const paymentMethods = formData.getAll("paymentMethods");
  const tillNumber = String(formData.get("tillNumber") || "").trim();
  const pochiNumber = String(formData.get("pochiNumber") || "").trim();
  const cardAccount = String(formData.get("cardAccount") || "").trim();

  if (!email || !password) {
    return { ok: false, message: "Email and password are required." };
  }

  if (password.length < 8) {
    return { ok: false, message: "Password must be at least 8 characters long." };
  }

  if (!selectedLocation) {
    return { ok: false, message: "Select your business location." };
  }

  if (paymentMethods.includes("M-Pesa Till") && !tillNumber) {
    return { ok: false, message: "Enter your M-Pesa Till Number." };
  }

  if (paymentMethods.includes("M-Pesa Pochi") && !pochiNumber) {
    return { ok: false, message: "Enter your M-Pesa Pochi Number." };
  }

  if ((paymentMethods.includes("Bank Account") || paymentMethods.includes("Card Payment")) && !cardAccount) {
    return { ok: false, message: "Enter your bank account number." };
  }

  return {
    ok: true,
    payload: {
      id: createId("seller"),
      name: String(formData.get("storeName")).trim(),
      storeName: String(formData.get("storeName")).trim(),
      ownerName: String(formData.get("ownerName")).trim(),
      phone: String(formData.get("phone")).trim(),
      email,
      password,
      latitude: safeLatitude,
      longitude: safeLongitude,
      paymentMethods,
      paymentOptions: paymentMethods,
      tillNumber,
      pochiNumber,
      cardAccount,
      bankAccount: cardAccount,
      type: String(formData.get("businessType")).trim(),
      businessType: String(formData.get("businessType")).trim(),
      county: selectedLocation,
      locationId: slugify(selectedLocation),
      location: selectedLocation,
      logo: "",
      logoImage: "",
      rating: 4.5,
      status: "pending",
      createdAt: new Date().toISOString()
    }
  };
}

async function fileToDataUrl(file) {
  return optimizeImageFile(file);
}

function dataUrlBytes(dataUrl) {
  const base64 = String(dataUrl || "").split(",")[1] || "";
  return Math.ceil(base64.length * 0.75);
}

function canvasToDataUrl(canvas, quality) {
  return canvas.toDataURL("image/webp", quality);
}

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image could not be read."));
    };
    image.src = url;
  });
}

async function optimizeImageFile(file, presetName = "product") {
  if (!file || !file.size) {
    return "";
  }
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw new Error("Use JPG, PNG, or WebP images only.");
  }
  if (file.size > MAX_SOURCE_IMAGE_BYTES) {
    throw new Error("Image is too large. Use a file under 8 MB.");
  }

  const preset = IMAGE_PRESETS[presetName] || IMAGE_PRESETS.product;
  const image = await loadImageElement(file);
  const scale = Math.min(1, preset.maxWidth / image.naturalWidth, preset.maxHeight / image.naturalHeight);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) {
    throw new Error("Image compression is not supported on this browser.");
  }
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, width, height);

  let quality = preset.quality;
  let dataUrl = canvasToDataUrl(canvas, quality);
  while (dataUrlBytes(dataUrl) > preset.maxBytes && quality > 0.46) {
    quality = Math.max(0.46, quality - 0.08);
    dataUrl = canvasToDataUrl(canvas, quality);
  }

  if (!dataUrl.startsWith("data:image/webp;base64,")) {
    throw new Error("Image could not be converted to WebP.");
  }
  if (dataUrlBytes(dataUrl) > preset.maxBytes * 1.25) {
    throw new Error("Image is still too large after compression. Try a simpler image.");
  }
  return dataUrl;
}

async function buildProductPayload(formData) {
  const seller = currentSeller();
  if (!seller) {
    return { ok: false, message: "Please login before adding products." };
  }

  const price = Number(formData.get("productPrice"));
  if (!Number.isFinite(price) || price < 0) {
    return { ok: false, message: "Enter a valid product price." };
  }

  const productId = String(formData.get("productId")).trim();
  const existingProduct = products().find((product) => product.id === productId);
  let uploadedImage = "";
  try {
    uploadedImage = await optimizeImageFile(formData.get("productImageFile"), "product");
  } catch (error) {
    return { ok: false, message: error.message || "Product image could not be optimized." };
  }
  const productImage = uploadedImage || String(formData.get("productImageUrl")).trim() || existingProduct?.productImage || "";
  const productName = String(formData.get("productName")).trim();
  const productCategory = categoryLabelFromValue(formData.get("productCategory"));
  const productStock = String(formData.get("productStock")).trim();
  const productOffer = String(formData.get("productDeal")).trim();
  const businessId = seller.id;
  const categoryId = productCategory;

  if (!productName) {
    return { ok: false, message: "Enter a product name." };
  }

  if (!productCategory || !categoriesForSeller(seller).some((category) => categoryKey(category) === categoryKey(productCategory))) {
    return { ok: false, message: "Select a valid product category." };
  }

  return {
    ok: true,
    payload: {
      id: productId || createId("product"),
      businessId,
      sellerId: seller.id,
      storeId: seller.id,
      businessName: seller.name || seller.storeName,
      storeName: seller.storeName,
      categoryId,
      name: productName,
      productName,
      categoryName: productCategory,
      productCategory,
      price,
      productPrice: price,
      stock: productStock,
      productStock,
      offerFlag: Boolean(productOffer),
      productOffer,
      image: productImage,
      productImage,
      stockQuantity: productStock === "Out of stock" ? 0 : productStock === "Limited stock" ? 5 : 999,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    }
  };
}

async function buildOfferPayload(formData) {
  const seller = currentSeller();
  if (!seller) {
    return { ok: false, message: "Please login before creating offers." };
  }
  const offerId = String(formData.get("offerId")).trim();
  const existingOffer = offers().find((offer) => offer.id === offerId);
  let uploadedImage = "";
  try {
    uploadedImage = await optimizeImageFile(formData.get("offerImageFile"), "offer");
  } catch (error) {
    return { ok: false, message: error.message || "Offer image could not be optimized." };
  }
  const offerImage = uploadedImage || String(formData.get("offerImageUrl")).trim() || existingOffer?.offerImage || "";

  return {
    ok: true,
    payload: {
      id: offerId || createId("offer"),
      sellerId: seller.id,
      storeId: seller.id,
      storeName: seller.storeName,
      offerTitle: String(formData.get("offerTitle")).trim(),
      offerNote: String(formData.get("offerNote")).trim(),
      offerExpiry: String(formData.get("offerExpiry")).trim(),
      offerImage,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    }
  };
}

function resetProductForm() {
  const form = document.getElementById("productForm");
  form.reset();
  document.getElementById("productId").value = "";
  document.getElementById("saveProductBtn").textContent = "Save Product";
  document.getElementById("productCategorySearch").value = "";
  renderSmartCategorySelect("productCategorySelect", "productCategorySearch");
}

function resetOfferForm() {
  const form = document.getElementById("offerForm");
  form.reset();
  document.getElementById("offerId").value = "";
  document.getElementById("saveOfferBtn").textContent = "Save Offer";
}

function setSellerView(view) {
  const panels = document.querySelectorAll("[data-seller-panel]");
  const buttons = document.querySelectorAll("[data-seller-view]");
  const dashboard = document.getElementById("sellerDashboard");

  if (dashboard) {
    dashboard.dataset.activeSellerView = view;
  }

  panels.forEach((panel) => {
    panel.classList.toggle("seller-dashboard-hidden", panel.dataset.sellerPanel !== view);
  });

  document.querySelectorAll("#sellerDashboard > .dashboard-grid").forEach((grid) => {
    const hasVisiblePanel = [...grid.querySelectorAll("[data-seller-panel]")]
      .some((panel) => panel.dataset.sellerPanel === view);
    grid.classList.toggle("seller-dashboard-hidden", !hasVisiblePanel);
  });

  buttons.forEach((button) => {
    const active = button.dataset.sellerView === view;
    button.classList.toggle("button-primary", active);
    button.classList.toggle("button-ghost", !active);
    button.setAttribute("aria-current", active ? "page" : "false");
  });

  closeSellerMenu();
}

function closeSellerMenu() {
  const nav = document.getElementById("sellerWorkspaceNav");
  const overlay = document.getElementById("sellerMenuOverlay");
  const toggle = document.getElementById("sellerWorkspaceToggle");

  nav?.classList.remove("is-open");
  overlay?.classList.remove("is-open");
  toggle?.setAttribute("aria-expanded", "false");
  document.body.classList.remove("seller-menu-open");
}

function closeOtherMenusForSeller() {
  document.querySelectorAll(".admin-sidebar.is-open, .employee-sidebar.is-open, .seller-sidebar[data-open='true']")
    .forEach((menu) => {
      menu.classList.remove("is-open");
      if (menu.dataset.open) {
        menu.dataset.open = "false";
      }
    });
  document.querySelectorAll(".admin-sidebar-overlay.is-open, .employee-sidebar-overlay.is-open, .seller-sidebar-overlay.is-open")
    .forEach((overlay) => overlay.classList.remove("is-open"));
  document.querySelectorAll("#adminMenuToggle, #employeeMenuToggle, .seller-menu-toggle")
    .forEach((button) => {
      if (button.id !== "sellerWorkspaceToggle") {
        button.setAttribute("aria-expanded", "false");
      }
    });
  document.body.classList.remove("admin-menu-open", "employee-menu-open", "legacy-seller-menu-open");
}

function toggleSellerMenu() {
  const nav = document.getElementById("sellerWorkspaceNav");
  const overlay = document.getElementById("sellerMenuOverlay");
  const toggle = document.getElementById("sellerWorkspaceToggle");
  if (!nav || !overlay || !toggle) return;

  if (window.matchMedia("(min-width: 901px)").matches) {
    const dashboard = document.getElementById("sellerDashboard");
    const isCollapsed = dashboard?.classList.toggle("seller-sidebar-collapsed");
    toggle.setAttribute("aria-expanded", String(!isCollapsed));
    return;
  }

  closeOtherMenusForSeller();
  const isOpen = nav.classList.toggle("is-open");
  overlay.classList.toggle("is-open", isOpen);
  toggle.setAttribute("aria-expanded", String(isOpen));
  document.body.classList.toggle("seller-menu-open", isOpen);
}

function bindForms() {
  document.getElementById("sellerRegistrationForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const result = buildSellerPayload(formData);
    if (!result.ok) {
      showToast(result.message, "warn");
      return;
    }

    const seller = result.payload;
    const response = await postJson('./api/sellers/register.php', {
      ...seller,
      password: String(formData.get("password"))
    });
    if (!response.ok || response.data?.ok === false) {
      const details = response.data?.error ? ` ${response.data.error}` : "";
      showToast(`${response.data?.message || `Registration failed (${response.status}).`}${details}`, "warn");
      return;
    }
    clearSellerRegistrationForm(event.currentTarget);
    toggleForms(false);
    const successMessage = response.data?.message || "Successfully registered. Please wait for admin approval.";
    document.getElementById("loginStatus").textContent = successMessage;
    showToast(successMessage, "success");
  });

  document.getElementById("sellerLoginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email")).trim().toLowerCase();
    const password = String(formData.get("password"));
    const response = await postJson('./api/sellers/login.php', { email, password });
    if (!response.ok || response.data?.ok === false) {
      const message = response.status === 403
        ? (response.data?.message || "Your account is not approved by admin yet.")
        : (response.data?.message || "Invalid seller credentials.");
      document.getElementById("loginStatus").textContent = message;
      showToast(message, response.status === 403 ? "warn" : "error");
      return;
    }

    const loginSeller = response.data.seller;
    setCurrentSeller(loginSeller);
    await loadSellerData();
    event.currentTarget.reset();
    document.getElementById("loginStatus").textContent = "";
    showDashboard();
    showToast("Login successful. You can now manage your store.", "success");
  });

  document.getElementById("productForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const result = await buildProductPayload(formData);
    if (!result.ok) {
      showToast(result.message, "warn");
      return;
    }

    const nextProduct = result.payload;
    const existing = products().find((item) => item.id === nextProduct.id);
    const response = await postJson('./api/products/save.php', {
      id: nextProduct.id,
      businessId: nextProduct.businessId,
      categoryId: nextProduct.productCategory,
      categoryName: nextProduct.productCategory,
      productCategory: nextProduct.productCategory,
      name: nextProduct.productName,
      image: nextProduct.productImage,
      price: nextProduct.productPrice,
      offerFlag: nextProduct.offerFlag,
      stock: nextProduct.stockQuantity,
      description: nextProduct.description || ""
    });
    if (!response.ok || response.data?.ok === false) {
      showToast(response.data?.message || "Product save failed.", "warn");
      return;
    }
    await loadSellerData();
    renderCounts();
    renderSellerCategories();
    renderProducts();
    renderSellerAnalytics();
    resetProductForm();
    showToast(existing ? "Product updated." : "Product added.", "success");
  });

  document.getElementById("offerForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const result = await buildOfferPayload(formData);
    if (!result.ok) {
      showToast(result.message, "warn");
      return;
    }

    const nextOffer = result.payload;
    const existing = offers().find((item) => item.id === nextOffer.id);
    const response = await postJson('./api/offers/save.php', nextOffer);
    if (!response.ok || response.data?.ok === false) {
      showToast(response.data?.message || "Offer save failed.", "warn");
      return;
    }
    await loadSellerData();
    renderCounts();
    renderOffers();
    renderSellerAnalytics();
    resetOfferForm();
    showToast(existing ? "Offer updated." : "Offer created.", "success");
  });

  document.getElementById("sellerCategoryForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const seller = currentSeller();
    const formData = new FormData(event.currentTarget);
    const name = categoryLabelFromValue(formData.get("categoryName"));
    if (!seller || !name) return;

    const exists = sellerCategories()
      .filter((category) => category.sellerId === seller.id)
      .some((category) => categoryKey(category.name) === categoryKey(name));
    if (exists) {
      showToast("This category is already enabled for your store.", "warn");
      return;
    }

    const response = await postJson('./api/categories/save.php', { name, businessId: seller.id });
    if (!response.ok || response.data?.ok === false) {
      showToast(response.data?.message || "Category save failed.", "warn");
      return;
    }
    await loadSellerData();
    event.currentTarget.reset();
    renderSellerCategories();
    showToast("Category added.", "success");
  });

  document.getElementById("sellerLocationForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const updated = await updateCurrentSellerRecord({
      location: String(formData.get("location")).trim(),
      county: String(formData.get("location")).trim(),
      locationId: slugify(String(formData.get("location")).trim()),
      latitude: Number(formData.get("latitude")),
      longitude: Number(formData.get("longitude")),
      updatedAt: new Date().toISOString()
    });
    if (updated) showToast("Business location updated.", "success");
  });

  document.getElementById("sellerPaymentForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const paymentMethods = [];
    if (String(formData.get("tillNumber")).trim()) paymentMethods.push("M-Pesa Till");
    if (String(formData.get("pochiNumber")).trim()) paymentMethods.push("M-Pesa Pochi");
    if (String(formData.get("bankAccount")).trim()) paymentMethods.push("Bank Account");

    const updated = await updateCurrentSellerRecord({
      tillNumber: String(formData.get("tillNumber")).trim(),
      pochiNumber: String(formData.get("pochiNumber")).trim(),
      bankAccount: String(formData.get("bankAccount")).trim(),
      cardAccount: String(formData.get("bankAccount")).trim(),
      paymentMethods,
      paymentOptions: paymentMethods,
      updatedAt: new Date().toISOString()
    });
    if (updated) showToast("Payment details updated.", "success");
  });

  document.getElementById("sellerDeliveryForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const updated = await updateCurrentSellerRecord({
      deliveryAvailability: String(formData.get("deliveryAvailability")).trim(),
      deliveryNotes: String(formData.get("deliveryNotes")).trim(),
      updatedAt: new Date().toISOString()
    });
    if (updated) showToast("Delivery settings updated.", "success");
  });
}

async function updateCurrentSellerRecord(patch) {
  const seller = currentSeller();
  if (!seller) return false;
  const response = await postJson('./api/sellers/update.php', { id: seller.id, ...patch });
  if (!response.ok || response.data?.ok === false) {
    showToast(response.data?.message || "Seller update failed.", "warn");
    return false;
  }
  const updatedSeller = { ...seller, ...(response.data?.seller || patch) };
  setCurrentSeller(updatedSeller);
  await loadSellerData();
  fillSellerSettingsForms();
  return true;
}

function syncPaymentFields() {
  const checkedMethods = new Set(
    [...document.querySelectorAll('[name="paymentMethods"]:checked')].map((input) => input.value)
  );
  const fields = [
    { method: "M-Pesa Till", fieldId: "tillNumberField", inputId: "tillNumberInput" },
    { method: "M-Pesa Pochi", fieldId: "pochiNumberField", inputId: "pochiNumberInput" },
    { method: "Bank Account", legacyMethod: "Card Payment", fieldId: "cardAccountField", inputId: "cardAccountInput" }
  ];

  fields.forEach(({ method, legacyMethod, fieldId, inputId }) => {
    const field = document.getElementById(fieldId);
    const input = document.getElementById(inputId);
    const isActive = checkedMethods.has(method) || (legacyMethod && checkedMethods.has(legacyMethod));

    field?.classList.toggle("is-hidden", !isActive);
    if (input) {
      input.required = isActive;
      if (!isActive) {
        input.value = "";
      }
    }
  });
}

function clearSellerRegistrationForm(form) {
  form.reset();
  ["businessTypeSearch", "sellerMapSearchInput", "latitude", "longitude", "tillNumberInput", "pochiNumberInput", "cardAccountInput"].forEach((id) => {
    const input = document.getElementById(id);
    if (input) input.value = "";
  });
  document.querySelectorAll('[name="paymentMethods"]').forEach((input) => {
    input.checked = false;
  });
  if (marker && map) {
    map.removeLayer(marker);
    marker = null;
  }
  setSellerMapStatus("Tip: search and then click the map to refine the exact pin.");
  syncPaymentFields();
}

function bindActions() {
  document.getElementById("showRegistration").addEventListener("click", () => toggleForms(true));
  document.getElementById("showLogin").addEventListener("click", () => toggleForms(false));
  document.getElementById("resetProductBtn").addEventListener("click", resetProductForm);
  document.getElementById("resetOfferBtn").addEventListener("click", resetOfferForm);
  const logoutSeller = async () => {
    await fetch("./api/auth/logout.php", { method: "POST", cache: "no-store", credentials: "same-origin" }).catch(() => {});
    hideDashboard();
    toggleForms(false);
    showToast("Logged out successfully.", "info");
  };
  document.getElementById("logoutBtn").addEventListener("click", logoutSeller);
  document.getElementById("sellerPanelLogoutBtn").addEventListener("click", logoutSeller);

  document.getElementById("sellerWorkspaceToggle").addEventListener("click", toggleSellerMenu);
  document.getElementById("sellerMenuOverlay").addEventListener("click", closeSellerMenu);

  document.querySelectorAll("[data-seller-view]").forEach((button) => {
    button.addEventListener("click", () => setSellerView(button.dataset.sellerView));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeSellerMenu();
    }
  });

  window.addEventListener("resize", () => {
    if (window.matchMedia("(min-width: 901px)").matches) {
      closeSellerMenu();
    } else {
      document.getElementById("sellerDashboard")?.classList.remove("seller-sidebar-collapsed");
    }
  });

  document.querySelectorAll('[name="paymentMethods"]').forEach((input) => {
    input.addEventListener("change", syncPaymentFields);
  });

  syncPaymentFields();
}

function bindSellerOrderFilters() {
  const bindings = [
    ["sellerOrderSearch", "search"],
    ["sellerOrderStatusFilter", "status"],
    ["sellerOrderPaymentFilter", "payment"],
    ["sellerOrderDateFilter", "date"]
  ];
  bindings.forEach(([id, key]) => {
    const input = document.getElementById(id);
    if (!input || input.dataset.bound === "true") return;
    input.dataset.bound = "true";
    input.addEventListener("input", () => {
      sellerOrderFilters[key] = input.value;
      renderOrders();
    });
    input.addEventListener("change", () => {
      sellerOrderFilters[key] = input.value;
      renderOrders();
    });
  });
}

function refreshSellerOrderViews() {
  if (!currentSeller()) {
    return;
  }
  renderCounts();
  renderOrders();
  renderSellerNotifications();
  renderSellerPaymentOrders();
  renderSellerCustomers();
  renderSellerHomeSummary();
  renderSellerAnalytics();
}

function bindLiveOrderUpdates() {
  if (window.__tamuSellerLiveOrdersBound) {
    return;
  }
  window.__tamuSellerLiveOrdersBound = true;
  window.setInterval(async () => {
    if (currentSeller()) {
      await loadSellerData();
      refreshSellerOrderViews();
    }
  }, 12000);
}

async function boot() {
  document.body.classList.add("seller-auth-only");
  document.body.classList.remove("seller-dashboard-active");
  document.getElementById("sellerDashboard")?.classList.add("is-hidden");
  initReveal();
  initAdminTrigger();
  initMap();
  bindForms();
  bindActions();
  bindSmartCategorySearches();
  bindSellerOrderFilters();
  bindLiveOrderUpdates();
  await loadSellerData();
  renderAllCategorySelects();

  const seller = currentSeller();
  if (seller) {
    const hasSession = await verifySellerSession(seller);
    if (!hasSession) {
      setCurrentSeller(null);
      toggleForms(false);
      document.getElementById("loginStatus").textContent = "Please login again to continue managing your store.";
      return;
    }
    await loadSellerData();
    showDashboard();
  } else {
    hideDashboard();
    toggleForms(false);
  }
}

boot();
