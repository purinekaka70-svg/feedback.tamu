(function () {
  const STORAGE_KEY = "tamu_onesignal_external_id";
  const CUSTOMER_KEY = "tamu_onesignal_customer_id";
  const DEFAULT_APP_ID = "7c0a3b0d-53b6-4b67-9b42-266f49bfabcc";
  const SAFARI_WEB_ID = "web.onesignal.auto.399b8e00-4d8c-471a-9e28-27f67ae2986b";
  const READY_TIMEOUT_MS = 10000;

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function cleanExternalId(value) {
    return String(value || "").trim().toLowerCase().slice(0, 128);
  }

  async function config() {
    try {
      const response = await fetch("./api/onesignal/config.php", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      return {
        appId: response.ok && payload.ok && payload.appId ? payload.appId : DEFAULT_APP_ID
      };
    } catch {
      return { appId: DEFAULT_APP_ID };
    }
  }

  async function initOneSignal() {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    const payloadPromise = config().catch(() => ({ appId: DEFAULT_APP_ID }));

    const setup = async (OneSignal) => {
      const payload = await payloadPromise;
      if (!payload?.appId) return null;
      await OneSignal.init({
        appId: payload.appId,
        safari_web_id: SAFARI_WEB_ID,
        serviceWorkerPath: "OneSignalSDKWorker.js",
        serviceWorkerParam: { scope: "/" },
        notifyButton: {
          enable: false
        },
        promptOptions: {
          slidedown: {
            prompts: [
              {
                type: "push",
                autoPrompt: false
              }
            ]
          }
        }
      });
      return OneSignal;
    };

    if (window.OneSignal?.init) {
      try {
        return await setup(window.OneSignal);
      } catch {
        return null;
      }
    }

    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      window.setTimeout(() => finish(null), READY_TIMEOUT_MS);
      window.OneSignalDeferred.push(async function (OneSignal) {
        try {
          finish(await setup(OneSignal));
        } catch {
          finish(null);
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
      if (notificationsGranted(OneSignal) && !notificationsEnabled(OneSignal)) {
        await optInNotifications(OneSignal);
      }
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

  function notificationsDenied() {
    return window.Notification?.permission === "denied";
  }

  function notificationsEnabled(OneSignal) {
    const subscription = OneSignal?.User?.PushSubscription;
    return subscription?.optedIn === true && Boolean(subscription.id || subscription.token);
  }

  async function optInNotifications(OneSignal) {
    if (!OneSignal) return;
    if (OneSignal.User?.PushSubscription?.optIn) {
      await OneSignal.User.PushSubscription.optIn();
    }
  }

  async function waitForSubscription(OneSignal, timeoutMs = 6000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (notificationsEnabled(OneSignal)) return true;
      await sleep(300);
    }
    return notificationsEnabled(OneSignal);
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
      if (!button.isConnected) return;
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
      if (notificationsDenied()) {
        button.disabled = true;
        button.textContent = "Notifications blocked";
        return;
      }
      button.disabled = false;
      button.textContent = "Enable notifications";
    };
    button.addEventListener("click", async () => {
      button.disabled = true;
      button.textContent = "Enabling...";
      const OneSignal = await Promise.race([window.tamuOneSignalReady, sleep(READY_TIMEOUT_MS).then(() => null)]);
      if (!OneSignal) {
        button.textContent = "Try again";
        button.disabled = false;
        return;
      }
      try {
        if (OneSignal?.Slidedown?.promptPush) {
          await OneSignal.Slidedown.promptPush();
        } else if (OneSignal?.Notifications?.requestPermission) {
          await OneSignal.Notifications.requestPermission();
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
      const enabled = await waitForSubscription(OneSignal);
      if (enabled) {
        await identifyFromSession();
        button.classList.add("is-hidden");
        button.remove();
        return;
      }
      if (notificationsDenied()) {
        button.textContent = "Notifications blocked";
        button.disabled = true;
        return;
      }
      button.textContent = "Try again";
      button.disabled = false;
      await updateButton();
    });
    document.body.appendChild(button);
    window.tamuOneSignalReady.then((OneSignal) => {
      OneSignal?.Notifications?.addEventListener?.("permissionChange", updateButton);
      OneSignal?.User?.PushSubscription?.addEventListener?.("change", updateButton);
      updateButton();
    });
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
