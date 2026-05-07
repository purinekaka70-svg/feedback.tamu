(function () {
  "use strict";

  const STORAGE = {
    sellers: "tamu_sellers",
    currentSeller: "tamu_current_seller",
    products: "tamu_products",
    orders: "tamu_orders"
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const read = (key, fallback) => {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch (_) {
      return fallback;
    }
  };

  const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const normalise = (value) => String(value || "").trim().toLowerCase();

  function getField(form, names) {
    for (const name of names) {
      const field = form.querySelector(`[name="${name}"], #${name}, .${name}`);
      if (field) return field;
    }
    return null;
  }

  function message(target, text, type = "info") {
    let box = target && target.querySelector ? target.querySelector("[data-portal-message]") : null;
    if (!box && target && target.insertAdjacentHTML) {
      target.insertAdjacentHTML("afterbegin", '<div data-portal-message class="portal-message" aria-live="polite"></div>');
      box = target.querySelector("[data-portal-message]");
    }
    if (box) {
      box.textContent = text;
      box.dataset.type = type;
    } else if (text) {
      alert(text);
    }
  }

  function captureCoordinates(button) {
    const form = button.closest("form") || document;
    const latField = getField(form, ["latitude", "lat", "sellerLatitude"]);
    const lngField = getField(form, ["longitude", "lng", "lon", "sellerLongitude"]);
    const coordField = getField(form, ["coordinates", "cordinates", "coords", "locationCoordinates"]);

    if (!navigator.geolocation) {
      message(form, "Your browser does not support location capture.", "error");
      return;
    }

    button.disabled = true;
    const oldText = button.textContent;
    button.textContent = "Capturing location...";

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude.toFixed(6);
        const lng = position.coords.longitude.toFixed(6);
        if (latField) latField.value = lat;
        if (lngField) lngField.value = lng;
        if (coordField) coordField.value = `${lat}, ${lng}`;
        button.dataset.latitude = lat;
        button.dataset.longitude = lng;
        message(form, `Location captured: ${lat}, ${lng}`, "success");
        button.disabled = false;
        button.textContent = oldText;
      },
      (error) => {
        const text = error.code === error.PERMISSION_DENIED
          ? "Location permission was denied. Please allow location access and try again."
          : "Could not capture your location. Check GPS/network and try again.";
        message(form, text, "error");
        button.disabled = false;
        button.textContent = oldText;
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  function wireCoordinateButtons() {
    const candidates = $$("button, input[type='button'], input[type='submit'], a").filter((el) => {
      const text = normalise(`${el.textContent} ${el.value || ""} ${el.id} ${el.className}`);
      return text.includes("coordinate") || text.includes("cordinate") || text.includes("location");
    });

    candidates.forEach((button) => {
      if (button.dataset.coordinatesReady) return;
      button.dataset.coordinatesReady = "true";
      button.addEventListener("click", (event) => {
        const text = normalise(`${button.textContent} ${button.value || ""} ${button.id} ${button.className}`);
        if (text.includes("coordinate") || text.includes("cordinate") || text.includes("location")) {
          event.preventDefault();
          captureCoordinates(button);
        }
      });
    });
  }

  function upsertSeller(data) {
    const sellers = read(STORAGE.sellers, []);
    const existingIndex = sellers.findIndex((seller) => normalise(seller.email) === normalise(data.email));
    const seller = {
      id: existingIndex >= 0 ? sellers[existingIndex].id : uid(),
      status: existingIndex >= 0 ? sellers[existingIndex].status : "pending",
      createdAt: existingIndex >= 0 ? sellers[existingIndex].createdAt : new Date().toISOString(),
      ...data,
      updatedAt: new Date().toISOString()
    };
    sellers[existingIndex >= 0 ? existingIndex : sellers.length] = seller;
    write(STORAGE.sellers, sellers);
    return seller;
  }

  function sellerFromForm(form) {
    const data = new FormData(form);
    const email = data.get("email") || data.get("sellerEmail") || getField(form, ["email", "sellerEmail"])?.value;
    const password = data.get("password") || data.get("sellerPassword") || getField(form, ["password", "sellerPassword"])?.value;
    const name = data.get("name") || data.get("sellerName") || data.get("businessName") || getField(form, ["name", "sellerName", "businessName"])?.value;
    const phone = data.get("phone") || data.get("sellerPhone") || getField(form, ["phone", "sellerPhone"])?.value;
    const coordinates = data.get("coordinates") || data.get("cordinates") || getField(form, ["coordinates", "cordinates", "coords"])?.value;

    return {
      name: String(name || "").trim(),
      email: String(email || "").trim(),
      phone: String(phone || "").trim(),
      password: String(password || "").trim(),
      coordinates: String(coordinates || "").trim()
    };
  }

  function looksLikeRegister(form) {
    const text = normalise(`${form.id} ${form.className} ${form.textContent}`);
    return text.includes("register") || text.includes("sign up") || text.includes("create account");
  }

  function looksLikeLogin(form) {
    const text = normalise(`${form.id} ${form.className} ${form.textContent}`);
    return text.includes("login") || text.includes("log in") || text.includes("sign in");
  }

  function wireSellerForms() {
    $$("form").forEach((form) => {
      if (form.dataset.sellerPortalReady) return;
      const hasEmail = !!getField(form, ["email", "sellerEmail"]);
      const hasPassword = !!getField(form, ["password", "sellerPassword"]);
      if (!hasEmail || !hasPassword) return;

      form.dataset.sellerPortalReady = "true";
      form.addEventListener("submit", (event) => {
        const seller = sellerFromForm(form);
        if (!seller.email || !seller.password) return;

        if (looksLikeRegister(form)) {
          event.preventDefault();
          const saved = upsertSeller(seller);
          message(form, saved.status === "approved"
            ? "Registration updated. Your seller account is approved."
            : "Registration sent. Please wait for admin approval before logging in.",
            saved.status === "approved" ? "success" : "info");
          form.reset();
          return;
        }

        if (looksLikeLogin(form)) {
          const sellers = read(STORAGE.sellers, []);
          const match = sellers.find((item) => normalise(item.email) === normalise(seller.email) && item.password === seller.password);
          if (!match) return;
          event.preventDefault();
          if (match.status !== "approved") {
            message(form, "Your seller account is pending admin approval.", "error");
            return;
          }
          write(STORAGE.currentSeller, match);
          window.location.hash = "dashboard";
          ensureDashboard();
        }
      }, true);
    });
  }

  function currentSeller() {
    return read(STORAGE.currentSeller, null);
  }

  function ensureDashboard() {
    if (!/seller/i.test(location.pathname) && !document.body.dataset.sellerPage) return;
    if ($("#seller-dashboard-shell")) return;

    const seller = currentSeller();
    if (!seller) return;

    document.body.dataset.sellerPage = "true";
    document.body.insertAdjacentHTML("afterbegin", `
      <button class="seller-menu-toggle" type="button" aria-label="Toggle seller dashboard" aria-expanded="false">☰</button>
      <aside class="seller-sidebar" data-open="false">
        <strong>Seller Dashboard</strong>
        <button type="button" data-section="products">Products</button>
        <button type="button" data-section="offers">Offers</button>
        <button type="button" data-section="orders">Orders</button>
        <button type="button" data-section="settings">Settings</button>
        <button type="button" data-seller-logout>Logout</button>
      </aside>
      <main id="seller-dashboard-shell" class="seller-dashboard-shell">
        <section class="seller-panel" data-panel="products">
          <h2>Products</h2>
          <form id="seller-product-form">
            <input name="name" placeholder="Product name" required>
            <select name="category" required>
              <option value="">Choose category</option>
              <option>Fruits</option><option>Vegetables</option><option>Cereals</option>
              <option>Dairy</option><option>Meat</option><option>Drinks</option><option>Other</option>
            </select>
            <input name="price" type="number" min="0" step="0.01" placeholder="Price" required>
            <input name="image" type="url" placeholder="Image URL">
            <input name="imageFile" type="file" accept="image/*">
            <textarea name="description" placeholder="Description"></textarea>
            <button type="submit">Upload goods</button>
          </form>
          <div id="seller-products-list"></div>
        </section>
        <section class="seller-panel" data-panel="offers" hidden>
          <h2>Offers</h2>
          <div id="seller-offers-list"></div>
        </section>
        <section class="seller-panel" data-panel="orders" hidden>
          <h2>Orders</h2>
          <div id="seller-orders-list"></div>
        </section>
        <section class="seller-panel" data-panel="settings" hidden>
          <h2>Seller Settings</h2>
          <p>${seller.name || seller.email}</p>
          <p>${seller.coordinates || "No coordinates saved yet"}</p>
        </section>
      </main>
    `);

    const style = document.createElement("style");
    style.textContent = `
      .portal-message{margin:.75rem 0;padding:.75rem;border-radius:8px;background:#eef4ff;color:#18315c}
      .portal-message[data-type="success"]{background:#e8f7ed;color:#17552c}
      .portal-message[data-type="error"]{background:#fdecec;color:#7f1d1d}
      .seller-menu-toggle{position:fixed;top:1rem;left:1rem;z-index:1001;width:44px;height:44px;border:0;border-radius:8px;background:#111827;color:#fff;font-size:1.4rem}
      .seller-sidebar{position:fixed;top:0;left:0;bottom:0;z-index:1000;width:250px;padding:5rem 1rem 1rem;background:#fff;box-shadow:0 12px 36px rgba(0,0,0,.18);transform:translateX(-105%);transition:transform .2s ease;display:flex;gap:.65rem;flex-direction:column}
      .seller-sidebar[data-open="true"]{transform:translateX(0)}
      .seller-sidebar button{padding:.75rem;border:1px solid #d1d5db;border-radius:8px;background:#f9fafb;text-align:left}
      .seller-dashboard-shell{max-width:1100px;margin:5.5rem auto 2rem;padding:1rem}
      .seller-panel form{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.75rem;margin:1rem 0}
      .seller-panel input,.seller-panel select,.seller-panel textarea{min-height:42px;padding:.65rem;border:1px solid #cbd5e1;border-radius:8px}
      .seller-panel textarea{grid-column:1/-1;min-height:90px}
      .seller-panel form button{min-height:42px;border:0;border-radius:8px;background:#0f766e;color:white;font-weight:700}
      .seller-product-card,.category-product-card,.seller-order-card{border:1px solid #e5e7eb;border-radius:8px;padding:1rem;margin:.75rem 0;background:#fff}
      .category-product-card img{width:100%;max-height:220px;object-fit:cover;border-radius:8px;margin-bottom:.75rem}
      .seller-product-actions{display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.75rem}
      .seller-product-actions input{width:120px}
      @media (min-width: 900px){.seller-dashboard-shell{padding-left:270px}.seller-sidebar{transform:none}.seller-menu-toggle{display:none}}
    `;
    document.head.appendChild(style);
    wireDashboard();
    renderSellerProducts();
    renderSellerOrders();
  }

  function wireDashboard() {
    $(".seller-menu-toggle")?.addEventListener("click", () => {
      const sidebar = $(".seller-sidebar");
      const open = sidebar.dataset.open !== "true";
      sidebar.dataset.open = String(open);
      $(".seller-menu-toggle").setAttribute("aria-expanded", String(open));
    });

    $$(".seller-sidebar [data-section]").forEach((button) => {
      button.addEventListener("click", () => {
        $$(".seller-panel").forEach((panel) => panel.hidden = panel.dataset.panel !== button.dataset.section);
        const sidebar = $(".seller-sidebar");
        if (sidebar) sidebar.dataset.open = "false";
      });
    });

    $("[data-seller-logout]")?.addEventListener("click", () => {
      localStorage.removeItem(STORAGE.currentSeller);
      location.reload();
    });

    $("#seller-product-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const seller = currentSeller();
      if (!seller) return;
      const data = new FormData(form);
      const imageFile = data.get("imageFile");
      const uploadedImage = imageFile && imageFile.size ? await fileToDataUrl(imageFile) : "";
      const products = read(STORAGE.products, []);
      products.push({
        id: uid(),
        sellerId: seller.id,
        sellerName: seller.name || seller.email,
        name: String(data.get("name") || "").trim(),
        category: String(data.get("category") || "Other").trim(),
        price: Number(data.get("price") || 0),
        image: uploadedImage || String(data.get("image") || "").trim(),
        description: String(data.get("description") || "").trim(),
        offer: "",
        createdAt: new Date().toISOString()
      });
      write(STORAGE.products, products);
      form.reset();
      renderSellerProducts();
      renderCategories();
    });
  }

  function renderSellerProducts() {
    const seller = currentSeller();
    const target = $("#seller-products-list");
    if (!seller || !target) return;
    const products = read(STORAGE.products, []).filter((product) => product.sellerId === seller.id);
    target.innerHTML = products.length ? products.map((product) => `
      <article class="seller-product-card">
        <strong>${escapeHtml(product.name)}</strong>
        <p>${escapeHtml(product.category)} - KSh ${Number(product.price).toLocaleString()}</p>
        <p>${escapeHtml(product.offer || "No offer posted")}</p>
        <div class="seller-product-actions">
          <input type="number" min="0" step="0.01" value="${product.price}" aria-label="New price">
          <button type="button" data-price="${product.id}">Alter price</button>
          <input type="text" value="${escapeAttr(product.offer || "")}" placeholder="Offer text" aria-label="Offer text">
          <button type="button" data-offer="${product.id}">Post offer</button>
          <button type="button" data-delete="${product.id}">Remove</button>
        </div>
      </article>
    `).join("") : "<p>No goods uploaded yet.</p>";

    target.querySelectorAll("[data-price]").forEach((button) => {
      button.addEventListener("click", () => {
        const input = button.previousElementSibling;
        updateProduct(button.dataset.price, { price: Number(input.value || 0) });
      });
    });
    target.querySelectorAll("[data-offer]").forEach((button) => {
      button.addEventListener("click", () => {
        const input = button.previousElementSibling;
        updateProduct(button.dataset.offer, { offer: input.value.trim() });
      });
    });
    target.querySelectorAll("[data-delete]").forEach((button) => {
      button.addEventListener("click", () => {
        write(STORAGE.products, read(STORAGE.products, []).filter((product) => product.id !== button.dataset.delete));
        renderSellerProducts();
        renderCategories();
      });
    });
  }

  function updateProduct(id, patch) {
    const products = read(STORAGE.products, []).map((product) => product.id === id ? { ...product, ...patch } : product);
    write(STORAGE.products, products);
    renderSellerProducts();
    renderCategories();
  }

  function fileToDataUrl(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => resolve("");
      reader.readAsDataURL(file);
    });
  }

  function renderSellerOrders() {
    const seller = currentSeller();
    const target = $("#seller-orders-list");
    if (!seller || !target) return;
    const sellerProductIds = read(STORAGE.products, []).filter((product) => product.sellerId === seller.id).map((product) => product.id);
    const orders = read(STORAGE.orders, []).filter((order) => sellerProductIds.includes(order.productId));
    target.innerHTML = orders.length ? orders.map((order) => `
      <article class="seller-order-card">
        <strong>Order ${escapeHtml(order.id)}</strong>
        <p>${escapeHtml(order.customer || "Customer")} - ${escapeHtml(order.status || "Pending")}</p>
      </article>
    `).join("") : "<p>No orders yet.</p>";
  }

  function renderCategories() {
    const products = read(STORAGE.products, []);
    const categoryTargets = $$("[data-category-products], #category-products, .category-products, #categories, .categories-grid");
    if (!categoryTargets.length) return;

    const html = products.length ? products.map((product) => `
      <article class="category-product-card" data-category="${escapeAttr(product.category)}">
        ${product.image ? `<img src="${escapeAttr(product.image)}" alt="${escapeAttr(product.name)}" loading="lazy">` : ""}
        <strong>${escapeHtml(product.name)}</strong>
        <p>${escapeHtml(product.category)} - KSh ${Number(product.price).toLocaleString()}</p>
        <p>${escapeHtml(product.sellerName || "Seller")}</p>
        ${product.offer ? `<p><b>Offer:</b> ${escapeHtml(product.offer)}</p>` : ""}
      </article>
    `).join("") : "<p>No products available yet. Approved sellers can upload goods from their dashboard.</p>";

    categoryTargets.forEach((target) => {
      target.innerHTML = html;
    });
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[char]));
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }

  function initAdminHelpers() {
    window.tamuAdmin = window.tamuAdmin || {};
    window.tamuAdmin.approveSeller = function approveSeller(email) {
      const sellers = read(STORAGE.sellers, []).map((seller) =>
        normalise(seller.email) === normalise(email) ? { ...seller, status: "approved", approvedAt: new Date().toISOString() } : seller
      );
      write(STORAGE.sellers, sellers);
      return sellers.find((seller) => normalise(seller.email) === normalise(email));
    };
    window.tamuAdmin.pendingSellers = function pendingSellers() {
      return read(STORAGE.sellers, []).filter((seller) => seller.status !== "approved");
    };
  }

  function ensureAdminApprovalPanel() {
    if (!/admin/i.test(location.pathname) || $("#seller-approval-panel")) return;

    document.body.insertAdjacentHTML("beforeend", `
      <section id="seller-approval-panel" class="seller-approval-panel">
        <h2>Seller Approvals</h2>
        <div id="seller-approval-list"></div>
      </section>
    `);

    const style = document.createElement("style");
    style.textContent = `
      .seller-approval-panel{max-width:1100px;margin:2rem auto;padding:1rem}
      .seller-approval-card{border:1px solid #e5e7eb;border-radius:8px;padding:1rem;margin:.75rem 0;background:#fff;display:grid;gap:.5rem}
      .seller-approval-card button{width:max-content;padding:.65rem .9rem;border:0;border-radius:8px;background:#0f766e;color:#fff;font-weight:700}
    `;
    document.head.appendChild(style);
    renderSellerApprovals();
  }

  function renderSellerApprovals() {
    const target = $("#seller-approval-list");
    if (!target) return;

    const sellers = read(STORAGE.sellers, []);
    const pending = sellers.filter((seller) => seller.status !== "approved");
    target.innerHTML = pending.length ? pending.map((seller) => `
      <article class="seller-approval-card">
        <strong>${escapeHtml(seller.name || seller.email)}</strong>
        <span>${escapeHtml(seller.email)}</span>
        <span>${escapeHtml(seller.phone || "No phone saved")}</span>
        <span>${escapeHtml(seller.coordinates || "No coordinates saved")}</span>
        <button type="button" data-approve-seller="${escapeAttr(seller.email)}">Approve seller</button>
      </article>
    `).join("") : "<p>No pending sellers.</p>";

    target.querySelectorAll("[data-approve-seller]").forEach((button) => {
      button.addEventListener("click", () => {
        window.tamuAdmin.approveSeller(button.dataset.approveSeller);
        renderSellerApprovals();
      });
    });
  }

  function init() {
    wireCoordinateButtons();
    if (!$("#sellerRegistrationForm")) {
      wireSellerForms();
    }
    initAdminHelpers();
    ensureDashboard();
    ensureAdminApprovalPanel();
    renderCategories();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
