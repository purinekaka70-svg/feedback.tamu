(function () {
  const STORAGE_KEY = "tamu_onesignal_external_id";

  function cleanExternalId(value) {
    return String(value || "").trim().toLowerCase().slice(0, 128);
  }

  async function config() {
    const response = await fetch("./api/onesignal/config.php", { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    return response.ok && payload.ok && payload.appId ? payload : null;
  }

  async function initOneSignal() {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    const payload = await config().catch(() => null);
    if (!payload?.appId) return null;
    return new Promise((resolve) => {
      window.OneSignalDeferred.push(async function (OneSignal) {
        try {
          await OneSignal.init({
            appId: payload.appId,
            serviceWorkerPath: "OneSignalSDKWorker.js"
          });
          const prompted = window.localStorage.getItem("tamu_onesignal_prompted") === "true";
          if (!prompted && OneSignal.Slidedown?.promptPush) {
            window.localStorage.setItem("tamu_onesignal_prompted", "true");
            OneSignal.Slidedown.promptPush().catch(() => {});
          }
          resolve(OneSignal);
        } catch {
          resolve(null);
        }
      });
    });
  }

  async function identify(externalId, tags = {}) {
    const id = cleanExternalId(externalId);
    if (!id) return false;
    const OneSignal = await window.tamuOneSignalReady;
    if (!OneSignal?.login) return false;
    try {
      await OneSignal.login(id);
      if (OneSignal.User?.addTags) {
        OneSignal.User.addTags(tags);
      }
      window.localStorage.setItem(STORAGE_KEY, id);
      return true;
    } catch {
      return false;
    }
  }

  async function logout() {
    const OneSignal = await window.tamuOneSignalReady;
    try {
      await OneSignal?.logout?.();
    } catch {
      return;
    } finally {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }

  async function identifyFromSession() {
    const response = await fetch("./api/auth/session.php", { cache: "no-store" }).catch(() => null);
    const payload = response ? await response.json().catch(() => ({})) : {};
    const session = payload?.session || {};
    if (session.role === "admin") {
      await identify("admin", { role: "admin" });
    } else if (session.role === "seller" && session.businessId) {
      await identify(`business:${session.businessId}`, { role: "seller", business_id: String(session.businessId) });
    } else if (session.role === "employee") {
      await identify("employees", { role: "employee" });
    }
  }

  window.tamuOneSignalReady = initOneSignal();
  window.tamuPushLogin = identify;
  window.tamuPushLogout = logout;
  window.tamuPushIdentifySession = identifyFromSession;
  window.tamuPushCustomerId = function (phone) {
    const normalized = String(phone || "").replace(/[^\d+]/g, "").trim();
    return normalized ? `customer:${normalized}` : "";
  };

  window.tamuOneSignalReady.then(() => identifyFromSession());
})();
