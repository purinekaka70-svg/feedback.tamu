const STORAGE_KEYS = {
  sellers: "tamu_market_sellers",
  sellerApplications: "tamu_market_seller_applications",
  currentSeller: "tamu_market_current_seller",
  categories: "tamu_market_categories",
  sellerCategories: "tamu_market_seller_categories",
  sellerProducts: "tamu_market_seller_products",
  sellerOffers: "tamu_market_seller_offers",
  adminOrders: "tamu_market_admin_orders",
  adminSession: "tamu_market_admin_session"
};

const ADMIN_CREDENTIALS = {
  username: "TamuAdmin@2025",
  password: "ummeats"
};

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
    return { ok: false, status: 0, data: null };
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
  const sessionSeller = currentSeller();
  if (!sessionSeller) {
    return;
  }
  const latestSeller = allSellerRecords().find((record) =>
    record.id === sessionSeller.id || record.email === sessionSeller.email
  ) || sessionSeller;

  if (!isSellerActive(latestSeller)) {
    setCurrentSeller(null);
    toggleForms(false);
    document.getElementById("loginStatus").textContent = "Your seller account is not approved yet.";
    return;
  }

  const seller = syncApprovedSellerRecord(latestSeller);
  setCurrentSeller(seller);

  document.body.classList.add("seller-dashboard-active");
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
  renderSellerAnalytics();
  fillSellerSettingsForms();
  setSellerView("overview");
}

function hideDashboard() {
  document.body.classList.remove("seller-dashboard-active");
  document.getElementById("sellerDashboard").classList.add("is-hidden");
  document.getElementById("sellerAuthSection").classList.remove("is-hidden");
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

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password) {
      window.localStorage.setItem(STORAGE_KEYS.adminSession, "active");
      status.textContent = "Login successful. Redirecting...";
      window.setTimeout(() => {
        window.location.href = "./admin.html";
      }, 450);
      return;
    }

    status.textContent = "Invalid admin credentials.";
  });
}

function sellers() {
  return readStorage(STORAGE_KEYS.sellers, []);
}

function sellerApplications() {
  return readStorage(STORAGE_KEYS.sellerApplications, []);
}

function allSellerRecords() {
  const byEmail = new Map();
  [...sellers(), ...sellerApplications()].forEach((record) => {
    const key = String(record.email || record.id || "").trim().toLowerCase();
    if (!key) return;
    const current = byEmail.get(key) || {};
    const merged = { ...current, ...record };
    if (current.status === "approved" || record.status === "approved") {
      merged.status = "approved";
      merged.approvedAt = record.approvedAt || current.approvedAt;
      merged.activatedAt = record.activatedAt || current.activatedAt;
      merged.expiresAt = record.expiresAt || current.expiresAt;
    }
    if (!merged.password && current.password) {
      merged.password = current.password;
    }
    byEmail.set(key, merged);
  });
  return [...byEmail.values()];
}

function currentSeller() {
  return readStorage(STORAGE_KEYS.currentSeller, null);
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

function passwordMatches(seller, password) {
  if (!seller || !password) {
    return false;
  }

  if (seller.password === password) {
    return true;
  }

  try {
    return atob(seller.password) === password;
  } catch (error) {
    return false;
  }
}

function syncApprovedSellerRecord(seller) {
  const currentSellers = sellers();
  const existing = currentSellers.find((item) => item.id === seller.id || item.email === seller.email);
  const nextSeller = { ...existing, ...seller };

  if (existing) {
    writeStorage(STORAGE_KEYS.sellers, currentSellers.map((item) =>
      item.id === existing.id || item.email === existing.email ? nextSeller : item
    ));
  } else {
    writeStorage(STORAGE_KEYS.sellers, [...currentSellers, nextSeller]);
  }

  writeStorage(STORAGE_KEYS.sellerApplications, sellerApplications().map((item) =>
    item.id === seller.id || item.email === seller.email ? { ...item, ...nextSeller } : item
  ));

  return nextSeller;
}

function products() {
  return readStorage(STORAGE_KEYS.sellerProducts, []);
}

function offers() {
  return readStorage(STORAGE_KEYS.sellerOffers, []);
}

function sellerCategories() {
  return readStorage(STORAGE_KEYS.sellerCategories, []);
}

function categoriesForSeller(seller = currentSeller()) {
  const globalCategories = readStorage(STORAGE_KEYS.categories, []);
  const storeCategories = sellerCategories()
    .filter((category) => !seller || category.sellerId === seller.id)
    .map((category) => category.name);
  return [...new Set([...globalCategories, ...storeCategories])].filter(Boolean);
}

function orders() {
  return readStorage(STORAGE_KEYS.adminOrders, []);
}

function sellerOrders(seller) {
  return orders().filter((order) => {
    if (order.sellerId === seller.id) {
      return true;
    }

    if (Array.isArray(order.items)) {
      return order.items.some((item) => item.sellerId === seller.id || item.storeId === seller.id);
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
          ${product.productImage ? `<img src="${product.productImage}" alt="${product.productName}" loading="lazy">` : product.productCategory}
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
      document.querySelector('[name="productCategory"]').value = product.productCategory;
      document.querySelector('[name="productPrice"]').value = product.productPrice;
      document.querySelector('[name="productStock"]').value = product.productStock;
      document.querySelector('[name="productDeal"]').value = product.productOffer || "";
      document.querySelector('[name="productImageUrl"]').value = product.productImage || "";
      document.getElementById("saveProductBtn").textContent = "Update Product";
      showToast("Product loaded for editing.", "info");
    });
  });

  container.querySelectorAll("[data-delete-product]").forEach((button) => {
    button.addEventListener("click", () => {
      const remaining = products().filter((item) => item.id !== button.dataset.deleteProduct);
      writeStorage(STORAGE_KEYS.sellerProducts, remaining);
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
  const options = document.getElementById("sellerCategoryOptions");
  if (!seller || !container || !options) return;

  const list = sellerCategories().filter((category) => category.sellerId === seller.id);
  options.innerHTML = categoriesForSeller(seller)
    .map((category) => `<option value="${category}"></option>`)
    .join("");

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
    button.addEventListener("click", () => {
      writeStorage(
        STORAGE_KEYS.sellerCategories,
        sellerCategories().filter((category) => category.id !== button.dataset.deleteCategory)
      );
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
          ${offer.offerImage ? `<img src="${offer.offerImage}" alt="${offer.offerTitle}" loading="lazy">` : "Offer"}
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
    button.addEventListener("click", () => {
      const remaining = offers().filter((item) => item.id !== button.dataset.deleteOffer);
      writeStorage(STORAGE_KEYS.sellerOffers, remaining);
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

  const sellerOrderList = sellerOrders(seller).slice().reverse();
  if (!sellerOrderList.length) {
    container.innerHTML = '<div class="list-card">No orders yet for your store.</div>';
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
      return `
      <article class="list-card">
        <div class="section-head">
          <strong>${order.id}</strong>
          <span class="status-pill status-pill--${orderStatus}">
            ${labelize(orderStatus)}
          </span>
        </div>
        <p>${order.customer || "Customer"} | ${order.phone || ""}</p>
        <p class="tiny">M-Pesa: ${order.mpesaName || order.customer || "Name pending"} | ${order.mpesaNumber || order.phone || "Number pending"} | Ref: ${order.mpesaReference || businessPayment?.reference || "No reference submitted"}</p>
        <p class="tiny">${sellerItems.map((item) => `${item.productName} x${item.quantity}`).join(", ") || "Products pending"}</p>
        <p class="tiny">Business amount: ${currency(sellerTotal)} | Ref: ${businessPayment?.reference || "No reference submitted"} | ${labelize(paymentStatus)}</p>
        <p class="tiny">Delivery: ${currency(order.deliveryFee || 0)} to till ${order.deliveryPayment?.tillNumber || "7312380"} | Ref: ${order.deliveryPayment?.reference || "Pending"}</p>
        <p class="tiny">Delivery status: ${labelize(order.deliveryStatus || order.status || "pending")} | Employee: ${order.assignedEmployeeName || order.assignedEmployeeEmail || "Not assigned"}</p>
        <div class="button-row">
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
      writeStorage(STORAGE_KEYS.adminOrders, updated);
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
    button.addEventListener("click", () => {
      const updated = orders().filter((order) => order.id !== button.dataset.deleteOrder);
      writeStorage(STORAGE_KEYS.adminOrders, updated);
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
  writeStorage(STORAGE_KEYS.adminOrders, updated);
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
  const latitude = parseFloat(formData.get("latitude"));
  const longitude = parseFloat(formData.get("longitude"));
  const paymentMethods = formData.getAll("paymentMethods");
  const tillNumber = String(formData.get("tillNumber") || "").trim();
  const pochiNumber = String(formData.get("pochiNumber") || "").trim();
  const cardAccount = String(formData.get("cardAccount") || "").trim();

  if (!email || !password) {
    return { ok: false, message: "Email and password are required." };
  }

  if (password.length < 6) {
    return { ok: false, message: "Password must be at least 6 characters long." };
  }

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { ok: false, message: "Please select your business location on the map." };
  }

  if (paymentMethods.length === 0) {
    return { ok: false, message: "Select at least one payment method." };
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

  if (sellers().some((seller) => seller.email === email)) {
    return { ok: false, message: "A seller account with this email already exists." };
  }

  return {
    ok: true,
    payload: {
      id: createId("seller"),
      storeName: String(formData.get("storeName")).trim(),
      ownerName: String(formData.get("ownerName")).trim(),
      phone: String(formData.get("phone")).trim(),
      email,
      password: btoa(password),
      latitude,
      longitude,
      paymentMethods,
      paymentOptions: paymentMethods,
      tillNumber,
      pochiNumber,
      cardAccount,
      bankAccount: cardAccount,
      businessType: String(formData.get("businessType")).trim(),
      county: String(formData.get("county")).trim(),
      location: String(formData.get("county")).trim(),
      status: "pending",
      createdAt: new Date().toISOString()
    }
  };
}

async function fileToDataUrl(file) {
  return new Promise((resolve) => {
    if (!file || !file.size) {
      resolve("");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
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
  const uploadedImage = await fileToDataUrl(formData.get("productImageFile"));
  const productImage = uploadedImage || String(formData.get("productImageUrl")).trim() || existingProduct?.productImage || "";

  return {
    ok: true,
    payload: {
      id: productId || createId("product"),
      sellerId: seller.id,
      storeId: seller.id,
      storeName: seller.storeName,
      productName: String(formData.get("productName")).trim(),
      productCategory: String(formData.get("productCategory")).trim(),
      productPrice: price,
      productStock: String(formData.get("productStock")).trim(),
      productOffer: String(formData.get("productDeal")).trim(),
      productImage,
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
  const uploadedImage = await fileToDataUrl(formData.get("offerImageFile"));
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

  const isOpen = nav.classList.toggle("is-open");
  overlay.classList.toggle("is-open", isOpen);
  toggle.setAttribute("aria-expanded", String(isOpen));
  document.body.classList.toggle("seller-menu-open", isOpen);
}

function bindForms() {
  document.getElementById("sellerRegistrationForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const result = buildSellerPayload(formData);
    if (!result.ok) {
      showToast(result.message, "warn");
      return;
    }

    const seller = result.payload;
    writeStorage(STORAGE_KEYS.sellers, [...sellers(), seller]);
    writeStorage(STORAGE_KEYS.sellerApplications, [...sellerApplications(), seller]);
    event.currentTarget.reset();
    syncPaymentFields();
    toggleForms(false);
    document.getElementById("loginStatus").textContent = "Registration sent. Please wait for admin approval before logging in.";
    showToast("Registration sent. Please wait for admin approval before logging in.", "success");
  });

  document.getElementById("sellerLoginForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email")).trim().toLowerCase();
    const password = String(formData.get("password"));

    const emailRecords = allSellerRecords().filter((item) => String(item.email || "").toLowerCase() === email);
    const seller = emailRecords.find((item) => passwordMatches(item, password));
    if (!seller) {
      document.getElementById("loginStatus").textContent = emailRecords.length
        ? "Invalid password for this seller account."
        : "Seller account not found. Register first and wait for admin approval.";
      return;
    }

    if (!isSellerActive(seller)) {
      document.getElementById("loginStatus").textContent = "Your seller account is waiting for admin approval.";
      showToast("Your seller account is pending approval.", "warn");
      return;
    }

    const loginSeller = syncApprovedSellerRecord(seller);
    setCurrentSeller(loginSeller);
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
    const nextProducts = existing
      ? products().map((item) => (item.id === nextProduct.id ? { ...item, ...nextProduct, createdAt: item.createdAt || new Date().toISOString() } : item))
      : [...products(), nextProduct];

    writeStorage(STORAGE_KEYS.sellerProducts, nextProducts);
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
    const nextOffers = existing
      ? offers().map((item) => (item.id === nextOffer.id ? { ...item, ...nextOffer, createdAt: item.createdAt || new Date().toISOString() } : item))
      : [...offers(), nextOffer];

    writeStorage(STORAGE_KEYS.sellerOffers, nextOffers);
    renderCounts();
    renderOffers();
    renderSellerAnalytics();
    resetOfferForm();
    showToast(existing ? "Offer updated." : "Offer created.", "success");
  });

  document.getElementById("sellerCategoryForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const seller = currentSeller();
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("categoryName")).trim();
    if (!seller || !name) return;

    const exists = categoriesForSeller(seller).some((category) => category.toLowerCase() === name.toLowerCase());
    if (exists) {
      showToast("Category already exists.", "warn");
      return;
    }

    writeStorage(STORAGE_KEYS.sellerCategories, [
      ...sellerCategories(),
      { id: createId("category"), sellerId: seller.id, storeName: seller.storeName, name, createdAt: new Date().toISOString() }
    ]);
    writeStorage(STORAGE_KEYS.categories, [...new Set([...readStorage(STORAGE_KEYS.categories, []), name])]);
    event.currentTarget.reset();
    renderSellerCategories();
    showToast("Category added.", "success");
  });

  document.getElementById("sellerLocationForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    updateCurrentSellerRecord({
      location: String(formData.get("location")).trim(),
      county: String(formData.get("location")).trim(),
      latitude: Number(formData.get("latitude")),
      longitude: Number(formData.get("longitude")),
      updatedAt: new Date().toISOString()
    });
    showToast("Business location updated.", "success");
  });

  document.getElementById("sellerPaymentForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const paymentMethods = [];
    if (String(formData.get("tillNumber")).trim()) paymentMethods.push("M-Pesa Till");
    if (String(formData.get("pochiNumber")).trim()) paymentMethods.push("M-Pesa Pochi");
    if (String(formData.get("bankAccount")).trim()) paymentMethods.push("Bank Account");

    updateCurrentSellerRecord({
      tillNumber: String(formData.get("tillNumber")).trim(),
      pochiNumber: String(formData.get("pochiNumber")).trim(),
      bankAccount: String(formData.get("bankAccount")).trim(),
      cardAccount: String(formData.get("bankAccount")).trim(),
      paymentMethods,
      paymentOptions: paymentMethods,
      updatedAt: new Date().toISOString()
    });
    showToast("Payment details updated.", "success");
  });

  document.getElementById("sellerDeliveryForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    updateCurrentSellerRecord({
      deliveryAvailability: String(formData.get("deliveryAvailability")).trim(),
      deliveryNotes: String(formData.get("deliveryNotes")).trim(),
      updatedAt: new Date().toISOString()
    });
    showToast("Delivery settings updated.", "success");
  });
}

function updateCurrentSellerRecord(patch) {
  const seller = currentSeller();
  if (!seller) return;
  const updatedSeller = { ...seller, ...patch };
  setCurrentSeller(updatedSeller);
  writeStorage(STORAGE_KEYS.sellers, sellers().map((item) => item.id === seller.id ? { ...item, ...patch } : item));
  writeStorage(STORAGE_KEYS.sellerApplications, sellerApplications().map((item) => item.id === seller.id ? { ...item, ...patch } : item));
  fillSellerSettingsForms();
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

function bindActions() {
  document.getElementById("showRegistration").addEventListener("click", () => toggleForms(true));
  document.getElementById("showLogin").addEventListener("click", () => toggleForms(false));
  document.getElementById("resetProductBtn").addEventListener("click", resetProductForm);
  document.getElementById("resetOfferBtn").addEventListener("click", resetOfferForm);
  document.getElementById("logoutBtn").addEventListener("click", () => {
    hideDashboard();
    toggleForms(true);
    showToast("Logged out successfully.", "info");
  });
  document.getElementById("sellerPanelLogoutBtn").addEventListener("click", () => {
    hideDashboard();
    toggleForms(true);
    showToast("Logged out successfully.", "info");
  });

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

function refreshSellerOrderViews() {
  if (!currentSeller()) {
    return;
  }
  renderCounts();
  renderOrders();
  renderSellerNotifications();
  renderSellerPaymentOrders();
  renderSellerCustomers();
  renderSellerAnalytics();
}

function bindLiveOrderUpdates() {
  if (window.__tamuSellerLiveOrdersBound) {
    return;
  }
  window.__tamuSellerLiveOrdersBound = true;
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEYS.adminOrders) {
      refreshSellerOrderViews();
    }
  });
}

function boot() {
  initReveal();
  initAdminTrigger();
  initMap();
  bindForms();
  bindActions();
  bindLiveOrderUpdates();

  const seller = currentSeller();
  if (seller) {
    showDashboard();
  } else {
    toggleForms(true);
  }
}

boot();
