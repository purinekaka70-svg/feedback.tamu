(function () {
  "use strict";

  function initMobileTopbarMenu() {
    const topbar = document.querySelector(".topbar");
    const nav = topbar?.querySelector(".topbar-actions");
    if (!topbar || !nav || nav.dataset.mobileMenuReady === "true") {
      return;
    }

    nav.dataset.mobileMenuReady = "true";
    nav.id = nav.id || "primaryTopbarMenu";

    const toggle = document.createElement("button");
    toggle.className = "topbar-menu-toggle";
    toggle.type = "button";
    toggle.setAttribute("aria-label", "Open navigation menu");
    toggle.setAttribute("aria-controls", nav.id);
    toggle.setAttribute("aria-expanded", "false");
    toggle.innerHTML = "<span></span><span></span><span></span>";
    topbar.insertBefore(toggle, nav);

    const overlay = document.createElement("div");
    overlay.className = "topbar-menu-overlay";
    overlay.setAttribute("aria-hidden", "true");
    document.body.appendChild(overlay);

    const closeMenu = () => {
      nav.classList.remove("is-open");
      overlay.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
      document.body.classList.remove("topbar-menu-open");
    };

    const openMenu = () => {
      document.querySelectorAll(".admin-sidebar.is-open, .seller-workspace-nav.is-open, .employee-sidebar.is-open")
        .forEach((menu) => menu.classList.remove("is-open"));
      document.querySelectorAll(".admin-sidebar-overlay.is-open, .seller-menu-overlay.is-open, .employee-sidebar-overlay.is-open")
        .forEach((menuOverlay) => menuOverlay.classList.remove("is-open"));
      document.body.classList.remove("admin-menu-open", "seller-menu-open", "employee-menu-open");
      nav.classList.add("is-open");
      overlay.classList.add("is-open");
      toggle.setAttribute("aria-expanded", "true");
      document.body.classList.add("topbar-menu-open");
    };

    toggle.addEventListener("click", (event) => {
      event.stopPropagation();
      if (nav.classList.contains("is-open")) {
        closeMenu();
      } else {
        openMenu();
      }
    });
    overlay.addEventListener("click", closeMenu);
    nav.addEventListener("click", (event) => {
      if (event.target.closest("a, button")) {
        closeMenu();
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    });
    window.addEventListener("resize", () => {
      if (window.matchMedia("(min-width: 761px)").matches) {
        closeMenu();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initMobileTopbarMenu);
  } else {
    initMobileTopbarMenu();
  }

  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // The app still works normally when service worker registration is unavailable.
    });
  });
})();
