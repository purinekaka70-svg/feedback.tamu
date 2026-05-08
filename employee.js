const EMPLOYEE_KEYS = {
  adminOrders: "tamu_market_admin_orders",
  employeeSession: "tamu_market_employee_session",
  employeeAccounts: "tamu_market_employee_accounts",
  adminPhone: "tamu_market_admin_phone",
  sellers: "tamu_market_sellers",
  sellerApplications: "tamu_market_seller_applications",
  legacySellers: "tamu_sellers"
};

const defaultEmployees = [
  {
    id: "employee-demo-1",
    name: "Delivery Employee",
    email: "employee@tamu.local",
    password: "delivery123",
    phone: "254700000000",
    status: "active",
    role: "rider"
  }
];

const employeeViewMeta = {
  dashboard: "Dashboard",
  orders: "Orders",
  deliveries: "Deliveries",
  notifications: "Notifications",
  maps: "Maps/Tracking",
  customerChats: "Customer Chats",
  adminChats: "Admin Chats",
  settings: "Settings"
};

let currentEmployee = null;
let activeEmployeeView = "dashboard";
let employeeMap = null;
let routeLayer = null;
let markerLayer = null;

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

function ensureEmployeeSeed() {
  if (!readStorage(EMPLOYEE_KEYS.employeeAccounts, null)) {
    writeStorage(EMPLOYEE_KEYS.employeeAccounts, defaultEmployees);
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function currency(value) {
  return `KSh ${Number(value || 0).toLocaleString()}`;
}

function capitalize(value) {
  return String(value || "pending")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function showToast(message, tone = "success") {
  const container = document.getElementById("toastContainer");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast toast--${tone}`;
  toast.textContent = message;
  container.appendChild(toast);
  window.setTimeout(() => toast.remove(), 2600);
}

function passwordMatches(account, password) {
  if (!account) return false;
  if (account.password && account.password === password) return true;
  if (account.passwordHash && account.passwordHash === window.btoa(password)) return true;
  return false;
}

function firebaseConfig() {
  if (window.tamuFirebaseConfig) {
    return window.tamuFirebaseConfig;
  }
  return readStorage("tamu_market_firebase_config", null);
}

async function loadFirebaseEmployees() {
  const config = firebaseConfig();
  if (!config || !window.firebase?.firestore) {
    return [];
  }

  try {
    if (!window.firebase.apps.length) {
      window.firebase.initializeApp(config);
    }
    const snapshot = await window.firebase.firestore().collection("employees").get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    return [];
  }
}

async function employeeAccounts() {
  ensureEmployeeSeed();
  const localAccounts = readStorage(EMPLOYEE_KEYS.employeeAccounts, defaultEmployees);
  const firebaseAccounts = await loadFirebaseEmployees();
  return [...firebaseAccounts, ...localAccounts].filter((account, index, list) =>
    list.findIndex((item) => (item.id && item.id === account.id) || (item.email && item.email === account.email)) === index
  );
}

function isEmployeeActive(account) {
  const status = String(account?.status || "inactive").toLowerCase();
  return status === "active" || status === "approved" || account?.approved === true;
}

async function findEmployeeByEmail(email) {
  const accounts = await employeeAccounts();
  return accounts.find((account) => String(account.email || "").toLowerCase() === email.toLowerCase());
}

function showLogin() {
  document.getElementById("employeeLoginView")?.classList.remove("is-hidden");
  document.getElementById("employeeDashboardView")?.classList.add("is-hidden");
}

function showDashboard() {
  document.getElementById("employeeLoginView")?.classList.add("is-hidden");
  document.getElementById("employeeDashboardView")?.classList.remove("is-hidden");
}

function normalizeOrder(order) {
  const subtotal = Number(order.subtotal || asArray(order.items).reduce((sum, item) => sum + Number(item.lineTotal || 0), 0));
  const deliveryFee = Number(order.deliveryFee || order.deliveryPayment?.amount || 0);
  const total = Number(order.total || subtotal + deliveryFee);
  return {
    ...order,
    id: order.id || order.publicId || `order-${Date.now()}`,
    customer: order.customer || order.customerName || "Customer",
    phone: order.phone || order.customerPhone || order.mpesaNumber || "",
    buyerLocation: order.buyerLocation || order.location || "Customer location pending",
    status: String(order.status || "pending_payment").toLowerCase(),
    deliveryStatus: String(order.deliveryStatus || order.status || "pending").toLowerCase(),
    items: asArray(order.items),
    businessPayments: asArray(order.businessPayments),
    subtotal,
    deliveryFee,
    total
  };
}

function orders() {
  return readStorage(EMPLOYEE_KEYS.adminOrders, []).map(normalizeOrder);
}

function saveOrders(nextOrders) {
  writeStorage(EMPLOYEE_KEYS.adminOrders, nextOrders.map(normalizeOrder));
}

function applications() {
  return [
    ...readStorage(EMPLOYEE_KEYS.sellers, []),
    ...readStorage(EMPLOYEE_KEYS.sellerApplications, []),
    ...readStorage(EMPLOYEE_KEYS.legacySellers, [])
  ];
}

function currentEmployeeId() {
  return currentEmployee?.id || currentEmployee?.email || "";
}

function isAssignedToEmployee(order) {
  const employeeId = currentEmployeeId();
  return order.assignedEmployeeId === employeeId || order.assignedEmployeeEmail === currentEmployee?.email;
}

function activeDeliveryOrders() {
  const employeeId = currentEmployeeId();
  return orders().filter((order) => {
    const status = String(order.status || "").toLowerCase();
    const assignable = !order.assignedEmployeeId || order.assignedEmployeeId === employeeId || order.assignedEmployeeEmail === currentEmployee?.email;
    return assignable && !["delivered", "cancelled"].includes(status);
  });
}

function assignedOrders() {
  return orders().filter(isAssignedToEmployee);
}

function orderItemsText(order) {
  return asArray(order.items).map((item) => `${item.productName || "Product"} x${item.quantity || 1}`).join(", ") || "Items pending";
}

function cleanPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("0")) return `254${digits.slice(1)}`;
  if (digits.startsWith("7") || digits.startsWith("1")) return `254${digits}`;
  return digits;
}

function whatsappLink(phone, text) {
  const number = cleanPhone(phone);
  if (!number) return "#";
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

function orderLatitude(order) {
  return Number(order.buyerLatitude || order.customerLatitude || order.latitude || order.customer?.latitude);
}

function orderLongitude(order) {
  return Number(order.buyerLongitude || order.customerLongitude || order.longitude || order.customer?.longitude);
}

function findStorePoint(order) {
  const storeIds = new Set(asArray(order.items).map((item) => item.storeId).filter(Boolean));
  const app = applications().find((item) =>
    storeIds.has(item.id) || storeIds.has(item.email) || storeIds.has(item.storeName)
  ) || applications().find((item) => String(order.storeName || "").includes(item.storeName || item.name || ""));
  const lat = Number(app?.latitude);
  const lng = Number(app?.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng)
    ? { lat, lng, label: app.storeName || app.name || "Business" }
    : null;
}

function mapsUrl(order) {
  const lat = orderLatitude(order);
  const lng = orderLongitude(order);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.buyerLocation || "")}`;
  }
  const store = findStorePoint(order);
  if (store) {
    return `https://www.google.com/maps/dir/?api=1&origin=${store.lat},${store.lng}&destination=${lat},${lng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

function updateOrder(orderId, patch) {
  const now = new Date().toISOString();
  const nextOrders = orders().map((order) => order.id === orderId
    ? { ...order, ...patch, updatedAt: now }
    : order);
  saveOrders(nextOrders);
  renderEmployee();
}

function acceptDelivery(orderId) {
  updateOrder(orderId, {
    assignedEmployeeId: currentEmployeeId(),
    assignedEmployeeEmail: currentEmployee.email,
    assignedEmployeeName: currentEmployee.name || currentEmployee.email,
    deliveryStatus: "assigned",
    status: "processing"
  });
  showToast("Delivery assigned to you.");
}

function setDeliveryStatus(orderId, status) {
  const patch = {
    deliveryStatus: status,
    status: status === "delivered" ? "delivered" : "processing"
  };
  if (status === "delivered") {
    patch.deliveredAt = new Date().toISOString();
  }
  updateOrder(orderId, patch);
  showToast(`Delivery marked ${capitalize(status)}.`);
}

function renderStats() {
  const allOrders = orders();
  const assigned = assignedOrders();
  const active = activeDeliveryOrders();
  const delivered = assigned.filter((order) => order.status === "delivered" || order.deliveryStatus === "delivered");
  document.getElementById("employeeActiveBadge").textContent = `${active.length} active`;
  document.getElementById("employeeStats").innerHTML = `
    <article class="card stat-card"><span>Available</span><strong>${active.length}</strong></article>
    <article class="card stat-card"><span>Assigned</span><strong>${assigned.length}</strong></article>
    <article class="card stat-card"><span>Delivered</span><strong>${delivered.length}</strong></article>
    <article class="card stat-card"><span>All Orders</span><strong>${allOrders.length}</strong></article>
  `;
}

function orderCard(order, compact = false) {
  const customerMessage = `Hello ${order.customer || "Customer"}, I am delivering your Tamu Express order ${order.id}.`;
  const adminMessage = `Order ${order.id} update: ${order.customer || "Customer"} at ${order.buyerLocation || "location pending"}.`;
  const adminPhone = window.localStorage.getItem(EMPLOYEE_KEYS.adminPhone) || "254700000000";
  const assigned = isAssignedToEmployee(order);
  return `
    <article class="list-card order-card">
      <div class="section-head">
        <div>
          <strong>${order.id}</strong>
          <p class="tiny">${order.customer || "Customer"} | ${order.phone || "Phone pending"}</p>
        </div>
        <span class="status-pill status-pill--${order.deliveryStatus || order.status}">${capitalize(order.deliveryStatus || order.status)}</span>
      </div>
      <p class="tiny">${order.buyerLocation || "Customer location pending"}</p>
      <p class="tiny">${orderItemsText(order)}</p>
      ${compact ? "" : `
        <p class="tiny">Payment ref: ${order.mpesaReference || order.businessPayments?.[0]?.reference || "pending"} | Payment ${capitalize(order.paymentStatus || "pending")}</p>
        <p class="tiny">Delivery: ${currency(order.deliveryFee)} | Total: ${currency(order.total)}</p>
        <p class="tiny">Assigned to: ${order.assignedEmployeeName || "Not assigned"}</p>
      `}
      <div class="button-row">
        ${assigned ? "" : `<button class="button button-primary button-small" type="button" data-accept-order="${order.id}">Accept Delivery</button>`}
        <button class="button button-outline button-small" type="button" data-status-order="${order.id}" data-delivery-status="picked_up">Picked Up</button>
        <button class="button button-outline button-small" type="button" data-status-order="${order.id}" data-delivery-status="on_the_way">On The Way</button>
        <button class="button button-primary button-small" type="button" data-status-order="${order.id}" data-delivery-status="delivered">Delivered</button>
        <a class="button button-ghost button-small" href="${mapsUrl(order)}" target="_blank" rel="noopener">Maps</a>
        <a class="button button-ghost button-small" href="${whatsappLink(order.phone, customerMessage)}" target="_blank" rel="noopener">Customer</a>
        <a class="button button-ghost button-small" href="${whatsappLink(adminPhone, adminMessage)}" target="_blank" rel="noopener">Admin</a>
      </div>
    </article>
  `;
}

function bindOrderActions(container) {
  container.querySelectorAll("[data-accept-order]").forEach((button) => {
    button.addEventListener("click", () => acceptDelivery(button.dataset.acceptOrder));
  });
  container.querySelectorAll("[data-status-order]").forEach((button) => {
    button.addEventListener("click", () => setDeliveryStatus(button.dataset.statusOrder, button.dataset.deliveryStatus));
  });
}

function renderOrderLists() {
  const available = activeDeliveryOrders().slice().reverse();
  const assigned = assignedOrders().slice().reverse();
  const orderContainer = document.getElementById("employeeOrderList");
  const deliveryContainer = document.getElementById("employeeDeliveryList");
  const previewContainer = document.getElementById("employeeAssignedPreview");

  orderContainer.innerHTML = available.length
    ? available.map((order) => orderCard(order)).join("")
    : '<div class="list-card">No active delivery orders yet.</div>';
  deliveryContainer.innerHTML = assigned.length
    ? assigned.map((order) => orderCard(order)).join("")
    : '<div class="list-card">Accept an order to begin delivery tracking.</div>';
  previewContainer.innerHTML = assigned.slice(0, 4).length
    ? assigned.slice(0, 4).map((order) => orderCard(order, true)).join("")
    : '<div class="list-card">No assigned deliveries yet.</div>';

  [orderContainer, deliveryContainer, previewContainer].forEach(bindOrderActions);
}

function renderNotifications() {
  const list = activeDeliveryOrders().slice().reverse().map((order) => ({
    title: `Order ${order.id}`,
    detail: `${order.customer || "Customer"} | ${capitalize(order.deliveryStatus || order.status)} | ${order.buyerLocation || "Location pending"}`
  }));
  const html = list.length
    ? list.map((item) => `
      <article class="notification-card">
        <span class="summary-chip">Order</span>
        <div>
          <strong>${item.title}</strong>
          <p class="tiny">${item.detail}</p>
        </div>
      </article>
    `).join("")
    : '<div class="list-card">No delivery notifications yet.</div>';

  document.getElementById("employeeNotificationList").innerHTML = html;
  document.getElementById("employeeNotificationPreview").innerHTML = html;
}

function renderChats() {
  const assigned = assignedOrders().slice().reverse();
  const customerContainer = document.getElementById("employeeCustomerChats");
  const adminContainer = document.getElementById("employeeAdminChats");
  const adminPhone = window.localStorage.getItem(EMPLOYEE_KEYS.adminPhone) || "254700000000";
  customerContainer.innerHTML = assigned.length
    ? assigned.map((order) => `
      <article class="mini-list-card">
        <div>
          <strong>${order.customer || "Customer"}</strong>
          <p class="tiny">${order.id} | ${order.phone || "Phone pending"}</p>
        </div>
        <a class="button button-primary button-small" href="${whatsappLink(order.phone, `Hello ${order.customer || "Customer"}, I am delivering your Tamu Express order ${order.id}.`)}" target="_blank" rel="noopener">WhatsApp</a>
      </article>
    `).join("")
    : '<div class="list-card">Customer chats appear after you accept a delivery.</div>';

  adminContainer.innerHTML = `
    <article class="mini-list-card">
      <div>
        <strong>Admin Dispatch</strong>
        <p class="tiny">${adminPhone}</p>
      </div>
      <a class="button button-primary button-small" href="${whatsappLink(adminPhone, "Hello Admin, I need help with a Tamu Express delivery.")}" target="_blank" rel="noopener">WhatsApp</a>
    </article>
  `;
}

function renderMap() {
  const mapElement = document.getElementById("employeeMap");
  if (!mapElement || !window.L) {
    document.getElementById("mapOrderDetails").innerHTML = '<div class="list-card">Map library is unavailable. Use the Open in Maps button for navigation.</div>';
    return;
  }

  const order = assignedOrders().find((item) => item.status !== "delivered") || activeDeliveryOrders()[0] || orders()[0];
  if (!employeeMap) {
    employeeMap = window.L.map(mapElement, { scrollWheelZoom: false }).setView([-1.2921, 36.8219], 12);
    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap"
    }).addTo(employeeMap);
    markerLayer = window.L.layerGroup().addTo(employeeMap);
    routeLayer = window.L.layerGroup().addTo(employeeMap);
  }

  window.setTimeout(() => employeeMap.invalidateSize(), 120);
  markerLayer.clearLayers();
  routeLayer.clearLayers();

  if (!order) {
    document.getElementById("mapOrderDetails").innerHTML = '<div class="list-card">No order location available yet.</div>';
    return;
  }

  const lat = orderLatitude(order);
  const lng = orderLongitude(order);
  const openMaps = document.getElementById("openMapsLink");
  openMaps.href = mapsUrl(order);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    document.getElementById("mapOrderDetails").innerHTML = `
      <div class="list-card">
        <strong>${order.id}</strong>
        <p class="tiny">Customer location has no GPS coordinates yet. Location text: ${order.buyerLocation || "pending"}</p>
      </div>
    `;
    return;
  }

  const store = findStorePoint(order);
  window.L.marker([lat, lng]).addTo(markerLayer).bindPopup(`${order.customer || "Customer"}<br>${order.buyerLocation || ""}`);
  if (store) {
    window.L.marker([store.lat, store.lng]).addTo(markerLayer).bindPopup(store.label);
    window.L.polyline([[store.lat, store.lng], [lat, lng]], { color: "#15803d", weight: 5, opacity: 0.8 }).addTo(routeLayer);
    employeeMap.fitBounds([[store.lat, store.lng], [lat, lng]], { padding: [34, 34] });
  } else {
    employeeMap.setView([lat, lng], 14);
  }

  document.getElementById("mapOrderDetails").innerHTML = `
    <article class="list-card">
      <strong>${order.id}</strong>
      <p class="tiny">${order.customer || "Customer"} | ${order.phone || "Phone pending"}</p>
      <p class="tiny">${order.buyerLocation || "Customer location pending"}</p>
      <p class="tiny">Distance: ${order.distanceText || order.routeBreakdown?.[0]?.distanceText || "Calculated during checkout"} | Delivery ${currency(order.deliveryFee)}</p>
    </article>
  `;
}

function renderSettings() {
  const form = document.getElementById("employeeSettingsForm");
  if (form && form.dataset.bound !== "true") {
    form.dataset.bound = "true";
    form.elements.adminPhone.value = window.localStorage.getItem(EMPLOYEE_KEYS.adminPhone) || "254700000000";
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = String(new FormData(form).get("adminPhone") || "").trim();
      window.localStorage.setItem(EMPLOYEE_KEYS.adminPhone, value || "254700000000");
      showToast("Settings saved.");
      renderChats();
    });
  }

  document.getElementById("employeeProfileDetails").innerHTML = `
    <article class="list-card">
      <strong>${currentEmployee?.name || currentEmployee?.email || "Employee"}</strong>
      <p class="tiny">${currentEmployee?.email || "Email pending"} | ${currentEmployee?.phone || "Phone pending"}</p>
      <p class="tiny">Role: ${capitalize(currentEmployee?.role || "employee")} | Status: ${capitalize(currentEmployee?.status || "active")}</p>
    </article>
  `;
}

function renderEmployee() {
  if (!currentEmployee) return;
  document.getElementById("employeeNameLabel").textContent = currentEmployee.name || "Employee";
  renderStats();
  renderOrderLists();
  renderNotifications();
  renderChats();
  renderSettings();
  if (activeEmployeeView === "maps") {
    renderMap();
  }
}

function closeEmployeeMenu() {
  const sidebar = document.getElementById("employeeSidebar");
  const overlay = document.getElementById("employeeSidebarOverlay");
  const toggle = document.getElementById("employeeMenuToggle");
  sidebar?.classList.remove("is-open");
  overlay?.classList.remove("is-open");
  toggle?.setAttribute("aria-expanded", "false");
  document.body.classList.remove("employee-menu-open");
}

function setEmployeeView(view) {
  activeEmployeeView = employeeViewMeta[view] ? view : "dashboard";
  document.getElementById("employeeViewTitle").textContent = employeeViewMeta[activeEmployeeView];
  document.querySelectorAll("[data-employee-panel]").forEach((panel) => {
    panel.classList.toggle("is-hidden", panel.dataset.employeePanel !== activeEmployeeView);
  });
  document.querySelectorAll("[data-employee-view]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.employeeView === activeEmployeeView);
  });
  closeEmployeeMenu();
  if (activeEmployeeView === "maps") {
    renderMap();
  }
}

function bindNavigation() {
  const toggle = document.getElementById("employeeMenuToggle");
  const sidebar = document.getElementById("employeeSidebar");
  const overlay = document.getElementById("employeeSidebarOverlay");
  toggle?.addEventListener("click", () => {
    const isOpen = sidebar.classList.toggle("is-open");
    overlay.classList.toggle("is-open", isOpen);
    toggle.setAttribute("aria-expanded", String(isOpen));
    document.body.classList.toggle("employee-menu-open", isOpen);
  });
  overlay?.addEventListener("click", closeEmployeeMenu);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeEmployeeMenu();
  });
  window.addEventListener("resize", () => {
    if (window.matchMedia("(min-width: 981px)").matches) {
      closeEmployeeMenu();
    }
  });
  document.querySelectorAll("[data-employee-view]").forEach((button) => {
    button.addEventListener("click", () => setEmployeeView(button.dataset.employeeView));
  });
  document.getElementById("employeeRefreshButton")?.addEventListener("click", () => {
    renderEmployee();
    showToast("Orders refreshed.");
  });
  document.getElementById("employeeLogoutButton")?.addEventListener("click", () => {
    window.localStorage.removeItem(EMPLOYEE_KEYS.employeeSession);
    currentEmployee = null;
    showLogin();
  });
  window.addEventListener("storage", (event) => {
    if (event.key === EMPLOYEE_KEYS.adminOrders) {
      renderEmployee();
    }
  });
}

async function restoreSession() {
  const session = readStorage(EMPLOYEE_KEYS.employeeSession, null);
  if (!session?.email) return false;
  const account = await findEmployeeByEmail(session.email);
  if (!account || !isEmployeeActive(account)) return false;
  currentEmployee = account;
  return true;
}

function bindLogin() {
  const form = document.getElementById("employeeLoginForm");
  const status = document.getElementById("employeeLoginStatus");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "").trim();
    const account = await findEmployeeByEmail(email);

    if (!account || !isEmployeeActive(account) || !passwordMatches(account, password)) {
      status.textContent = "Invalid employee credentials or account is not active.";
      return;
    }

    currentEmployee = account;
    writeStorage(EMPLOYEE_KEYS.employeeSession, {
      id: account.id,
      email: account.email,
      name: account.name,
      loggedInAt: new Date().toISOString()
    });
    status.textContent = "";
    form.reset();
    showDashboard();
    renderEmployee();
    setEmployeeView("dashboard");
  });
}

async function boot() {
  ensureEmployeeSeed();
  bindLogin();
  bindNavigation();

  if (await restoreSession()) {
    showDashboard();
    renderEmployee();
    setEmployeeView("dashboard");
    return;
  }

  showLogin();
}

boot();
