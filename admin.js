let cachedApplications = [];
const STORAGE_KEYS = {
  sellers: "tamu_market_sellers",
  sellerApplications: "tamu_market_seller_applications",
  legacySellers: "tamu_sellers",
  legacyProducts: "tamu_products",
  legacyOrders: "tamu_orders",
  sellerProducts: "tamu_market_seller_products",
  categories: "tamu_market_categories",
  adminOrders: "tamu_market_admin_orders",
  adminSession: "tamu_market_admin_session"
};

const DEMO_ORDER_IDS = new Set(["order-1001", "order-1002", "order-1003", "order-1004"]);

const defaultCategories = [
  "Beverages",
  "Drinks",
  "Groceries",
  "Fresh Foods",
  "Household",
  "Snacks",
  "Dairy",
  "Wholesale Packs"
];

const orderStages = ["pending_payment", "paid", "processing", "delivered", "cancelled"];
const LOCAL_ADMIN_CREDENTIALS = {
  username: "TamuAdmin@2025",
  password: "ummeats"
};
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

function readStorage(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    return fallback;
  }
}

function ensureAdminSession() {
  if (window.localStorage.getItem(STORAGE_KEYS.adminSession) === "active") {
    return true;
  }

  return false;
}

function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    return;
  }
}

function seedStorage() {
  if (!readStorage(STORAGE_KEYS.categories, null)) {
    writeStorage(STORAGE_KEYS.categories, defaultCategories);
  }

  if (!readStorage(STORAGE_KEYS.adminOrders, null)) {
    writeStorage(STORAGE_KEYS.adminOrders, []);
  }

  if (!readStorage(STORAGE_KEYS.sellerApplications, null)) {
    writeStorage(STORAGE_KEYS.sellerApplications, []);
  }
}

function currency(value) {
  return `KSh ${Number(value).toLocaleString()}`;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
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

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const username = String(formData.get("username") || "").trim();
    const password = String(formData.get("password") || "").trim();

    if (username !== LOCAL_ADMIN_CREDENTIALS.username || password !== LOCAL_ADMIN_CREDENTIALS.password) {
      status.textContent = "Invalid admin credentials.";
      return;
    }

    window.localStorage.setItem(STORAGE_KEYS.adminSession, "active");
    status.textContent = "";
    form.reset();
    startDashboard();
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
  const localSellers = readStorage(STORAGE_KEYS.sellers, []);
  const localApplications = readStorage(STORAGE_KEYS.sellerApplications, []);
  const legacySellers = readStorage(STORAGE_KEYS.legacySellers, []).map((seller) => ({
    id: seller.id || seller.email,
    storeName: seller.storeName || seller.name || seller.businessName || seller.email,
    ownerName: seller.ownerName || seller.name || "",
    email: seller.email || "",
    phone: seller.phone || "",
    businessType: seller.businessType || "seller",
    location: seller.location || seller.coordinates || "Location pending",
    status: seller.status || "pending",
    createdAt: seller.createdAt || "",
    updatedAt: seller.updatedAt || ""
  }));
  const merged = [...localSellers, ...localApplications, ...legacySellers, ...cachedApplications];
  return merged.filter((application, index, list) =>
    list.findIndex((item) => (item.id && item.id === application.id) || (item.email && item.email === application.email)) === index
  );
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
    const res = await fetch('./api/admin/applications.php');
    if (!res.ok) {
      return;
    }
    const data = await res.json();
    if (data.ok) {
      cachedApplications = data.applications || [];
    }
  } catch (error) {
    cachedApplications = [];
  }
}

function categories() {
  return readStorage(STORAGE_KEYS.categories, defaultCategories);
}

function findLegacyProduct(productId) {
  return readStorage(STORAGE_KEYS.legacyProducts, []).find((product) => product.id === productId);
}

function normalizeOrder(order) {
  const product = order.productId ? findLegacyProduct(order.productId) : null;
  const items = asArray(order.items).length
    ? order.items
    : product
      ? [{
          productId: product.id,
          productName: product.name || product.productName || "Product",
          storeId: product.sellerId || product.storeId || "",
          storeName: product.sellerName || product.storeName || "Seller",
          quantity: Number(order.quantity || 1),
          unitPrice: Number(product.price || product.productPrice || order.total || 0),
          lineTotal: Number(order.total || product.price || product.productPrice || 0) * Number(order.quantity || 1)
        }]
      : [];

  const subtotal = Number(order.subtotal || items.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0));
  const deliveryFee = Number(order.deliveryFee || 0);
  const total = Number(order.total || subtotal + deliveryFee);

  return {
    ...order,
    id: order.id || order.publicId || `order-${order.createdAt || Date.now()}`,
    customer: order.customer || order.customerName || order.buyerName || "Customer",
    phone: order.phone || order.customerPhone || "",
    buyerLocation: order.buyerLocation || order.location || "Buyer location pending",
    paymentMethod: order.paymentMethod || "Payment pending",
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
  const currentOrders = readStorage(STORAGE_KEYS.adminOrders, []).map(normalizeOrder);
  const cleanOrders = currentOrders.filter((order) => !DEMO_ORDER_IDS.has(order.id));
  if (cleanOrders.length !== currentOrders.length) {
    writeStorage(STORAGE_KEYS.adminOrders, cleanOrders);
  }

  const legacyOrders = readStorage(STORAGE_KEYS.legacyOrders, []).map(normalizeOrder);
  return [...cleanOrders, ...legacyOrders].filter((order, index, list) =>
    list.findIndex((item) => item.id === order.id) === index
  );
}

function saveOrders(nextOrders) {
  writeStorage(STORAGE_KEYS.adminOrders, nextOrders.map(normalizeOrder));
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
  if (status === "expired") {
    patch.expiresAt = new Date().toISOString();
  }

  const localSellers = readStorage(STORAGE_KEYS.sellers, []);
  const localApplications = readStorage(STORAGE_KEYS.sellerApplications, []);
  const targetApplication = [...localSellers, ...localApplications].find((record) =>
    record.id === applicationId || record.email === applicationId
  );
  const targetEmail = targetApplication?.email || "";
  const updatedSellers = localSellers.map((seller) =>
    seller.id === applicationId || seller.email === applicationId || (targetEmail && seller.email === targetEmail)
      ? { ...seller, ...patch }
      : seller
  );

  const updatedApplications = localApplications.map((application) =>
    application.id === applicationId || application.email === applicationId || (targetEmail && application.email === targetEmail)
      ? { ...application, ...patch }
      : application
  );

  const updatedApplication = updatedApplications.find((application) =>
    application.id === applicationId || application.email === applicationId || (targetEmail && application.email === targetEmail)
  );
  const sellerExists = updatedSellers.some((seller) =>
    seller.id === applicationId || seller.email === updatedApplication?.email || (targetEmail && seller.email === targetEmail)
  );
  const nextSellers = sellerExists || !updatedApplication
    ? updatedSellers
    : [...updatedSellers, { ...updatedApplication, ...patch }];

  if (nextSellers.some((seller, index) => seller !== localSellers[index]) || nextSellers.length !== localSellers.length) {
    writeStorage(STORAGE_KEYS.sellers, nextSellers);
  }
  if (updatedApplications.some((application, index) => application !== localApplications[index])) {
    writeStorage(STORAGE_KEYS.sellerApplications, updatedApplications);
  }

  const legacySellers = readStorage(STORAGE_KEYS.legacySellers, []);
  const updatedLegacySellers = legacySellers.map((seller) =>
    seller.id === applicationId || seller.email === applicationId ? { ...seller, ...patch } : seller
  );
  if (updatedLegacySellers.some((seller, index) => seller !== legacySellers[index])) {
    writeStorage(STORAGE_KEYS.legacySellers, updatedLegacySellers);
  }

  try {
    const response = await fetch('./api/admin/applications.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: applicationId, status })
    });
    const result = await response.json();
    if (result.ok) {
      await loadData();
    }
  } catch (error) {
    // Local seller approvals still work when the PHP API is unavailable.
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
            <button class="button button-outline button-small" data-application-action="expired" data-application-id="${application.id}" type="button">Expire</button>
            <button class="button button-outline button-small" data-application-action="blocked" data-application-id="${application.id}" type="button">Block</button>
            <button class="button button-ghost button-small" data-application-action="rejected" data-application-id="${application.id}" type="button">Reject</button>
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
  document.getElementById("categoryList").innerHTML = categories()
    .map((category) => `<span class="category-chip">${category}</span>`)
    .join("");
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
}

function deleteOrder(orderId) {
  saveOrders(orders().filter((order) => order.id !== orderId));
  renderOverview();
  renderOrderList();
  renderOrders();
  renderNotifications();
  renderAdminUtilityPanels();
  showToast("Order deleted.", "warn");
}

function bindOrderActionButtons(container) {
  container.querySelectorAll("[data-move-order]").forEach((button) => {
    button.addEventListener("click", () => {
      moveOrder(button.dataset.moveOrder);
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

function renderOrders() {
  renderOrderList();
}

function renderOrderList() {
  const container = document.getElementById("orderList");
  if (!container) return;
  const list = orders().slice().reverse();
  const summary = document.getElementById("orderCountSummary");
  if (summary) {
    summary.textContent = `${list.length} order${list.length === 1 ? "" : "s"}`;
  }

  if (!list.length) {
    container.innerHTML = '<div class="list-card">No orders placed yet. Orders from checkout will appear here immediately.</div>';
    return;
  }

  container.innerHTML = list.map((order) => `
    <article class="list-card order-menu-card">
      <div class="section-head">
        <div>
          <strong>${order.id}</strong>
          <p class="tiny">${order.customer || "Customer"} | ${order.phone || "Phone pending"}</p>
        </div>
        <span class="status-pill status-pill--${order.status || "pending"}">${capitalize(order.status || "pending")}</span>
      </div>
      <p>${order.storeName || order.storeNames?.join(", ") || "Store pending"}</p>
      <p class="tiny">M-Pesa: ${order.mpesaName || order.customer || "Name pending"} | ${order.mpesaNumber || order.phone || "Number pending"} | Ref ${order.mpesaReference || order.businessPayments?.[0]?.reference || "pending"}</p>
      ${asArray(order.items).length
        ? `<p class="tiny">Items: ${order.items.map((item) => `${item.productName || "Product"} x${item.quantity || 1}`).join(", ")}</p>`
        : ""}
      ${asArray(order.businessPayments).length
        ? `<p class="tiny">Business refs: ${order.businessPayments.map((payment) => `${payment.storeName || "Business"} ${payment.reference || "pending"} (${capitalize(payment.status || "pending")})`).join(" | ")}</p>`
        : ""}
      <p class="tiny">${order.buyerLocation || "Buyer location pending"} | ${order.paymentMethod || "Payment pending"}</p>
      <p class="tiny">Payment status: ${capitalize(String(order.paymentStatus || "pending").replace("_", " "))}</p>
      <p class="tiny">Delivery status: ${capitalize(order.deliveryStatus || order.status || "pending")} | Employee: ${order.assignedEmployeeName || order.assignedEmployeeEmail || "Not assigned"}</p>
      <p class="tiny">Delivery till ${order.deliveryPayment?.tillNumber || "7312380"} | Ref ${order.deliveryPayment?.reference || "pending"} | ${capitalize(order.deliveryPayment?.status || "pending")}</p>
      <p class="tiny">Delivery ${currency(order.deliveryFee || 0)} | Total ${currency(order.total || 0)}</p>
      <div class="button-row">
        ${order.paymentStatus !== "paid"
          ? `<button class="button button-primary button-small" data-paid-order="${order.id}" type="button">Mark paid</button>`
          : ""}
        ${!["delivered", "cancelled"].includes(order.status)
          ? `<button class="button button-outline button-small" data-move-order="${order.id}" type="button">Move next</button>`
          : ""}
        ${order.status !== "delivered"
          ? `<button class="button button-outline button-small" data-deliver-order="${order.id}" type="button">Delivered</button>`
          : ""}
        ${order.status !== "cancelled"
          ? `<button class="button button-outline button-small" data-cancel-order="${order.id}" type="button">Cancel</button>`
          : ""}
        <button class="button button-ghost button-small" data-delete-order="${order.id}" type="button">Delete</button>
      </div>
    </article>
  `).join("");

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
  const sellerProducts = readStorage(STORAGE_KEYS.sellerProducts, []);
  const customers = [...new Map(allOrders.map((order) => [
    `${order.phone || ""}-${order.customer || ""}`,
    order
  ])).values()];
  const paidOrders = allOrders.filter((order) => order.paymentStatus === "paid");
  const deliveryTotal = allOrders.reduce((sum, order) => sum + Number(order.deliveryFee || 0), 0);
  const salesTotal = allOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);

  const usersContainer = document.getElementById("adminUserList");
  if (usersContainer) {
    const sellerRows = allApplications.slice().reverse().slice(0, 12).map((seller) => `
      <article class="mini-list-card">
        <div>
          <strong>${seller.storeName || seller.name || "Business"}</strong>
          <p class="tiny">${seller.email || "Email pending"} | ${seller.phone || "Phone pending"}</p>
        </div>
        <span class="status-pill status-pill--${businessStatus(seller)}">${capitalize(businessStatus(seller))}</span>
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
    usersContainer.innerHTML = sellerRows.concat(customerRows).join("") || '<div class="list-card">Users will appear after seller registration or checkout.</div>';
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
    const paymentRows = allOrders.flatMap((order) => [
      ...asArray(order.businessPayments).map((payment) => ({
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
              <p class="tiny">${payment.order.id} | ${payment.detail}</p>
            </div>
            <span class="summary-chip">${currency(payment.amount)}</span>
          </article>
        `).join("")
      : '<div class="list-card">Payment references submitted by customers will appear here.</div>';
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
  form.addEventListener("submit", (event) => {
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

    writeStorage(STORAGE_KEYS.categories, [...categories(), categoryName]);
    event.currentTarget.reset();
    renderCategories();
    showToast("Category added.");
  });
}

function bindLogout() {
  const logout = () => {
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

function bindLiveOrderUpdates() {
  if (window.__tamuAdminLiveOrdersBound) {
    return;
  }
  window.__tamuAdminLiveOrdersBound = true;
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEYS.adminOrders || !ensureAdminSession()) {
      return;
    }
    renderOverview();
    renderOrderList();
    renderNotifications();
    renderAdminUtilityPanels();
  });
}

async function startDashboard() {
  showAdminDashboard();
  seedStorage();
  await loadData();
  bindAdminNavigation();
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

  if (!ensureAdminSession()) {
    showAdminLogin();
    return;
  }

  await startDashboard();
}

boot();
