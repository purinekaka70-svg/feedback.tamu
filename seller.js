const STORAGE_KEYS = {
  sellerApplications: "tamu_market_seller_applications",
  sellerProducts: "tamu_market_seller_products",
  sellerOffers: "tamu_market_seller_offers",
  sellerDrafts: "tamu_market_seller_drafts",
  adminOrders: "tamu_market_admin_orders",
  activeSellerStore: "tamu_market_active_seller_store",
  adminSession: "tamu_market_admin_session"
};

const API_ENDPOINTS = {
  sellerApply: "./api/sellers/apply.php"
};

const DEMO_ORDER_IDS = new Set(["order-1001", "order-1002", "order-1003", "order-1004"]);

const ADMIN_CREDENTIALS = {
  username: "TamuAdmin@2025",
  password: "ummeats"
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
    return;
  }
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function currency(value) {
  return `KSh ${Number(value).toLocaleString()}`;
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function splitFocusCategories(value) {
  return String(value)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function storeLabel(store) {
  return store ? store.storeName || store.name || "Store" : "Store";
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

    if (clickCount === 3) {
      clickCount = 0;
      openModal();
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

function migrateLegacyProducts() {
  const currentProducts = readStorage(STORAGE_KEYS.sellerProducts, null);
  if (currentProducts !== null) {
    return;
  }

  const legacyDrafts = readStorage(STORAGE_KEYS.sellerDrafts, []);
  const convertedProducts = legacyDrafts.map((draft) => ({
    id: draft.id || createId("product"),
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

function sanitizeOrders() {
  const currentOrders = readStorage(STORAGE_KEYS.adminOrders, []);
  const cleanOrders = currentOrders.filter((order) => !DEMO_ORDER_IDS.has(order.id));
  if (cleanOrders.length !== currentOrders.length) {
    writeStorage(STORAGE_KEYS.adminOrders, cleanOrders);
  }

  return cleanOrders;
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
  return sanitizeOrders();
}

function activeStoreId() {
  const list = applications();
  if (!list.length) {
    return "";
  }

  const saved = window.localStorage.getItem(STORAGE_KEYS.activeSellerStore);
  if (saved && list.some((application) => application.id === saved)) {
    return saved;
  }

  const fallback = list[list.length - 1].id;
  window.localStorage.setItem(STORAGE_KEYS.activeSellerStore, fallback);
  return fallback;
}

function setActiveStoreId(storeId) {
  window.localStorage.setItem(STORAGE_KEYS.activeSellerStore, storeId);
}

function getStoreById(storeId) {
  return applications().find((application) => application.id === storeId);
}

function renderCounts() {
  const allApplications = applications();
  document.getElementById("pendingCount").textContent = String(
    allApplications.filter((application) => application.status === "pending").length
  );
  document.getElementById("approvedCount").textContent = String(
    allApplications.filter((application) => application.status === "approved").length
  );
  document.getElementById("draftCount").textContent = String(products().length);
}

function renderApplications() {
  const container = document.getElementById("sellerApplicationList");
  const summary = document.getElementById("sellerStatusSummary");
  const list = applications().slice().reverse();

  if (!list.length) {
    summary.textContent = "No application submitted yet.";
    container.innerHTML = '<div class="list-card">Your submitted applications will appear here.</div>';
    return;
  }

  const latest = list[0];
  summary.innerHTML = `
    <strong>${latest.storeName}</strong> is currently
    <span class="status-pill status-pill--${latest.status}">${capitalize(latest.status)}</span>.
  `;

  container.innerHTML = list
    .map((application) => {
      const paymentOptions = Array.isArray(application.paymentOptions) && application.paymentOptions.length
        ? application.paymentOptions
        : ["M-Pesa", "Cash on Delivery"];
      const minimumOrder = Number(application.minimumOrder || 0);
      const latitude = Number(application.latitude);
      const longitude = Number(application.longitude);

      return `
        <article class="list-card">
          <div class="section-head">
            <strong>${application.storeName}</strong>
            <span class="status-pill status-pill--${application.status}">${capitalize(application.status)}</span>
          </div>
          <p>${capitalize(application.businessType)} store in ${application.location}</p>
          <p class="tiny">Focus: ${application.categoryFocus} | Prep time: ${application.prepTime}</p>
          <p class="tiny">Minimum order: ${currency(minimumOrder)} | Payments: ${paymentOptions.join(", ")}</p>
          <p class="tiny">Pickup coordinates: ${Number.isFinite(latitude) ? latitude.toFixed(4) : "-"}, ${Number.isFinite(longitude) ? longitude.toFixed(4) : "-"}</p>
        </article>
      `;
    })
    .join("");
}

function syncStoreSelectOptions() {
  const stores = applications();
  const selectedStoreId = activeStoreId();
  const options = stores.length
    ? stores
        .map(
          (application) => `
            <option value="${application.id}">
              ${application.storeName} (${capitalize(application.status)})
            </option>
          `
        )
        .join("")
    : '<option value="">Submit a store application first</option>';

  ["workspaceStoreSelect", "productStoreSelect", "offerStoreSelect"].forEach((selectId) => {
    const select = document.getElementById(selectId);
    select.innerHTML = stores.length
      ? `<option value="">Choose your submitted store</option>${options}`
      : options;
    select.disabled = !stores.length;
  });

  if (stores.length) {
    document.getElementById("workspaceStoreSelect").value = selectedStoreId;
    if (!document.getElementById("productIdInput").value) {
      document.getElementById("productStoreSelect").value = selectedStoreId;
    }
    if (!document.getElementById("offerIdInput").value) {
      document.getElementById("offerStoreSelect").value = selectedStoreId;
    }
  }
}

function renderWorkspace() {
  const section = document.getElementById("sellerWorkspaceSection");
  const productSection = document.getElementById("sellerProductSection");
  const offerSection = document.getElementById("sellerOfferSection");
  const orderSection = document.getElementById("sellerOrderSection");
  const currentStore = getStoreById(activeStoreId());
  if (!applications().length) {
    section.classList.add("is-hidden");
    productSection.classList.add("is-hidden");
    offerSection.classList.add("is-hidden");
    orderSection.classList.add("is-hidden");
    return;
  }

  section.classList.remove("is-hidden");
  productSection.classList.remove("is-hidden");
  offerSection.classList.remove("is-hidden");
  orderSection.classList.remove("is-hidden");
  const workspaceStatus = document.getElementById("workspaceStatus");
  if (!currentStore) {
    workspaceStatus.textContent = "Choose a store to start managing products, offers, and orders.";
    return;
  }

  const paymentOptions = Array.isArray(currentStore.paymentOptions) && currentStore.paymentOptions.length
    ? currentStore.paymentOptions
    : ["M-Pesa", "Cash on Delivery"];

  workspaceStatus.innerHTML = `
    <strong>${currentStore.storeName}</strong><br>
    Status: ${capitalize(currentStore.status)} | Payments: ${paymentOptions.join(", ")}<br>
    ${currentStore.status === "approved"
      ? "This store can appear on the buyer side."
      : "This store is still hidden from buyers until admin approval."}
  `;
}

function resetProductForm() {
  const form = document.getElementById("sellerProductForm");
  form.reset();
  document.getElementById("productIdInput").value = "";
  document.getElementById("saveProductButton").textContent = "Save product";
  const selectedStoreId = activeStoreId();
  if (selectedStoreId) {
    document.getElementById("productStoreSelect").value = selectedStoreId;
  }
}

function resetOfferForm() {
  const form = document.getElementById("sellerOfferForm");
  form.reset();
  document.getElementById("offerIdInput").value = "";
  document.getElementById("saveOfferButton").textContent = "Save offer";
  const selectedStoreId = activeStoreId();
  if (selectedStoreId) {
    document.getElementById("offerStoreSelect").value = selectedStoreId;
  }
}

function renderProducts() {
  const container = document.getElementById("sellerProductList");
  const currentStoreId = activeStoreId();
  const list = currentStoreId
    ? products().filter((product) => product.storeId === currentStoreId).slice().reverse()
    : [];

  if (!list.length) {
    container.innerHTML = '<div class="list-card">No products yet for this store. Add your first product above.</div>';
    return;
  }

  container.innerHTML = list
    .map(
      (product) => `
        <article class="list-card">
          <div class="section-head">
            <strong>${product.productName}</strong>
            <span class="status-pill status-pill--approved">${product.productCategory}</span>
          </div>
          <p>${product.storeName || storeLabel(getStoreById(product.storeId))}</p>
          <p class="tiny">Price: ${currency(product.productPrice)} | ${product.productStock}</p>
          <p class="tiny">${product.productOffer || "No product offer note added."}</p>
          <div class="button-row">
            <button class="button button-outline button-small" data-edit-product="${product.id}" type="button">Update</button>
            <button class="button button-ghost button-small" data-delete-product="${product.id}" type="button">Delete</button>
          </div>
        </article>
      `
    )
    .join("");

  container.querySelectorAll("[data-edit-product]").forEach((button) => {
    button.addEventListener("click", () => {
      const product = products().find((entry) => entry.id === button.dataset.editProduct);
      if (!product) {
        return;
      }

      document.getElementById("productIdInput").value = product.id;
      document.getElementById("productStoreSelect").value = product.storeId;
      document.querySelector('[name="productName"]').value = product.productName;
      document.querySelector('[name="productCategory"]').value = product.productCategory;
      document.querySelector('[name="productPrice"]').value = product.productPrice;
      document.querySelector('[name="productStock"]').value = product.productStock;
      document.querySelector('[name="productDeal"]').value = product.productOffer || "";
      document.getElementById("saveProductButton").textContent = "Update product";
      showToast("Product loaded for updating.", "info");
    });
  });

  container.querySelectorAll("[data-delete-product]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextProducts = products().filter((product) => product.id !== button.dataset.deleteProduct);
      writeStorage(STORAGE_KEYS.sellerProducts, nextProducts);
      renderCounts();
      renderProducts();
      showToast("Product removed.", "warn");
    });
  });
}

function renderOffers() {
  const container = document.getElementById("sellerOfferList");
  const currentStoreId = activeStoreId();
  const list = currentStoreId
    ? offers().filter((offer) => offer.storeId === currentStoreId).slice().reverse()
    : [];

  if (!list.length) {
    container.innerHTML = '<div class="list-card">No offers yet for this store. Add your first offer above.</div>';
    return;
  }

  container.innerHTML = list
    .map(
      (offer) => `
        <article class="list-card">
          <div class="section-head">
            <strong>${offer.offerTitle}</strong>
            <span class="status-pill status-pill--pending">${offer.offerExpiry}</span>
          </div>
          <p>${offer.storeName || storeLabel(getStoreById(offer.storeId))}</p>
          <p class="tiny">${offer.offerNote}</p>
          <div class="button-row">
            <button class="button button-outline button-small" data-edit-offer="${offer.id}" type="button">Update</button>
            <button class="button button-ghost button-small" data-delete-offer="${offer.id}" type="button">Delete</button>
          </div>
        </article>
      `
    )
    .join("");

  container.querySelectorAll("[data-edit-offer]").forEach((button) => {
    button.addEventListener("click", () => {
      const offer = offers().find((entry) => entry.id === button.dataset.editOffer);
      if (!offer) {
        return;
      }

      document.getElementById("offerIdInput").value = offer.id;
      document.getElementById("offerStoreSelect").value = offer.storeId;
      document.querySelector('[name="offerTitle"]').value = offer.offerTitle;
      document.querySelector('[name="offerNote"]').value = offer.offerNote;
      document.querySelector('[name="offerExpiry"]').value = offer.offerExpiry;
      document.getElementById("saveOfferButton").textContent = "Update offer";
      showToast("Offer loaded for updating.", "info");
    });
  });

  container.querySelectorAll("[data-delete-offer]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextOffers = offers().filter((offer) => offer.id !== button.dataset.deleteOffer);
      writeStorage(STORAGE_KEYS.sellerOffers, nextOffers);
      renderOffers();
      showToast("Offer removed.", "warn");
    });
  });
}

function orderMatchesStore(order, store) {
  if (!store) {
    return false;
  }

  if (Array.isArray(order.items) && order.items.some((item) => item.storeId === store.id)) {
    return true;
  }

  if (Array.isArray(order.stores) && order.stores.some((entry) => entry === store.id || entry === store.storeName)) {
    return true;
  }

  return order.storeName === store.storeName;
}

function sellerOrderItems(order, storeId) {
  if (!Array.isArray(order.items)) {
    return [];
  }

  return order.items.filter((item) => item.storeId === storeId);
}

function sellerPaymentStatus(order, storeId) {
  if (order.sellerPaymentStatus && order.sellerPaymentStatus[storeId]) {
    return order.sellerPaymentStatus[storeId];
  }

  return order.paymentStatus || "pending";
}

function markOrderPaid(orderId, storeId) {
  const nextOrders = orders().map((order) => {
    if (order.id !== orderId) {
      return order;
    }

    const nextSellerPaymentStatus = { ...(order.sellerPaymentStatus || {}) };
    nextSellerPaymentStatus[storeId] = "paid";

    const relevantStoreIds = Array.isArray(order.items) && order.items.length
      ? [...new Set(order.items.map((item) => item.storeId))]
      : [storeId];

    const allPaid = relevantStoreIds.every((itemStoreId) => nextSellerPaymentStatus[itemStoreId] === "paid");
    return {
      ...order,
      sellerPaymentStatus: nextSellerPaymentStatus,
      paymentStatus: allPaid ? "paid" : "pending"
    };
  });

  writeStorage(STORAGE_KEYS.adminOrders, nextOrders);
  renderOrders();
  showToast("Order marked as paid for this store.");
}

function renderOrders() {
  const container = document.getElementById("sellerOrderList");
  const currentStore = getStoreById(activeStoreId());

  if (!currentStore) {
    container.innerHTML = '<div class="list-card">Register a business first to start receiving orders here.</div>';
    return;
  }

  const list = orders()
    .filter((order) => orderMatchesStore(order, currentStore))
    .slice()
    .reverse();

  if (!list.length) {
    container.innerHTML = '<div class="list-card">No orders yet for this store.</div>';
    return;
  }

  container.innerHTML = list
    .map((order) => {
      const matchingItems = sellerOrderItems(order, currentStore.id);
      const sellerAmount = matchingItems.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0);
      const paymentStatus = sellerPaymentStatus(order, currentStore.id);

      return `
        <article class="list-card">
          <div class="section-head">
            <strong>${order.id}</strong>
            <span class="status-pill status-pill--${paymentStatus === "paid" ? "approved" : "pending"}">
              ${paymentStatus === "paid" ? "Paid" : "Pending payment"}
            </span>
          </div>
          <p>${order.customer || "Buyer"}${order.phone ? ` | ${order.phone}` : ""}</p>
          <p class="tiny">${order.buyerLocation || "Delivery location pending"} | ${order.paymentMethod || "Payment method pending"}</p>
          <p class="tiny">Store amount: ${currency(sellerAmount)} | Order total: ${currency(order.total || 0)}</p>
          ${matchingItems.length
            ? matchingItems
                .map((item) => `<p class="tiny">${item.productName} x${item.quantity}</p>`)
                .join("")
            : '<p class="tiny">This order came from an older flow without item breakdown.</p>'}
          ${paymentStatus !== "paid"
            ? `<div class="button-row">
                <button class="button button-primary button-small" data-mark-paid="${order.id}" type="button">Mark as paid</button>
              </div>`
            : ""}
        </article>
      `;
    })
    .join("");

  container.querySelectorAll("[data-mark-paid]").forEach((button) => {
    button.addEventListener("click", () => {
      markOrderPaid(button.dataset.markPaid, currentStore.id);
    });
  });
}

function buildApplicationPayload(formData) {
  const paymentOptions = formData.getAll("paymentOptions");
  const latitude = Number(formData.get("latitude"));
  const longitude = Number(formData.get("longitude"));

  if (!paymentOptions.length) {
    return {
      ok: false,
      message: "Select at least one payment option."
    };
  }

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return {
      ok: false,
      message: "Enter valid pickup coordinates."
    };
  }

  return {
    ok: true,
    payload: {
      id: createId("seller"),
      storeName: String(formData.get("storeName")).trim(),
      businessType: String(formData.get("businessType")).trim(),
      ownerName: String(formData.get("ownerName")).trim(),
      phone: String(formData.get("phone")).trim(),
      location: String(formData.get("location")).trim(),
      categoryFocus: String(formData.get("categoryFocus")).trim(),
      minimumOrder: Number(formData.get("minimumOrder")),
      prepTime: String(formData.get("prepTime")).trim(),
      latitude,
      longitude,
      categoryList: splitFocusCategories(formData.get("categoryFocus")),
      paymentOptions,
      status: "pending",
      createdAt: new Date().toISOString()
    }
  };
}

function buildProductPayload(formData) {
  const store = getStoreById(String(formData.get("storeId")).trim());
  const productPrice = Number(formData.get("productPrice"));
  if (!store) {
    return {
      ok: false,
      message: "Choose the store you want to manage."
    };
  }

  if (!Number.isFinite(productPrice) || productPrice < 0) {
    return {
      ok: false,
      message: "Enter a valid product price."
    };
  }

  return {
    ok: true,
    payload: {
      id: String(formData.get("productId")).trim() || createId("product"),
      storeId: store.id,
      storeName: storeLabel(store),
      productName: String(formData.get("productName")).trim(),
      productCategory: String(formData.get("productCategory")).trim(),
      productPrice,
      productStock: String(formData.get("productStock")).trim(),
      productOffer: String(formData.get("productDeal")).trim(),
      updatedAt: new Date().toISOString()
    }
  };
}

function buildOfferPayload(formData) {
  const store = getStoreById(String(formData.get("storeId")).trim());
  if (!store) {
    return {
      ok: false,
      message: "Choose the store for this offer."
    };
  }

  return {
    ok: true,
    payload: {
      id: String(formData.get("offerId")).trim() || createId("offer"),
      storeId: store.id,
      storeName: storeLabel(store),
      offerTitle: String(formData.get("offerTitle")).trim(),
      offerNote: String(formData.get("offerNote")).trim(),
      offerExpiry: String(formData.get("offerExpiry")).trim(),
      updatedAt: new Date().toISOString()
    }
  };
}

function refreshSellerWorkspace() {
  renderCounts();
  renderApplications();
  syncStoreSelectOptions();
  renderWorkspace();
  renderProducts();
  renderOffers();
  renderOrders();
}

function bindForms() {
  document.getElementById("sellerApplicationForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const nextApplication = buildApplicationPayload(formData);

    if (!nextApplication.ok) {
      showToast(nextApplication.message, "warn");
      return;
    }

    const application = nextApplication.payload;
    writeStorage(STORAGE_KEYS.sellerApplications, [...applications(), application]);
    setActiveStoreId(application.id);
    event.currentTarget.reset();
    refreshSellerWorkspace();
    resetProductForm();
    resetOfferForm();

    const response = await postJson(API_ENDPOINTS.sellerApply, application);
    showToast(
      response.ok
        ? "Business registered and saved."
        : "Business registered locally. Backend sync will work when PHP is live.",
      response.ok ? "success" : "info"
    );
  });

  document.getElementById("sellerProductForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const nextProduct = buildProductPayload(formData);

    if (!nextProduct.ok) {
      showToast(nextProduct.message, "warn");
      return;
    }

    const product = nextProduct.payload;
    const currentProducts = products();
    const existingProduct = currentProducts.find((entry) => entry.id === product.id);
    const nextProducts = existingProduct
      ? currentProducts.map((entry) =>
          entry.id === product.id
            ? { ...entry, ...product, createdAt: entry.createdAt || new Date().toISOString() }
            : entry
        )
      : [...currentProducts, { ...product, createdAt: new Date().toISOString() }];

    writeStorage(STORAGE_KEYS.sellerProducts, nextProducts);
    refreshSellerWorkspace();
    resetProductForm();
    showToast(existingProduct ? "Product updated." : "Product saved.");
  });

  document.getElementById("sellerOfferForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const nextOffer = buildOfferPayload(formData);

    if (!nextOffer.ok) {
      showToast(nextOffer.message, "warn");
      return;
    }

    const offer = nextOffer.payload;
    const currentOffers = offers();
    const existingOffer = currentOffers.find((entry) => entry.id === offer.id);
    const nextOffers = existingOffer
      ? currentOffers.map((entry) =>
          entry.id === offer.id
            ? { ...entry, ...offer, createdAt: entry.createdAt || new Date().toISOString() }
            : entry
        )
      : [...currentOffers, { ...offer, createdAt: new Date().toISOString() }];

    writeStorage(STORAGE_KEYS.sellerOffers, nextOffers);
    renderOffers();
    resetOfferForm();
    showToast(existingOffer ? "Offer updated." : "Offer saved.");
  });
}

function bindWorkspaceActions() {
  document.getElementById("workspaceStoreSelect").addEventListener("change", (event) => {
    const storeId = event.target.value;
    if (!storeId) {
      return;
    }

    setActiveStoreId(storeId);
    syncStoreSelectOptions();
    renderWorkspace();
    renderProducts();
    renderOffers();
    renderOrders();
    resetProductForm();
    resetOfferForm();
  });

  document.getElementById("resetProductFormButton").addEventListener("click", () => {
    resetProductForm();
  });

  document.getElementById("resetOfferFormButton").addEventListener("click", () => {
    resetOfferForm();
  });
}

function boot() {
  migrateLegacyProducts();
  sanitizeOrders();
  initReveal();
  initAdminTrigger();
  bindForms();
  bindWorkspaceActions();
  refreshSellerWorkspace();
  resetProductForm();
  resetOfferForm();
}

boot();
