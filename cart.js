const STORAGE_KEYS = {
  cart: "tamu_market_cart",
  sellerApplications: "tamu_market_seller_applications",
  sellerProducts: "tamu_market_seller_products",
  sellerDrafts: "tamu_market_seller_drafts",
  buyerProfile: "tamu_market_buyer_profile",
  adminOrders: "tamu_market_admin_orders",
  adminSession: "tamu_market_admin_session"
};

const API_ENDPOINTS = {
  createOrder: "./api/orders/create.php"
};

const ADMIN_CREDENTIALS = {
  username: "TamuAdmin@2025",
  password: "ummeats"
};

let cart = readStorage(STORAGE_KEYS.cart, []);

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

function applications() {
  return readStorage(STORAGE_KEYS.sellerApplications, []);
}

function sellerProducts() {
  return readStorage(STORAGE_KEYS.sellerProducts, []);
}

function approvedStores() {
  return applications().filter((application) => application.status === "approved");
}

function buyerProfile() {
  return readStorage(STORAGE_KEYS.buyerProfile, {
    fullName: "",
    phone: "",
    location: "",
    latitude: "",
    longitude: "",
    paymentMethod: "",
    note: ""
  });
}

function getStore(storeId) {
  return approvedStores().find((store) => store.id === storeId);
}

function getProduct(productId) {
  return sellerProducts().find((product) => product.id === productId);
}

function normalizePaymentOptions(options) {
  const cleaned = Array.isArray(options)
    ? options.map((entry) => String(entry).trim()).filter(Boolean)
    : [];
  return cleaned.length ? cleaned : ["M-Pesa", "Cash on Delivery"];
}

function currency(value) {
  return `KSh ${Number(value).toLocaleString()}`;
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
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

function buildDeliverySummary(items, profile = buyerProfile()) {
  if (!items.length) {
    return {
      hasCoordinates: false,
      fee: 0,
      subtotal: 0,
      total: 0,
      breakdown: [],
      consolidationFee: 0,
      label: currency(0)
    };
  }

  const subtotal = items.reduce((sum, item) => {
    const product = getProduct(item.productId);
    return sum + (product ? product.productPrice * item.quantity : 0);
  }, 0);

  const latitude = Number(profile.latitude);
  const longitude = Number(profile.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return {
      hasCoordinates: false,
      fee: 0,
      subtotal,
      total: subtotal,
      breakdown: [],
      consolidationFee: 0,
      label: "Set location"
    };
  }

  const buyerPoint = { latitude, longitude };
  const groupedByStore = new Map();

  items.forEach((item) => {
    const product = getProduct(item.productId);
    if (!product || !getStore(product.storeId)) {
      return;
    }

    const current = groupedByStore.get(product.storeId) || {
      storeId: product.storeId,
      quantity: 0,
      subtotal: 0
    };

    current.quantity += item.quantity;
    current.subtotal += product.productPrice * item.quantity;
    groupedByStore.set(product.storeId, current);
  });

  const breakdown = [...groupedByStore.values()]
    .map((group) => {
      const store = getStore(group.storeId);
      if (!store) {
        return null;
      }

      const distanceKm = haversineDistanceKm(buyerPoint, {
        latitude: Number(store.latitude),
        longitude: Number(store.longitude)
      });
      const routeFee = Math.max(120, Math.round((90 + distanceKm * 28) / 10) * 10);

      return {
        storeId: store.id,
        storeName: store.storeName,
        distanceKm,
        fee: routeFee,
        quantity: group.quantity,
        subtotal: group.subtotal
      };
    })
    .filter(Boolean);

  const consolidationFee = breakdown.length > 1 ? (breakdown.length - 1) * 40 : 0;
  const fee = breakdown.reduce((sum, entry) => sum + entry.fee, 0) + consolidationFee;

  return {
    hasCoordinates: true,
    fee,
    subtotal,
    total: subtotal + fee,
    breakdown,
    consolidationFee,
    label: currency(fee)
  };
}

function availableCheckoutMethods(items) {
  const methodsByStore = [...new Set(
    items
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
  return first.filter((method) => methodsByStore.every((methods) => methods.includes(method)));
}

function sanitizeCart() {
  const validProducts = new Set(
    sellerProducts()
      .filter((product) => getStore(product.storeId))
      .map((product) => product.id)
  );
  const cleanCart = cart.filter((item) => validProducts.has(item.productId));
  if (cleanCart.length !== cart.length) {
    cart = cleanCart;
    writeStorage(STORAGE_KEYS.cart, cart);
  }
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

function updateQuantity(productId, nextQuantity) {
  const current = cart.find((item) => item.productId === productId);
  if (!current) {
    return;
  }

  if (nextQuantity <= 0) {
    cart = cart.filter((item) => item.productId !== productId);
  } else {
    current.quantity = nextQuantity;
  }

  writeStorage(STORAGE_KEYS.cart, cart);
  renderCart();
}

function fillCheckoutForm() {
  const profile = buyerProfile();
  document.getElementById("buyerNameInput").value = profile.fullName || "";
  document.getElementById("buyerPhoneInput").value = profile.phone || "";
  document.getElementById("buyerLocationInput").value = profile.location || "";
  document.getElementById("buyerLatitudeInput").value = profile.latitude || "";
  document.getElementById("buyerLongitudeInput").value = profile.longitude || "";
  document.getElementById("buyerNoteInput").value = profile.note || "";
}

function readCheckoutForm() {
  return {
    fullName: document.getElementById("buyerNameInput").value.trim(),
    phone: document.getElementById("buyerPhoneInput").value.trim(),
    location: document.getElementById("buyerLocationInput").value.trim(),
    latitude: document.getElementById("buyerLatitudeInput").value.trim(),
    longitude: document.getElementById("buyerLongitudeInput").value.trim(),
    paymentMethod: document.getElementById("paymentMethodInput").value.trim(),
    note: document.getElementById("buyerNoteInput").value.trim()
  };
}

function saveBuyerProfileFromForm() {
  const profile = readCheckoutForm();
  writeStorage(STORAGE_KEYS.buyerProfile, profile);
  renderSummaryPanels();
}

function renderPaymentOptions(items) {
  const container = document.getElementById("sellerPaymentMethods");
  const selectedStores = [...new Set(
    items
      .map((item) => getProduct(item.productId))
      .filter(Boolean)
      .map((product) => product.storeId)
  )]
    .map((storeId) => getStore(storeId))
    .filter(Boolean);

  if (!selectedStores.length) {
    container.innerHTML = '<span class="payment-chip">No sellers in cart yet</span>';
    return;
  }

  container.innerHTML = selectedStores
    .map(
      (store) => `
        <span class="payment-chip">${store.storeName}: ${normalizePaymentOptions(store.paymentOptions).join(", ")}</span>
      `
    )
    .join("");
}

function syncPaymentMethodSelect(items) {
  const select = document.getElementById("paymentMethodInput");
  const profile = buyerProfile();
  const methods = availableCheckoutMethods(items);
  const selectedMethod = methods.includes(profile.paymentMethod) ? profile.paymentMethod : methods[0] || "";

  select.innerHTML = methods.length
    ? `
      <option value="">Select payment method</option>
      ${methods.map((method) => `<option value="${method}">${method}</option>`).join("")}
    `
    : '<option value="">No shared payment method available yet</option>';

  select.value = selectedMethod;
  writeStorage(STORAGE_KEYS.buyerProfile, {
    ...profile,
    paymentMethod: selectedMethod
  });
}

function renderDeliveryBreakdown(items) {
  const container = document.getElementById("deliveryBreakdown");
  const delivery = buildDeliverySummary(items);

  if (!items.length) {
    container.innerHTML = '<div class="breakdown-card"><p>Add products to see the route breakdown.</p></div>';
    return delivery;
  }

  if (!delivery.hasCoordinates) {
    container.innerHTML = '<div class="breakdown-card"><p>Enter buyer coordinates to calculate delivery from each seller.</p></div>';
    return delivery;
  }

  container.innerHTML = `
    ${delivery.breakdown
      .map(
        (entry) => `
          <article class="breakdown-card">
            <strong>${entry.storeName}</strong>
            <p>${entry.distanceKm.toFixed(1)} km route | ${entry.quantity} item(s)</p>
            <p>Store subtotal ${currency(entry.subtotal)} | Route fee ${currency(entry.fee)}</p>
          </article>
        `
      )
      .join("")}
    ${delivery.consolidationFee > 0
      ? `<article class="breakdown-card">
          <strong>Multi-store coordination</strong>
          <p>Tamu Express pickup coordination for ${delivery.breakdown.length} stores.</p>
          <p>${currency(delivery.consolidationFee)}</p>
        </article>`
      : ""}
  `;

  return delivery;
}

function renderSummaryPanels() {
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const delivery = renderDeliveryBreakdown(cart);
  renderPaymentOptions(cart);
  syncPaymentMethodSelect(cart);
  const methods = availableCheckoutMethods(cart);

  document.getElementById("cartCountBadge").textContent = String(itemCount);
  document.getElementById("cartSubtotalValue").textContent = currency(delivery.subtotal);
  document.getElementById("deliveryFeeValue").textContent = itemCount ? delivery.label : currency(0);
  document.getElementById("grandTotalValue").textContent = currency(delivery.total);

  const info = document.getElementById("deliverySummaryInfo");
  const status = document.getElementById("checkoutStatus");

  if (!cart.length) {
    info.textContent = "Tamu Express will coordinate seller confirmation, sourcing, and dispatch after checkout.";
    status.textContent = "Add products to start building the buyer route.";
    return;
  }

  if (!delivery.hasCoordinates) {
    info.textContent = "Enter buyer delivery coordinates so Tamu Express can calculate the route from each seller.";
    status.textContent = "Waiting for buyer location to calculate the final delivery fee.";
    return;
  }

  if (!methods.length) {
    info.textContent = "The selected sellers do not currently share one checkout payment method.";
    status.textContent = "Use products from sellers with a shared payment method or reduce the cart to one seller.";
    return;
  }

  info.textContent =
    delivery.breakdown.length > 1
      ? `Delivery fee includes ${delivery.breakdown.length} seller pickup routes and a coordination fee.`
      : "Delivery fee is based on the selected seller route to the buyer location.";
  status.textContent = `Route ready. Delivery estimate ${currency(delivery.fee)} on top of products total ${currency(delivery.subtotal)}.`;
}

function renderCart() {
  sanitizeCart();
  const container = document.getElementById("cartItems");

  if (!cart.length) {
    container.innerHTML = '<div class="card">Your cart is empty. Go back to categories and add products first.</div>';
    renderSummaryPanels();
    return;
  }

  container.innerHTML = cart
    .map((item) => {
      const product = getProduct(item.productId);
      const store = product ? getStore(product.storeId) : null;
      if (!product || !store) {
        return "";
      }

      return `
        <article class="cart-item">
          <strong>${product.productName}</strong>
          <p>${store.storeName} | ${store.location}</p>
          <p>${currency(product.productPrice)}</p>
          <div class="button-row">
            <button class="button button-ghost button-small" data-cart-action="decrease" data-product-id="${product.id}" type="button">-</button>
            <span class="summary-chip">${item.quantity}</span>
            <button class="button button-ghost button-small" data-cart-action="increase" data-product-id="${product.id}" type="button">+</button>
            <button class="button button-outline button-small" data-cart-action="remove" data-product-id="${product.id}" type="button">Remove</button>
          </div>
        </article>
      `;
    })
    .join("");

  document.querySelectorAll("[data-cart-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const productId = button.dataset.productId;
      const item = cart.find((entry) => entry.productId === productId);
      if (!item) {
        return;
      }

      if (button.dataset.cartAction === "increase") {
        updateQuantity(productId, item.quantity + 1);
      }

      if (button.dataset.cartAction === "decrease") {
        updateQuantity(productId, item.quantity - 1);
      }

      if (button.dataset.cartAction === "remove") {
        updateQuantity(productId, 0);
        showToast("Item removed from cart.", "info");
      }
    });
  });

  renderSummaryPanels();
}

function buildOrderPayload(profile, delivery) {
  const items = cart
    .map((item) => {
      const product = getProduct(item.productId);
      const store = product ? getStore(product.storeId) : null;
      if (!product || !store) {
        return null;
      }

      return {
        productId: product.id,
        productName: product.productName,
        storeId: store.id,
        storeName: store.storeName,
        quantity: item.quantity,
        unitPrice: product.productPrice,
        lineTotal: product.productPrice * item.quantity
      };
    })
    .filter(Boolean);

  const uniqueStores = [...new Set(items.map((item) => item.storeId))];
  const uniqueStoreNames = [...new Set(items.map((item) => item.storeName))];
  const sellerPaymentStatus = uniqueStores.reduce((statusMap, storeId) => {
    statusMap[storeId] = "pending";
    return statusMap;
  }, {});

  return {
    id: createId("order"),
    customer: profile.fullName,
    phone: profile.phone,
    buyerLocation: profile.location,
    buyerLatitude: Number(profile.latitude),
    buyerLongitude: Number(profile.longitude),
    paymentMethod: profile.paymentMethod,
    paymentStatus: "pending",
    sellerPaymentStatus,
    note: profile.note,
    storeName: uniqueStoreNames.join(" + "),
    stores: uniqueStoreNames,
    subtotal: delivery.subtotal,
    deliveryFee: delivery.fee,
    total: delivery.total,
    routeBreakdown: delivery.breakdown,
    status: "pending",
    items,
    createdAt: new Date().toISOString()
  };
}

async function handleCheckout() {
  sanitizeCart();

  if (!cart.length) {
    showToast("Add products before checkout.", "warn");
    return;
  }

  const profile = readCheckoutForm();
  const latitude = Number(profile.latitude);
  const longitude = Number(profile.longitude);
  const delivery = buildDeliverySummary(cart, profile);

  if (!profile.fullName || !profile.phone || !profile.location) {
    showToast("Fill in buyer details before checkout.", "warn");
    return;
  }

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    showToast("Enter valid buyer coordinates to calculate delivery.", "warn");
    return;
  }

  if (!profile.paymentMethod) {
    showToast("Choose a payment method supported by the selected sellers.", "warn");
    return;
  }

  if (!delivery.hasCoordinates) {
    showToast("Buyer coordinates are required for route pricing.", "warn");
    return;
  }

  const order = buildOrderPayload(profile, delivery);
  const existingOrders = readStorage(STORAGE_KEYS.adminOrders, []);
  writeStorage(STORAGE_KEYS.adminOrders, [...existingOrders, order]);
  writeStorage(STORAGE_KEYS.buyerProfile, profile);

  const response = await postJson(API_ENDPOINTS.createOrder, order);
  document.getElementById("checkoutStatus").textContent = response.ok
    ? "Order submitted and backend synced."
    : "Order submitted in prototype mode. Backend sync will work once PHP is running.";

  cart = [];
  writeStorage(STORAGE_KEYS.cart, cart);
  renderCart();
  showToast(
    response.ok ? "Order placed successfully." : "Order placed locally and queued for backend setup.",
    response.ok ? "success" : "info"
  );
}

function bindEvents() {
  document.getElementById("clearCartButton").addEventListener("click", () => {
    cart = [];
    writeStorage(STORAGE_KEYS.cart, cart);
    renderCart();
    showToast("Cart cleared.", "warn");
  });

  document.getElementById("checkoutButton").addEventListener("click", () => {
    handleCheckout();
  });

  document.getElementById("checkoutForm").addEventListener("input", () => {
    saveBuyerProfileFromForm();
  });

  document.getElementById("checkoutForm").addEventListener("change", () => {
    saveBuyerProfileFromForm();
  });

  window.addEventListener("storage", () => {
    cart = readStorage(STORAGE_KEYS.cart, []);
    fillCheckoutForm();
    renderCart();
  });
}

function boot() {
  migrateLegacyProducts();
  initReveal();
  initAdminTrigger();
  fillCheckoutForm();
  bindEvents();
  renderCart();
}

boot();
