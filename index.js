const STORAGE_KEYS = {
  adminSession: "tamu_market_admin_session"
};

const ADMIN_LOGIN_ENDPOINT = "./api/admin/login.php";

function initReveal() {
  const items = document.querySelectorAll(".reveal");
  if (!items.length) {
    return;
  }

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
    { threshold: 0.1 }
  );

  items.forEach((item) => observer.observe(item));
}

function openAdminDashboard(status) {
  window.localStorage.setItem(STORAGE_KEYS.adminSession, "active");
  status.textContent = "Login successful. Redirecting...";
  window.setTimeout(() => {
    window.location.href = "./admin.html";
  }, 450);
}

function initAdminTrigger() {
  const footer = document.getElementById("footerTrigger");
  const modal = document.getElementById("adminLoginModal");
  const form = document.getElementById("adminLoginForm");
  const status = document.getElementById("adminLoginStatus");
  const usernameInput = document.getElementById("adminUsernameInput");
  const passwordInput = document.getElementById("adminPasswordInput");
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

  footer.addEventListener("click", (event) => {
    if (event.target.closest("[data-footer-link]")) {
      return;
    }
    window.location.href = "./admin.html";
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
      const response = await window.fetch(ADMIN_LOGIN_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ username, password })
      });
      const data = await response.json().catch(() => ({}));

      if (response.ok && data && data.ok) {
        openAdminDashboard(status);
        return;
      }

      status.textContent = data && data.message ? data.message : "Invalid admin credentials.";
    } catch (error) {
      status.textContent = "Could not reach admin login service.";
    }

  });
}

function initStorefrontSearch() {
  const form = document.querySelector(".store-search");
  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = String(new FormData(form).get("search") || "").trim();
    const destination = new URL("./categories.html", window.location.href);
    if (query) destination.searchParams.set("search", query);
    window.location.href = destination.href;
  });
}

function escapeMarkup(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function initHomeMarketplace() {
  const track = document.getElementById("homeMarketMarquee");
  const status = document.getElementById("homeMarketStatus");
  if (!track || !status) return;

  const editorialItems = [
    { name: "Fresh produce", category: "Everyday groceries", image: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=560&q=78" },
    { name: "Pantry favourites", category: "Stock up locally", image: "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?auto=format&fit=crop&w=560&q=78" },
    { name: "Made for your home", category: "Household essentials", image: "https://images.unsplash.com/photo-1585421514738-01798e348b17?auto=format&fit=crop&w=560&q=78" },
    { name: "Discover nearby shops", category: "Local businesses", image: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=560&q=78" }
  ];

  function render(items, live) {
    const displayItems = items.length ? items.slice(0, 12) : editorialItems;
    const cards = displayItems.map((item) => {
      const image = escapeMarkup(item.image || item.productImage || "");
      const name = escapeMarkup(item.name || item.productName || "Marketplace find");
      const category = escapeMarkup(item.categoryName || item.category || item.productCategory || item.businessName || "Local shop");
      const price = Number(item.price ?? item.productPrice);
      return `<a class="home-market-card" href="./categories.html" aria-label="Browse ${name} from the marketplace"><img src="${image}" alt="" loading="lazy"><span class="home-market-card-copy"><small>${category}</small><strong>${name}</strong>${live && Number.isFinite(price) && price > 0 ? `<b>KSh ${price.toLocaleString("en-KE")}</b>` : ""}</span></a>`;
    }).join("");
    track.innerHTML = cards + cards;
    track.classList.toggle("home-market-track--editorial", !live);
    status.textContent = live
      ? `Showing ${displayItems.length} products from approved local sellers.`
      : "A preview of what you can discover from local shops. Live product availability appears when the marketplace service is connected.";
  }

  render([], false);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8000);
  fetch("./api/marketplace/list.php?limit=12", { cache: "no-store", signal: controller.signal })
    .then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error("Marketplace unavailable");
      const products = (data.products || []).filter((product) => product && (product.name || product.productName));
      if (products.length) render(products, true);
    })
    .catch(() => {})
    .finally(() => window.clearTimeout(timeout));
}

initReveal();
initAdminTrigger();
initStorefrontSearch();
initHomeMarketplace();
