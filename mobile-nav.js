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

  function initTopbarMenu() {
    const topbar = document.querySelector(".topbar");
    const nav = topbar?.querySelector(".topbar-actions");
    if (!topbar || !nav || nav.dataset.mobileNavReady === "true") {
      return;
    }

    nav.dataset.mobileNavReady = "true";
    if (!nav.id) {
      nav.id = `topbarActions-${Math.random().toString(36).slice(2, 8)}`;
    }

    const toggle = document.createElement("button");
    toggle.className = "topbar-menu-toggle";
    toggle.type = "button";
    toggle.setAttribute("aria-label", "Open navigation menu");
    toggle.setAttribute("aria-controls", nav.id);
    toggle.setAttribute("aria-expanded", "false");
    toggle.innerHTML = "<span></span><span></span><span></span>";

    const overlay = document.createElement("div");
    overlay.className = "topbar-menu-overlay";
    overlay.setAttribute("aria-hidden", "true");

    topbar.appendChild(toggle);
    topbar.insertAdjacentElement("afterend", overlay);

    const close = () => {
      nav.classList.remove(OPEN_CLASS);
      overlay.classList.remove(OPEN_CLASS);
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Open navigation menu");
      document.body.classList.remove(BODY_OPEN_CLASS);
    };

    const open = () => {
      if (!shouldUseDrawer()) {
        close();
        return;
      }
      nav.classList.add(OPEN_CLASS);
      overlay.classList.add(OPEN_CLASS);
      toggle.setAttribute("aria-expanded", "true");
      toggle.setAttribute("aria-label", "Close navigation menu");
      document.body.classList.add(BODY_OPEN_CLASS);
    };

    toggle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      nav.classList.contains(OPEN_CLASS) ? close() : open();
    });

    overlay.addEventListener("click", close);

    nav.addEventListener("click", (event) => {
      if (event.target.closest("a, button")) {
        window.setTimeout(close, 0);
      }
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
