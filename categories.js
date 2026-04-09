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

const API_ENDPOINTS = {
  adminLogin: "./api/admin/login.php"
};

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

const state = {
  selectedType: "all",
  selectedCategory: "all",
  focusedStoreId: "all",
  search: "",
  cart: readStorage(STORAGE_KEYS.cart, [])
};
let filterScrollerResizeBound = false;
let lastFloatingCartCount = 0;

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
  const text = String(value || "n/a");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function normalizePaymentOptions(options) {
  const cleaned = Array.isArray(options)
    ? options.map((entry) => String(entry).trim()).filter(Boolean)
    : [];
  return cleaned.length ? cleaned : ["M-Pesa", "Cash on Delivery"];
}

function storePaymentOptions(store) {
  if (!store) {
    return normalizePaymentOptions([]);
  }
  return normalizePaymentOptions(store.paymentOptions || store.paymentMethods);
}

function storeTillNumber(store) {
  return String((store && store.tillNumber) || "").trim();
}

function storePochiNumber(store) {
  return String((store && store.pochiNumber) || "").trim();
}

function storeCardAccount(store) {
  return String((store && store.cardAccount) || "").trim();
}

function storeCounty(store) {
  return String((store && store.county) || "").trim();
}

function storeBusinessImageBase64(store) {
  return String((store && store.businessImageBase64) || "").trim();
}

function applications() {
  return readStorage(STORAGE_KEYS.sellerApplications, []);
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
  return ["all", ...new Set([...defaultCategories, ...storedCategories, ...liveCategories])];
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
      String(store.storeName || "").toLowerCase().includes(query) ||
      String(store.location || "").toLowerCase().includes(query) ||
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
    .map((store) => storePaymentOptions(store));

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

function cartItemCount() {
  return state.cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
}

function renderFloatingCartCount(animate = false) {
  const countElement = document.getElementById("floatingCartCount");
  if (!countElement) {
    return;
  }

  const count = cartItemCount();
  countElement.textContent = String(count);
  countElement.classList.toggle("is-empty", count === 0);

  if (animate && count > lastFloatingCartCount) {
    countElement.classList.remove("is-pop");
    void countElement.offsetWidth;
    countElement.classList.add("is-pop");
  }

  lastFloatingCartCount = count;
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

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!username || !password) {
      status.textContent = "Enter username and password.";
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
        status.textContent = "Login successful. Redirecting...";
        window.setTimeout(() => {
          window.location.href = "./admin.html";
        }, 450);
        return;
      }

      status.textContent = data && data.message ? data.message : "Invalid admin credentials.";
    } catch (error) {
      status.textContent = "Could not reach admin login service.";
    }
  });
}

function scrollFilterRow(row, direction) {
  if (!row) {
    return;
  }

  const step = Math.max(180, Math.round(row.clientWidth * 0.72));
  row.scrollBy({
    left: direction * step,
    behavior: "smooth"
  });
}

function updateFilterScrollerState(scroller) {
  if (!scroller) {
    return;
  }

  const row = scroller.querySelector(".chip-row");
  const leftButton = scroller.querySelector('[data-scroll-dir="left"]');
  const rightButton = scroller.querySelector('[data-scroll-dir="right"]');
  if (!row || !leftButton || !rightButton) {
    return;
  }

  const canScroll = row.scrollWidth > row.clientWidth + 1;
  const maxScroll = Math.max(0, row.scrollWidth - row.clientWidth);
  const atStart = row.scrollLeft <= 1;
  const atEnd = row.scrollLeft >= maxScroll - 1;

  leftButton.disabled = !canScroll || atStart;
  rightButton.disabled = !canScroll || atEnd;
  leftButton.classList.toggle("is-hidden-control", !canScroll);
  rightButton.classList.toggle("is-hidden-control", !canScroll);
}

function updateFilterScrollers() {
  document.querySelectorAll(".chip-scroller").forEach((scroller) => {
    updateFilterScrollerState(scroller);
  });
}

function initFilterScrollers() {
  document.querySelectorAll(".chip-scroller").forEach((scroller) => {
    const row = scroller.querySelector(".chip-row");
    const leftButton = scroller.querySelector('[data-scroll-dir="left"]');
    const rightButton = scroller.querySelector('[data-scroll-dir="right"]');
    if (!row || !leftButton || !rightButton) {
      return;
    }

    if (scroller.dataset.bound === "true") {
      updateFilterScrollerState(scroller);
      return;
    }

    leftButton.addEventListener("click", () => {
      scrollFilterRow(row, -1);
    });
    rightButton.addEventListener("click", () => {
      scrollFilterRow(row, 1);
    });

    row.addEventListener(
      "scroll",
      () => {
        updateFilterScrollerState(scroller);
      },
      { passive: true }
    );

    scroller.dataset.bound = "true";
    updateFilterScrollerState(scroller);
  });

  if (!filterScrollerResizeBound) {
    window.addEventListener("resize", () => {
      updateFilterScrollers();
    });
    filterScrollerResizeBound = true;
  }
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
  renderFloatingCartCount(true);
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
      let label = category === "all" ? "All categories" : category;
      if (category.toLowerCase() === "clothes") {
        label = "Click to shop Clothes";
      }
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
      const countyLabel = storeCounty(store) ? `${storeCounty(store)} County` : "County not set";
      const tillChip = storeTillNumber(store)
        ? `Till ${storeTillNumber(store)}`
        : `Pay by ${storePaymentOptions(store)[0] || "M-Pesa"}`;
      const phoneChip = store.phone || "Phone not set";
      const locationChip = store.location || countyLabel;
      const cartActionLabel = hasBuyerCoordinates ? `Cart | ${distanceLabel}` : "Cart";

      return `
        <article class="store-card ${state.focusedStoreId === store.id ? "is-active" : ""}">
          <div class="store-pill store-pill--location">${locationChip}</div>
          <div class="store-pill-row">
            <span class="store-pill">${tillChip}</span>
            <span class="store-pill">${phoneChip}</span>
          </div>
          <h3 class="store-title">${store.storeName}</h3>
          <div class="store-action-row">
            <a class="store-cart-button" href="./cart.html" data-store-cart="${store.id}">
              <span class="store-cart-button__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" role="presentation" focusable="false">
                  <path d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h8.4a2 2 0 0 0 2-1.5L22 7H7.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
                  <circle cx="10" cy="20" r="1.7"></circle>
                  <circle cx="18" cy="20" r="1.7"></circle>
                </svg>
              </span>
              ${cartActionLabel}
            </a>
            <button class="button button-primary button-small store-menu-button" data-focus-store="${store.id}" type="button">
              ${state.focusedStoreId === store.id ? "Viewing Menu" : "View Menu"}
            </button>
          </div>
          <p class="store-helper-text">
            Click the supermarket icon to continue with cart and payment details.
          </p>
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

  container.querySelectorAll("[data-store-cart]").forEach((link) => {
    link.addEventListener("click", () => {
      showToast("Opening cart for checkout flow.", "info");
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
      const paymentLabel = store ? storePaymentOptions(store).join(", ") : "Seller payment methods";
      const tillLabel = store && storeTillNumber(store) ? ` | Till ${storeTillNumber(store)}` : "";
      const pochiLabel = store && storePochiNumber(store) ? ` | Pochi ${storePochiNumber(store)}` : "";
      const cardLabel = store && storeCardAccount(store) ? ` | Card ${storeCardAccount(store)}` : "";

      return `
        <article class="product-card">
          <div class="product-visual">${product.productCategory}</div>
          <div class="product-head">
            <div>
              <h3>${product.productName}</h3>
              <p>${store ? store.storeName : "Approved seller"}</p>
            </div>
            <span class="status-pill status-pill--stock">${product.productStock || "Available"}</span>
          </div>
          <div class="summary-list">
            <div class="summary-row">
              <span>Price</span>
              <strong>${currency(product.productPrice)}</strong>
            </div>
          </div>
          <p>${product.productOffer || "No special offer on this item."}</p>
          <p class="tiny">Payments: ${paymentLabel}${tillLabel}${pochiLabel}${cardLabel}</p>
          <button class="button button-primary button-small" data-add-product="${product.id}" type="button">Add to cart</button>
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
  const cartCountBadge = document.getElementById("cartCountBadge");
  const cartSubtotalValue = document.getElementById("cartSubtotalValue");
  const deliveryFeeValue = document.getElementById("deliveryFeeValue");
  const infoBox = document.querySelector(".cart-summary-card .info-box");
  if (!cartCountBadge || !cartSubtotalValue || !deliveryFeeValue || !infoBox) {
    return;
  }

  const subtotal = state.cart.reduce((sum, item) => {
    const product = getProduct(item.productId);
    return sum + (product ? product.productPrice * item.quantity : 0);
  }, 0);
  const itemCount = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  const delivery = buildDeliverySummary(state.cart);
  const methods = availableCheckoutMethods(state.cart);

  cartCountBadge.textContent = String(itemCount);
  cartSubtotalValue.textContent = currency(subtotal);
  deliveryFeeValue.textContent = itemCount ? delivery.label : currency(0);

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
  renderFloatingCartCount();
  updateFilterScrollers();
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

  const clearCartButton = document.getElementById("clearCartButton");
  if (clearCartButton) {
    clearCartButton.addEventListener("click", () => {
      state.cart = [];
      writeStorage(STORAGE_KEYS.cart, state.cart);
      renderCartSummary();
      showToast("Cart cleared.", "warn");
    });
  }

  window.addEventListener("storage", () => {
    state.cart = readStorage(STORAGE_KEYS.cart, []);
    renderMarket();
  });
}

function boot() {
  seedCategories();
  migrateLegacyProducts();
  initReveal();
  initAdminTrigger();
  initFilterScrollers();
  bindEvents();
  renderMarket();
}

boot();
