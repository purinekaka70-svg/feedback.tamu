(() => {
  let installPrompt = null;
  const button = document.getElementById("employeeInstallApp");
  const status = document.getElementById("employeeInstallStatus");

  function isInstalled() {
    return window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }

  function refreshButton() {
    if (!button) return;
    const signedIn = document.body.classList.contains("employee-dashboard-active");
    button.hidden = !signedIn || isInstalled();
    if (!signedIn && status) status.textContent = "";
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    refreshButton();
  });

  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    refreshButton();
    if (status) status.textContent = "Employee app installed on this device.";
  });

  button?.addEventListener("click", async () => {
    if (!document.body.classList.contains("employee-dashboard-active")) return;
    if (!installPrompt) {
      if (status) status.textContent = "Open your browser menu and choose Install app or Add to Home Screen.";
      return;
    }

    const promptEvent = installPrompt;
    installPrompt = null;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (status) {
      status.textContent = choice?.outcome === "accepted"
        ? "Employee app is installing."
        : "Installation was cancelled. You can install it later from this button.";
    }
    refreshButton();
  });

  new MutationObserver(refreshButton).observe(document.body, {
    attributes: true,
    attributeFilter: ["class"]
  });
  refreshButton();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./seller-sw.js", { scope: "./" }).catch(() => {
        if (status && document.body.classList.contains("employee-dashboard-active")) {
          status.textContent = "The app can be installed, but offline support is unavailable.";
        }
      });
    }, { once: true });
  }
})();
