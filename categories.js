let cachedApplications = [];
const STORAGE_KEYS = {
  cart: "tamu_market_cart",
  sellers: "tamu_market_sellers",
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
const fallbackLocationImages = [
  "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=70",
  "https://images.unsplash.com/photo-1543168256-418811576931?auto=format&fit=crop&w=900&q=70",
  "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?auto=format&fit=crop&w=900&q=70",
  "https://images.unsplash.com/photo-1516594798947-e65505dbb29d?auto=format&fit=crop&w=900&q=70"
];
const businessTypeImagePools = {
  supermarket: [
    "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1578916171728-46686eac8d58?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1534723452862-4c874018d66d?auto=format&fit=crop&w=900&q=72"
  ],
  retail: [
    "https://images.unsplash.com/photo-1515706886582-54c73c5eaf41?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1601598851547-4302969d0614?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1556741533-6e6a62bd8b49?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=900&q=72"
  ],
  wholesale: [
    "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1580674285054-bed31e145f59?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1587293852726-70cdb56c2866?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1565891741441-64926e441838?auto=format&fit=crop&w=900&q=72"
  ],
  mixed: [
    "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1543168256-418811576931?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1516594798947-e65505dbb29d?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1533900298318-6b8da08a523e?auto=format&fit=crop&w=900&q=72"
  ]
};
const categoryImagePools = {
  grocery: [
    "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1578916171728-46686eac8d58?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?auto=format&fit=crop&w=900&q=72"
  ],
  fresh: [
    "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1516594798947-e65505dbb29d?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1543168256-418811576931?auto=format&fit=crop&w=900&q=72"
  ],
  beverage: [
    "https://images.unsplash.com/photo-1532634922-8fe0b757fb13?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1563223771-5fe4038fbfc9?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=900&q=72"
  ],
  household: [
    "https://images.unsplash.com/photo-1585421514738-01798e348b17?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=900&q=72"
  ],
  snack: [
    "https://images.unsplash.com/photo-1621939514649-280e2ee25f60?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1599490659213-e2b9527bd087?auto=format&fit=crop&w=900&q=72",
    "https://images.unsplash.com/photo-1604882406195-d94d4888564d?auto=format&fit=crop&w=900&q=72"
  ],
  wholesale: businessTypeImagePools.wholesale
};

const state = {
  selectedType: "all",
  selectedCategory: "all",
  focusedLocation: "all",
  focusedStoreId: "all",
  focusedBusinessCategory: "all",
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

function portalSellers() {
  return readStorage("tamu_sellers", [])
    .filter((seller) => seller.status === "approved")
    .map((seller) => {
      const [latitude = "", longitude = ""] = String(seller.coordinates || "")
        .split(",")
        .map((part) => part.trim());

      return {
        id: seller.id,
        storeName: seller.name || seller.email || "Approved seller",
        businessType: seller.businessType || "retail",
        location: seller.coordinates || "Seller location",
        latitude,
        longitude,
        prepTime: seller.prepTime || "30-60 min",
        paymentOptions: seller.paymentOptions || ["M-Pesa", "Cash on Delivery"],
        status: "approved"
      };
    });
}

function portalProducts() {
  const stores = new Map(portalSellers().map((seller) => [seller.id, seller]));

  return readStorage("tamu_products", [])
    .filter((product) => stores.has(product.sellerId))
    .map((product) => {
      const store = stores.get(product.sellerId);

      return {
        id: product.id,
        storeId: product.sellerId,
        storeName: product.sellerName || store.storeName,
        productName: product.name || "Seller product",
        productCategory: product.category || "Other",
        productPrice: Number(product.price) || 0,
        productStock: product.stock || "Available",
        productOffer: product.offer || "",
        productImage: product.image || "",
        createdAt: product.createdAt || new Date().toISOString(),
        updatedAt: product.updatedAt || product.createdAt || new Date().toISOString()
      };
    });
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
  const localSellers = readStorage(STORAGE_KEYS.sellers, []);
  const localApplications = readStorage(STORAGE_KEYS.sellerApplications, []);
  const byId = new Map();
  [...cachedApplications, ...localApplications, ...localSellers, ...portalSellers()].forEach((application) => {
    const key = application.id || application.email;
    if (!key) return;
    const current = byId.get(key) || {};
    const merged = { ...current, ...application };
    if (current.status === "approved" || application.status === "approved") {
      merged.status = "approved";
    }
    byId.set(key, merged);
  });
  return [...byId.values()];
}

async function loadMarketData() {
  try {
    const res = await fetch('./api/admin/applications.php?status=approved');
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

function sellerProducts() {
  const approvedStoreIds = new Set(approvedStores().map((store) => store.id));
  const localProducts = readStorage(STORAGE_KEYS.sellerProducts, []).map((product) => ({
    ...product,
    storeId: product.storeId || product.sellerId || "",
    storeName: product.storeName || product.sellerName || ""
  })).filter((product) => approvedStoreIds.has(product.storeId));
  const merged = [...localProducts, ...portalProducts().filter((product) => approvedStoreIds.has(product.storeId))];
  return merged.filter((product, index, list) =>
    list.findIndex((item) => item.id === product.id) === index
  );
}

function sellerOffers() {
  const approvedStoreIds = new Set(approvedStores().map((store) => store.id));
  return readStorage(STORAGE_KEYS.sellerOffers, []).map((offer) => ({
    ...offer,
    storeId: offer.storeId || offer.sellerId || "",
    title: offer.title || offer.offerTitle || "",
    note: offer.note || offer.offerNote || "",
    image: offer.image || offer.offerImage || ""
  })).filter((offer) => approvedStoreIds.has(offer.storeId));
}

function buyerProfile() {
  return readStorage(STORAGE_KEYS.buyerProfile, {
    latitude: "",
    longitude: ""
  });
}

function approvedStores() {
  return applications().filter((application) => {
    if (application.status !== "approved") {
      return false;
    }
    if (!application.expiresAt) {
      return true;
    }
    const expiry = new Date(application.expiresAt).getTime();
    return Number.isFinite(expiry) ? expiry > Date.now() : true;
  });
}

function getStore(storeId) {
  return approvedStores().find((store) => store.id === storeId);
}

function getProduct(productId) {
  return sellerProducts().find((product) => product.id === productId);
}

function storePrimaryImage(storeId) {
  const productImage = sellerProducts().find((product) => product.storeId === storeId && product.productImage)?.productImage;
  if (productImage) {
    return productImage;
  }

  return sellerOffers().find((offer) => offer.storeId === storeId && offer.image)?.image || "";
}

function locationPrimaryImage(stores, storeProducts = []) {
  const imageByStoreId = new Map(stores.map((store) => [store.id, storePrimaryImage(store.id)]));
  const productImage = storeProducts.find((product) => product.productImage)?.productImage;
  return stores.map((store) => imageByStoreId.get(store.id)).find(Boolean) || productImage || "";
}

function fallbackImageFor(value, pool = fallbackLocationImages) {
  const text = String(value || "market");
  const index = [...text].reduce((sum, char) => sum + char.charCodeAt(0), 0) % pool.length;
  return pool[index];
}

function normalizeBusinessType(value) {
  const type = String(value || "").toLowerCase();
  if (type.includes("super")) return "supermarket";
  if (type.includes("whole")) return "wholesale";
  if (type.includes("retail") || type.includes("shop") || type.includes("mini")) return "retail";
  return "retail";
}

function dominantBusinessType(stores) {
  const counts = stores.reduce((summary, store) => {
    const type = normalizeBusinessType(store.businessType);
    summary[type] = (summary[type] || 0) + 1;
    return summary;
  }, {});
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!sorted.length) {
    return "mixed";
  }
  if (sorted.length > 1 && sorted[0][1] === sorted[1][1]) {
    return "mixed";
  }
  return sorted[0][0];
}

function normalizeCategoryGroup(value) {
  const category = String(value || "").toLowerCase();
  if (category.includes("whole") || category.includes("bulk")) return "wholesale";
  if (category.includes("fresh") || category.includes("food") || category.includes("dairy") || category.includes("meat") || category.includes("vegetable")) return "fresh";
  if (category.includes("drink") || category.includes("beverage") || category.includes("juice") || category.includes("water")) return "beverage";
  if (category.includes("house") || category.includes("clean") || category.includes("home")) return "household";
  if (category.includes("snack") || category.includes("sweet") || category.includes("biscuit")) return "snack";
  if (category.includes("grocery") || category.includes("grocer") || category.includes("super")) return "grocery";
  return "";
}

function dominantCategoryGroup(products) {
  const counts = products.reduce((summary, product) => {
    const group = normalizeCategoryGroup(product.productCategory || product.category);
    if (!group) return summary;
    summary[group] = (summary[group] || 0) + 1;
    return summary;
  }, {});
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!sorted.length) {
    return "";
  }
  if (sorted.length > 1 && sorted[0][1] === sorted[1][1]) {
    return "mixed";
  }
  return sorted[0][0];
}

function ecosystemImagePool(type, categoryGroup) {
  if (categoryGroup && categoryGroup !== "mixed" && categoryImagePools[categoryGroup]) {
    return categoryImagePools[categoryGroup];
  }
  return businessTypeImagePools[type] || businessTypeImagePools.mixed;
}

function ecosystemLabel(type, categoryGroup, uploadedImage) {
  if (uploadedImage) {
    return `${capitalize(type)} live hub`;
  }
  if (categoryGroup && categoryGroup !== "mixed") {
    return `${capitalize(categoryGroup)} hub`;
  }
  return `${capitalize(type)} hub`;
}

function locationCardImage(location, stores, storeProducts = []) {
  const type = dominantBusinessType(stores);
  const categoryGroup = dominantCategoryGroup(storeProducts);
  const uploadedImage = locationPrimaryImage(stores, storeProducts);
  const shouldUseUploadedImage = Boolean(uploadedImage && stores.length <= 2 && categoryGroup !== "mixed");

  if (shouldUseUploadedImage) {
    return {
      image: uploadedImage,
      type,
      categoryGroup,
      label: ecosystemLabel(type, categoryGroup, true)
    };
  }

  const pool = ecosystemImagePool(type, categoryGroup);
  return {
    image: fallbackImageFor(`${location}-${type}-${categoryGroup}-${stores.length}-${storeProducts.length}`, pool),
    type,
    categoryGroup,
    label: ecosystemLabel(type, categoryGroup, false)
  };
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
    const storeLocation = String(store.location || store.county || "Unknown location");
    const matchesType = state.selectedType === "all" || store.businessType === state.selectedType;
    const matchesLocation = state.focusedLocation === "all" || storeLocation === state.focusedLocation;
    const productCategories = products
      .filter((product) => product.storeId === store.id)
      .map((product) => product.productCategory);
    const matchesCategory =
      state.selectedCategory === "all" || productCategories.includes(state.selectedCategory);
    const matchesSearch =
      !query ||
      String(store.storeName || "").toLowerCase().includes(query) ||
      storeLocation.toLowerCase().includes(query) ||
      productCategories.join(" ").toLowerCase().includes(query) ||
      products.some((product) => {
        if (product.storeId !== store.id) {
          return false;
        }

        return `${product.productName} ${product.productCategory}`.toLowerCase().includes(query);
      });

    return matchesType && matchesLocation && matchesCategory && matchesSearch;
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
    const matchesFocusedBusinessCategory =
      state.focusedBusinessCategory === "all" || product.productCategory === state.focusedBusinessCategory;
    const matchesSearch =
      !query ||
      product.productName.toLowerCase().includes(query) ||
      product.productCategory.toLowerCase().includes(query) ||
      (product.productOffer || "").toLowerCase().includes(query);

    return inVisibleStore && matchesCategory && matchesFocusedStore && matchesFocusedBusinessCategory && matchesSearch;
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
      image: offer.image || offer.offerImage || "",
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
      image: product.productImage || "",
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

function storeTillNumber(store) {
  return String((store && store.tillNumber) || "").trim();
}

function storePochiNumber(store) {
  return String((store && store.pochiNumber) || "").trim();
}

function storeCardAccount(store) {
  return String((store && (store.bankAccount || store.cardAccount)) || "").trim();
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

    if (clickCount === 4) {
      clickCount = 0;
      window.location.href = "./admin.html";
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
      state.focusedBusinessCategory = "all";
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
      state.focusedBusinessCategory = "all";
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
          <div class="deal-visual">
            ${offer.image ? `<img src="${offer.image}" alt="${offer.title}">` : `<span>${offer.title.charAt(0)}</span>`}
          </div>
          <div class="deal-copy">
            <div class="deal-head">
              <div>
                <h4>${offer.title}</h4>
                <p>${store ? store.storeName : "Approved seller"}</p>
              </div>
              <span class="status-pill status-pill--timed">${offer.expires}</span>
            </div>
            <p>${offer.note}</p>
            ${button}
          </div>
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
      const store = getStore(button.dataset.offerStore);
      state.focusedLocation = store ? String(store.location || store.county || state.focusedLocation) : state.focusedLocation;
      state.focusedStoreId = button.dataset.offerStore;
      state.focusedBusinessCategory = "all";
      renderMarket();
      document.getElementById("productGrid").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function storeRating(store, productCount) {
  const seed = String(store.id || store.storeName || "").split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const rating = 4.2 + ((seed + productCount) % 7) / 10;
  return Math.min(4.9, rating).toFixed(1);
}

function renderStores() {
  const container = document.getElementById("storeGrid");
  const summary = document.getElementById("browseSummary");
  const list = visibleStores();
  const allStores = approvedStores().filter((store) => {
    const matchesType = state.selectedType === "all" || store.businessType === state.selectedType;
    const query = state.search.toLowerCase();
    return matchesType && (!query || String(store.storeName || "").toLowerCase().includes(query) || String(store.location || store.county || "").toLowerCase().includes(query));
  });
  const profile = buyerProfile();
  const hasBuyerCoordinates =
    Number.isFinite(Number(profile.latitude)) && Number.isFinite(Number(profile.longitude));

  summary.textContent = state.focusedLocation === "all" ? `${allStores.length} businesses by location` : `${list.length} sellers visible`;

  if (state.focusedLocation === "all") {
    const grouped = allStores.reduce((map, store) => {
      const key = String(store.location || store.county || "Unknown location");
      const current = map.get(key) || [];
      current.push(store);
      map.set(key, current);
      return map;
    }, new Map());

    if (!grouped.size) {
      container.innerHTML = '<div class="card">No approved sellers match the current filters yet.</div>';
      return;
    }

    container.innerHTML = [...grouped.entries()].map(([location, stores]) => {
      const storeProducts = sellerProducts().filter((product) => stores.some((store) => store.id === product.storeId));
      const productCount = storeProducts.length;
      const locationImage = locationCardImage(location, stores, storeProducts);
      const image = locationImage.image;
      const categories = [...new Set(
        storeProducts.map((product) => product.productCategory)
      )];
      return `
        <article class="store-card location-card">
          <div class="location-card-media">
            <img src="${image}" alt="${location} businesses">
          </div>
          <div class="compact-card-body">
            <div>
              <p class="eyebrow">Location</p>
              <h3>${location}</h3>
            </div>
            <span class="market-type-badge market-type-badge--${locationImage.type}">${locationImage.label}</span>
            <p>${productCount} products across ${categories.length || 1} aisles.</p>
            <div class="tag-row">
              ${categories.slice(0, 3).map((category) => `<span class="store-chip">${category}</span>`).join("")}
            </div>
            <div class="compact-card-footer">
              <span class="summary-chip">${stores.length} businesses</span>
              <button class="button button-primary button-small" data-focus-location="${location}" type="button">Open</button>
            </div>
          </div>
        </article>
      `;
    }).join("");

    container.querySelectorAll("[data-focus-location]").forEach((button) => {
      button.addEventListener("click", () => {
        state.focusedLocation = button.dataset.focusLocation;
        state.focusedStoreId = "all";
        state.focusedBusinessCategory = "all";
        renderMarket();
      });
    });
    return;
  }

  if (!list.length) {
    container.innerHTML = '<div class="card">No approved sellers match the current filters yet.</div>';
    return;
  }

  container.innerHTML = `
    <article class="store-card">
      <div class="section-head">
        <strong>${state.focusedLocation}</strong>
        <button class="button button-outline button-small" data-clear-location type="button">All locations</button>
      </div>
    </article>
    ${list
    .map((store) => {
      const county = store.county || store.location || state.focusedLocation || "Location";
      const localArea = store.location || store.county || "Business location";
      const paymentLabel = storeTillNumber(store)
        ? `Till ${storeTillNumber(store)}`
        : storePochiNumber(store)
          ? `Pochi ${storePochiNumber(store)}`
          : storeCardAccount(store)
            ? `Bank ${storeCardAccount(store)}`
            : "Payment details pending";
      const phoneLabel = store.phone || store.mpesaNumber || store.pochiNumber || "Phone pending";
      const image = store.logoImage || store.businessImage || store.image || storePrimaryImage(store.id) || fallbackImageFor(store.storeName);
      const storeProducts = sellerProducts().filter((product) => product.storeId === store.id);
      const productCount = storeProducts.length;
      const deliveryLabel = store.deliveryAvailability || store.deliveryStatus || "Delivery available";
      const categories = [...new Set(storeProducts.map((product) => product.productCategory).filter(Boolean))];
      const description = store.description || store.deliveryNotes || `${categories.slice(0, 3).join(", ") || "Retail and wholesale items"} from ${store.storeName}.`;

      return `
        <article class="store-card business-directory-card ${state.focusedStoreId === store.id ? "is-active" : ""}">
          <div class="business-logo">
              ${image ? `<img src="${image}" alt="${store.storeName}">` : `<span>${String(store.storeName || "S").charAt(0)}</span>`}
          </div>
          <div class="compact-card-body">
            <div class="business-card-title-row">
              <h3>${store.storeName}</h3>
              <span class="business-rating">★ ${storeRating(store, productCount)}</span>
            </div>
            <p class="business-description">${description}</p>
            <div class="business-meta-row">
              <span>${county}</span>
              <span>${localArea}</span>
              <span>${productCount} items</span>
            </div>
            <div class="business-meta-row">
              <span>${deliveryLabel}</span>
              <span>${paymentLabel}</span>
            </div>
            <div class="compact-card-footer">
              <a class="business-cart-button" href="./cart.html" aria-label="Open cart for ${store.storeName}">Cart</a>
              <button class="button button-primary business-menu-button" data-focus-store="${store.id}" type="button">
                ${state.focusedStoreId === store.id ? "Close" : "View"}
              </button>
            </div>
          </div>
        </article>
      `;
    })
    .join("")}`;

  container.querySelector("[data-clear-location]")?.addEventListener("click", () => {
    state.focusedLocation = "all";
    state.focusedStoreId = "all";
    state.focusedBusinessCategory = "all";
    renderMarket();
  });

  container.querySelectorAll("[data-focus-store]").forEach((button) => {
    button.addEventListener("click", () => {
      state.focusedStoreId = state.focusedStoreId === button.dataset.focusStore ? "all" : button.dataset.focusStore;
      state.focusedBusinessCategory = "all";
      renderMarket();
      document.getElementById("productGrid").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function renderProducts() {
  const container = document.getElementById("productGrid");
  const summary = document.getElementById("productCountSummary");
  const productSection = container?.closest(".section-stack");
  if (productSection) {
    productSection.classList.toggle("is-hidden", state.focusedStoreId === "all");
  }
  if (state.focusedStoreId === "all") {
    if (summary) {
      summary.textContent = "Choose a business";
    }
    if (container) {
      container.innerHTML = "";
    }
    return;
  }
  const list = visibleProducts();
  summary.textContent =
    state.focusedStoreId === "all"
      ? `${list.length} products`
      : state.focusedBusinessCategory === "all"
        ? `${new Set(list.map((product) => product.productCategory || "Other")).size} categories from selected seller`
        : `${list.length} products in ${state.focusedBusinessCategory}`;

  if (!list.length) {
    container.innerHTML = '<div class="card">No products match the current filters yet.</div>';
    return;
  }

  if (state.focusedStoreId !== "all") {
    const grouped = list.reduce((map, product) => {
      const key = product.productCategory || "Other";
      const current = map.get(key) || [];
      current.push(product);
      map.set(key, current);
      return map;
    }, new Map());

    const shelfEntries = state.focusedBusinessCategory === "all"
      ? [...grouped.entries()]
      : [[state.focusedBusinessCategory, list]];

    container.innerHTML = shelfEntries.map(([category, products]) => `
      <section class="category-shelf supermarket-shelf">
        <div class="section-head shelf-head">
          <div>
            <p class="eyebrow">Aisle</p>
            <h3>${category}</h3>
          </div>
          <span class="summary-chip">${products.length} item${products.length === 1 ? "" : "s"}</span>
        </div>
        <div class="product-grid product-grid--shelf">
          ${products.map((product) => productCardHtml(product)).join("")}
        </div>
      </section>
    `).join("");
  } else {
    container.innerHTML = list.map(productCardHtml).join("");
  }

  container.querySelectorAll("[data-add-product]").forEach((button) => {
    button.addEventListener("click", () => {
      addToCart(button.dataset.addProduct);
    });
  });
}

function productCardHtml(product) {
  const store = getStore(product.storeId);
  return `
    <article class="product-card supermarket-product-card">
      <div class="product-visual">
        ${product.productImage ? `<img src="${product.productImage}" alt="${product.productName}">` : `<span>${product.productCategory}</span>`}
      </div>
      <div class="product-head">
        <div>
          <h3>${product.productName}</h3>
          <p class="tiny">${product.productCategory || "Product"} | ${store ? store.storeName : "Seller"}</p>
        </div>
      </div>
      <strong class="product-price">${currency(product.productPrice)}</strong>
      ${product.productOffer ? `<p class="product-offer-label">${product.productOffer}</p>` : '<p class="product-offer-label product-offer-label--muted">Everyday item</p>'}
      <button class="button button-primary button-small" data-add-product="${product.id}" type="button">Add to cart</button>
    </article>
  `;
}

function renderCartSummary() {
  const subtotal = state.cart.reduce((sum, item) => {
    const product = getProduct(item.productId);
    return sum + (product ? product.productPrice * item.quantity : 0);
  }, 0);
  const itemCount = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  const delivery = buildDeliverySummary(state.cart);
  const methods = availableCheckoutMethods(state.cart);

  const cartCountBadge = document.getElementById("cartCountBadge");
  const floatingCartCount = document.getElementById("floatingCartCount");
  const subtotalValue = document.getElementById("cartSubtotalValue");
  const deliveryFeeValue = document.getElementById("deliveryFeeValue");

  if (cartCountBadge) {
    cartCountBadge.textContent = String(itemCount);
  }
  if (floatingCartCount) {
    floatingCartCount.textContent = String(itemCount);
    floatingCartCount.classList.toggle("is-empty", itemCount === 0);
  }
  if (subtotalValue) {
    subtotalValue.textContent = currency(subtotal);
  }
  if (deliveryFeeValue) {
    deliveryFeeValue.textContent = itemCount ? delivery.label : currency(0);
  }

  const infoBox = document.querySelector(".cart-summary-card .info-box");
  if (!infoBox) {
    return;
  }
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
    state.focusedBusinessCategory = "all";
  }

  if (
    state.focusedBusinessCategory !== "all" &&
    !sellerProducts().some((product) =>
      product.storeId === state.focusedStoreId && product.productCategory === state.focusedBusinessCategory
    )
  ) {
    state.focusedBusinessCategory = "all";
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
    state.focusedLocation = "all";
    state.focusedStoreId = "all";
    state.focusedBusinessCategory = "all";
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
