const STORAGE_KEYS = {
  sellerApplications: "tamu_market_seller_applications",
  categories: "tamu_market_categories",
  adminOrders: "tamu_market_admin_orders",
  adminSession: "tamu_market_admin_session"
};

const API_ENDPOINTS = {
  adminLogin: "./api/admin/login.php"
};

const DEMO_ORDER_IDS = new Set(["order-1001", "order-1002", "order-1003", "order-1004"]);

const defaultCategories = [
  "Beverages",
  "Drinks",
  "Groceries",
  "Fresh Foods",
  "Household",
  "Clothes",
  "Snacks",
  "Dairy",
  "Wholesale Packs"
];

const orderStages = ["pending", "sourcing", "dispatch", "completed"];
let categoryFormBound = false;
let logoutBound = false;
let loginBound = false;

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

function capitalize(value) {
  const text = String(value || "n/a");
  return text.charAt(0).toUpperCase() + text.slice(1);
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

function hasAdminSession() {
  return window.localStorage.getItem(STORAGE_KEYS.adminSession) === "active";
}

function setAdminView(isLoggedIn) {
  const loginView = document.getElementById("adminLoginView");
  const dashboardView = document.getElementById("adminDashboardView");
  const logoutButton = document.getElementById("adminLogoutButton");
  if (!loginView || !dashboardView || !logoutButton) {
    return;
  }

  loginView.classList.toggle("is-hidden", isLoggedIn);
  dashboardView.classList.toggle("is-hidden", !isLoggedIn);
  logoutButton.classList.toggle("is-hidden", !isLoggedIn);
}

async function submitAdminAccess(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const status = document.getElementById("adminAccessStatus");
  const formData = new FormData(form);
  const username = String(formData.get("username")).trim();
  const password = String(formData.get("password"));

  if (!username || !password) {
    status.textContent = "Enter admin email and password.";
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
      window.localStorage.setItem(STORAGE_KEYS.adminSession, "active");
      status.textContent = "Login successful. Loading dashboard...";
      window.setTimeout(() => {
        activateDashboard();
      }, 280);
      return;
    }

    status.textContent = data && data.message ? data.message : "Invalid admin credentials.";
  } catch (error) {
    status.textContent = "Could not reach admin login service.";
  }
}

function bindAdminAccessForm() {
  const form = document.getElementById("adminAccessForm");
  if (!form || loginBound) {
    return;
  }

  form.addEventListener("submit", submitAdminAccess);
  loginBound = true;
}

function applications() {
  return readStorage(STORAGE_KEYS.sellerApplications, []);
}

function categories() {
  const stored = readStorage(STORAGE_KEYS.categories, defaultCategories);
  return [...new Set([...defaultCategories, ...stored])];
}

function orders() {
  const currentOrders = readStorage(STORAGE_KEYS.adminOrders, []);
  const cleanOrders = currentOrders.filter((order) => !DEMO_ORDER_IDS.has(order.id));
  if (cleanOrders.length !== currentOrders.length) {
    writeStorage(STORAGE_KEYS.adminOrders, cleanOrders);
  }

  return cleanOrders;
}

function renderOverview() {
  const allApplications = applications();
  const allOrders = orders();
  const pendingApprovals = allApplications.filter((item) => item.status === "pending").length;
  const activeOrders = allOrders.filter((item) => item.status !== "completed").length;
  const dispatchOrders = allOrders.filter((item) => item.status === "dispatch").length;

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
      <span class="stat-label">Ready for dispatch</span>
      <strong>${dispatchOrders}</strong>
    </article>
  `;
}

function updateApplicationStatus(applicationId, status) {
  const nextApplications = applications().map((application) =>
    application.id === applicationId ? { ...application, status } : application
  );
  writeStorage(STORAGE_KEYS.sellerApplications, nextApplications);
  renderOverview();
  renderApprovals();
  showToast(`Application ${status}.`, status === "approved" ? "success" : "warn");
}

function renderApprovals() {
  const container = document.getElementById("approvalList");
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
      const cardText = application.cardAccount ? ` | Card: ${application.cardAccount}` : "";
      return `
        <article class="list-card">
          <div class="section-head">
            <div>
              <strong>${application.storeName}</strong>
              <p class="tiny">${capitalize(application.businessType || "seller")} | ${application.location || "Location pending"}</p>
            </div>
            <span class="status-pill status-pill--${application.status}">${capitalize(application.status)}</span>
          </div>
          <p>Owner: ${application.ownerName || "-"} | Phone: ${application.phone || "-"}</p>
          <p class="tiny">Payments: ${paymentOptions.join(", ") || "M-Pesa, Cash on Delivery"}${tillText}${pochiText}${cardText}</p>
          <p class="tiny">Pickup: ${application.latitude || "-"}, ${application.longitude || "-"}</p>
          <div class="button-row">
            <button class="button button-primary button-small" data-application-action="approved" data-application-id="${application.id}" type="button">Approve</button>
            <button class="button button-outline button-small" data-application-action="rejected" data-application-id="${application.id}" type="button">Reject</button>
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

    const currentIndex = orderStages.indexOf(order.status);
    const nextStatus = orderStages[Math.min(currentIndex + 1, orderStages.length - 1)];
    return { ...order, status: nextStatus };
  });

  writeStorage(STORAGE_KEYS.adminOrders, nextOrders);
  renderOverview();
  renderOrders();
  showToast("Order moved to the next stage.");
}

function renderOrders() {
  const container = document.getElementById("orderBoard");

  container.innerHTML = orderStages
    .map((stage) => {
      const stageOrders = orders().filter((order) => order.status === stage);
      const cards = stageOrders.length
        ? stageOrders
            .map(
              (order) => `
                <article class="order-card">
                  <div class="section-head">
                    <strong>${order.id}</strong>
                    <span class="status-pill status-pill--${order.status}">${capitalize(order.status)}</span>
                  </div>
                  <p>${order.customer} | ${order.storeName}</p>
                  <p class="tiny">${order.buyerLocation || "Buyer location pending"} | ${order.paymentMethod || "Payment pending"}</p>
                  <p class="tiny">Payment status: ${capitalize((order.paymentStatus || "pending").replace("_", " "))}</p>
                  <p class="tiny">Delivery ${currency(order.deliveryFee || 0)} | Total ${currency(order.total)}</p>
                  ${
                    order.status !== "completed"
                      ? `<button class="button button-outline button-small" data-move-order="${order.id}" type="button">Move next</button>`
                      : ""
                  }
                </article>
              `
            )
            .join("")
        : '<div class="list-card">No orders in this stage.</div>';

      return `
        <section class="order-column">
          <div class="section-head">
            <h3>${capitalize(stage)}</h3>
            <span class="tiny">${stageOrders.length}</span>
          </div>
          ${cards}
        </section>
      `;
    })
    .join("");

  container.querySelectorAll("[data-move-order]").forEach((button) => {
    button.addEventListener("click", () => {
      moveOrder(button.dataset.moveOrder);
    });
  });
}

function bindCategoryForm() {
  const form = document.getElementById("categoryForm");
  if (!form || categoryFormBound) {
    return;
  }

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

  categoryFormBound = true;
}

function bindLogout() {
  const logoutButton = document.getElementById("adminLogoutButton");
  if (!logoutButton || logoutBound) {
    return;
  }

  logoutButton.addEventListener("click", () => {
    window.localStorage.removeItem(STORAGE_KEYS.adminSession);
    const loginForm = document.getElementById("adminAccessForm");
    const status = document.getElementById("adminAccessStatus");
    if (loginForm) {
      loginForm.reset();
    }
    if (status) {
      status.textContent = "";
    }
    setAdminView(false);
    showToast("Logged out.", "info");
  });

  logoutBound = true;
}

function activateDashboard() {
  seedStorage();
  setAdminView(true);
  initReveal();
  renderOverview();
  renderApprovals();
  renderCategories();
  renderOrders();
}

function boot() {
  initReveal();
  bindAdminAccessForm();
  bindCategoryForm();
  bindLogout();

  if (hasAdminSession()) {
    activateDashboard();
    return;
  }

  setAdminView(false);
}

boot();
