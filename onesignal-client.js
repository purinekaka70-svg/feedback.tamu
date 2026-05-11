(function () {
  const STORAGE_KEY = "tamu_onesignal_external_id";
  const CUSTOMER_KEY = "tamu_onesignal_customer_id";
  const NOTIFICATIONS_ALLOWED_KEY = "tamu_notifications_allowed";
  const DEFAULT_APP_ID = "7c0a3b0d-53b6-4b67-9b42-266f49bfabcc";
  const SAFARI_WEB_ID = "web.onesignal.auto.399b8e00-4d8c-471a-9e28-27f67ae2986b";
  const SDK_SRC = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
  const TEST_NOTIFICATION_KEY = "tamu_onesignal_test_notification";
  const LIVE_SITE_URL = "https://feedback-tamu.vercel.app/";
  const READY_TIMEOUT_MS = 12000;
  const CLICK_READY_TIMEOUT_MS = 6500;
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

  function isHttpOrigin() {
    return location.protocol === "https:" || location.protocol === "http:";
  }

  function cleanExternalId(value) {
    return String(value || "").trim().toLowerCase().slice(0, 128);
  }

  function rememberNotificationsAllowed() {
    try {
      window.localStorage.setItem(NOTIFICATIONS_ALLOWED_KEY, "1");
    } catch {
      // Storage can be unavailable in private modes; browser permission still controls visibility.
    }
  }

  function clearNotificationsAllowed() {
    try {
      window.localStorage.removeItem(NOTIFICATIONS_ALLOWED_KEY);
    } catch {
      return;
    }
  }

  function notificationsAllowedRemembered() {
    try {
      return window.localStorage.getItem(NOTIFICATIONS_ALLOWED_KEY) === "1";
    } catch {
      return false;
    }
  }

  function appToast(title, message, type = "info") {
    if (typeof window.showToast === "function") {
      window.showToast({ title, message, type });
      return;
    }
    const container = document.getElementById("toastContainer");
    if (!container) return;
    const toast = document.createElement("div");
    const toastTitle = document.createElement("strong");
    const toastMessage = document.createElement("span");
    toast.className = `toast toast--${type} toast-${type}`;
    toastTitle.className = "toast-title";
    toastTitle.textContent = title;
    toastMessage.className = "toast-message";
    toastMessage.textContent = message;
    toast.append(toastTitle, toastMessage);
    container.appendChild(toast);
    window.setTimeout(() => toast.remove(), 4200);
  }

  async function config() {
    if (!isHttpOrigin()) {
      return { appId: DEFAULT_APP_ID };
    }
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
    if (!isHttpOrigin()) {
      lastInitError = "Open the live HTTPS site to enable push notifications.";
      return null;
    }
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
        serviceWorkerPath: "/OneSignalSDKWorker.js",
        serviceWorkerUpdaterPath: "/OneSignalSDKUpdaterWorker.js",
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

  function warmOneSignalSdk() {
    if (!isHttpOrigin()) return;
    loadOneSignalSdk().catch(() => false);
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
        await waitForSubscription(OneSignal, 6000);
      }
      if (notificationsGranted(OneSignal)) {
        rememberNotificationsAllowed();
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
    if (!isHttpOrigin()) return;
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

  function browserNotificationsGranted() {
    return window.Notification?.permission === "granted";
  }

  function oneSignalPermissionGranted(OneSignal) {
    return OneSignal?.Notifications?.permission === true;
  }

  function notificationsDenied() {
    return window.Notification?.permission === "denied";
  }

  function notificationsSupported(OneSignal) {
    if (!isHttpOrigin()) {
      return false;
    }
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

  function shouldHideEnableButton(OneSignal) {
    if (notificationsDenied()) {
      clearNotificationsAllowed();
      return false;
    }
    if (notificationsEnabled(OneSignal)) {
      rememberNotificationsAllowed();
      return true;
    }
    return false;
  }

  function removeEnableButton(button) {
    if (!button) return;
    button.classList.add("is-hidden");
    button.remove();
  }

  async function syncAllowedNotifications(OneSignal) {
    if (!OneSignal || !notificationsGranted(OneSignal)) return false;
    rememberNotificationsAllowed();
    if (!notificationsEnabled(OneSignal)) {
      await requestOneSignalSubscription(OneSignal).catch(() => false);
    }
    await identifyFromSession().catch(() => {});
    return notificationsEnabled(OneSignal);
  }

  async function optInNotifications(OneSignal) {
    if (!OneSignal) return;
    if (OneSignal.User?.PushSubscription?.optIn) {
      await OneSignal.User.PushSubscription.optIn().catch((error) => {
        lastInitError = String(error?.message || error || "OneSignal opt-in failed").slice(0, 180);
      });
    }
  }

  async function waitForServiceWorker() {
    if (!navigator.serviceWorker?.ready) return false;
    return withTimeout(navigator.serviceWorker.ready.then(() => true).catch(() => false), 5000, false);
  }

  async function ensureOneSignalServiceWorker() {
    if (!isHttpOrigin() || !navigator.serviceWorker?.register) return false;
    try {
      const registration = await navigator.serviceWorker.register("/OneSignalSDKWorker.js", { scope: "/" });
      await registration.update().catch(() => {});
      return Boolean(await waitForServiceWorker());
    } catch (error) {
      lastInitError = String(error?.message || error || "OneSignal service worker registration failed").slice(0, 180);
      return false;
    }
  }

  async function syncOneSignalPermission(OneSignal) {
    if (!OneSignal || notificationsDenied()) return false;
    if (oneSignalPermissionGranted(OneSignal)) return true;
    if (!browserNotificationsGranted() && OneSignal.Slidedown?.promptPush) {
      await withTimeout(OneSignal.Slidedown.promptPush({ force: true }).catch((error) => {
        lastInitError = String(error?.message || error || "OneSignal prompt failed").slice(0, 180);
        return false;
      }), 3500, false);
    }
    if (!oneSignalPermissionGranted(OneSignal) && OneSignal.Notifications?.requestPermission) {
      await withTimeout(OneSignal.Notifications.requestPermission().catch((error) => {
        lastInitError = String(error?.message || error || "Permission prompt failed").slice(0, 180);
        return false;
      }), 6500, false);
    }
    return notificationsGranted(OneSignal);
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
    if (notificationsEnabled(OneSignal)) return true;
    await ensureOneSignalServiceWorker();
    await syncOneSignalPermission(OneSignal);
    if (notificationsGranted(OneSignal)) {
      await ensureOneSignalServiceWorker();
      await optInNotifications(OneSignal);
    }
    if (!(await waitForSubscription(OneSignal, 9000)) && notificationsGranted(OneSignal)) {
      await optInNotifications(OneSignal);
      return waitForSubscription(OneSignal, 6000);
    }
    return notificationsEnabled(OneSignal);
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

  async function completeOneSignalSubscription(OneSignal) {
    if (!OneSignal) return false;
    await requestOneSignalSubscription(OneSignal).catch(() => false);
    await identifyFromSession().catch(() => {});
    if (notificationsEnabled(OneSignal)) {
      rememberNotificationsAllowed();
      return true;
    }
    return false;
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
      rememberNotificationsAllowed();
      await showTestNotification();
      removeEnableButton(button);
      return true;
    }
    if (notificationsGranted(OneSignal)) {
      rememberNotificationsAllowed();
      button.textContent = "Finalizing...";
      if (await completeOneSignalSubscription(OneSignal)) {
        await showTestNotification(true);
        appToast("Push notifications enabled", "This device is subscribed for Tamu Express alerts.", "success");
        removeEnableButton(button);
        return true;
      }
      appToast("Almost done", "Permission is allowed, but the push subscription did not finish. Tap Enable notifications again.", "warn");
    }
    return false;
  }

  async function finishNativePermission(button) {
    const permission = await requestBrowserPermissionImmediately();
    if (permission === "granted") {
      rememberNotificationsAllowed();
      button.textContent = "Enabling notifications...";
      const OneSignal = await getOneSignal();
      if (await completeOneSignalSubscription(OneSignal)) {
        await showTestNotification(true);
        appToast("Push notifications enabled", "This device is subscribed for Tamu Express alerts.", "success");
        removeEnableButton(button);
        return true;
      }
      appToast("Permission allowed", "Browser permission is on, but push setup still needs one more try.", "warn");
      button.textContent = "Finish notifications";
      button.disabled = false;
      return true;
    }
    if (permission === "denied") {
      clearNotificationsAllowed();
      appToast("Notifications blocked", "Allow notifications in your browser site settings, then try again.", "warn");
      button.textContent = "Notifications blocked";
      button.disabled = true;
      return true;
    }
    return false;
  }

  async function subscribeWithOneSignal(button) {
    if (!isHttpOrigin()) {
      button.textContent = "Open live site";
      window.location.href = LIVE_SITE_URL;
      return true;
    }
    button.textContent = "Opening OneSignal...";
    const OneSignal = await getOneSignalFast();
    if (!OneSignal) {
      return false;
    }
    if (notificationsDenied()) {
      clearNotificationsAllowed();
      button.textContent = "Notifications blocked";
      button.disabled = true;
      return true;
    }
    if (!notificationsSupported(OneSignal)) {
      button.textContent = window.isSecureContext ? "Notifications unsupported" : "HTTPS required";
      button.disabled = true;
      appToast("Notifications unavailable", button.textContent, "warn");
      return true;
    }

    button.textContent = "Subscribing to OneSignal...";
    await requestOneSignalSubscription(OneSignal);
    return finishEnabledState(OneSignal, button);
  }

  function ensureEnableButton() {
    if (document.getElementById("enableNotificationsButton")) return;
    if (shouldHideEnableButton(null)) {
      window.tamuOneSignalReady.then((OneSignal) => syncAllowedNotifications(OneSignal));
      return;
    }
    const button = document.createElement("button");
    button.id = "enableNotificationsButton";
    button.type = "button";
    button.textContent = isHttpOrigin() ? "Enable notifications" : "Open live site";
    button.setAttribute("aria-label", "Enable push notifications");
    const updateButton = async () => {
      if (!button.isConnected) return;
      if (!isHttpOrigin()) {
        button.disabled = false;
        button.textContent = "Open live site";
        return;
      }
      const OneSignal = await Promise.race([
        window.tamuOneSignalReady,
        new Promise((resolve) => window.setTimeout(() => resolve(null), 3500))
      ]);
      if (shouldHideEnableButton(OneSignal)) {
        removeEnableButton(button);
        syncAllowedNotifications(OneSignal);
        return;
      }
      if (notificationsGranted(OneSignal) && !notificationsEnabled(OneSignal)) {
        button.disabled = false;
        button.textContent = "Finish notifications";
        return;
      }
      if (OneSignal && !notificationsSupported(OneSignal)) {
        button.disabled = true;
        button.textContent = window.isSecureContext ? "Notifications unsupported" : "HTTPS required";
        appToast("Notifications unavailable", button.textContent, "warn");
        return;
      }
      if (notificationsDenied()) {
        clearNotificationsAllowed();
        button.disabled = true;
        button.textContent = "Notifications blocked";
        appToast("Notifications blocked", "Allow notifications in browser settings to receive alerts.", "warn");
        return;
      }
      button.disabled = false;
      button.textContent = "Enable notifications";
    };
    button.addEventListener("click", async () => {
      if (!isHttpOrigin()) {
        button.disabled = false;
        button.textContent = "Open live site";
        window.location.href = LIVE_SITE_URL;
        return;
      }
      button.disabled = true;
      button.textContent = "Enabling notifications...";
      try {
        if (await subscribeWithOneSignal(button)) {
          return;
        }
      } catch {
        button.textContent = "Enable notifications";
        button.disabled = false;
        return;
      }

      if (await finishNativePermission(button)) {
        return;
      }
      if (notificationsDenied()) {
        clearNotificationsAllowed();
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
          rememberNotificationsAllowed();
          button.textContent = "Finalizing...";
          if (await completeOneSignalSubscription(OneSignal)) {
            removeEnableButton(button);
            await showTestNotification();
          }
        } else if (notificationsDenied()) {
          clearNotificationsAllowed();
        }
        updateButton();
      });
      OneSignal?.User?.PushSubscription?.addEventListener?.("change", async () => {
        if (notificationsEnabled(OneSignal)) {
          rememberNotificationsAllowed();
          removeEnableButton(button);
          await identifyFromSession();
        }
        updateButton();
      });
      updateButton();
    });
    updateButton();
  }

  window.tamuOneSignalReady = initOneSignal();
  warmOneSignalSdk();
  window.tamuPushLogin = identify;
  window.tamuPushLogout = logout;
  window.tamuPushIdentifySession = identifyFromSession;
  window.tamuPushRememberCustomer = rememberCustomer;
  window.tamuPushCustomerId = function (phone) {
    const normalized = String(phone || "").replace(/[^\d+]/g, "").trim();
    return normalized ? `customer:${normalized}` : "";
  };
  async function debugPushState() {
    const OneSignal = await window.tamuOneSignalReady;
    const subscription = OneSignal?.User?.PushSubscription || {};
    const registrations = navigator.serviceWorker?.getRegistrations
      ? await navigator.serviceWorker.getRegistrations().catch(() => [])
      : [];
    return {
      sdkReady: Boolean(OneSignal),
      origin: location.origin,
      protocol: location.protocol,
      secureContext: window.isSecureContext,
      supported: notificationsSupported(OneSignal),
      permission: window.Notification?.permission || "unsupported",
      sdkPermission: OneSignal?.Notifications?.permission,
      serviceWorkerReady: Boolean(await waitForServiceWorker()),
      serviceWorkerController: Boolean(navigator.serviceWorker?.controller),
      serviceWorkerRegistrations: registrations.map((registration) => registration.scope),
      rememberedAllowed: notificationsAllowedRemembered(),
      optedIn: subscription.optedIn,
      subscriptionId: subscription.id || "",
      token: subscription.token ? "present" : "",
      lastInitError,
      externalId: OneSignal?.User?.externalId || window.localStorage.getItem(STORAGE_KEY) || ""
    };
  }
  window.tamuPushDebug = debugPushState;
  window.tamupushDebug = debugPushState;
  window.tamupushdebug = debugPushState;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureEnableButton, { once: true });
  } else {
    ensureEnableButton();
  }
  window.tamuOneSignalReady.then(async (OneSignal) => {
    await identifyFromSession();
    if (shouldHideEnableButton(OneSignal)) {
      await syncAllowedNotifications(OneSignal);
    }
  });
})();
