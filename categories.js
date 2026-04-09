let cachedApplications = [];
const STORAGE_KEYS = {
  cart: "tamu_market_cart",
  categories: "tamu_market_categories",
  sellerApplications: "tamu_market_seller_applications",
  sellerProducts: "tamu_market_seller_products",
  sellerOffers: "tamu_market_seller_offers",
  sellerDrafts: "tamu_market_seller_drafts",
  buyerProfile: "tamu_market_buyer_profile",
  adminSession: "tamu_market_admin_session"
};

const ADMIN_CREDENTIALS = {
  username: "TamuAdmin@2025",
  password: "ummeats"
};

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

const state = {
  selectedType: "all",
  selectedCategory: "all",
  focusedStoreId: "all",
  search: "",
  cart: readStorage(STORAGE_KEYS.cart, [])
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

function seedCategories() {
  if (!readStorage(STORAGE_KEYS.categories, null)) {
    writeStorage(STORAGE_KEYS.categories, defaultCategories);
  }
}

function migrateLegacyProducts() {
  const currentProducts = readStorage(STORAGE_KEYS.sellerProducts, null);
  if (currentProducts !== null) {
    return;
  }

  const legacyDrafts = readStorage(STORAGE_KEYS.sellerDrafts, []);
  const convertedProducts = legacyDrafts.map((draft) => ({
    id: draft.id,
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

function currency(value) {
  return `KSh ${Number(value).toLocaleString()}`;
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function normalizePaymentOptions(options) {
  const cleaned = Array.isArray(options)
    ? options.map((entry) => String(entry).trim()).filter(Boolean)
    : [];
  return cleaned.length ? cleaned : ["M-Pesa", "Cash on Delivery"];
}

function applications() {
  return cachedApplications;
}

async function loadMarketData() {
  const res = await fetch('./api/admin/applications.php?status=approved');
  const data = await res.json();
  if (data.ok) {
    cachedApplications = data.applications || [];
  }
}

function sellerProducts() {
  return readStorage(STORAGE_KEYS.sellerProducts, []);
}

function sellerOffers() {
  return readStorage(STORAGE_KEYS.sellerOffers, []);
}

function buyerProfile() {
  return readStorage(STORAGE_KEYS.buyerProfile, {
    latitude: "",
    longitude: ""
  });
}

function approvedStores() {
  return applications().filter((application) => application.status === "approved");
}

function getStore(storeId) {
  return approvedStores().find((store) => store.id === storeId);
}

function getProduct(productId) {
  return sellerProducts().find((product) => product.id === productId);
}

function currentCategories() {
  const storedCategories = readStorage(STORAGE_KEYS.categories, defaultCategories);
  const approvedStoreIds = new Set(approvedStores().map((store) => store.id));
  const liveCategories = sellerProducts()
    .filter((product) => approvedStoreIds.has(product.storeId))
    .map((product) => product.productCategory)
    .filter(Boolean);
  return ["all", ...new Set([...storedCategories, ...liveCategories])];
}

function visibleStores() {
  const query = state.search.toLowerCase();
  const products = sellerProducts();

  return approvedStores().filter((store) => {
    const matchesType = state.selectedType === "all" || store.businessType === state.selectedType;
    const productCategories = products
      .filter((product) => product.storeId === store.id)
      .map((product) => product.productCategory);
    const matchesCategory =
      state.selectedCategory === "all" || productCategories.includes(state.selectedCategory);
    const matchesSearch =
      !query ||
      store.storeName.toLowerCase().includes(query) ||
      store.location.toLowerCase().includes(query) ||
      productCategories.join(" ").toLowerCase().includes(query) ||
      products.some((product) => {
        if (product.storeId !== store.id) {
          return false;
        }

        return `${product.productName} ${product.productCategory}`.toLowerCase().includes(query);
      });

    return matchesType && matchesCategory && matchesSearch;
  });
}

function visibleProducts() {
  const allowedStoreIds = new Set(visibleStores().map((store) => store.id));
  const query = state.search.toLowerCase();

  return sellerProducts().filter((product) => {
    const inVisibleStore = allowedStoreIds.has(product.storeId);
    const matchesCategory =
      state.selectedCategory === "all" || product.productCategory === state.selectedCategory;
    const matchesFocusedStore =
      state.focusedStoreId === "all" || product.storeId === state.focusedStoreId;
    const matchesSearch =
      !query ||
      product.productName.toLowerCase().includes(query) ||
      product.productCategory.toLowerCase().includes(query) ||
      (product.productOffer || "").toLowerCase().includes(query);

    return inVisibleStore && matchesCategory && matchesFocusedStore && matchesSearch;
  });
}

function catalogOffers() {
  const approvedStoreIds = new Set(approvedStores().map((store) => store.id));
  const explicitOffers = sellerOffers()
    .filter((offer) => approvedStoreIds.has(offer.storeId))
    .map((offer) => ({
      id: offer.id,
      storeId: offer.storeId,
      title: offer.offerTitle,
      note: offer.offerNote,
      expires: offer.offerExpiry,
      productId: ""
    }));

  const productOffers = sellerProducts()
    .filter((product) => approvedStoreIds.has(product.storeId) && product.productOffer)
    .map((product) => ({
      id: `product-offer-${product.id}`,
      storeId: product.storeId,
      title: product.productName,
      note: product.productOffer,
      expires: "Store offer",
      productId: product.id
    }));

  return [...explicitOffers, ...productOffers];
}

function visibleOffers() {
  const allowedStoreIds = new Set(visibleStores().map((store) => store.id));
  const query = state.search.toLowerCase();

  return catalogOffers().filter((offer) => {
    const matchesStore = allowedStoreIds.has(offer.storeId);
    const matchesFocusedStore =
      state.focusedStoreId === "all" || offer.storeId === state.focusedStoreId;
    const matchesSearch =
      !query ||
      offer.title.toLowerCase().includes(query) ||
      offer.note.toLowerCase().includes(query);

    return matchesStore && matchesFocusedStore && matchesSearch;
  });
}

function haversineDistanceKm(from, to) {
  const toRadians = (value) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);

  const a =
    Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2) +
    Math.cos(fromLatitude) *
      Math.cos(toLatitude) *
      Math.sin(longitudeDelta / 2) *
      Math.sin(longitudeDelta / 2);

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buildDeliverySummary(cartItems, profile = buyerProfile()) {
  if (!cartItems.length) {
    return {
      subtotal: 0,
      fee: 0,
      label: currency(0)
    };
  }

  const subtotal = cartItems.reduce((sum, item) => {
    const product = getProduct(item.productId);
    return sum + (product ? product.productPrice * item.quantity : 0);
  }, 0);

  const latitude = Number(profile.latitude);
  const longitude = Number(profile.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return {
      subtotal,
      fee: 0,
      label: "Set location in cart"
    };
  }

  const buyerPoint = { latitude, longitude };
  const uniqueStoreIds = [...new Set(
    cartItems
      .map((item) => getProduct(item.productId))
      .filter(Boolean)
      .map((product) => product.storeId)
  )];

  const fee = uniqueStoreIds.reduce((sum, storeId) => {
    const store = getStore(storeId);
    if (!store) {
      return sum;
    }

    const distanceKm = haversineDistanceKm(buyerPoint, {
      latitude: Number(store.latitude),
      longitude: Number(store.longitude)
    });
    return sum + Math.max(120, Math.round((90 + distanceKm * 28) / 10) * 10);
  }, 0);

  return {
    subtotal,
    fee,
    label: currency(fee)
  };
}

function availableCheckoutMethods(cartItems) {
  const methodsByStore = [...new Set(
    cartItems
      .map((item) => getProduct(item.productId))
      .filter(Boolean)
      .map((product) => product.storeId)
  )]
    .map((storeId) => getStore(storeId))
    .filter(Boolean)
    .map((store) => normalizePaymentOptions(store.paymentOptions));

  if (!methodsByStore.length) {
    return [];
  }

  const first = methodsByStore[0];
  return first.filter((method) => methodsByStore.every((storeMethods) => storeMethods.includes(method)));
}

function sanitizeCart() {
  const validProducts = new Set(
    sellerProducts()
      .filter((product) => getStore(product.storeId))
      .map((product) => product.id)
  );

  const cleanCart = state.cart.filter((item) => validProducts.has(item.productId));
  if (cleanCart.length !== state.cart.length) {
    state.cart = cleanCart;
    writeStorage(STORAGE_KEYS.cart, cleanCart);
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

function addToCart(productId) {
  const product = getProduct(productId);
  if (!product || !getStore(product.storeId)) {
    showToast("This product is not available right now.", "warn");
    return;
  }

  const existing = state.cart.find((item) => item.productId === productId);
  if (existing) {
    existing.quantity += 1;
  } else {
    state.cart.push({ productId, quantity: 1 });
  }

  writeStorage(STORAGE_KEYS.cart, state.cart);
  renderCartSummary();
  showToast("Item added to cart.");
}

function renderTypeFilters() {
  const container = document.getElementById("storeTypeFilters");
  const options = [
    { value: "all", label: "All stores" },
    { value: "supermarket", label: "Supermarkets" },
    { value: "retail", label: "Retailers" },
    { value: "wholesale", label: "Wholesalers" }
  ];

  container.innerHTML = options
    .map(
      (option) => `
        <button class="filter-chip ${state.selectedType === option.value ? "is-active" : ""}" data-type="${option.value}" type="button">
          ${option.label}
        </button>
      `
    )
    .join("");

  container.querySelectorAll("[data-type]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedType = button.dataset.type;
      state.focusedStoreId = "all";
      renderMarket();
    });
  });
}

function renderCategoryFilters() {
  const container = document.getElementById("categoryFilters");
  container.innerHTML = currentCategories()
    .map((category) => {
      const label = category === "all" ? "All categories" : category;
      return `
        <button class="filter-chip ${state.selectedCategory === category ? "is-active" : ""}" data-category="${category}" type="button">
          ${label}
        </button>
      `;
    })
    .join("");

  container.querySelectorAll("[data-category]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedCategory = button.dataset.category;
      renderMarket();
    });
  });
}

function renderDeals() {
  const container = document.getElementById("dealGrid");
  const list = visibleOffers();

  if (!list.length) {
    container.innerHTML = '<div class="card">No seller offers yet.</div>';
    return;
  }

  container.innerHTML = list
    .map((offer) => {
      const store = getStore(offer.storeId);
      const button = offer.productId
        ? `<button class="button button-primary button-small" data-offer-product="${offer.productId}" type="button">Add offer</button>`
        : `<button class="button button-outline button-small" data-offer-store="${offer.storeId}" type="button">View store</button>`;

      return `
        <article class="deal-card">
          <div class="deal-head">
            <div>
              <h4>${offer.title}</h4>
              <p>${store ? store.storeName : "Approved seller"}</p>
            </div>
            <span class="status-pill status-pill--timed">${offer.expires}</span>
          </div>
          <p>${offer.note}</p>
          ${button}
        </article>
      `;
    })
    .join("");

  container.querySelectorAll("[data-offer-product]").forEach((button) => {
    button.addEventListener("click", () => {
      addToCart(button.dataset.offerProduct);
    });
  });

  container.querySelectorAll("[data-offer-store]").forEach((button) => {
    button.addEventListener("click", () => {
      state.focusedStoreId = button.dataset.offerStore;
      renderMarket();
      document.getElementById("productGrid").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function renderStores() {
  const container = document.getElementById("storeGrid");
  const summary = document.getElementById("browseSummary");
  const list = visibleStores();
  const profile = buyerProfile();
  const hasBuyerCoordinates =
    Number.isFinite(Number(profile.latitude)) && Number.isFinite(Number(profile.longitude));

  summary.textContent = `${list.length} sellers visible`;

  if (!list.length) {
    container.innerHTML = '<div class="card">No approved sellers match the current filters yet.</div>';
    return;
  }

  container.innerHTML = list
    .map((store) => {
      const distanceLabel = hasBuyerCoordinates
        ? `${haversineDistanceKm(
            { latitude: Number(profile.latitude), longitude: Number(profile.longitude) },
            { latitude: Number(store.latitude), longitude: Number(store.longitude) }
          ).toFixed(1)} km away`
        : "Set buyer location in cart";
      const storeCategories = sellerProducts()
        .filter((product) => product.storeId === store.id)
        .map((product) => product.productCategory);

      return `
        <article class="store-card ${state.focusedStoreId === store.id ? "is-active" : ""}" style="display: flex; flex-direction: column; gap: 0; overflow: hidden; height: 100%;">
          <div class="store-visual-header" style="height: 120px; background: var(--color-surface-dim, #f3f4f6); position: relative; display: flex; align-items: center; justify-content: center; font-size: 2rem; font-weight: 800; color: var(--color-primary);">
            ${store.storeName.charAt(0)}
            <span class="status-pill status-pill--stock" style="position: absolute; top: 8px; right: 8px; font-size: 0.7rem;">${capitalize(store.businessType)}</span>
          </div>
          <div class="store-content" style="padding: 12px; display: flex; flex-direction: column; flex-grow: 1;">
            <div style="margin-bottom: 4px;">
              <h3 style="margin: 0; font-size: 1.1rem; line-height: 1.2;">${store.storeName}</h3>
              <p class="tiny" style="margin: 2px 0 0;">${store.location}</p>
            </div>
            <p style="font-size: 0.8rem; color: #666; margin-bottom: 8px; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden;">
              ${[...new Set(storeCategories)].join(", ") || "Marketplace Partner"}
            </p>
            <div style="display: flex; gap: 8px; font-size: 0.75rem; font-weight: 600; color: #444; margin-top: auto;">
              <span>${distanceLabel}</span>
              <span>•</span>
              <span>${store.prepTime}</span>
            </div>
            <button class="button button-primary button-small" data-focus-store="${store.id}" type="button" style="width: 100%; margin-top: 12px;">
              ${state.focusedStoreId === store.id ? "Close Menu" : "View Menu"}
            </button>
          </div>
        </article>
      `;
    })
    .join("");

  container.querySelectorAll("[data-focus-store]").forEach((button) => {
    button.addEventListener("click", () => {
      state.focusedStoreId = state.focusedStoreId === button.dataset.focusStore ? "all" : button.dataset.focusStore;
      renderMarket();
      document.getElementById("productGrid").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function renderProducts() {
  const container = document.getElementById("productGrid");
  const summary = document.getElementById("productCountSummary");
  const list = visibleProducts();
  summary.textContent =
    state.focusedStoreId === "all" ? `${list.length} products` : `${list.length} products from selected seller`;

  if (!list.length) {
    container.innerHTML = '<div class="card">No products match the current filters yet.</div>';
    return;
  }

  container.innerHTML = list
    .map((product) => {
      const store = getStore(product.storeId);

      return `
        <article class="product-card" style="padding: 8px; display: flex; flex-direction: column; gap: 8px;">
          <div class="product-visual" style="height: 100px; font-size: 0.8rem;">${product.productCategory}</div>
          <div class="product-head" style="margin: 0;">
            <div>
              <h3 style="font-size: 1rem; margin-bottom: 2px;">${product.productName}</h3>
              <strong style="font-size: 0.95rem; color: var(--color-primary);">${currency(product.productPrice)}</strong>
            </div>
          </div>
          <div style="flex-grow: 1;">
             <p class="tiny" style="margin: 0; color: #666;">${store ? store.storeName : "Seller"}</p>
             ${product.productOffer ? `<p class="tiny" style="color: #15803d; font-weight: 600;">${product.productOffer}</p>` : ''}
          </div>
          <button class="button button-primary button-small" data-add-product="${product.id}" type="button" style="width: 100%;">
            Add
          </button>
        </article>
      `;
    })
    .join("");

  container.querySelectorAll("[data-add-product]").forEach((button) => {
    button.addEventListener("click", () => {
      addToCart(button.dataset.addProduct);
    });
  });
}

function renderCartSummary() {
  const subtotal = state.cart.reduce((sum, item) => {
    const product = getProduct(item.productId);
    return sum + (product ? product.productPrice * item.quantity : 0);
  }, 0);
  const itemCount = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  const delivery = buildDeliverySummary(state.cart);
  const methods = availableCheckoutMethods(state.cart);

  document.getElementById("cartCountBadge").textContent = String(itemCount);
  document.getElementById("cartSubtotalValue").textContent = currency(subtotal);
  document.getElementById("deliveryFeeValue").textContent = itemCount ? delivery.label : currency(0);

  const infoBox = document.querySelector(".cart-summary-card .info-box");
  if (!itemCount) {
    infoBox.textContent = "Add seller products to start building your cart.";
    return;
  }

  infoBox.textContent = methods.length
    ? `Accepted across selected sellers: ${methods.join(", ")}.`
    : "Save buyer location in the cart so delivery can be calculated.";
}

function renderMarket() {
  sanitizeCart();

  if (
    state.focusedStoreId !== "all" &&
    !approvedStores().some((store) => store.id === state.focusedStoreId)
  ) {
    state.focusedStoreId = "all";
  }

  renderTypeFilters();
  renderCategoryFilters();
  renderDeals();
  renderStores();
  renderProducts();
  renderCartSummary();
}

function bindEvents() {
  document.getElementById("searchInput").addEventListener("input", (event) => {
    state.search = event.target.value.trim();
    renderMarket();
  });

  document.getElementById("resetFiltersButton").addEventListener("click", () => {
    state.selectedType = "all";
    state.selectedCategory = "all";
    state.focusedStoreId = "all";
    state.search = "";
    document.getElementById("searchInput").value = "";
    renderMarket();
  });

  document.getElementById("clearCartButton").addEventListener("click", () => {
    state.cart = [];
    writeStorage(STORAGE_KEYS.cart, state.cart);
    renderCartSummary();
    showToast("Cart cleared.", "warn");
  });

  window.addEventListener("storage", () => {
    state.cart = readStorage(STORAGE_KEYS.cart, []);
    renderMarket();
  });
}

async function boot() {
  seedCategories();
  migrateLegacyProducts();
  await loadMarketData();
  initReveal();
  initAdminTrigger();
  bindEvents();
  renderMarket();
}

boot();
