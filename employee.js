const EMPLOYEE_KEYS = {
  adminPhone: "tamu_market_admin_phone"
};

const DEFAULT_ADMIN_PHONES = ["0115613332", "0116860686", "0759280343"];
const DEFAULT_ADMIN_PHONE = DEFAULT_ADMIN_PHONES[0];

const employeeViewMeta = {
  dashboard: "Dashboard",
  orders: "Orders",
  notifications: "Notifications",
  maps: "Maps",
  delivered: "Delivered Orders",
  customerChats: "Customer Chats",
  adminChats: "Admin Chats",
  settings: "Settings"
};

const EMPLOYEE_PROFILE_COLLECTIONS = ["employees", "marketEmployees", "market_employees", "deliveryEmployees", "delivery_employees", "staff", "users"];
const KENYA_COUNTIES = [
  "mombasa", "kwale", "kilifi", "tana river", "lamu", "taita taveta",
  "garissa", "wajir", "mandera", "marsabit", "isiolo", "meru",
  "tharaka nithi", "embu", "kitui", "machakos", "makueni", "nyandarua",
  "nyeri", "kirinyaga", "muranga", "kiambu", "turkana", "west pokot",
  "samburu", "trans nzoia", "uasin gishu", "elgeyo marakwet", "nandi",
  "baringo", "laikipia", "nakuru", "narok", "kajiado", "kericho",
  "bomet", "kakamega", "vihiga", "bungoma", "busia", "siaya", "kisumu",
  "homa bay", "migori", "kisii", "nyamira", "nairobi"
];

const COUNTY_ALIASES = {
  "taita-taveta": "taita taveta",
  "elgeyo-marakwet": "elgeyo marakwet",
  "homa-bay": "homa bay",
  "trans-nzoia": "trans nzoia",
  "tharaka-nithi": "tharaka nithi",
  "west-pokot": "west pokot"
};

let currentEmployee = null;
let activeEmployeeView = "dashboard";
let employeeMap = null;
let routeLayer = null;
let markerLayer = null;
let cachedEmployeeOrders = [];
let cachedBusinesses = [];
let employeeOrderUnsubscribe = null;
let activeMapOrderId = "";
const EMPLOYEE_PORTAL_URL = "https://ummeats.vercel.app/employee.html";

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

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeCounty(value) {
  const cleaned = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/county/g, "")
    .replace(/[^a-z0-9\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (COUNTY_ALIASES[cleaned] || cleaned)
    .replace(/[^a-z0-9]+/g, "");
}

function countyFromText(value) {
  const normalized = String(value || "")
    .toLowerCase()
    .replace(/county/g, "")
    .replace(/[^a-z0-9\s-]+/g, " ")
    .replace(/\s+/g, " ");
  return KENYA_COUNTIES.find((county) => normalized.includes(county)) || "";
}

function employeeCounty() {
  return currentEmployee?.county
    || currentEmployee?.location
    || currentEmployee?.assignedCounty
    || currentEmployee?.deliveryCounty
    || currentEmployee?.workCounty
    || currentEmployee?.area
    || currentEmployee?.region
    || "";
}

async function firebaseIdToken() {
  const user = window.firebase?.auth?.().currentUser;
  return user ? user.getIdToken() : "";
}

function orderCountyValues(order) {
  return [
    order.county,
    order.buyerCounty,
    order.locationCounty,
    order.buyerLocation,
    order.storeName,
    ...asArray(order.stores),
    ...asArray(order.items).flatMap((item) => [item.county, item.storeCounty, item.storeName])
  ].filter(Boolean);
}

function orderMatchesEmployeeCounty(order) {
  const target = normalizeCounty(countyFromText(employeeCounty()) || employeeCounty());
  if (!target) return false;
  return orderCountyValues(order).some((value) => {
    const derived = normalizeCounty(countyFromText(value));
    const normalized = normalizeCounty(value);
    return normalized === target
      || normalized.includes(target)
      || Boolean(derived && (derived === target || target.includes(derived)));
  });
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

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
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

function firebaseConfig() {
  if (window.tamuFirebaseConfig) {
    return window.tamuFirebaseConfig;
  }
  return readStorage("tamu_market_firebase_config", null);
}

async function loadFirebaseConfig() {
  const existing = firebaseConfig();
  if (existing?.apiKey && existing?.projectId) {
    return existing;
  }

  try {
    const response = await fetch("./api/firebase/config.php", { cache: "no-store" });
    const result = await response.json().catch(() => ({}));
    if (response.ok && result.ok && result.config?.apiKey && result.config?.projectId) {
      window.tamuFirebaseConfig = result.config;
      return result.config;
    }
  } catch (error) {
    return null;
  }

  return null;
}

async function ensureFirebaseApp() {
  const config = await loadFirebaseConfig();
  if (!config || !window.firebase?.auth || !window.firebase?.firestore) {
    return {
      ok: false,
      message: "Firebase Auth is not configured. Add firebase-config.js or set TAMU_FIREBASE_* server variables."
    };
  }

  if (!window.firebase.apps.length) {
    window.firebase.initializeApp(config);
  }

  return { ok: true };
}

async function apiPayload(response) {
  const raw = await response.text().catch(() => "");
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return { message: raw.trim().slice(0, 180) };
  }
}

async function employeeRecordForFirebaseUser(user) {
  if (!user?.uid) {
    return null;
  }

  const token = await user.getIdToken().catch(() => "");
  if (token) {
    try {
      const response = await fetch("./api/employee/session.php", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` }
      });
      const result = await apiPayload(response);
      if (response.ok && result.ok && result.employee) {
        return {
          ...result.employee,
          uid: result.employee.uid || user.uid,
          email: result.employee.email || user.email
        };
      }
      const error = new Error(result.message || "Employee backend login failed.");
      error.employeeSessionDenied = true;
      throw error;
    } catch (error) {
      if (error.employeeSessionDenied || (error.message && (
        error.message.includes("not allowed")
        || error.message.includes("not approved")
        || error.message.includes("assigned county")
        || error.message.includes("role is not allowed")
        || error.message.includes("inactive")
      ))) {
        throw error;
      }
      throw new Error("Employee backend login failed. Check Firebase Admin and Supabase configuration.");
    }
  }

  const normalizeEmployeeRecord = (id, data = {}, collection = "employees") => ({
    id,
    sourceCollection: collection,
    ...data,
    uid: data.uid || data.authUid || data.firebaseUid || data.firebaseId || data.userId || user.uid,
    email: data.email || data.employeeEmail || user.email,
    name: data.name || data.displayName || data.employeeName || data.fullName || user.displayName || user.email,
    role: String(data.role || data.accountType || data.userType || "employee").toLowerCase(),
    county: data.county
      || data.assignedCounty
      || data.locationCounty
      || data.deliveryCounty
      || data.workCounty
      || data.countyName
      || data.assignedLocation
      || data.location
      || data.area
      || data.region
      || "All",
    assignedCounty: data.assignedCounty || data.county || data.location || "All",
    location: data.location || data.county || data.assignedCounty || "All",
    status: data.status || "approved",
    active: data.active !== false,
    approved: data.approved !== false
  });

  try {
    const db = window.firebase.firestore();
    const docIds = [user.uid, user.email, String(user.email || "").toLowerCase()].filter(Boolean);
    const lookupQueries = [
      ["uid", user.uid],
      ["authUid", user.uid],
      ["firebaseUid", user.uid],
      ["firebaseId", user.uid],
      ["userId", user.uid],
      ["email", user.email],
      ["email", String(user.email || "").toLowerCase()],
      ["employeeEmail", user.email],
      ["employeeEmail", String(user.email || "").toLowerCase()]
    ].filter(([, value]) => value);

    for (const collectionName of EMPLOYEE_PROFILE_COLLECTIONS) {
      const employeeCollection = db.collection(collectionName);
      for (const docId of docIds) {
        const directDoc = await employeeCollection.doc(docId).get();
        if (directDoc.exists) {
          return normalizeEmployeeRecord(directDoc.id, directDoc.data(), collectionName);
        }
      }

      for (const [field, value] of lookupQueries) {
        const snapshot = await employeeCollection.where(field, "==", value).limit(1).get();
        if (!snapshot.empty) {
          const doc = snapshot.docs[0];
          return normalizeEmployeeRecord(doc.id, doc.data(), collectionName);
        }
      }
    }
  } catch (error) {
    // Fall back to the authenticated Firebase user below.
  }

  return normalizeEmployeeRecord(user.uid || user.email, {
    uid: user.uid,
    email: user.email,
    name: user.displayName || user.email || "Employee",
    role: "employee",
    status: "approved",
    active: true,
    approved: true,
    county: "All"
  }, "firebaseAuth");
}

function isEmployeeActive(account) {
  const role = String(account?.role || account?.accountType || account?.userType || "employee").toLowerCase();
  const status = String(account?.status || "").toLowerCase();
  const inactive = account?.active === false
    || account?.disabled === true
    || account?.blocked === true
    || ["inactive", "disabled", "rejected", "blocked", "suspended"].includes(status);
  const explicitlyRejected = account?.approved === false || account?.verified === false;
  const approved = !explicitlyRejected
    && (account?.approved === true
      || account?.verified === true
      || account?.active === true
      || ["approved", "active", "verified", "enabled", "accepted"].includes(status)
      || (!status && account?.approved === undefined && account?.verified === undefined));
  const employeeRole = ["employee", "delivery", "delivery_employee", "driver", "rider", "courier"].includes(role)
    || role.includes("employee")
    || role.includes("delivery");
  return !inactive && approved && employeeRole && Boolean(account?.county || account?.location || account?.assignedCounty || account?.deliveryCounty || account?.workCounty || account?.area || account?.region);
}

function employeeLoginErrorMessage(error) {
  const code = String(error?.code || "");
  if (code.includes("user-not-found")) {
    return "No Firebase Auth employee exists for this email. The employee must be registered in the same Firebase project.";
  }
  if (code.includes("wrong-password") || code.includes("invalid-credential") || code.includes("invalid-login-credentials")) {
    return "Wrong employee email or password in Firebase Auth.";
  }
  if (code.includes("too-many-requests")) {
    return "Firebase temporarily blocked this email after too many failed attempts. Wait a few minutes or use Reset Firebase password.";
  }
  if (code.includes("network-request-failed")) {
    return "Firebase login network failed. Check internet connection and Firebase config.";
  }
  if (code.includes("unauthorized-continue-uri") || code.includes("unauthorized-domain")) {
    return "Firebase rejected the reset link domain. Add ummeats.vercel.app to Firebase Authentication authorized domains.";
  }
  return error?.message || "Invalid employee credentials or Firebase Auth failed.";
}

async function sendEmployeePasswordReset(email) {
  const firebase = await ensureFirebaseApp();
  if (!firebase.ok) {
    return firebase;
  }

  if (!email) {
    return { ok: false, message: "Enter the employee email first, then reset the password." };
  }

  try {
    await window.firebase.auth().sendPasswordResetEmail(email, {
      url: EMPLOYEE_PORTAL_URL,
      handleCodeInApp: false
    });
    return { ok: true, message: "Password reset email sent. Check the employee inbox, set the new password, then return to the employee portal." };
  } catch (error) {
    return { ok: false, message: employeeLoginErrorMessage(error) };
  }
}

async function loadEmployeeOrders() {
  if (!currentEmployee) {
    cachedEmployeeOrders = [];
    return { ok: false, message: "No employee session is active." };
  }

  try {
    const token = await firebaseIdToken();
    if (!token) {
      cachedEmployeeOrders = [];
      return { ok: false, message: "Firebase employee session expired. Login again." };
    }
    const [orderRes, marketRes] = await Promise.all([
      fetch(`./api/employee/orders.php?county=${encodeURIComponent(employeeCounty())}`, {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` }
      }),
      fetch('./api/marketplace/list.php', { cache: 'no-store' })
    ]);
    const orderData = await apiPayload(orderRes);
    const marketData = await apiPayload(marketRes);
    if (!orderRes.ok || !orderData.ok) {
      cachedEmployeeOrders = [];
      return {
        ok: false,
        message: orderData.message || `Employee orders request failed (${orderRes.status}).`
      };
    }
    cachedEmployeeOrders = mergeOrders(cachedEmployeeOrders, orderData.orders || []);
    cachedBusinesses = marketRes.ok && marketData.ok ? (marketData.businesses || []) : [];
    return { ok: true };
  } catch (error) {
    cachedEmployeeOrders = orders();
    cachedBusinesses = [];
    return {
      ok: false,
      message: error?.message || "Employee orders could not be loaded."
    };
  }
}

async function signInEmployee(email, password) {
  const firebase = await ensureFirebaseApp();
  if (!firebase.ok) {
    return firebase;
  }

  try {
    await window.firebase.auth().setPersistence(window.firebase.auth.Auth.Persistence.LOCAL);
    const credential = await window.firebase.auth().signInWithEmailAndPassword(email, password);
    const user = credential.user;
    const account = await employeeRecordForFirebaseUser(user);

    if (!isEmployeeActive(account)) {
      await window.firebase.auth().signOut();
      return { ok: false, message: "Firebase login worked, but this account is not allowed as an employee. Add role employee/delivery, active or approved status, and county/location." };
    }

    return { ok: true, account };
  } catch (error) {
    return { ok: false, message: employeeLoginErrorMessage(error) };
  }
}

function showLogin() {
  closeEmployeeMenu();
  document.body.classList.add("employee-auth-only");
  document.body.classList.remove("employee-dashboard-active");
  document.getElementById("employeeLoginView")?.classList.remove("is-hidden");
  document.getElementById("employeeDashboardView")?.classList.add("is-hidden");
}

function showDashboard() {
  document.body.classList.remove("employee-auth-only");
  document.body.classList.add("employee-dashboard-active");
  document.getElementById("employeeLoginView")?.classList.add("is-hidden");
  document.getElementById("employeeDashboardView")?.classList.remove("is-hidden");
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

function normalizeOrder(order) {
  const items = asArray(order.items).map(normalizeOrderItem);
  const subtotal = Number(order.subtotal || items.reduce((sum, item) => sum + Number(item.lineTotal || item.total || 0), 0));
  const deliveryFee = Number(order.deliveryFee || order.deliveryPayment?.amount || 0);
  const total = Number(order.total || subtotal + deliveryFee);
  const paymentRef = order.paymentRef || order.mpesaReference || order.deliveryPayment?.reference || "";
  return {
    ...order,
    id: order.id || order.publicId || `order-${Date.now()}`,
    userId: order.userId || order.customerId || order.phone || "guest",
    customer: order.customer || order.customerName || "Customer",
    phone: order.phone || order.customerPhone || order.mpesaNumber || "",
    buyerLocation: order.buyerLocation || order.location || "Customer location pending",
    buyerLatitude: Number(order.buyerLatitude || order.buyer_latitude || 0),
    buyerLongitude: Number(order.buyerLongitude || order.buyer_longitude || 0),
    county: order.county || order.buyerCounty || order.locationCounty || "",
    paymentRef,
    mpesaReference: order.mpesaReference || paymentRef,
    paymentStatus: order.paymentStatus || order.payment_status || "pending",
    paymentMethod: order.paymentMethod || order.payment_method || "",
    routeBreakdown: asArray(order.routeBreakdown || order.route_breakdown),
    notes: order.notes || "",
    status: String(order.status || "pending_payment").toLowerCase(),
    deliveryStatus: String(order.deliveryStatus || order.status || "pending").toLowerCase(),
    assignedEmployeeId: order.assignedEmployeeId || "",
    assignedEmployeeEmail: order.assignedEmployeeEmail || "",
    assignedEmployeeName: order.assignedEmployeeName || "",
    items,
    businessPayments: asArray(order.businessPayments),
    subtotal,
    deliveryFee,
    total,
    createdAt: order.createdAt || order.created_at || ""
  };
}

function orders() {
  const normalized = cachedEmployeeOrders.map(normalizeOrder);
  const matched = normalized.filter(orderMatchesEmployeeCounty);
  return matched.length ? matched : normalized;
}

function saveOrders(nextOrders) {
  cachedEmployeeOrders = nextOrders.map(normalizeOrder);
}

function mergeOrders(current, incoming) {
  const byId = new Map();
  [...current, ...incoming].map(normalizeOrder).forEach((order) => {
    if (!order.id) return;
    const existing = byId.get(order.id) || {};
    const merged = { ...existing, ...order };
    ["assignedEmployeeId", "assignedEmployeeEmail", "assignedEmployeeName"].forEach((key) => {
      if (!merged[key] && existing[key]) {
        merged[key] = existing[key];
      }
    });
    if ((!merged.deliveryStatus || merged.deliveryStatus === "pending") && existing.deliveryStatus) {
      merged.deliveryStatus = existing.deliveryStatus;
    }
    byId.set(order.id, merged);
  });
  return [...byId.values()].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

function applications() {
  return cachedBusinesses;
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

function deliveredOrders() {
  return orders().filter((order) => order.status === "delivered" || order.deliveryStatus === "delivered");
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

function currentAdminPhone() {
  return window.localStorage.getItem(EMPLOYEE_KEYS.adminPhone) || DEFAULT_ADMIN_PHONE;
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

function formatOrderTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return "Time pending";
  }
  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

async function syncOrderToFirestore(order) {
  if (!currentEmployee || !window.firebase?.firestore || !order?.id) return;
  try {
    const db = window.firebase.firestore();
    await db.collection("deliveryOrders").doc(String(order.id)).set({
      ...order,
      county: employeeCounty(),
      countyKey: normalizeCounty(employeeCounty()),
      updatedAt: new Date().toISOString(),
      source: "tamu-express"
    }, { merge: true });
  } catch (error) {
    // Firestore sync is best-effort; API persistence remains the authority.
  }
}

async function updateOrder(orderId, patch) {
  const now = new Date().toISOString();
  const nextOrders = orders().map((order) => order.id === orderId
    ? { ...order, ...patch, updatedAt: now }
    : order);
  saveOrders(nextOrders);
  renderEmployee();
  const updatedOrder = orders().find((order) => order.id === orderId);
  await syncOrderToFirestore(updatedOrder);
  const token = await firebaseIdToken();
  fetch('./api/employee/orders.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ id: orderId, county: employeeCounty(), status: patch.status, deliveryStatus: patch.deliveryStatus })
  }).catch(() => {});
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
  const delivered = deliveredOrders();
  document.getElementById("employeeActiveBadge").textContent = `${active.length} active`;
  document.getElementById("employeeCountyLabel").textContent = `${employeeCounty()} county`;
  document.getElementById("employeeStats").innerHTML = `
    <article class="card stat-card"><span>Available</span><strong>${active.length}</strong></article>
    <article class="card stat-card"><span>Assigned</span><strong>${assigned.length}</strong></article>
    <article class="card stat-card"><span>Delivered</span><strong>${delivered.length}</strong></article>
    <article class="card stat-card"><span>County Orders</span><strong>${allOrders.length}</strong></article>
  `;
}

function orderCard(order, compact = false) {
  const customerMessage = `Hello ${order.customer || "Customer"}, I am delivering your Tamu Express order ${order.id}.`;
  const adminMessage = `Order ${order.id} update: ${order.customer || "Customer"} at ${order.buyerLocation || "location pending"}.`;
  const adminPhone = currentAdminPhone();
  const assigned = isAssignedToEmployee(order);
  const customerChat = whatsappLink(order.phone, customerMessage);
  const adminChat = whatsappLink(adminPhone, adminMessage);
  return `
    <article class="list-card order-card">
      <div class="section-head">
        <div>
          <strong>${escapeHtml(order.id)}</strong>
          <p class="tiny">${escapeHtml(order.customer || "Customer")} | ${escapeHtml(order.phone || "Phone pending")}</p>
        </div>
        <span class="status-pill status-pill--${escapeAttribute(order.deliveryStatus || order.status)}">${escapeHtml(capitalize(order.deliveryStatus || order.status))}</span>
      </div>
      <p class="tiny">${escapeHtml(order.buyerLocation || "Customer location pending")}</p>
      <p class="tiny">Placed: ${formatOrderTime(order.createdAt)}</p>
      <p class="tiny">${escapeHtml(orderItemsText(order))}</p>
      ${compact ? "" : `
        <p class="tiny">Payment ref: ${escapeHtml(order.mpesaReference || order.businessPayments?.[0]?.reference || "pending")} | Payment ${escapeHtml(capitalize(order.paymentStatus || "pending"))}</p>
        <p class="tiny">Delivery: ${currency(order.deliveryFee)} | Total: ${currency(order.total)}</p>
        <p class="tiny">GPS: ${Number.isFinite(orderLatitude(order)) && Number.isFinite(orderLongitude(order)) ? `${orderLatitude(order).toFixed(6)}, ${orderLongitude(order).toFixed(6)}` : "No customer coordinates yet"}</p>
        <p class="tiny">Assigned to: ${escapeHtml(order.assignedEmployeeName || "Not assigned")}</p>
      `}
      <div class="button-row">
        ${assigned ? "" : `<button class="button button-primary button-small" type="button" data-accept-order="${escapeAttribute(order.id)}">Accept Delivery</button>`}
        <button class="button button-outline button-small" type="button" data-status-order="${escapeAttribute(order.id)}" data-delivery-status="picked_up">Picked Up</button>
        <button class="button button-outline button-small" type="button" data-status-order="${escapeAttribute(order.id)}" data-delivery-status="on_the_way">On The Way</button>
        <button class="button button-primary button-small" type="button" data-status-order="${escapeAttribute(order.id)}" data-delivery-status="delivered">Delivered</button>
        <button class="button button-ghost button-small" type="button" data-open-order-map="${escapeAttribute(order.id)}">Open Map</button>
        <a class="button button-ghost button-small" href="${escapeAttribute(mapsUrl(order))}" target="_blank" rel="noopener">Google Maps</a>
        <a class="button button-ghost button-small" href="${escapeAttribute(customerChat)}" target="_blank" rel="noopener">WhatsApp Customer</a>
        <a class="button button-ghost button-small" href="${escapeAttribute(adminChat)}" target="_blank" rel="noopener">Chat Admin</a>
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
  container.querySelectorAll("[data-open-order-map]").forEach((button) => {
    button.addEventListener("click", () => {
      activeMapOrderId = button.dataset.openOrderMap;
      setEmployeeView("maps");
      renderMap();
      document.getElementById("employeeMap")?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });
}

function renderOrderLists() {
  const available = activeDeliveryOrders().slice().reverse();
  const assigned = assignedOrders().slice().reverse();
  const delivered = deliveredOrders().slice().reverse();
  const orderContainer = document.getElementById("employeeOrderList");
  const deliveredContainer = document.getElementById("employeeDeliveredList");
  const previewContainer = document.getElementById("employeeAssignedPreview");

  orderContainer.innerHTML = available.length
    ? available.map((order) => orderCard(order)).join("")
    : '<div class="list-card">No active delivery orders yet.</div>';
  deliveredContainer.innerHTML = delivered.length
    ? delivered.map((order) => orderCard(order)).join("")
    : '<div class="list-card">Delivered orders in your county will appear here.</div>';
  previewContainer.innerHTML = assigned.slice(0, 4).length
    ? assigned.slice(0, 4).map((order) => orderCard(order, true)).join("")
    : '<div class="list-card">No assigned deliveries yet.</div>';

  [orderContainer, deliveredContainer, previewContainer].forEach(bindOrderActions);
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
          <strong>${escapeHtml(item.title)}</strong>
          <p class="tiny">${escapeHtml(item.detail)}</p>
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
  const selectedAdminPhone = currentAdminPhone();
  customerContainer.innerHTML = assigned.length
    ? assigned.map((order) => `
      <article class="mini-list-card">
        <div>
          <strong>${escapeHtml(order.customer || "Customer")}</strong>
          <p class="tiny">${escapeHtml(order.id)} | ${escapeHtml(order.phone || "Phone pending")}</p>
        </div>
        <a class="button button-primary button-small" href="${escapeAttribute(whatsappLink(order.phone, `Hello ${order.customer || "Customer"}, I am delivering your Tamu Express order ${order.id}.`))}" target="_blank" rel="noopener">WhatsApp</a>
      </article>
    `).join("")
    : '<div class="list-card">Customer chats appear after you accept a delivery.</div>';

  adminContainer.innerHTML = `
    <article class="mini-list-card">
      <div>
        <strong>Admin Dispatch</strong>
        <p class="tiny">Primary: ${escapeHtml(selectedAdminPhone)}</p>
        <p class="tiny">All admin numbers: ${DEFAULT_ADMIN_PHONES.join(" / ")}</p>
      </div>
      <a class="button button-primary button-small" href="${whatsappLink(selectedAdminPhone, "Hello Admin, I need help with a Tamu Express delivery.")}" target="_blank" rel="noopener">WhatsApp</a>
    </article>
    <div class="button-row">
      ${DEFAULT_ADMIN_PHONES.map((phone) => `<a class="button button-outline button-small" href="${whatsappLink(phone, "Hello Admin, I need help with a Tamu Express delivery.")}" target="_blank" rel="noopener">${phone}</a>`).join("")}
    </div>
  `;
}

function renderMap() {
  const mapElement = document.getElementById("employeeMap");
  if (!mapElement || !window.L) {
    document.getElementById("mapOrderDetails").innerHTML = '<div class="list-card">Map library is unavailable. Use the Open in Maps button for navigation.</div>';
    return;
  }

  const selectedOrder = activeMapOrderId ? orders().find((item) => String(item.id) === String(activeMapOrderId)) : null;
  const order = selectedOrder || assignedOrders().find((item) => item.status !== "delivered") || activeDeliveryOrders()[0] || orders()[0];
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
        <strong>${escapeHtml(order.id)}</strong>
        <p class="tiny">Customer location has no GPS coordinates yet. Location text: ${escapeHtml(order.buyerLocation || "pending")}</p>
      </div>
    `;
    return;
  }

  const store = findStorePoint(order);
  window.L.marker([lat, lng]).addTo(markerLayer).bindPopup(`${escapeHtml(order.customer || "Customer")}<br>${escapeHtml(order.buyerLocation || "")}`);
  if (store) {
    window.L.marker([store.lat, store.lng]).addTo(markerLayer).bindPopup(store.label);
    window.L.polyline([[store.lat, store.lng], [lat, lng]], { color: "#15803d", weight: 5, opacity: 0.8 }).addTo(routeLayer);
    employeeMap.fitBounds([[store.lat, store.lng], [lat, lng]], { padding: [34, 34] });
  } else {
    employeeMap.setView([lat, lng], 14);
  }

  document.getElementById("mapOrderDetails").innerHTML = `
    <article class="list-card">
      <strong>${escapeHtml(order.id)}</strong>
      <p class="tiny">${escapeHtml(order.customer || "Customer")} | ${escapeHtml(order.phone || "Phone pending")}</p>
      <p class="tiny">${escapeHtml(order.buyerLocation || "Customer location pending")}</p>
      <p class="tiny">Distance: ${escapeHtml(order.distanceText || order.routeBreakdown?.[0]?.distanceText || "Calculated during checkout")} | Delivery ${currency(order.deliveryFee)}</p>
    </article>
  `;
}

function renderSettings() {
  const form = document.getElementById("employeeSettingsForm");
  if (form && form.dataset.bound !== "true") {
    form.dataset.bound = "true";
    form.elements.adminPhone.value = currentAdminPhone();
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = String(new FormData(form).get("adminPhone") || "").trim();
      window.localStorage.setItem(EMPLOYEE_KEYS.adminPhone, value || DEFAULT_ADMIN_PHONE);
      showToast("Settings saved.");
      renderChats();
    });
  }

  document.getElementById("employeeProfileDetails").innerHTML = `
    <article class="list-card">
      <strong>${escapeHtml(currentEmployee?.name || currentEmployee?.email || "Employee")}</strong>
      <p class="tiny">${escapeHtml(currentEmployee?.email || "Email pending")} | ${escapeHtml(currentEmployee?.phone || "Phone pending")}</p>
      <p class="tiny">Role: ${escapeHtml(capitalize(currentEmployee?.role || "employee"))} | Status: ${escapeHtml(capitalize(currentEmployee?.status || "active"))}</p>
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

function subscribeEmployeeOrders() {
  if (!currentEmployee || !window.firebase?.firestore) return;
  if (employeeOrderUnsubscribe) {
    employeeOrderUnsubscribe();
    employeeOrderUnsubscribe = null;
  }

  try {
    const db = window.firebase.firestore();
    employeeOrderUnsubscribe = db.collection("deliveryOrders")
      .where("county", "==", employeeCounty())
      .onSnapshot((snapshot) => {
        const liveOrders = [];
        snapshot.forEach((doc) => liveOrders.push({ id: doc.id, ...doc.data() }));
        cachedEmployeeOrders = mergeOrders(cachedEmployeeOrders, liveOrders);
        renderEmployee();
      });
  } catch (error) {
    showToast("Live delivery sync is unavailable for this account.", "warn");
  }
}

function closeEmployeeMenu() {
  const sidebar = document.getElementById("employeeSidebar");
  const overlay = document.getElementById("employeeSidebarOverlay");
  const toggle = document.getElementById("employeeMenuToggle");
  sidebar?.classList.remove("is-open");
  overlay?.classList.remove("is-open");
  if (toggle) {
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open employee menu");
  }
  document.body.classList.remove("employee-menu-open");
}

function closeOtherMenusForEmployee() {
  document.querySelectorAll(".admin-sidebar.is-open, .seller-workspace-nav.is-open, .seller-sidebar[data-open='true']")
    .forEach((menu) => {
      menu.classList.remove("is-open");
      if (menu.dataset.open) {
        menu.dataset.open = "false";
      }
    });
  document.querySelectorAll(".admin-sidebar-overlay.is-open, .seller-menu-overlay.is-open, .seller-sidebar-overlay.is-open")
    .forEach((overlay) => overlay.classList.remove("is-open"));
  document.querySelectorAll("#adminMenuToggle, #sellerWorkspaceToggle, .seller-menu-toggle")
    .forEach((button) => button.setAttribute("aria-expanded", "false"));
  document.body.classList.remove("admin-menu-open", "seller-menu-open", "legacy-seller-menu-open");
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
  const closeButton = document.getElementById("employeeMenuClose");
  const sidebar = document.getElementById("employeeSidebar");
  const overlay = document.getElementById("employeeSidebarOverlay");
  if (toggle?.dataset.bound === "true") {
    return;
  }
  if (toggle) {
    toggle.dataset.bound = "true";
  }
  toggle?.addEventListener("click", () => {
    closeOtherMenusForEmployee();
    const isOpen = sidebar?.classList.toggle("is-open");
    overlay?.classList.toggle("is-open", Boolean(isOpen));
    toggle.setAttribute("aria-expanded", String(isOpen));
    toggle.setAttribute("aria-label", isOpen ? "Close employee menu" : "Open employee menu");
    document.body.classList.toggle("employee-menu-open", isOpen);
  });
  closeButton?.addEventListener("click", closeEmployeeMenu);
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
  document.getElementById("employeeRefreshButton")?.addEventListener("click", async () => {
    const result = await loadEmployeeOrders();
    renderEmployee();
    showToast(result?.ok ? "Orders refreshed." : result?.message || "Orders could not be refreshed.", result?.ok ? "success" : "warn");
  });
  document.getElementById("employeeLogoutButton")?.addEventListener("click", async () => {
    if (employeeOrderUnsubscribe) {
      employeeOrderUnsubscribe();
      employeeOrderUnsubscribe = null;
    }
    if (window.firebase?.auth) {
      await window.firebase.auth().signOut().catch(() => {});
    }
    await fetch("./api/auth/logout.php", { method: "POST" }).catch(() => {});
    currentEmployee = null;
    showLogin();
  });
  window.setInterval(async () => {
    if (!currentEmployee) return;
    await loadEmployeeOrders();
    cachedEmployeeOrders.forEach(syncOrderToFirestore);
    renderEmployee();
  }, 12000);
}

async function restoreSession() {
  const firebase = await ensureFirebaseApp();
  if (!firebase.ok) {
    return false;
  }

  const user = await new Promise((resolve) => {
    const unsubscribe = window.firebase.auth().onAuthStateChanged((nextUser) => {
      unsubscribe();
      resolve(nextUser);
    });
  });

  if (!user) {
    return false;
  }

  const account = await employeeRecordForFirebaseUser(user);
  if (!isEmployeeActive(account)) {
    await window.firebase.auth().signOut().catch(() => {});
    return false;
  }

  currentEmployee = account;
  subscribeEmployeeOrders();
  await loadEmployeeOrders();
  return true;
}

function bindLogin() {
  const form = document.getElementById("employeeLoginForm");
  const status = document.getElementById("employeeLoginStatus");
  const resetButton = document.getElementById("employeeResetPasswordButton");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "").trim();
    const result = await signInEmployee(email, password);

    if (!result.ok) {
      status.textContent = result.message;
      return;
    }

    const account = result.account;
    currentEmployee = account;
    status.textContent = "";
    form.reset();
    showDashboard();
    subscribeEmployeeOrders();
    await loadEmployeeOrders();
    cachedEmployeeOrders.forEach(syncOrderToFirestore);
    renderEmployee();
    setEmployeeView("dashboard");
  });

  resetButton?.addEventListener("click", async () => {
    const emailInput = document.getElementById("employeeEmail");
    const email = String(emailInput?.value || "").trim();
    resetButton.disabled = true;
    status.textContent = "Sending reset email...";
    const result = await sendEmployeePasswordReset(email);
    status.textContent = result.message;
    resetButton.disabled = false;
  });
}

async function boot() {
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
