(function () {
  const STORAGE_KEY = "tamu_onesignal_external_id";
  const CUSTOMER_KEY = "tamu_onesignal_customer_id";
  const DEFAULT_APP_ID = "7c0a3b0d-53b6-4b67-9b42-266f49bfabcc";
  const SAFARI_WEB_ID = "web.onesignal.auto.399b8e00-4d8c-471a-9e28-27f67ae2986b";
  const SDK_SRC = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
  const TEST_NOTIFICATION_KEY = "tamu_onesignal_test_notification";
  const READY_TIMEOUT_MS = 20000;
  const CLICK_READY_TIMEOUT_MS = 1800;
  let lastInitError = "";

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function withTimeout(promise, ms, fallback = false) {
    return Promise.race([
      Promise.resolve(promise),
      sleep(ms).then(() => fallback)
    ]);
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
      if (OneSignal?.User?.PushSubscription) {
        return OneSignal;
      }
      const payload = await payloadPromise;
      if (!payload?.appId) return null;
      await OneSignal.init({
        appId: payload.appId,
        safari_web_id: SAFARI_WEB_ID,
        serviceWorkerPath: "OneSignalSDKWorker.js",
        serviceWorkerParam: { scope: "/" },
        allowLocalhostAsSecureOrigin: location.hostname === "localhost" || location.hostname === "127.0.0.1",
        notifyButton: {
          enable: false
        },
        promptOptions: {
          slidedown: {
            prompts: [
              {
                type: "push",
                autoPrompt: false,
                text: {
                  actionMessage: "Get order and payment updates from Tamu Express.",
                  acceptButton: "Allow",
                  cancelButton: "Later"
                }
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
      } catch (error) {
        lastInitError = String(error?.message || error || "OneSignal init failed").slice(0, 180);
        console.warn("OneSignal init failed:", lastInitError);
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
        } catch (error) {
          lastInitError = String(error?.message || error || "OneSignal init failed").slice(0, 180);
          console.warn("OneSignal init failed:", lastInitError);
          finish(null);
        }
      });
    });
  }

  function loadOneSignalSdk() {
    if (window.OneSignal?.init) return Promise.resolve(true);
    return new Promise((resolve) => {
      const existing = document.querySelector(`script[src="${SDK_SRC}"]`);
      if (existing) {
        existing.addEventListener("load", () => resolve(true), { once: true });
        existing.addEventListener("error", () => resolve(false), { once: true });
        window.setTimeout(() => resolve(Boolean(window.OneSignal?.init)), 5000);
        return;
      }
      const script = document.createElement("script");
      script.src = SDK_SRC;
      script.defer = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });
  }

  async function getOneSignal() {
    let OneSignal = await Promise.race([window.tamuOneSignalReady, sleep(READY_TIMEOUT_MS).then(() => null)]);
    if (OneSignal) return OneSignal;
    const loaded = await loadOneSignalSdk();
    if (!loaded) return null;
    window.tamuOneSignalReady = initOneSignal();
    OneSignal = await Promise.race([window.tamuOneSignalReady, sleep(READY_TIMEOUT_MS).then(() => null)]);
    return OneSignal;
  }

  async function getOneSignalFast() {
    return Promise.race([
      getOneSignal(),
      sleep(CLICK_READY_TIMEOUT_MS).then(() => null)
    ]);
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

  function notificationsSupported(OneSignal) {
    if (!window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
      return false;
    }
    if (!("Notification" in window)) return false;
    if (OneSignal?.Notifications?.isPushSupported) {
      return OneSignal.Notifications.isPushSupported();
    }
    return true;
  }

  function notificationsEnabled(OneSignal) {
    const subscription = OneSignal?.User?.PushSubscription;
    return subscription?.optedIn === true && Boolean(subscription.id || subscription.token);
  }

  async function optInNotifications(OneSignal) {
    if (!OneSignal) return;
    if (OneSignal.User?.PushSubscription?.optIn) {
      await OneSignal.User.PushSubscription.optIn().catch((error) => {
        lastInitError = String(error?.message || error || "OneSignal opt-in failed").slice(0, 180);
      });
    }
  }

  async function requestBrowserPermissionImmediately() {
    if (!("Notification" in window) || notificationsDenied() || window.Notification.permission === "granted") {
      return window.Notification?.permission || "unsupported";
    }
    if (!window.Notification.requestPermission) {
      return window.Notification.permission;
    }
    try {
      return await window.Notification.requestPermission();
    } catch {
      return window.Notification.permission;
    }
  }

  async function requestOneSignalSubscription(OneSignal) {
    if (!notificationsSupported(OneSignal) || notificationsDenied()) return false;
    if (!notificationsGranted(OneSignal) && OneSignal?.Slidedown?.promptPush) {
      await withTimeout(OneSignal.Slidedown.promptPush({ force: true }).catch(() => false), 2500, false);
    }
    if (!notificationsGranted(OneSignal) && OneSignal?.Notifications?.requestPermission) {
      await withTimeout(OneSignal.Notifications.requestPermission().catch(() => false), 6000, false);
    }
    if (notificationsGranted(OneSignal)) {
      await optInNotifications(OneSignal);
    }
    return waitForSubscription(OneSignal, 15000);
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

  function notificationIcon() {
    const icon = document.querySelector("link[rel~='icon']")?.href;
    return icon || "/tamu-express-logo.png";
  }

  async function showTestNotification(force = false) {
    if (!("Notification" in window) || window.Notification.permission !== "granted") return false;
    if (!force && window.sessionStorage.getItem(TEST_NOTIFICATION_KEY) === "shown") return false;
    window.sessionStorage.setItem(TEST_NOTIFICATION_KEY, "shown");
    const title = "Tamu Express notifications enabled";
    const options = {
      body: "Order, payment, seller, admin, and employee alerts will appear here.",
      icon: notificationIcon(),
      badge: notificationIcon(),
      tag: "tamu-notifications-enabled",
      renotify: true
    };
    try {
      const registration = await Promise.race([
        navigator.serviceWorker?.ready,
        sleep(1500).then(() => null)
      ]);
      if (registration?.showNotification) {
        await registration.showNotification(title, options);
        return true;
      }
    } catch {
      // Fall through to the Notification constructor.
    }
    try {
      new Notification(title, options);
      return true;
    } catch {
      return false;
    }
  }

  async function finishEnabledState(OneSignal, button) {
    await identifyFromSession();
    if (notificationsEnabled(OneSignal)) {
      await showTestNotification();
      button.classList.add("is-hidden");
      button.remove();
      return true;
    }
    if (notificationsGranted(OneSignal)) {
      await showTestNotification(true);
      button.disabled = true;
      button.textContent = "Notifications enabled";
      window.setTimeout(async () => {
        await requestOneSignalSubscription(OneSignal).catch(() => false);
        await identifyFromSession();
        if (button.isConnected) {
          button.classList.toggle("is-hidden", notificationsEnabled(OneSignal));
          if (notificationsEnabled(OneSignal)) button.remove();
        }
      }, 2500);
      return true;
    }
    return false;
  }

  async function finishNativePermission(button) {
    const permission = await requestBrowserPermissionImmediately();
    if (permission === "granted") {
      await showTestNotification(true);
      button.textContent = "Notifications enabled";
      button.disabled = true;
      getOneSignal().then(async (OneSignal) => {
        if (!OneSignal) return;
        await requestOneSignalSubscription(OneSignal).catch(() => false);
        await identifyFromSession();
        if (button.isConnected && notificationsEnabled(OneSignal)) {
          button.classList.add("is-hidden");
          button.remove();
        }
      });
      return true;
    }
    if (permission === "denied") {
      button.textContent = "Notifications blocked";
      button.disabled = true;
      return true;
    }
    return false;
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
      if (OneSignal && !notificationsSupported(OneSignal)) {
        button.disabled = true;
        button.textContent = window.isSecureContext ? "Notifications unsupported" : "HTTPS required";
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
      const OneSignal = await getOneSignalFast();
      if (!OneSignal) {
        if (await finishNativePermission(button)) {
          return;
        }
        button.textContent = lastInitError ? "Reload page" : "Enable notifications";
        button.disabled = false;
        return;
      }
      if (notificationsDenied()) {
        button.textContent = "Notifications blocked";
        button.disabled = true;
        return;
      }
      try {
        button.textContent = OneSignal?.Slidedown?.promptPush ? "Opening banner..." : "Enabling...";
        await requestOneSignalSubscription(OneSignal);
      } catch {
        if (await finishNativePermission(button)) {
          return;
        }
        button.textContent = "Enable notifications";
        button.disabled = false;
        return;
      }
      if (await finishEnabledState(OneSignal, button)) {
        return;
      }
      if (await finishNativePermission(button)) {
        return;
      }
      if (notificationsDenied()) {
        button.textContent = "Notifications blocked";
        button.disabled = true;
        return;
      }
      button.textContent = lastInitError ? "Reload page" : "Enable notifications";
      button.disabled = false;
      await updateButton();
    });
    document.body.appendChild(button);
    window.tamuOneSignalReady.then((OneSignal) => {
      OneSignal?.Notifications?.addEventListener?.("permissionChange", async () => {
        if (notificationsGranted(OneSignal)) {
          await requestOneSignalSubscription(OneSignal);
          await identifyFromSession();
          await showTestNotification();
        }
        updateButton();
      });
      OneSignal?.User?.PushSubscription?.addEventListener?.("change", async () => {
        if (notificationsEnabled(OneSignal)) {
          await identifyFromSession();
        }
        updateButton();
      });
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
  window.tamuPushDebug = async function () {
    const OneSignal = await window.tamuOneSignalReady;
    const subscription = OneSignal?.User?.PushSubscription || {};
    return {
      sdkReady: Boolean(OneSignal),
      secureContext: window.isSecureContext,
      supported: notificationsSupported(OneSignal),
      permission: window.Notification?.permission || "unsupported",
      sdkPermission: OneSignal?.Notifications?.permission,
      optedIn: subscription.optedIn,
      subscriptionId: subscription.id || "",
      token: subscription.token ? "present" : "",
      externalId: OneSignal?.User?.externalId || window.localStorage.getItem(STORAGE_KEY) || ""
    };
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureEnableButton, { once: true });
  } else {
    ensureEnableButton();
  }
  window.tamuOneSignalReady.then(() => identifyFromSession());
})();
