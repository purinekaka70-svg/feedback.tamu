const STORAGE_KEYS = {
  sellers: "tamu_market_sellers",
  currentSeller: "tamu_market_current_seller",
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

function initMap() {
  const defaultLat = -1.2921;
  const defaultLng = 36.8219;

  map = L.map("locationMap").setView([defaultLat, defaultLng], 10);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors"
  }).addTo(map);

  map.on("click", function (e) {
    const { lat, lng } = e.latlng;
    if (marker) {
      marker.setLatLng([lat, lng]);
    } else {
      marker = L.marker([lat, lng]).addTo(map);
    }
    document.getElementById("latitude").value = lat.toFixed(6);
    document.getElementById("longitude").value = lng.toFixed(6);
  });

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(function (position) {
      const { latitude, longitude } = position.coords;
      map.setView([latitude, longitude], 15);
    });
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

  document.body.classList.add("seller-dashboard-active");
  document.getElementById("sellerAuthSection").classList.add("is-hidden");
  document.getElementById("sellerDashboard").classList.remove("is-hidden");
  document.getElementById("registrationForm").classList.add("is-hidden");
  document.getElementById("loginForm").classList.add("is-hidden");
  document.getElementById("formTitle").textContent = "Seller Dashboard";
  document.getElementById("sellerWelcomeTitle").textContent = `${seller.storeName || "Your store"} dashboard`;

  renderCounts();
  renderProducts();
  renderOffers();
  renderOrders();
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

function sellers() {
  return readStorage(STORAGE_KEYS.sellers, []);
}

function currentSeller() {
  return readStorage(STORAGE_KEYS.currentSeller, null);
}

function setCurrentSeller(seller) {
  if (!seller) {
    window.localStorage.removeItem(STORAGE_KEYS.currentSeller);
    return;
  }
  writeStorage(STORAGE_KEYS.currentSeller, seller);
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

function sellerOrders(seller) {
  return orders().filter((order) => {
    if (order.sellerId === seller.id) {
      return true;
    }

    if (Array.isArray(order.items)) {
      return order.items.some((item) => item.sellerId === seller.id);
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
  document.getElementById("orderCount").textContent = sellerOrderList.filter((order) => order.paymentStatus !== "paid").length;
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
      <article class="list-card">
        <div class="seller-product-media">
          ${product.productImage ? `<img src="${product.productImage}" alt="${product.productName}" loading="lazy">` : product.productCategory}
        </div>
        <div class="section-head">
          <strong>${product.productName}</strong>
          <span class="status-pill status-pill--approved">${product.productCategory}</span>
        </div>
        <p>${product.productStock}</p>
        <p class="tiny">${currency(product.productPrice)} ${product.productOffer ? `| ${product.productOffer}` : ''}</p>
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

  const sellerOffers = offers().filter((offer) => offer.sellerId === seller.id).slice().reverse();
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
      const offer = offers().find((item) => item.id === button.dataset.editOffer);
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
      const remaining = offers().filter((item) => item.id !== button.dataset.deleteOffer);
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
      const status = order.paymentStatus === "paid" ? "paid" : "pending";
      return `
      <article class="list-card">
        <div class="section-head">
          <strong>${order.id}</strong>
          <span class="status-pill status-pill--${status === "paid" ? "approved" : "pending"}">
            ${status === "paid" ? "Paid" : "Pending"}
          </span>
        </div>
        <p>${order.customer || "Customer"} | ${order.phone || ""}</p>
        <p class="tiny">${order.paymentMethod || "Payment method not specified"}</p>
        <p class="tiny">Total: ${currency(order.total || 0)}</p>
        ${status !== "paid" ? `<div class="button-row"><button class="button button-primary button-small" data-mark-paid="${order.id}" type="button">Mark as Paid</button></div>` : ""}
      </article>
    `;
    })
    .join("");

  container.querySelectorAll("[data-mark-paid]").forEach((button) => {
    button.addEventListener("click", () => {
      const orderId = button.dataset.markPaid;
      const updated = orders().map((order) => {
        if (order.id !== orderId) return order;
        return { ...order, paymentStatus: "paid" };
      });
      writeStorage(STORAGE_KEYS.adminOrders, updated);
      renderCounts();
      renderOrders();
      showToast("Order marked as paid.", "success");
    });
  });
}

function buildSellerPayload(formData) {
  const email = String(formData.get("email")).trim().toLowerCase();
  const password = String(formData.get("password"));
  const latitude = parseFloat(formData.get("latitude"));
  const longitude = parseFloat(formData.get("longitude"));
  const paymentMethods = formData.getAll("paymentMethods");

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
      businessType: String(formData.get("businessType")).trim(),
      county: String(formData.get("county")).trim(),
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

function buildOfferPayload(formData) {
  const seller = currentSeller();
  if (!seller) {
    return { ok: false, message: "Please login before creating offers." };
  }

  return {
    ok: true,
    payload: {
      id: String(formData.get("offerId")).trim() || createId("offer"),
      sellerId: seller.id,
      storeName: seller.storeName,
      offerTitle: String(formData.get("offerTitle")).trim(),
      offerNote: String(formData.get("offerNote")).trim(),
      offerExpiry: String(formData.get("offerExpiry")).trim(),
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
  const nav = document.getElementById("sellerWorkspaceNav");
  const toggle = document.getElementById("sellerWorkspaceToggle");

  panels.forEach((panel) => {
    panel.classList.toggle("seller-dashboard-hidden", view !== "overview" && panel.dataset.sellerPanel !== view);
  });

  buttons.forEach((button) => {
    const active = button.dataset.sellerView === view;
    button.classList.toggle("button-primary", active);
    button.classList.toggle("button-ghost", !active);
  });

  if (nav && toggle) {
    nav.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
  }
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
    event.currentTarget.reset();
    toggleForms(false);
    showToast("Registration sent. Please wait for admin approval before logging in.", "success");
  });

  document.getElementById("sellerLoginForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email")).trim().toLowerCase();
    const password = String(formData.get("password"));

    const seller = sellers().find((item) => item.email === email && atob(item.password) === password);
    if (!seller) {
      document.getElementById("loginStatus").textContent = "Invalid email or password.";
      return;
    }

    if (seller.status !== "approved") {
      document.getElementById("loginStatus").textContent = "Your seller account is waiting for admin approval.";
      showToast("Your seller account is pending approval.", "warn");
      return;
    }

    setCurrentSeller(seller);
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
      ? offers().map((item) => (item.id === nextOffer.id ? { ...item, ...nextOffer, createdAt: item.createdAt || new Date().toISOString() } : item))
      : [...offers(), nextOffer];

    writeStorage(STORAGE_KEYS.sellerOffers, nextOffers);
    renderCounts();
    renderOffers();
    resetOfferForm();
    showToast(existing ? "Offer updated." : "Offer created.", "success");
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

  document.getElementById("sellerWorkspaceToggle").addEventListener("click", () => {
    const nav = document.getElementById("sellerWorkspaceNav");
    const isOpen = nav.classList.toggle("is-open");
    document.getElementById("sellerWorkspaceToggle").setAttribute("aria-expanded", String(isOpen));
  });

  document.querySelectorAll("[data-seller-view]").forEach((button) => {
    button.addEventListener("click", () => setSellerView(button.dataset.sellerView));
  });
}

function boot() {
  initReveal();
  initAdminTrigger();
  initMap();
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
