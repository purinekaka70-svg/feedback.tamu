const STORAGE_KEYS = {
  sellerApplications: "tamu_market_seller_applications",
  legacySellers: "tamu_market_sellers",
  currentSeller: "tamu_market_current_seller",
  sellerProducts: "tamu_market_seller_products",
  sellerOffers: "tamu_market_seller_offers",
  adminOrders: "tamu_market_admin_orders",
  adminSession: "tamu_market_admin_session"
};

const ADMIN_LOGIN_ENDPOINT = "./api/admin/login.php";
const SELLER_APPLY_ENDPOINT = "./api/sellers/apply.php";
const MAX_BUSINESS_IMAGE_BYTES = 2_500_000;

let map;
let marker;

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

function currency(value) {
  return `KSh ${Number(value || 0).toLocaleString()}`;
}

function normalizePaymentOptions(options) {
  const cleaned = Array.isArray(options)
    ? options.map((entry) => String(entry).trim()).filter(Boolean)
    : [];
  return cleaned.length ? cleaned : ["M-Pesa", "Cash on Delivery"];
}

function passwordMatches(encodedPassword, plainPassword) {
  try {
    return atob(String(encodedPassword || "")) === plainPassword;
  } catch (error) {
    return false;
  }
}

function showToast(message, tone = "info") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast--${tone}`;
  toast.textContent = message;
  container.appendChild(toast);

  window.setTimeout(() => {
    toast.remove();
  }, 3000);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read selected image."));
    reader.readAsDataURL(file);
  });
}

function isDataImageUrl(value) {
  return /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(String(value || ""));
}

function base64ByteSize(dataImageUrl) {
  const raw = String(dataImageUrl || "");
  const parts = raw.split(",");
  if (parts.length < 2) {
    return 0;
  }

  const base64 = parts[1];
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.ceil((base64.length * 3) / 4) - padding);
}

function renderBusinessImagePreview(dataImageUrl) {
  const preview = document.getElementById("businessImagePreview");
  if (!preview) {
    return;
  }

  if (!dataImageUrl) {
    preview.innerHTML = '<div class="business-image-preview__placeholder">No business image selected yet.</div>';
    return;
  }

  preview.innerHTML = `<img src="${dataImageUrl}" alt="Selected business image preview" />`;
}

function resetBusinessImageInput() {
  const fileInput = document.getElementById("businessImageInput");
  const hiddenInput = document.getElementById("businessImageBase64");
  if (fileInput) {
    fileInput.value = "";
  }
  if (hiddenInput) {
    hiddenInput.value = "";
  }
  renderBusinessImagePreview("");
}

function bindBusinessImageInput() {
  const fileInput = document.getElementById("businessImageInput");
  const hiddenInput = document.getElementById("businessImageBase64");
  if (!fileInput || !hiddenInput || fileInput.dataset.bound === "true") {
    return;
  }

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
    if (!file) {
      hiddenInput.value = "";
      renderBusinessImagePreview("");
      return;
    }

    if (!String(file.type || "").startsWith("image/")) {
      showToast("Please select a valid image file.", "warn");
      resetBusinessImageInput();
      return;
    }

    try {
      const dataImageUrl = await readFileAsDataUrl(file);
      if (!isDataImageUrl(dataImageUrl)) {
        showToast("Image format is invalid. Try another image.", "warn");
        resetBusinessImageInput();
        return;
      }

      if (base64ByteSize(dataImageUrl) > MAX_BUSINESS_IMAGE_BYTES) {
        showToast("Image is too large. Use an image below 2.5MB.", "warn");
        resetBusinessImageInput();
        return;
      }

      hiddenInput.value = dataImageUrl;
      renderBusinessImagePreview(dataImageUrl);
    } catch (error) {
      showToast("Could not read image. Try again.", "warn");
      resetBusinessImageInput();
    }
  });

  fileInput.dataset.bound = "true";
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
      data: {}
    };
  }
}

async function syncSellerApplicationToBackend(application) {
  const backendPayload = {
    id: application.id,
    storeName: application.storeName,
    businessType: application.businessType,
    ownerName: application.ownerName,
    phone: application.phone,
    location: application.location,
    county: application.county || "",
    businessImageBase64: application.businessImageBase64 || "",
    categoryFocus: application.categoryFocus,
    minimumOrder: application.minimumOrder,
    prepTime: application.prepTime,
    latitude: application.latitude,
    longitude: application.longitude,
    paymentOptions: application.paymentOptions,
    status: application.status
  };

  return postJson(SELLER_APPLY_ENDPOINT, backendPayload);
}

function applications() {
  return readStorage(STORAGE_KEYS.sellerApplications, []);
}

function products() {
  return readStorage(STORAGE_KEYS.sellerProducts, []);
}

function offers() {
  return readStorage(STORAGE_KEYS.sellerOffers, []);
}

function orders() {
  return readStorage(STORAGE_KEYS.adminOrders, []);
}

function setCurrentSeller(seller) {
  if (!seller) {
    writeStorage(STORAGE_KEYS.currentSeller, null);
    return;
  }

  writeStorage(STORAGE_KEYS.currentSeller, {
    id: seller.id,
    email: seller.email
  });
}

function currentSeller() {
  const session = readStorage(STORAGE_KEYS.currentSeller, null);
  if (!session) {
    return null;
  }

  const matchedSeller = applications().find((application) => {
    if (session.id && application.id === session.id) {
      return true;
    }

    if (!session.email) {
      return false;
    }

    return String(application.email || "").toLowerCase() === String(session.email).toLowerCase();
  });

  if (!matchedSeller || matchedSeller.status !== "approved") {
    setCurrentSeller(null);
    return null;
  }

  return matchedSeller;
}

function sellerOwnsRecord(record, sellerId) {
  return record.storeId === sellerId || record.sellerId === sellerId;
}

function orderStoreIds(order) {
  const ids = new Set();

  if (order.storeId) {
    ids.add(order.storeId);
  }
  if (order.sellerId) {
    ids.add(order.sellerId);
  }
  if (Array.isArray(order.items)) {
    order.items.forEach((item) => {
      if (item.storeId) {
        ids.add(item.storeId);
      }
      if (item.sellerId) {
        ids.add(item.sellerId);
      }
    });
  }

  return [...ids];
}

function sellerOrders(seller) {
  return orders().filter((order) => {
    if (order.storeId === seller.id || order.sellerId === seller.id) {
      return true;
    }

    if (Array.isArray(order.items)) {
      return order.items.some((item) => item.storeId === seller.id || item.sellerId === seller.id);
    }

    return false;
  });
}

function isOrderPaidForSeller(order, sellerId) {
  if (order.paymentStatus === "paid") {
    return true;
  }
  return (order.sellerPaymentStatus || {})[sellerId] === "paid";
}

function migrateLegacySellers() {
  const legacySellers = readStorage(STORAGE_KEYS.legacySellers, []);
  if (!legacySellers.length) {
    return;
  }

  const currentApplications = applications();
  const existingEmails = new Set(
    currentApplications
      .map((application) => String(application.email || "").trim().toLowerCase())
      .filter(Boolean)
  );

  const converted = legacySellers
    .map((legacy) => {
      const email = String(legacy.email || "").trim().toLowerCase();
      if (!email || existingEmails.has(email)) {
        return null;
      }

      return {
        id: legacy.id || createId("seller"),
        storeName: String(legacy.storeName || "").trim(),
        businessType: String(legacy.businessType || "supermarket").trim().toLowerCase(),
        ownerName: String(legacy.ownerName || "").trim(),
        phone: String(legacy.phone || "").trim(),
        email,
        password: String(legacy.password || ""),
        county: String(legacy.county || "County not set").trim(),
        location: String(legacy.location || "Location pending").trim(),
        categoryFocus: String(legacy.categoryFocus || "General groceries").trim(),
        minimumOrder: Number(legacy.minimumOrder) || 0,
        prepTime: String(legacy.prepTime || "30-45 min").trim(),
        latitude: Number(legacy.latitude),
        longitude: Number(legacy.longitude),
        businessImageBase64: String(legacy.businessImageBase64 || legacy.businessImage || "").trim(),
        paymentOptions: normalizePaymentOptions(legacy.paymentOptions || legacy.paymentMethods),
        tillNumber: String(legacy.tillNumber || "").trim(),
        pochiNumber: String(legacy.pochiNumber || "").trim(),
        cardAccount: String(legacy.cardAccount || "").trim(),
        status: ["pending", "approved", "rejected"].includes(legacy.status) ? legacy.status : "approved",
        createdAt: legacy.createdAt || new Date().toISOString()
      };
    })
    .filter(Boolean);

  if (!converted.length) {
    return;
  }

  writeStorage(STORAGE_KEYS.sellerApplications, [...currentApplications, ...converted]);
}

function migrateLegacyProducts() {
  const currentProducts = products();
  if (!currentProducts.length) {
    return;
  }

  let changed = false;
  const migrated = currentProducts.map((product) => {
    const storeId = product.storeId || product.sellerId || "";
    const sellerId = product.sellerId || product.storeId || "";
    const productOffer = product.productOffer ?? product.productDeal ?? "";

    if (
      storeId !== product.storeId ||
      sellerId !== product.sellerId ||
      productOffer !== product.productOffer
    ) {
      changed = true;
    }

    return {
      ...product,
      storeId,
      sellerId,
      productOffer
    };
  });

  if (changed) {
    writeStorage(STORAGE_KEYS.sellerProducts, migrated);
  }
}

function migrateLegacyOffers() {
  const currentOffers = offers();
  if (!currentOffers.length) {
    return;
  }

  let changed = false;
  const migrated = currentOffers.map((offer) => {
    const storeId = offer.storeId || offer.sellerId || "";
    const sellerId = offer.sellerId || offer.storeId || "";

    if (storeId !== offer.storeId || sellerId !== offer.sellerId) {
      changed = true;
    }

    return {
      ...offer,
      storeId,
      sellerId
    };
  });

  if (changed) {
    writeStorage(STORAGE_KEYS.sellerOffers, migrated);
  }
}

function setSellerMapStatus(message) {
  const status = document.getElementById("sellerMapSearchStatus");
  if (!status) {
    return;
  }
  status.textContent = message;
}

function setSellerCoordinates(latitude, longitude, label = "") {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !map) {
    return;
  }

  if (marker) {
    marker.setLatLng([lat, lng]);
  } else {
    marker = L.marker([lat, lng]).addTo(map);
  }

  document.getElementById("latitude").value = lat.toFixed(6);
  document.getElementById("longitude").value = lng.toFixed(6);
  map.setView([lat, lng], 15);
  setSellerMapStatus(label ? `Pinned: ${label}` : `Pinned at ${lat.toFixed(5)}, ${lng.toFixed(5)}.`);
}

async function searchSellerMapLocation() {
  const input = document.getElementById("sellerMapSearchInput");
  if (!input) {
    return;
  }

  const query = input.value.trim();
  if (!query) {
    setSellerMapStatus("Type a location to search first.");
    return;
  }

  setSellerMapStatus("Searching location...");

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
      setSellerMapStatus("No location match found. Try a nearby town or landmark.");
      return;
    }

    const lat = Number(match.lat);
    const lng = Number(match.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setSellerMapStatus("Location found but coordinates were invalid. Try another search.");
      return;
    }

    setSellerCoordinates(lat, lng, match.display_name || query);
  } catch (error) {
    setSellerMapStatus("Search failed. Check internet and try again.");
  }
}

function useSellerCurrentCoordinates() {
  if (!navigator.geolocation) {
    setSellerMapStatus("Geolocation is not supported on this device.");
    return;
  }

  setSellerMapStatus("Getting your current coordinates...");

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude, accuracy } = position.coords;
      const accuracyText = Number.isFinite(accuracy) ? ` (accuracy ±${Math.round(accuracy)}m)` : "";
      setSellerCoordinates(latitude, longitude, `Current location${accuracyText}`);
    },
    (error) => {
      if (error && error.code === 1) {
        setSellerMapStatus("Location access denied. Allow permission and try again.");
        return;
      }
      if (error && error.code === 2) {
        setSellerMapStatus("Could not detect your location right now.");
        return;
      }
      if (error && error.code === 3) {
        setSellerMapStatus("Location request timed out. Try again.");
        return;
      }
      setSellerMapStatus("Could not fetch your current coordinates.");
    },
    {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 30000
    }
  );
}

function initMap() {
  const mapElement = document.getElementById("locationMap");
  if (!mapElement || typeof L === "undefined") {
    return;
  }

  const defaultLat = -1.2921;
  const defaultLng = 36.8219;
  map = L.map("locationMap").setView([defaultLat, defaultLng], 10);

  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    attribution: "Tiles &copy; Esri",
    maxZoom: 19
  }).addTo(map);

  L.tileLayer("https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", {
    attribution: "Labels &copy; Esri",
    maxZoom: 19
  }).addTo(map);

  map.on("click", (event) => {
    const { lat, lng } = event.latlng;
    setSellerCoordinates(lat, lng);
  });

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition((position) => {
      const { latitude, longitude } = position.coords;
      map.setView([latitude, longitude], 13);
    });
  }

  const searchButton = document.getElementById("sellerMapSearchButton");
  const searchInput = document.getElementById("sellerMapSearchInput");
  const useCoordinatesButton = document.getElementById("sellerUseCoordinatesButton");
  if (searchButton && searchButton.dataset.bound !== "true") {
    searchButton.addEventListener("click", () => {
      searchSellerMapLocation();
    });
    searchButton.dataset.bound = "true";
  }

  if (searchInput && searchInput.dataset.bound !== "true") {
    searchInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        searchSellerMapLocation();
      }
    });
    searchInput.dataset.bound = "true";
  }

  if (useCoordinatesButton && useCoordinatesButton.dataset.bound !== "true") {
    useCoordinatesButton.addEventListener("click", () => {
      useSellerCurrentCoordinates();
    });
    useCoordinatesButton.dataset.bound = "true";
  }
}

function clearMapSelection() {
  document.getElementById("latitude").value = "";
  document.getElementById("longitude").value = "";
  resetBusinessImageInput();
  const searchInput = document.getElementById("sellerMapSearchInput");
  if (searchInput) {
    searchInput.value = "";
  }
  setSellerMapStatus("Tip: search and then click the map to refine the exact pin.");

  if (map && marker) {
    map.removeLayer(marker);
    marker = null;
  }
}

function toggleForms(showRegistration) {
  const registrationForm = document.getElementById("registrationForm");
  const loginForm = document.getElementById("loginForm");
  const formTitle = document.getElementById("formTitle");

  if (showRegistration) {
    registrationForm.classList.remove("is-hidden");
    loginForm.classList.add("is-hidden");
    formTitle.textContent = "New Seller Registration";
    return;
  }

  registrationForm.classList.add("is-hidden");
  loginForm.classList.remove("is-hidden");
  formTitle.textContent = "Seller Login";
}

function showDashboard() {
  const seller = currentSeller();
  if (!seller) {
    return;
  }

  document.getElementById("sellerDashboard").classList.remove("is-hidden");
  document.getElementById("registrationForm").classList.add("is-hidden");
  document.getElementById("loginForm").classList.add("is-hidden");
  document.getElementById("formTitle").textContent = "Seller Dashboard";

  renderCounts();
  renderProducts();
  renderOffers();
  renderOrders();
}

function hideDashboard() {
  document.getElementById("sellerDashboard").classList.add("is-hidden");
  setCurrentSeller(null);
  document.getElementById("formTitle").textContent = "New Seller Registration";
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

    if (clickCount === 3) {
      clickCount = 0;
      openModal();
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

    status.textContent = "Checking credentials...";

    try {
      const response = await window.fetch(ADMIN_LOGIN_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ username, password })
      });
      const data = await response.json().catch(() => ({}));

      if (response.ok && data && data.ok) {
        window.localStorage.setItem(STORAGE_KEYS.adminSession, "active");
        status.textContent = "Login successful. Redirecting...";
        window.setTimeout(() => {
          window.location.href = "./admin.html";
        }, 450);
        return;
      }

      status.textContent = data && data.message ? data.message : "Invalid admin credentials.";
    } catch (error) {
      status.textContent = "Could not reach admin login service.";
    }
  });
}

function renderCounts() {
  const seller = currentSeller();
  if (!seller) return;

  const sellerProducts = products().filter((product) => sellerOwnsRecord(product, seller.id));
  const sellerOffers = offers().filter((offer) => sellerOwnsRecord(offer, seller.id));
  const sellerOrderList = sellerOrders(seller);
  const pendingOrders = sellerOrderList.filter((order) => !isOrderPaidForSeller(order, seller.id));

  document.getElementById("productCount").textContent = sellerProducts.length;
  document.getElementById("offerCount").textContent = sellerOffers.length;
  document.getElementById("orderCount").textContent = pendingOrders.length;
}

function renderProducts() {
  const seller = currentSeller();
  const container = document.getElementById("productList");
  if (!container) return;

  if (!seller) {
    container.innerHTML = '<div class="list-card">Login to manage your products.</div>';
    return;
  }

  const sellerProducts = products()
    .filter((product) => sellerOwnsRecord(product, seller.id))
    .slice()
    .reverse();
  if (!sellerProducts.length) {
    container.innerHTML = '<div class="list-card">No products yet. Add your first product above.</div>';
    return;
  }

  container.innerHTML = sellerProducts
    .map((product) => `
      <article class="list-card">
        <div class="section-head">
          <strong>${product.productName}</strong>
          <span class="status-pill status-pill--approved">${product.productCategory}</span>
        </div>
        <p>${product.productStock}</p>
        <p class="tiny">${currency(product.productPrice)} ${product.productOffer ? `| ${product.productOffer}` : ""}</p>
        <div class="button-row">
          <button class="button button-outline button-small" data-edit-product="${product.id}" type="button">Edit</button>
          <button class="button button-ghost button-small" data-delete-product="${product.id}" type="button">Delete</button>
        </div>
      </article>
    `)
    .join("");

  container.querySelectorAll("[data-edit-product]").forEach((button) => {
    button.addEventListener("click", () => {
      const product = products().find(
        (item) => item.id === button.dataset.editProduct && sellerOwnsRecord(item, seller.id)
      );
      if (!product) return;

      document.getElementById("productId").value = product.id;
      document.querySelector('[name="productName"]').value = product.productName;
      document.querySelector('[name="productCategory"]').value = product.productCategory;
      document.querySelector('[name="productPrice"]').value = product.productPrice;
      document.querySelector('[name="productStock"]').value = product.productStock;
      document.querySelector('[name="productDeal"]').value = product.productOffer || "";
      document.getElementById("saveProductBtn").textContent = "Update Product";
      showToast("Product loaded for editing.", "info");
    });
  });

  container.querySelectorAll("[data-delete-product]").forEach((button) => {
    button.addEventListener("click", () => {
      const remaining = products().filter(
        (item) => item.id !== button.dataset.deleteProduct || !sellerOwnsRecord(item, seller.id)
      );
      writeStorage(STORAGE_KEYS.sellerProducts, remaining);
      renderCounts();
      renderProducts();
      showToast("Product deleted.", "warn");
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

  const sellerOffers = offers()
    .filter((offer) => sellerOwnsRecord(offer, seller.id))
    .slice()
    .reverse();
  if (!sellerOffers.length) {
    container.innerHTML = '<div class="list-card">No offers yet. Create one above.</div>';
    return;
  }

  container.innerHTML = sellerOffers
    .map((offer) => `
      <article class="list-card">
        <div class="section-head">
          <strong>${offer.offerTitle}</strong>
          <span class="status-pill status-pill--pending">${offer.offerExpiry}</span>
        </div>
        <p>${offer.offerNote}</p>
        <div class="button-row">
          <button class="button button-outline button-small" data-edit-offer="${offer.id}" type="button">Edit</button>
          <button class="button button-ghost button-small" data-delete-offer="${offer.id}" type="button">Delete</button>
        </div>
      </article>
    `)
    .join("");

  container.querySelectorAll("[data-edit-offer]").forEach((button) => {
    button.addEventListener("click", () => {
      const offer = offers().find(
        (item) => item.id === button.dataset.editOffer && sellerOwnsRecord(item, seller.id)
      );
      if (!offer) return;

      document.getElementById("offerId").value = offer.id;
      document.querySelector('[name="offerTitle"]').value = offer.offerTitle;
      document.querySelector('[name="offerNote"]').value = offer.offerNote;
      document.querySelector('[name="offerExpiry"]').value = offer.offerExpiry;
      document.getElementById("saveOfferBtn").textContent = "Update Offer";
      showToast("Offer loaded for editing.", "info");
    });
  });

  container.querySelectorAll("[data-delete-offer]").forEach((button) => {
    button.addEventListener("click", () => {
      const remaining = offers().filter(
        (item) => item.id !== button.dataset.deleteOffer || !sellerOwnsRecord(item, seller.id)
      );
      writeStorage(STORAGE_KEYS.sellerOffers, remaining);
      renderCounts();
      renderOffers();
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

  const sellerOrderList = sellerOrders(seller).slice().reverse();
  if (!sellerOrderList.length) {
    container.innerHTML = '<div class="list-card">No orders yet for your store.</div>';
    return;
  }

  container.innerHTML = sellerOrderList
    .map((order) => {
      const paid = isOrderPaidForSeller(order, seller.id);
      return `
        <article class="list-card">
          <div class="section-head">
            <strong>${order.id}</strong>
            <span class="status-pill status-pill--${paid ? "approved" : "pending"}">
              ${paid ? "Paid" : "Pending"}
            </span>
          </div>
          <p>${order.customer || "Customer"} | ${order.phone || ""}</p>
          <p class="tiny">${order.paymentMethod || "Payment method not specified"}</p>
          <p class="tiny">Total: ${currency(order.total || 0)}</p>
          ${
            paid
              ? ""
              : `<div class="button-row">
                  <button class="button button-primary button-small" data-mark-paid="${order.id}" type="button">Mark as Paid</button>
                </div>`
          }
        </article>
      `;
    })
    .join("");

  container.querySelectorAll("[data-mark-paid]").forEach((button) => {
    button.addEventListener("click", () => {
      const orderId = button.dataset.markPaid;
      const updated = orders().map((order) => {
        if (order.id !== orderId) return order;

        const nextSellerStatus = {
          ...(order.sellerPaymentStatus || {}),
          [seller.id]: "paid"
        };
        const storeIds = orderStoreIds(order);
        const allPaid = storeIds.length
          ? storeIds.every((storeId) => nextSellerStatus[storeId] === "paid")
          : true;

        return {
          ...order,
          sellerPaymentStatus: nextSellerStatus,
          paymentStatus: allPaid ? "paid" : order.paymentStatus || "pending"
        };
      });
      writeStorage(STORAGE_KEYS.adminOrders, updated);
      renderCounts();
      renderOrders();
      showToast("Order marked as paid.", "success");
    });
  });
}

function buildSellerPayload(formData) {
  const storeName = String(formData.get("storeName")).trim();
  const businessType = String(formData.get("businessType")).trim().toLowerCase();
  const ownerName = String(formData.get("ownerName")).trim();
  const phone = String(formData.get("phone")).trim();
  const email = String(formData.get("email")).trim().toLowerCase();
  const password = String(formData.get("password"));
  const county = String(formData.get("county")).trim();
  const latitude = Number(formData.get("latitude"));
  const longitude = Number(formData.get("longitude"));
  const businessImageBase64 = String(formData.get("businessImageBase64")).trim();
  const paymentMethods = formData.getAll("paymentMethods").map((entry) => String(entry).trim()).filter(Boolean);
  const tillNumber = String(formData.get("tillNumber")).trim();
  const pochiNumber = String(formData.get("pochiNumber")).trim();
  const cardAccount = String(formData.get("cardAccount")).trim();
  const wantsTill = paymentMethods.includes("M-Pesa Till");
  const wantsPochi = paymentMethods.includes("M-Pesa Pochi");
  const wantsCard = paymentMethods.includes("Card Payment");

  if (!storeName || !ownerName || !phone || !email || !password || !county) {
    return { ok: false, message: "Fill in all required business and account details." };
  }

  if (password.length < 6) {
    return { ok: false, message: "Password must be at least 6 characters long." };
  }

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { ok: false, message: "Please select your business location on the map." };
  }

  if (businessImageBase64) {
    if (!isDataImageUrl(businessImageBase64)) {
      return { ok: false, message: "Business image format is invalid. Upload a valid image." };
    }
    if (base64ByteSize(businessImageBase64) > MAX_BUSINESS_IMAGE_BYTES) {
      return { ok: false, message: "Business image is too large. Use one below 2.5MB." };
    }
  }

  if (!paymentMethods.length) {
    return { ok: false, message: "Select at least one payment method." };
  }

  if (wantsTill && !tillNumber) {
    return { ok: false, message: "Enter your M-Pesa Till number." };
  }

  if (wantsPochi && !pochiNumber) {
    return { ok: false, message: "Enter your M-Pesa Pochi number." };
  }

  if (wantsCard && !cardAccount) {
    return { ok: false, message: "Enter your card payment account details." };
  }

  if (applications().some((seller) => String(seller.email || "").toLowerCase() === email)) {
    return { ok: false, message: "A seller account with this email already exists." };
  }

  const location = `${county} County, pinned at ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;

  return {
    ok: true,
    payload: {
      id: createId("seller"),
      storeName,
      businessType: businessType || "supermarket",
      ownerName,
      phone,
      email,
      password: btoa(password),
      county,
      location,
      categoryFocus: "General groceries",
      minimumOrder: 0,
      prepTime: "30-45 min",
      latitude,
      longitude,
      businessImageBase64,
      paymentOptions: normalizePaymentOptions(paymentMethods),
      tillNumber,
      pochiNumber,
      cardAccount,
      status: "pending",
      createdAt: new Date().toISOString()
    }
  };
}

function buildProductPayload(formData) {
  const seller = currentSeller();
  if (!seller) {
    return { ok: false, message: "Please login before adding products." };
  }

  const productName = String(formData.get("productName")).trim();
  const productCategory = String(formData.get("productCategory")).trim();
  const productStock = String(formData.get("productStock")).trim();
  const price = Number(formData.get("productPrice"));

  if (!productName || !productCategory || !productStock) {
    return { ok: false, message: "Fill in product name, category, and stock status." };
  }

  if (!Number.isFinite(price) || price < 0) {
    return { ok: false, message: "Enter a valid product price." };
  }

  return {
    ok: true,
    payload: {
      id: String(formData.get("productId")).trim() || createId("product"),
      storeId: seller.id,
      sellerId: seller.id,
      storeName: seller.storeName,
      productName,
      productCategory,
      productPrice: price,
      productStock,
      productOffer: String(formData.get("productDeal")).trim(),
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    }
  };
}

function buildOfferPayload(formData) {
  const seller = currentSeller();
  if (!seller) {
    return { ok: false, message: "Please login before creating offers." };
  }

  const title = String(formData.get("offerTitle")).trim();
  const note = String(formData.get("offerNote")).trim();
  const expiry = String(formData.get("offerExpiry")).trim();

  if (!title || !note || !expiry) {
    return { ok: false, message: "Fill in all offer details." };
  }

  return {
    ok: true,
    payload: {
      id: String(formData.get("offerId")).trim() || createId("offer"),
      storeId: seller.id,
      sellerId: seller.id,
      storeName: seller.storeName,
      offerTitle: title,
      offerNote: note,
      offerExpiry: expiry,
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
}

function resetOfferForm() {
  const form = document.getElementById("offerForm");
  form.reset();
  document.getElementById("offerId").value = "";
  document.getElementById("saveOfferBtn").textContent = "Save Offer";
}

function bindPaymentPrompts() {
  const tillCheckbox = document.querySelector('input[name="paymentMethods"][value="M-Pesa Till"]');
  const tillField = document.getElementById("tillNumberField");
  const tillInput = document.getElementById("tillNumberInput");
  const pochiCheckbox = document.querySelector('input[name="paymentMethods"][value="M-Pesa Pochi"]');
  const pochiField = document.getElementById("pochiNumberField");
  const pochiInput = document.getElementById("pochiNumberInput");
  const cardCheckbox = document.querySelector('input[name="paymentMethods"][value="Card Payment"]');
  const cardField = document.getElementById("cardAccountField");
  const cardInput = document.getElementById("cardAccountInput");

  if (
    !tillCheckbox || !tillField || !tillInput ||
    !pochiCheckbox || !pochiField || !pochiInput ||
    !cardCheckbox || !cardField || !cardInput
  ) {
    return;
  }

  const sync = () => {
    const showTill = tillCheckbox.checked;
    const showPochi = pochiCheckbox.checked;
    const showCard = cardCheckbox.checked;

    tillField.classList.toggle("is-hidden", !showTill);
    tillInput.required = showTill;
    if (!showTill) {
      tillInput.value = "";
    }

    pochiField.classList.toggle("is-hidden", !showPochi);
    pochiInput.required = showPochi;
    if (!showPochi) {
      pochiInput.value = "";
    }

    cardField.classList.toggle("is-hidden", !showCard);
    cardInput.required = showCard;
    if (!showCard) {
      cardInput.value = "";
    }
  };

  if (tillCheckbox.dataset.bound !== "true") {
    tillCheckbox.addEventListener("change", sync);
    tillCheckbox.dataset.bound = "true";
  }
  if (pochiCheckbox.dataset.bound !== "true") {
    pochiCheckbox.addEventListener("change", sync);
    pochiCheckbox.dataset.bound = "true";
  }
  if (cardCheckbox.dataset.bound !== "true") {
    cardCheckbox.addEventListener("change", sync);
    cardCheckbox.dataset.bound = "true";
  }
  sync();
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

    const nextApplications = [...applications(), result.payload];
    writeStorage(STORAGE_KEYS.sellerApplications, nextApplications);
    event.currentTarget.reset();
    clearMapSelection();
    bindPaymentPrompts();
    toggleForms(false);

    const syncResult = await syncSellerApplicationToBackend(result.payload);
    if (syncResult.ok && syncResult.data && syncResult.data.ok) {
      document.getElementById("loginStatus").textContent =
        "Application submitted and synced. Wait for admin approval before login.";
      showToast("Application submitted successfully.", "success");
      return;
    }

    document.getElementById("loginStatus").textContent =
      "Application submitted locally. Wait for admin approval before login.";
    showToast("Application saved locally. Backend sync is pending.", "warn");
  });

  document.getElementById("sellerLoginForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email")).trim().toLowerCase();
    const password = String(formData.get("password"));
    const statusElement = document.getElementById("loginStatus");

    const seller = applications().find(
      (application) => String(application.email || "").toLowerCase() === email
    );

    if (!seller || !passwordMatches(seller.password, password)) {
      statusElement.textContent = "Invalid email or password.";
      return;
    }

    if (seller.status === "pending") {
      statusElement.textContent = "Your application is pending admin approval.";
      return;
    }

    if (seller.status === "rejected") {
      statusElement.textContent = "Your application was rejected. Contact support to re-apply.";
      return;
    }

    setCurrentSeller(seller);
    event.currentTarget.reset();
    statusElement.textContent = "";
    showDashboard();
    showToast("Login successful. You can now manage your store.", "success");
  });

  document.getElementById("productForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const result = buildProductPayload(formData);
    if (!result.ok) {
      showToast(result.message, "warn");
      return;
    }

    const nextProduct = result.payload;
    const existing = products().find((item) => item.id === nextProduct.id);
    const nextProducts = existing
      ? products().map((item) =>
          item.id === nextProduct.id
            ? { ...item, ...nextProduct, createdAt: item.createdAt || new Date().toISOString() }
            : item
        )
      : [...products(), nextProduct];

    writeStorage(STORAGE_KEYS.sellerProducts, nextProducts);
    renderCounts();
    renderProducts();
    resetProductForm();
    showToast(existing ? "Product updated." : "Product added.", "success");
  });

  document.getElementById("offerForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const result = buildOfferPayload(formData);
    if (!result.ok) {
      showToast(result.message, "warn");
      return;
    }

    const nextOffer = result.payload;
    const existing = offers().find((item) => item.id === nextOffer.id);
    const nextOffers = existing
      ? offers().map((item) =>
          item.id === nextOffer.id
            ? { ...item, ...nextOffer, createdAt: item.createdAt || new Date().toISOString() }
            : item
        )
      : [...offers(), nextOffer];

    writeStorage(STORAGE_KEYS.sellerOffers, nextOffers);
    renderCounts();
    renderOffers();
    resetOfferForm();
    showToast(existing ? "Offer updated." : "Offer created.", "success");
  });
}

function bindActions() {
  document.getElementById("showRegistration").addEventListener("click", () => {
    document.getElementById("loginStatus").textContent = "";
    toggleForms(true);
  });
  document.getElementById("showLogin").addEventListener("click", () => toggleForms(false));
  document.getElementById("resetProductBtn").addEventListener("click", resetProductForm);
  document.getElementById("resetOfferBtn").addEventListener("click", resetOfferForm);
  document.getElementById("logoutBtn").addEventListener("click", () => {
    hideDashboard();
    toggleForms(false);
    showToast("Logged out successfully.", "info");
  });
}

function boot() {
  migrateLegacySellers();
  migrateLegacyProducts();
  migrateLegacyOffers();
  initReveal();
  initAdminTrigger();
  initMap();
  bindBusinessImageInput();
  bindPaymentPrompts();
  bindForms();
  bindActions();

  const seller = currentSeller();
  if (seller) {
    showDashboard();
  } else {
    toggleForms(true);
  }
}

boot();
