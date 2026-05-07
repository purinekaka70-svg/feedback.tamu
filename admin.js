let cachedApplications = [];
const STORAGE_KEYS = {
  sellers: "tamu_market_sellers",
  sellerApplications: "tamu_market_seller_applications",
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

const orderStages = ["pending", "sourcing", "dispatch", "completed"];

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

  window.location.href = "./index.html";
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

function applications() {
  const localSellers = readStorage(STORAGE_KEYS.sellers, []);
  const merged = [...cachedApplications, ...localSellers];
  return merged.filter((application, index, list) =>
    list.findIndex((item) => item.id === application.id) === index
  );
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

async function updateApplicationStatus(applicationId, status) {
  const localSellers = readStorage(STORAGE_KEYS.sellers, []);
  const updatedSellers = localSellers.map((seller) =>
    seller.id === applicationId ? { ...seller, status, approvedAt: status === "approved" ? new Date().toISOString() : seller.approvedAt } : seller
  );
  if (updatedSellers.some((seller, index) => seller !== localSellers[index])) {
    writeStorage(STORAGE_KEYS.sellers, updatedSellers);
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
  document.getElementById("categoryForm").addEventListener("submit", (event) => {
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
  document.getElementById("adminLogoutButton").addEventListener("click", () => {
    window.localStorage.removeItem(STORAGE_KEYS.adminSession);
    window.location.href = "./index.html";
  });
}

async function boot() {
  if (!ensureAdminSession()) {
    return;
  }

  seedStorage();
  await loadData();
  initReveal();
  bindCategoryForm();
  bindLogout();
  renderOverview();
  renderApprovals();
  renderCategories();
  renderOrders();
}

boot();
