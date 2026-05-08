let cachedApplications = [];
let cachedOrders = [];
let cachedCategories = [];
let cachedProducts = [];
let cachedOffers = [];
let cachedLocations = [];
let cachedPayments = [];
let cachedUsers = [];
const STORAGE_KEYS = {
  adminSession: "tamu_market_admin_session"
};

const orderStages = ["pending_payment", "paid", "processing", "delivered", "cancelled"];
const adminViewMeta = {
  overview: {
    title: "Dashboard overview.",
    subtitle: "Track businesses, orders, and notifications from one admin workspace."
  },
  businesses: {
    title: "Registered businesses.",
    subtitle: "Approve sellers, block risky accounts, activate good businesses, or expire inactive ones."
  },
  orders: {
    title: "Orders placed by users.",
    subtitle: "See every buyer order, confirm payment references, and move orders through delivery."
  },
  notifications: {
    title: "Notifications center.",
    subtitle: "See new order activity and seller account changes in one feed."
  },
  categories: {
    title: "Category management.",
    subtitle: "Keep product browsing organized for buyers."
  },
  users: {
    title: "Users and accounts.",
    subtitle: "Review customer activity and seller account status."
  },
  delivery: {
    title: "Delivery fees.",
    subtitle: "Track delivery fee references paid separately to till 7312380."
  },
  payments: {
    title: "Payment references.",
    subtitle: "Audit business payments, delivery payments, and manual confirmations."
  },
  analytics: {
    title: "Analytics.",
    subtitle: "Monitor orders, revenue, sellers, and product activity."
  },
  reports: {
    title: "Reports.",
    subtitle: "A clean operational summary for the marketplace."
  }
};
let activeAdminView = "overview";
const adminOrderFilters = {
  search: "",
  status: "all",
  payment: "all",
  date: "all"
};

const ADMIN_CONTROL_ENDPOINT = "./api/admin/control.php";

function readStorage(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    return fallback;
  }
}

async function ensureAdminSession() {
  if (window.localStorage.getItem(STORAGE_KEYS.adminSession) !== "active") {
    return false;
  }

  try {
    const response = await fetch("./api/auth/session.php", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok || !result.ok || result.session?.role !== "admin") {
      window.localStorage.removeItem(STORAGE_KEYS.adminSession);
      return false;
    }
    return true;
  } catch (error) {
    window.localStorage.removeItem(STORAGE_KEYS.adminSession);
    return false;
  }
}

function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    return;
  }
}

function seedStorage() {}

function currency(value) {
  return `KSh ${Number(value).toLocaleString()}`;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item";
}

function normalizeBusinessRecord(record = {}) {
  const name = String(record.name || record.storeName || record.store_name || record.businessName || record.email || "Business").trim();
  const location = String(record.location || record.county || record.locationName || record.location_name || record.locationId || "Location pending").trim();
  const type = String(record.type || record.businessType || record.business_type || "retail").trim().toLowerCase();
  const logo = record.logo || record.logoImage || record.logo_image || record.businessImage || record.image || "";

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

function capitalize(value) {
  const text = String(value || "n/a");
  return text
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeOrderStatus(status) {
  const value = String(status || "pending").toLowerCase();
  if (value === "completed") return "delivered";
  if (value === "dispatch" || value === "sourcing") return "processing";
  if (value === "pending") return "pending_payment";
  return orderStages.includes(value) ? value : "pending_payment";
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

function showAdminLogin() {
  document.getElementById("adminLoginView")?.classList.remove("is-hidden");
  document.getElementById("adminDashboardView")?.classList.add("is-hidden");
}

function showAdminDashboard() {
  document.getElementById("adminLoginView")?.classList.add("is-hidden");
  document.getElementById("adminDashboardView")?.classList.remove("is-hidden");
}

function bindAdminLogin() {
  const form = document.getElementById("adminAccessForm");
  const status = document.getElementById("adminAccessStatus");
  if (!form || !status) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const username = String(formData.get("username") || "").trim();
    const password = String(formData.get("password") || "").trim();

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
      status.textContent = "";
      form.reset();
      startDashboard();
    } catch (error) {
      status.textContent = "Admin login service is unavailable.";
    }
  });
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

function applications() {
  const merged = [...cachedApplications];
  return merged
    .filter((application, index, list) =>
      list.findIndex((item) => (item.id && item.id === application.id) || (item.email && item.email === application.email)) === index
    )
    .map(normalizeBusinessRecord);
}

function isBusinessActive(application) {
  const status = application.status || "pending";
  if (status !== "approved") {
    return false;
  }

  if (!application.expiresAt) {
    return true;
  }

  return new Date(application.expiresAt).getTime() > Date.now();
}

function businessStatus(application) {
  if ((application.status || "pending") === "approved" && application.expiresAt) {
    const expiry = new Date(application.expiresAt).getTime();
    if (Number.isFinite(expiry) && expiry <= Date.now()) {
      return "expired";
    }
  }

  return application.status || "pending";
}

function formatDate(value) {
  if (!value) {
    return "Not set";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Not set";
  }

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

async function loadData() {
  try {
    const [applicationRes, marketRes, orderRes, paymentRes, userRes] = await Promise.all([
      fetch('./api/admin/applications.php', { cache: 'no-store' }),
      fetch('./api/marketplace/list.php', { cache: 'no-store' }),
      fetch('./api/orders/list.php', { cache: 'no-store' }),
      fetch('./api/payments/index.php', { cache: 'no-store' }),
      fetch('./api/users/index.php', { cache: 'no-store' })
    ]);
    const applicationData = await applicationRes.json();
    const marketData = await marketRes.json();
    const orderData = await orderRes.json();
    const paymentData = await paymentRes.json();
    const userData = await userRes.json();
    cachedApplications = applicationRes.ok && applicationData.ok ? (applicationData.applications || []) : [];
    cachedCategories = marketRes.ok && marketData.ok ? (marketData.categories || []) : [];
    cachedProducts = marketRes.ok && marketData.ok ? (marketData.products || []) : [];
    cachedOffers = marketRes.ok && marketData.ok ? (marketData.offers || []) : [];
    cachedLocations = marketRes.ok && marketData.ok ? (marketData.locations || []) : [];
    cachedOrders = orderRes.ok && orderData.ok ? (orderData.orders || []) : [];
    cachedPayments = paymentRes.ok && paymentData.ok ? (paymentData.payments || []) : [];
    cachedUsers = userRes.ok && userData.ok ? (userData.users || []) : [];
  } catch (error) {
    cachedApplications = [];
    cachedCategories = [];
    cachedProducts = [];
    cachedOffers = [];
    cachedLocations = [];
    cachedOrders = [];
    cachedPayments = [];
    cachedUsers = [];
  }
}

function categories() {
  return cachedCategories.map((category) => category.name || category).filter(Boolean);
}

function findLegacyProduct(productId) {
  return cachedProducts.find((product) => String(product.id) === String(productId));
}

function normalizeOrderItem(item = {}) {
  const businessId = item.businessId || item.storeId || item.sellerId || "";
  const name = item.name || item.productName || item.title || "Product";
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
    categoryName: item.categoryName || item.productCategory || "",
    quantity,
    price,
    unitPrice: Number(item.unitPrice ?? price) || 0,
    total,
    lineTotal: Number(item.lineTotal ?? total) || 0
  };
}

function normalizeOrder(order) {
  const product = order.productId ? findLegacyProduct(order.productId) : null;
  const items = asArray(order.items).length
    ? order.items.map(normalizeOrderItem)
    : product
      ? [normalizeOrderItem({
          productId: product.id,
          businessId: product.sellerId || product.storeId || "",
          productName: product.name || product.productName || "Product",
          storeId: product.sellerId || product.storeId || "",
          storeName: product.sellerName || product.storeName || "Seller",
          quantity: Number(order.quantity || 1),
          price: Number(product.price || product.productPrice || order.total || 0),
          unitPrice: Number(product.price || product.productPrice || order.total || 0),
          total: Number(order.total || product.price || product.productPrice || 0) * Number(order.quantity || 1),
          lineTotal: Number(order.total || product.price || product.productPrice || 0) * Number(order.quantity || 1)
        })]
      : [];

  const subtotal = Number(order.subtotal || items.reduce((sum, item) => sum + Number(item.lineTotal || item.total || 0), 0));
  const deliveryFee = Number(order.deliveryFee || 0);
  const total = Number(order.total || subtotal + deliveryFee);
  const paymentRef = order.paymentRef || order.mpesaReference || order.deliveryPayment?.reference || "";

  return {
    ...order,
    id: order.id || order.publicId || `order-${order.createdAt || Date.now()}`,
    userId: order.userId || order.customerId || order.phone || "guest",
    customer: order.customer || order.customerName || order.buyerName || "Customer",
    phone: order.phone || order.customerPhone || "",
    buyerLocation: order.buyerLocation || order.location || "Buyer location pending",
    paymentMethod: order.paymentMethod || "Payment pending",
    paymentRef,
    mpesaReference: order.mpesaReference || paymentRef,
    paymentStatus: order.paymentStatus || "pending_payment",
    businessPayments: asArray(order.businessPayments),
    deliveryPayment: order.deliveryPayment || {
      tillNumber: "7312380",
      amount: Number(order.deliveryFee || 0),
      reference: "",
      status: "pending_payment"
    },
    storeName: order.storeName || order.storeNames?.join(", ") || product?.sellerName || product?.storeName || "Store pending",
    stores: asArray(order.stores).length ? order.stores : asArray(order.storeNames),
    subtotal,
    deliveryFee,
    total,
    status: normalizeOrderStatus(order.status),
    items,
    createdAt: order.createdAt || order.updatedAt || ""
  };
}

function orders() {
  return cachedOrders.map(normalizeOrder).filter((order, index, list) =>
    list.findIndex((item) => item.id === order.id) === index
  );
}

function saveOrders(nextOrders) {
  cachedOrders = nextOrders.map(normalizeOrder);
}

async function updateOrderBackend(orderId, patch) {
  try {
    await fetch('./api/orders/update.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: orderId, ...patch })
    });
  } catch (error) {
    return;
  }
}

async function deleteOrderBackend(orderId) {
  return adminDeleteRecord("order", orderId, "order", { silent: true });
}

async function adminDeleteRecord(entity, id, label = "record", options = {}) {
  if (!id) {
    showToast(`Missing ${label} id.`, "warn");
    return false;
  }
  if (!options.skipConfirm && !window.confirm(`Delete this ${label}? This cannot be undone.`)) {
    return false;
  }

  try {
    const response = await fetch(ADMIN_CONTROL_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity, id })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok === false) {
      showToast(result.message || `Could not delete ${label}.`, "warn");
      return false;
    }
    if (!options.silent) {
      showToast(`${capitalize(label)} deleted.`, "warn");
    }
    await loadData();
    renderOverview();
    renderApprovals();
    renderCategories();
    renderOrderList();
    renderOrders();
    renderNotifications();
    renderAdminUtilityPanels();
    return true;
  } catch (error) {
    showToast(`Could not delete ${label}.`, "warn");
    return false;
  }
}

function renderOverview() {
  const allApplications = applications();
  const allOrders = orders();
  const pendingApprovals = allApplications.filter((item) => item.status === "pending").length;
  const activeOrders = allOrders.filter((item) => !["delivered", "cancelled"].includes(item.status)).length;
  const dispatchOrders = allOrders.filter((item) => item.status === "processing").length;
  const activeBusinesses = allApplications.filter(isBusinessActive).length;
  const blockedBusinesses = allApplications.filter((item) => item.status === "blocked").length;

  document.getElementById("adminOverviewStats").innerHTML = `
    <article class="card stat-card">
      <span class="stat-label">Pending approvals</span>
      <strong>${pendingApprovals}</strong>
    </article>
    <article class="card stat-card">
      <span class="stat-label">Active orders</span>
      <strong>${activeOrders}</strong>
    </article>
    <article class="card stat-card">
      <span class="stat-label">Processing orders</span>
      <strong>${dispatchOrders}</strong>
    </article>
    <article class="card stat-card">
      <span class="stat-label">Active businesses</span>
      <strong>${activeBusinesses}</strong>
    </article>
    <article class="card stat-card">
      <span class="stat-label">Blocked businesses</span>
      <strong>${blockedBusinesses}</strong>
    </article>
  `;

  renderRecentBusinesses();
  renderRecentOrders();
}

async function updateApplicationStatus(applicationId, status) {
  const patch = { status };
  if (status === "approved") {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);
    patch.approvedAt = new Date().toISOString();
    patch.activatedAt = new Date().toISOString();
    patch.expiresAt = expiresAt.toISOString();
    patch.blockedAt = "";
  }
  if (status === "blocked") {
    patch.blockedAt = new Date().toISOString();
  }
  try {
    const response = await fetch('./api/admin/applications.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: applicationId, status })
    });
    const result = await response.json();
    if (response.ok && result.ok) {
      await loadData();
    } else {
      showToast(result.message || `Could not update business to ${status}.`, "warn");
      return;
    }
  } catch (error) {
    showToast("Could not reach approval service.", "warn");
    return;
  }

  renderOverview();
  renderApprovals();
  renderNotifications();
  renderAdminUtilityPanels();
  showToast(`Business ${status}.`, status === "approved" ? "success" : "warn");
}

function renderApprovals() {
  const container = document.getElementById("approvalList");
  if (!container) return;
  const list = applications().slice().reverse();

  if (!list.length) {
    container.innerHTML = '<div class="list-card">No seller applications yet. New ones from the seller portal will appear here.</div>';
    return;
  }

  container.innerHTML = list
    .map((application) => {
      const paymentOptions = Array.isArray(application.paymentOptions)
        ? application.paymentOptions
        : Array.isArray(application.paymentMethods)
          ? application.paymentMethods
          : [];
      const tillText = application.tillNumber ? ` | Till: ${application.tillNumber}` : "";
      const pochiText = application.pochiNumber ? ` | Pochi: ${application.pochiNumber}` : "";
      const bankAccount = application.bankAccount || application.cardAccount || "";
      const cardText = bankAccount ? ` | Bank: ${bankAccount}` : "";
      const status = businessStatus(application);
      return `
        <article class="list-card business-card">
          <div class="section-head">
            <div>
              <strong>${application.storeName || application.name || "Registered business"}</strong>
              <p class="tiny">${capitalize(application.businessType || "seller")} | ${application.location || "Location pending"}</p>
            </div>
            <span class="status-pill status-pill--${status}">${capitalize(status)}</span>
          </div>
          <p>Owner: ${application.ownerName || "-"} | Phone: ${application.phone || "-"}</p>
          <p class="tiny">Payments: ${paymentOptions.join(", ") || "M-Pesa, Cash on Delivery"}${tillText}${pochiText}${cardText}</p>
          <p class="tiny">Pickup: ${application.latitude || "-"}, ${application.longitude || "-"}</p>
          <p class="tiny">Active until: ${formatDate(application.expiresAt)}</p>
          <div class="button-row">
            <button class="button button-primary button-small" data-application-action="approved" data-application-id="${application.id}" type="button">Approve / Activate</button>
            <button class="button button-outline button-small" data-application-action="blocked" data-application-id="${application.id}" type="button">Block</button>
            <button class="button button-ghost button-small" data-application-action="rejected" data-application-id="${application.id}" type="button">Reject</button>
            <button class="button button-ghost button-small" data-admin-delete="business" data-admin-delete-id="${application.id}" data-admin-delete-label="business" type="button">Delete</button>
            <button class="button button-ghost button-small" data-admin-delete="seller" data-admin-delete-id="${application.id}" data-admin-delete-label="seller account" type="button">Delete seller account</button>
          </div>
        </article>
      `;
    })
    .join("");

  container.querySelectorAll("[data-application-action]").forEach((button) => {
    button.addEventListener("click", () => {
      updateApplicationStatus(button.dataset.applicationId, button.dataset.applicationAction);
    });
  });
  bindAdminDeleteButtons(container);

  const locationContainer = document.getElementById("adminLocationList");
  if (locationContainer) {
    locationContainer.innerHTML = cachedLocations.length
      ? `<h3 class="section-title">Locations</h3>` + cachedLocations.map((location) => `
          <article class="mini-list-card">
            <div>
              <strong>${location.name || "Location"}</strong>
              <p class="tiny">${location.businessCount || 0} businesses</p>
            </div>
            <button class="button button-ghost button-small" data-admin-delete="location" data-admin-delete-id="${location.id || location.name}" data-admin-delete-label="location" type="button">Delete</button>
          </article>
        `).join("")
      : '<div class="list-card">Locations appear when approved businesses are listed.</div>';
    bindAdminDeleteButtons(locationContainer);
  }
}

function renderRecentBusinesses() {
  const container = document.getElementById("recentBusinessList");
  if (!container) return;
  const list = applications().slice().reverse().slice(0, 4);

  if (!list.length) {
    container.innerHTML = '<div class="list-card">No registered businesses yet.</div>';
    return;
  }

  container.innerHTML = list.map((business) => `
    <article class="mini-list-card">
      <div>
        <strong>${business.storeName || business.name || "Registered business"}</strong>
        <p class="tiny">${business.ownerName || business.email || "Owner pending"}</p>
      </div>
      <span class="status-pill status-pill--${businessStatus(business)}">${capitalize(businessStatus(business))}</span>
    </article>
  `).join("");
}

function renderRecentOrders() {
  const container = document.getElementById("recentOrderList");
  if (!container) return;
  const list = orders().slice().reverse().slice(0, 4);

  if (!list.length) {
    container.innerHTML = '<div class="list-card">No orders placed yet.</div>';
    return;
  }

  container.innerHTML = list.map((order) => `
    <article class="mini-list-card">
      <div>
        <strong>${order.id}</strong>
        <p class="tiny">${order.customer || "Customer"} | ${currency(order.total || 0)}</p>
      </div>
      <span class="status-pill status-pill--${order.status || "pending"}">${capitalize(order.status || "pending")}</span>
    </article>
  `).join("");
}

function renderCategories() {
  const categoryList = document.getElementById("categoryList");
  if (!categoryList) return;
  categoryList.innerHTML = cachedCategories
    .map((category) => `
      <span class="category-chip">
        ${category.name || category}
        <button class="button button-ghost button-small" data-admin-delete="category" data-admin-delete-id="${category.id || category.name || category}" data-admin-delete-label="category" type="button">Delete</button>
      </span>
    `)
    .join("");
  bindAdminDeleteButtons(categoryList);
}

function moveOrder(orderId) {
  const nextOrders = orders().map((order) => {
    if (order.id !== orderId) {
      return order;
    }

    const currentIndex = orderStages.indexOf(normalizeOrderStatus(order.status));
    const nextStatus = orderStages[Math.min(currentIndex + 1, orderStages.length - 1)];
    return { ...order, status: nextStatus, updatedAt: new Date().toISOString() };
  });

  saveOrders(nextOrders);
  renderOverview();
  renderOrderList();
  renderOrders();
  renderNotifications();
  renderAdminUtilityPanels();
  showToast("Order moved to the next stage.");
  const nextOrder = nextOrders.find((order) => order.id === orderId);
  updateOrderBackend(orderId, { status: normalizeOrderStatus(nextOrder?.status) });
}

function markOrderProcessing(orderId) {
  const nextOrders = orders().map((order) => order.id === orderId
    ? {
        ...order,
        status: "processing",
        deliveryStatus: order.deliveryStatus === "delivered" ? "delivered" : "processing",
        updatedAt: new Date().toISOString()
      }
    : order);

  saveOrders(nextOrders);
  renderOverview();
  renderOrderList();
  renderOrders();
  renderNotifications();
  renderAdminUtilityPanels();
  showToast("Order marked as processing.");
  updateOrderBackend(orderId, { status: "processing" });
}

function markOrderPaid(orderId) {
  const nextOrders = orders().map((order) => {
    if (order.id !== orderId) {
      return order;
    }
    const businessPayments = asArray(order.businessPayments).map((payment) => ({
      ...payment,
      status: "paid",
      confirmedAt: payment.confirmedAt || new Date().toISOString()
    }));
    const sellerPaymentStatus = businessPayments.reduce((statusMap, payment) => {
      statusMap[payment.storeId] = "paid";
      return statusMap;
    }, { ...(order.sellerPaymentStatus || {}) });
    return {
      ...order,
      businessPayments,
      sellerPaymentStatus,
      deliveryPayment: {
        ...(order.deliveryPayment || {}),
        tillNumber: order.deliveryPayment?.tillNumber || "7312380",
        amount: order.deliveryPayment?.amount || order.deliveryFee || 0,
        status: "paid",
        confirmedAt: new Date().toISOString()
      },
      paymentStatus: "paid",
      status: ["pending", "pending_payment"].includes(normalizeOrderStatus(order.status)) ? "paid" : normalizeOrderStatus(order.status),
      updatedAt: new Date().toISOString()
    };
  });

  saveOrders(nextOrders);
  renderOverview();
  renderOrderList();
  renderOrders();
  renderNotifications();
  renderAdminUtilityPanels();
  showToast("Order payment marked as paid.");
  updateOrderBackend(orderId, { status: "paid", paymentStatus: "paid" });
}

function markOrderDelivered(orderId) {
  const nextOrders = orders().map((order) => order.id === orderId
    ? {
        ...order,
        status: "delivered",
        deliveryStatus: "delivered",
        deliveredAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    : order);

  saveOrders(nextOrders);
  renderOverview();
  renderOrderList();
  renderOrders();
  renderNotifications();
  renderAdminUtilityPanels();
  showToast("Order marked as delivered.");
  updateOrderBackend(orderId, { status: "delivered" });
}

function cancelOrder(orderId) {
  const nextOrders = orders().map((order) => order.id === orderId
    ? {
        ...order,
        status: "cancelled",
        updatedAt: new Date().toISOString()
      }
    : order);

  saveOrders(nextOrders);
  renderOverview();
  renderOrderList();
  renderOrders();
  renderNotifications();
  renderAdminUtilityPanels();
  showToast("Order cancelled.", "warn");
  updateOrderBackend(orderId, { status: "cancelled" });
}

async function deleteOrder(orderId) {
  if (!window.confirm("Delete this order completely? Payments and delivery records for it will also be removed.")) {
    return;
  }
  const deleted = await deleteOrderBackend(orderId);
  if (!deleted) {
    return;
  }
  saveOrders(orders().filter((order) => order.id !== orderId));
  renderOverview();
  renderOrderList();
  renderOrders();
  renderNotifications();
  renderAdminUtilityPanels();
  showToast("Order deleted.", "warn");
}

function bindOrderActionButtons(container) {
  container.querySelectorAll("[data-view-order]").forEach((button) => {
    button.addEventListener("click", () => {
      container.querySelector(`[data-order-detail="${button.dataset.viewOrder}"]`)?.classList.toggle("is-hidden");
    });
  });

  container.querySelectorAll("[data-move-order]").forEach((button) => {
    button.addEventListener("click", () => {
      moveOrder(button.dataset.moveOrder);
    });
  });

  container.querySelectorAll("[data-process-order]").forEach((button) => {
    button.addEventListener("click", () => {
      markOrderProcessing(button.dataset.processOrder);
    });
  });

  container.querySelectorAll("[data-paid-order]").forEach((button) => {
    button.addEventListener("click", () => {
      markOrderPaid(button.dataset.paidOrder);
    });
  });

  container.querySelectorAll("[data-deliver-order]").forEach((button) => {
    button.addEventListener("click", () => {
      markOrderDelivered(button.dataset.deliverOrder);
    });
  });

  container.querySelectorAll("[data-delete-order]").forEach((button) => {
    button.addEventListener("click", () => {
      deleteOrder(button.dataset.deleteOrder);
    });
  });

  container.querySelectorAll("[data-cancel-order]").forEach((button) => {
    button.addEventListener("click", () => {
      cancelOrder(button.dataset.cancelOrder);
    });
  });
}

function bindAdminDeleteButtons(scope = document) {
  scope.querySelectorAll("[data-admin-delete]").forEach((button) => {
    if (button.dataset.deleteBound === "true") return;
    button.dataset.deleteBound = "true";
    button.addEventListener("click", () => {
      adminDeleteRecord(
        button.dataset.adminDelete,
        button.dataset.adminDeleteId,
        button.dataset.adminDeleteLabel || button.dataset.adminDelete
      );
    });
  });
}

function renderOrders() {
  renderOrderList();
}

function orderDistanceText(order) {
  const breakdown = asArray(order.routeBreakdown);
  if (!breakdown.length) {
    return "Distance pending";
  }
  return breakdown
    .map((entry) => `${entry.storeName || "Store"}: ${Number(entry.distanceKm || 0).toFixed(1)} km`)
    .join(" | ");
}

function orderSearchText(order) {
  return [
    order.id,
    order.customer,
    order.phone,
    order.buyerLocation,
    order.paymentMethod,
    order.mpesaReference,
    order.deliveryPayment?.reference,
    order.storeName,
    asArray(order.items).map((item) => item.productName).join(" "),
    asArray(order.businessPayments).map((payment) => `${payment.storeName} ${payment.reference}`).join(" ")
  ].join(" ").toLowerCase();
}

function orderInDateRange(order, range) {
  if (range === "all") return true;
  const created = new Date(order.createdAt || order.updatedAt || 0).getTime();
  if (!Number.isFinite(created) || created <= 0) return false;
  const now = new Date();
  if (range === "today") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return created >= start;
  }
  const days = Number(range);
  return Number.isFinite(days) ? created >= Date.now() - days * 24 * 60 * 60 * 1000 : true;
}

function filteredAdminOrders() {
  const query = adminOrderFilters.search.trim().toLowerCase();
  return orders().filter((order) => {
    const status = normalizeOrderStatus(order.status);
    const payment = String(order.paymentStatus || "pending_payment");
    const matchesSearch = !query || orderSearchText(order).includes(query);
    const matchesStatus = adminOrderFilters.status === "all" || status === adminOrderFilters.status;
    const matchesPayment = adminOrderFilters.payment === "all" || payment === adminOrderFilters.payment;
    const matchesDate = orderInDateRange(order, adminOrderFilters.date);
    return matchesSearch && matchesStatus && matchesPayment && matchesDate;
  });
}

function renderOrderList() {
  const container = document.getElementById("orderList");
  if (!container) return;
  const allOrders = orders();
  const list = filteredAdminOrders().slice().reverse();
  const summary = document.getElementById("orderCountSummary");
  if (summary) {
    summary.textContent = `${list.length}/${allOrders.length} order${allOrders.length === 1 ? "" : "s"}`;
  }

  if (!list.length) {
    container.innerHTML = '<div class="list-card">No orders match the current filters. Orders from checkout will appear here immediately.</div>';
    return;
  }

  container.innerHTML = list.map((order) => {
    const orderStatus = normalizeOrderStatus(order.status);
    const paymentReference = order.mpesaReference || order.businessPayments?.[0]?.reference || "pending";
    return `
    <article class="list-card order-menu-card">
      <div class="section-head">
        <div>
          <strong>${order.id}</strong>
          <p class="tiny">${order.customer || "Customer"} | ${order.phone || "Phone pending"}</p>
        </div>
        <span class="status-pill status-pill--${orderStatus}">${capitalize(orderStatus)}</span>
      </div>
      <p>${order.storeName || order.storeNames?.join(", ") || "Store pending"}</p>
      <p class="tiny">Payment: ${order.paymentMethod || "Business direct payment"} | M-Pesa: ${order.mpesaName || order.customer || "Name pending"} | ${order.mpesaNumber || order.phone || "Number pending"} | Ref ${paymentReference}</p>
      ${asArray(order.items).length
        ? `<p class="tiny">Items: ${order.items.map((item) => `${item.productName || "Product"} x${item.quantity || 1}`).join(", ")}</p>`
        : ""}
      ${asArray(order.businessPayments).length
        ? `<p class="tiny">Business refs: ${order.businessPayments.map((payment) => `${payment.storeName || "Business"} ${payment.reference || "pending"} (${capitalize(payment.status || "pending")})`).join(" | ")}</p>`
        : ""}
      <p class="tiny">${order.buyerLocation || "Buyer location pending"} | ${order.paymentMethod || "Payment pending"}</p>
      <p class="tiny">Distance: ${orderDistanceText(order)}</p>
      <p class="tiny">Payment status: ${capitalize(String(order.paymentStatus || "pending").replace("_", " "))}</p>
      <p class="tiny">Delivery status: ${capitalize(order.deliveryStatus || order.status || "pending")} | Employee: ${order.assignedEmployeeName || order.assignedEmployeeEmail || "Not assigned"}</p>
      <p class="tiny">Delivery till ${order.deliveryPayment?.tillNumber || "7312380"} | Ref ${order.deliveryPayment?.reference || "pending"} | ${capitalize(order.deliveryPayment?.status || "pending")}</p>
      <p class="tiny">Delivery ${currency(order.deliveryFee || 0)} | Total ${currency(order.total || 0)}</p>
      <div class="order-detail-panel is-hidden" data-order-detail="${order.id}">
        <p class="tiny">Created: ${order.createdAt ? new Date(order.createdAt).toLocaleString() : "Date pending"}</p>
        <p class="tiny">Customer location: ${order.buyerLocation || "Location pending"}</p>
        <p class="tiny">Route: ${orderDistanceText(order)}</p>
        <p class="tiny">Order total: Products ${currency(order.subtotal || 0)} + Delivery ${currency(order.deliveryFee || 0)} = ${currency(order.total || 0)}</p>
      </div>
      <div class="button-row">
        <button class="button button-outline button-small" data-view-order="${order.id}" type="button">View details</button>
        ${order.paymentStatus !== "paid"
          ? `<button class="button button-primary button-small" data-paid-order="${order.id}" type="button">Confirm payment</button>`
          : ""}
        ${!["processing", "delivered", "cancelled"].includes(orderStatus)
          ? `<button class="button button-outline button-small" data-process-order="${order.id}" type="button">Processing</button>`
          : ""}
        ${orderStatus !== "delivered"
          ? `<button class="button button-outline button-small" data-deliver-order="${order.id}" type="button">Delivered</button>`
          : ""}
        ${orderStatus !== "cancelled"
          ? `<button class="button button-outline button-small" data-cancel-order="${order.id}" type="button">Cancel</button>`
          : ""}
        <button class="button button-ghost button-small" data-delete-order="${order.id}" type="button">Delete</button>
      </div>
    </article>
  `; }).join("");

  bindOrderActionButtons(container);
}

function renderNotifications() {
  const container = document.getElementById("notificationList");
  if (!container) return;

  const orderNotifications = orders().slice().reverse().map((order) => ({
    type: "Order",
    title: `Order ${order.id} placed`,
    detail: `${order.customer || "Customer"} | ${currency(order.total || 0)} | ${capitalize(order.status || "pending")}`,
    date: order.createdAt || order.updatedAt || ""
  }));

  const businessNotifications = applications()
    .filter((business) => business.status && business.status !== "pending")
    .slice()
    .reverse()
    .map((business) => ({
      type: "Business",
      title: `${business.storeName || business.name || "Business"} is ${businessStatus(business)}`,
      detail: `${business.ownerName || business.email || "Owner pending"} | Active until ${formatDate(business.expiresAt)}`,
      date: business.updatedAt || business.approvedAt || business.blockedAt || business.createdAt || ""
    }));

  const notifications = [...orderNotifications, ...businessNotifications].slice(0, 40);

  if (!notifications.length) {
    container.innerHTML = '<div class="list-card">No notifications yet. New orders and business actions will appear here.</div>';
    return;
  }

  container.innerHTML = notifications.map((notification) => `
    <article class="notification-card">
      <span class="notification-type">${notification.type}</span>
      <div>
        <strong>${notification.title}</strong>
        <p class="tiny">${notification.detail}</p>
      </div>
    </article>
  `).join("");
}

function renderAdminUtilityPanels() {
  const allOrders = orders();
  const allApplications = applications();
  const sellerProducts = cachedProducts;
  const customers = [...new Map(allOrders.map((order) => [
    `${order.phone || ""}-${order.customer || ""}`,
    order
  ])).values()];
  const paidOrders = allOrders.filter((order) => order.paymentStatus === "paid");
  const deliveryTotal = allOrders.reduce((sum, order) => sum + Number(order.deliveryFee || 0), 0);
  const salesTotal = allOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);

  const usersContainer = document.getElementById("adminUserList");
  if (usersContainer) {
    const userRows = cachedUsers.slice().reverse().map((user) => `
      <article class="mini-list-card">
        <div>
          <strong>${user.name || user.email || "User"}</strong>
          <p class="tiny">${user.email || "Email pending"} | ${user.phone || "Phone pending"} | ${capitalize(user.role || "customer")}</p>
        </div>
        <div class="button-row">
          <span class="status-pill status-pill--${user.status || "active"}">${capitalize(user.status || "active")}</span>
          <button class="button button-ghost button-small" data-admin-delete="${user.role === "employee" ? "employee" : "user"}" data-admin-delete-id="${user.id}" data-admin-delete-label="${user.role || "user"}" type="button">Delete</button>
        </div>
      </article>
    `);
    const customerRows = customers.slice().reverse().slice(0, 8).map((customer) => `
      <article class="mini-list-card">
        <div>
          <strong>${customer.customer || "Customer"}</strong>
          <p class="tiny">${customer.phone || "Phone pending"} | ${customer.buyerLocation || "Location pending"}</p>
        </div>
        <span class="summary-chip">${currency(customer.total || 0)}</span>
      </article>
    `);
    usersContainer.innerHTML = userRows.concat(customerRows).join("") || '<div class="list-card">Users will appear after seller registration or checkout.</div>';
    bindAdminDeleteButtons(usersContainer);
  }

  const deliveryContainer = document.getElementById("adminDeliveryList");
  if (deliveryContainer) {
    deliveryContainer.innerHTML = allOrders.length
      ? allOrders.slice().reverse().map((order) => `
          <article class="list-card">
            <div class="section-head">
              <strong>${order.id}</strong>
              <span class="summary-chip">${currency(order.deliveryFee || 0)}</span>
            </div>
            <p class="tiny">Till 7312380 | Ref ${order.deliveryPayment?.reference || "pending"} | ${capitalize(order.deliveryPayment?.status || "pending")}</p>
            <p class="tiny">Delivery status: ${capitalize(order.deliveryStatus || order.status || "pending")} | Employee: ${order.assignedEmployeeName || order.assignedEmployeeEmail || "Not assigned"}</p>
            <p class="tiny">${order.customer || "Customer"} | ${order.buyerLocation || "Buyer location pending"}</p>
          </article>
        `).join("")
      : '<div class="list-card">Delivery fee records will appear after checkout.</div>';
  }

  const paymentContainer = document.getElementById("adminPaymentList");
  if (paymentContainer) {
    const paymentRows = cachedPayments.length
      ? cachedPayments.map((payment) => ({
          id: payment.id,
          title: payment.method || "Payment",
          detail: `${payment.order_public_id || "Order pending"} | Ref ${payment.reference || "pending"} | ${capitalize(payment.status || "pending")}`,
          amount: payment.amount || 0
        }))
      : allOrders.flatMap((order) => [
      ...asArray(order.businessPayments).map((payment) => ({
        id: payment.id || payment.reference || order.id,
        order,
        title: payment.storeName || "Business payment",
        detail: `${payment.method || "Method pending"} | Ref ${payment.reference || "pending"} | ${capitalize(payment.status || "pending")}`,
        amount: payment.amount || 0
      })),
      {
        order,
        title: "Delivery fee",
        detail: `Till ${order.deliveryPayment?.tillNumber || "7312380"} | Ref ${order.deliveryPayment?.reference || "pending"} | ${capitalize(order.deliveryPayment?.status || "pending")}`,
        amount: order.deliveryFee || 0
      }
    ]);
    paymentContainer.innerHTML = paymentRows.length
      ? paymentRows.slice().reverse().map((payment) => `
          <article class="mini-list-card">
            <div>
              <strong>${payment.title}</strong>
              <p class="tiny">${payment.order?.id || ""} ${payment.detail}</p>
            </div>
            <div class="button-row">
              <span class="summary-chip">${currency(payment.amount)}</span>
              <button class="button button-ghost button-small" data-admin-delete="payment" data-admin-delete-id="${payment.id}" data-admin-delete-label="payment" type="button">Delete</button>
            </div>
          </article>
        `).join("")
      : '<div class="list-card">Payment references submitted by customers will appear here.</div>';
    bindAdminDeleteButtons(paymentContainer);
  }

  const productContainer = document.getElementById("adminProductList");
  if (productContainer) {
    productContainer.innerHTML = cachedProducts.length
      ? `<h3 class="section-title">Products</h3>` + cachedProducts.slice().reverse().map((product) => `
          <article class="mini-list-card">
            <div>
              <strong>${product.productName || product.name || "Product"}</strong>
              <p class="tiny">${product.storeName || product.businessName || "Business"} | ${currency(product.price || product.productPrice || 0)}</p>
            </div>
            <button class="button button-ghost button-small" data-admin-delete="product" data-admin-delete-id="${product.id}" data-admin-delete-label="product" type="button">Delete</button>
          </article>
        `).join("")
      : '<div class="list-card">Products added by sellers will appear here.</div>';
    bindAdminDeleteButtons(productContainer);
  }

  const offerContainer = document.getElementById("adminOfferList");
  if (offerContainer) {
    offerContainer.innerHTML = cachedOffers.length
      ? `<h3 class="section-title">Offers</h3>` + cachedOffers.slice().reverse().map((offer) => `
          <article class="mini-list-card">
            <div>
              <strong>${offer.offerTitle || offer.title || "Offer"}</strong>
              <p class="tiny">${offer.storeName || "Business"} | ${offer.offerExpiry || offer.expires || "No expiry"}</p>
            </div>
            <button class="button button-ghost button-small" data-admin-delete="offer" data-admin-delete-id="${offer.id}" data-admin-delete-label="offer" type="button">Delete</button>
          </article>
        `).join("")
      : '<div class="list-card">Seller offer banners will appear here.</div>';
    bindAdminDeleteButtons(offerContainer);
  }

  const analyticsContainer = document.getElementById("adminAnalyticsStats");
  if (analyticsContainer) {
    analyticsContainer.innerHTML = `
      <article class="card stat-card"><span class="stat-label">Total sales</span><strong>${currency(salesTotal)}</strong></article>
      <article class="card stat-card"><span class="stat-label">Paid orders</span><strong>${paidOrders.length}</strong></article>
      <article class="card stat-card"><span class="stat-label">Delivery fees</span><strong>${currency(deliveryTotal)}</strong></article>
      <article class="card stat-card"><span class="stat-label">Approved businesses</span><strong>${allApplications.filter(isBusinessActive).length}</strong></article>
      <article class="card stat-card"><span class="stat-label">Listed products</span><strong>${sellerProducts.length}</strong></article>
    `;
  }

  const reportContainer = document.getElementById("adminReportList");
  if (reportContainer) {
    reportContainer.innerHTML = `
      <article class="list-card"><strong>Orders</strong><p class="tiny">${allOrders.length} total, ${allOrders.filter((order) => order.status === "pending").length} pending, ${allOrders.filter((order) => order.status === "processing").length} processing, ${allOrders.filter((order) => order.status === "delivered").length} delivered.</p></article>
      <article class="list-card"><strong>Businesses</strong><p class="tiny">${allApplications.length} registered, ${allApplications.filter(isBusinessActive).length} approved, ${allApplications.filter((item) => businessStatus(item) === "pending").length} pending approval.</p></article>
      <article class="list-card"><strong>Payments</strong><p class="tiny">${currency(salesTotal)} total order value and ${currency(deliveryTotal)} delivery fees routed to till 7312380.</p></article>
    `;
  }
}

function bindCategoryForm() {
  const form = document.getElementById("categoryForm");
  if (!form || form.dataset.bound === "true") return;
  form.dataset.bound = "true";
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const categoryName = String(formData.get("categoryName")).trim();

    if (!categoryName) {
      return;
    }

    if (categories().includes(categoryName)) {
      showToast("Category already exists.", "info");
      return;
    }

    const response = await fetch('./api/categories/save.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: categoryName })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok === false) {
      showToast(result.message || "Category save failed.", "warn");
      return;
    }
    await loadData();
    event.currentTarget.reset();
    renderCategories();
    showToast("Category added.");
  });
}

function bindLogout() {
  const logout = async () => {
    await fetch("./api/auth/logout.php", { method: "POST" }).catch(() => {});
    window.localStorage.removeItem(STORAGE_KEYS.adminSession);
    window.location.href = "./index.html";
  };
  document.getElementById("adminLogoutButton")?.addEventListener("click", logout);
  document.getElementById("adminSidebarLogoutButton")?.addEventListener("click", logout);
}

function closeAdminMenu() {
  const sidebar = document.getElementById("adminSidebar");
  const overlay = document.getElementById("adminSidebarOverlay");
  const toggle = document.getElementById("adminMenuToggle");
  sidebar?.classList.remove("is-open");
  overlay?.classList.remove("is-open");
  toggle?.setAttribute("aria-expanded", "false");
  document.body.classList.remove("admin-menu-open");
}

function closeOtherMenusForAdmin() {
  document.querySelectorAll(".seller-workspace-nav.is-open, .employee-sidebar.is-open, .seller-sidebar[data-open='true']")
    .forEach((menu) => {
      menu.classList.remove("is-open");
      if (menu.dataset.open) {
        menu.dataset.open = "false";
      }
    });
  document.querySelectorAll(".seller-menu-overlay.is-open, .employee-sidebar-overlay.is-open, .seller-sidebar-overlay.is-open")
    .forEach((overlay) => overlay.classList.remove("is-open"));
  document.querySelectorAll("#sellerWorkspaceToggle, #employeeMenuToggle, .seller-menu-toggle")
    .forEach((button) => button.setAttribute("aria-expanded", "false"));
  document.body.classList.remove("seller-menu-open", "employee-menu-open", "legacy-seller-menu-open");
}

function setAdminView(view) {
  activeAdminView = adminViewMeta[view] ? view : "overview";
  const meta = adminViewMeta[activeAdminView];
  document.getElementById("adminViewTitle").textContent = meta.title;
  const subtitle = document.getElementById("adminViewSubtitle");
  subtitle.textContent = meta.subtitle;
  subtitle.classList.toggle("is-hidden", !meta.subtitle);

  document.querySelectorAll("[data-admin-panel]").forEach((panel) => {
    panel.classList.toggle("is-hidden", panel.dataset.adminPanel !== activeAdminView);
  });

  document.querySelectorAll("[data-admin-view]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.adminView === activeAdminView);
  });

  closeAdminMenu();
}

function bindAdminNavigation() {
  const toggle = document.getElementById("adminMenuToggle");
  const sidebar = document.getElementById("adminSidebar");
  const overlay = document.getElementById("adminSidebarOverlay");
  const shell = document.querySelector(".admin-app-shell");

  if (toggle && toggle.dataset.bound !== "true") {
    toggle.dataset.bound = "true";
    toggle.addEventListener("click", () => {
      if (window.matchMedia("(min-width: 981px)").matches) {
        const collapsed = shell?.classList.toggle("admin-sidebar-collapsed");
        toggle.setAttribute("aria-expanded", String(!collapsed));
        return;
      }
      closeOtherMenusForAdmin();
      const isOpen = sidebar.classList.toggle("is-open");
      overlay.classList.toggle("is-open", isOpen);
      toggle.setAttribute("aria-expanded", String(isOpen));
      document.body.classList.toggle("admin-menu-open", isOpen);
    });
  }

  overlay?.addEventListener("click", closeAdminMenu);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeAdminMenu();
    }
  });
  window.addEventListener("resize", () => {
    if (window.matchMedia("(min-width: 981px)").matches) {
      closeAdminMenu();
    } else {
      shell?.classList.remove("admin-sidebar-collapsed");
    }
  });

  document.querySelectorAll("[data-admin-view]").forEach((button) => {
    if (button.dataset.bound === "true") return;
    button.dataset.bound = "true";
    button.addEventListener("click", () => setAdminView(button.dataset.adminView));
  });

  document.querySelectorAll("[data-admin-jump]").forEach((button) => {
    if (button.dataset.bound === "true") return;
    button.dataset.bound = "true";
    button.addEventListener("click", () => setAdminView(button.dataset.adminJump));
  });
}

function bindAdminOrderFilters() {
  const bindings = [
    ["adminOrderSearch", "search"],
    ["adminOrderStatusFilter", "status"],
    ["adminOrderPaymentFilter", "payment"],
    ["adminOrderDateFilter", "date"]
  ];
  bindings.forEach(([id, key]) => {
    const input = document.getElementById(id);
    if (!input || input.dataset.bound === "true") return;
    input.dataset.bound = "true";
    input.addEventListener("input", () => {
      adminOrderFilters[key] = input.value;
      renderOrderList();
    });
    input.addEventListener("change", () => {
      adminOrderFilters[key] = input.value;
      renderOrderList();
    });
  });
}

function bindLiveOrderUpdates() {
  if (window.__tamuAdminLiveOrdersBound) {
    return;
  }
  window.__tamuAdminLiveOrdersBound = true;
  window.setInterval(async () => {
    if (!(await ensureAdminSession())) return;
    await loadData();
    renderOverview();
    renderOrderList();
    renderNotifications();
    renderAdminUtilityPanels();
  }, 12000);
}

async function startDashboard() {
  showAdminDashboard();
  seedStorage();
  await loadData();
  bindAdminNavigation();
  bindAdminOrderFilters();
  bindLiveOrderUpdates();
  bindCategoryForm();
  bindLogout();
  renderOverview();
  renderApprovals();
  renderCategories();
  renderOrderList();
  renderOrders();
  renderNotifications();
  renderAdminUtilityPanels();
  setAdminView(activeAdminView);
}

async function boot() {
  initReveal();
  bindAdminLogin();

  if (!(await ensureAdminSession())) {
    showAdminLogin();
    return;
  }

  await startDashboard();
}

boot();
