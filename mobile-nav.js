(function () {
  const MOBILE_QUERY = "(max-width: 760px)";
  const OPEN_CLASS = "is-open";
  const BODY_OPEN_CLASS = "topbar-menu-open";

  function ready(callback) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback, { once: true });
      return;
    }
    callback();
  }

  function shouldUseDrawer() {
    return window.matchMedia(MOBILE_QUERY).matches
      && !document.body.classList.contains("seller-dashboard-active")
      && !document.body.classList.contains("admin-dashboard-active")
      && !document.body.classList.contains("employee-dashboard-active");
  }

  function cloneMenuItem(item, close) {
    const clone = item.cloneNode(true);
    clone.removeAttribute("id");
    clone.classList.add("mobile-menu-item");

    if (clone.tagName === "A") {
      clone.addEventListener("click", () => {
        close();
      });
      return clone;
    }

    clone.addEventListener("click", (event) => {
      event.preventDefault();
      close();
      item.click();
    });
    return clone;
  }

  function initTopbarMenu() {
    const topbar = document.querySelector(".topbar");
    const nav = topbar?.querySelector(".topbar-actions");
    if (!topbar || !nav || nav.dataset.mobileNavReady === "true") {
      return;
    }

    nav.dataset.mobileNavReady = "true";

    const menuId = `mobileNavDrawer-${Math.random().toString(36).slice(2, 8)}`;
    const toggle = document.createElement("button");
    toggle.className = "topbar-menu-toggle";
    toggle.type = "button";
    toggle.setAttribute("aria-label", "Open navigation menu");
    toggle.setAttribute("aria-controls", menuId);
    toggle.setAttribute("aria-expanded", "false");
    toggle.innerHTML = "<span></span><span></span><span></span>";

    const overlay = document.createElement("div");
    overlay.className = "topbar-menu-overlay";
    overlay.setAttribute("aria-hidden", "true");

    const drawer = document.createElement("nav");
    drawer.id = menuId;
    drawer.className = "topbar-mobile-drawer";
    drawer.setAttribute("aria-label", "Mobile navigation");
    drawer.setAttribute("aria-hidden", "true");

    const drawerHead = document.createElement("div");
    drawerHead.className = "topbar-mobile-drawer-head";
    drawerHead.innerHTML = "<strong>Menu</strong>";

    const closeButton = document.createElement("button");
    closeButton.className = "topbar-menu-close";
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "Close navigation menu");
    closeButton.textContent = "X";
    drawerHead.appendChild(closeButton);
    drawer.appendChild(drawerHead);

    const menuList = document.createElement("div");
    menuList.className = "topbar-mobile-menu-list";
    drawer.appendChild(menuList);

    const close = () => {
      drawer.classList.remove(OPEN_CLASS);
      overlay.classList.remove(OPEN_CLASS);
      drawer.setAttribute("aria-hidden", "true");
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Open navigation menu");
      document.body.classList.remove(BODY_OPEN_CLASS);
    };

    const rebuildMenu = () => {
      menuList.textContent = "";
      nav.querySelectorAll("a, button").forEach((item) => {
        menuList.appendChild(cloneMenuItem(item, close));
      });
    };

    const open = () => {
      if (!shouldUseDrawer()) {
        close();
        return;
      }
      rebuildMenu();
      drawer.classList.add(OPEN_CLASS);
      overlay.classList.add(OPEN_CLASS);
      drawer.setAttribute("aria-hidden", "false");
      toggle.setAttribute("aria-expanded", "true");
      toggle.setAttribute("aria-label", "Close navigation menu");
      document.body.classList.add(BODY_OPEN_CLASS);
      window.setTimeout(() => {
        drawer.querySelector("a, button")?.focus({ preventScroll: true });
      }, 0);
    };

    topbar.appendChild(toggle);
    document.body.appendChild(overlay);
    document.body.appendChild(drawer);

    toggle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      drawer.classList.contains(OPEN_CLASS) ? close() : open();
    });

    closeButton.addEventListener("click", close);
    overlay.addEventListener("click", close);
    drawer.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        close();
      }
    });

    window.addEventListener("resize", () => {
      if (!shouldUseDrawer()) {
        close();
      }
    });
  }

  ready(initTopbarMenu);
})();
