(function () {
  const STORAGE_KEY = "tamu_onesignal_external_id";
  const CUSTOMER_KEY = "tamu_onesignal_customer_id";
  const DEFAULT_APP_ID = "7c0a3b0d-53b6-4b67-9b42-266f49bfabcc";
  const SAFARI_WEB_ID = "web.onesignal.auto.399b8e00-4d8c-471a-9e28-27f67ae2986b";

  function cleanExternalId(value) {
    return String(value || "").trim().toLowerCase().slice(0, 128);
  }

  async function config() {
    const response = await fetch("./api/onesignal/config.php", { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    return {
      appId: response.ok && payload.ok && payload.appId ? payload.appId : DEFAULT_APP_ID
    };
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
            safari_web_id: SAFARI_WEB_ID,
            serviceWorkerPath: "OneSignalSDKWorker.js",
            notifyButton: {
              enable: false
            }
          });
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
        const safeTags = Object.fromEntries(
          Object.entries(tags || {})
            .filter(([, value]) => value !== undefined && value !== null && value !== "")
            .map(([key, value]) => [key, String(value).slice(0, 128)])
        );
        if (Object.keys(safeTags).length) {
          await OneSignal.User.addTags(safeTags);
        }
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
      const employeeKey = session.firebaseUid || session.userId || session.employeeId || session.email || "current";
      await identify(`employee:${employeeKey}`, { role: "employee", employee_id: String(employeeKey) });
    } else {
      const customerId = window.localStorage.getItem(CUSTOMER_KEY);
      if (customerId) {
        await identify(customerId, { role: "customer" });
      }
    }
  }

  function notificationsGranted(OneSignal) {
    return window.Notification?.permission === "granted" || OneSignal?.Notifications?.permission === true;
  }

  function notificationsEnabled(OneSignal) {
    return notificationsGranted(OneSignal) || OneSignal?.User?.PushSubscription?.optedIn === true;
  }

  async function optInNotifications(OneSignal) {
    if (!OneSignal) return;
    if (OneSignal.User?.PushSubscription?.optIn) {
      await OneSignal.User.PushSubscription.optIn();
    }
  }

  async function rememberCustomer(phone) {
    const customerId = window.tamuPushCustomerId(phone);
    if (!customerId) return false;
    window.localStorage.setItem(CUSTOMER_KEY, customerId);
    return identify(customerId, { role: "customer" });
  }

  function ensureEnableButton() {
    if (document.getElementById("enableNotificationsButton")) return;
    const button = document.createElement("button");
    button.id = "enableNotificationsButton";
    button.type = "button";
    button.textContent = "Enable notifications";
    button.setAttribute("aria-label", "Enable push notifications");
    const updateButton = async () => {
      const OneSignal = await Promise.race([
        window.tamuOneSignalReady,
        new Promise((resolve) => window.setTimeout(() => resolve(null), 3500))
      ]);
      const enabled = notificationsEnabled(OneSignal);
      button.classList.toggle("is-hidden", enabled);
      if (enabled) {
        button.remove();
        return;
      }
      button.disabled = false;
      button.textContent = "Enable notifications";
    };
    button.addEventListener("click", async () => {
      button.disabled = true;
      button.textContent = "Enabling...";
      const OneSignal = await window.tamuOneSignalReady;
      try {
        if (OneSignal?.Notifications?.requestPermission) {
          await OneSignal.Notifications.requestPermission();
        } else if (OneSignal?.Slidedown?.promptPush) {
          await OneSignal.Slidedown.promptPush();
        } else if (window.Notification?.requestPermission) {
          await window.Notification.requestPermission();
        }
        if (notificationsGranted(OneSignal)) {
          await optInNotifications(OneSignal);
        }
      } catch {
        button.textContent = "Try again";
        button.disabled = false;
        return;
      }
      const enabled = notificationsEnabled(OneSignal);
      if (enabled) {
        await identifyFromSession();
        button.classList.add("is-hidden");
        button.remove();
        return;
      }
      await updateButton();
    });
    document.body.appendChild(button);
    updateButton();
  }

  window.tamuOneSignalReady = initOneSignal();
  window.tamuPushLogin = identify;
  window.tamuPushLogout = logout;
  window.tamuPushIdentifySession = identifyFromSession;
  window.tamuPushRememberCustomer = rememberCustomer;
  window.tamuPushCustomerId = function (phone) {
    const normalized = String(phone || "").replace(/[^\d+]/g, "").trim();
    return normalized ? `customer:${normalized}` : "";
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureEnableButton, { once: true });
  } else {
    ensureEnableButton();
  }
  window.tamuOneSignalReady.then(() => identifyFromSession());
})();
