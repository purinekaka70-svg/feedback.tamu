const CACHE_NAME = "tamu-app-shell-v9";
const APP_SHELL = [
  "./seller.html",
  "./seller.css",
  "./seller-app.css",
  "./storefront-commerce.css",
  "./responsive.css",
  "./notifications.css",
  "./header-menu-fix.css",
  "./seller.js",
  "./seller-pwa.js",
  "./realtime-sync.js",
  "./security-client.js",
  "./seller.webmanifest",
  "./employee.html",
  "./employee.css",
  "./employee-app.css",
  "./employee.js",
  "./employee-pwa.js",
  "./employee.webmanifest",
  "./realtime-sync.js",
  "./security-client.js",
  "./firebase-config.js",
  "./assets/tamu-logo-192.png",
  "./assets/tamu-logo-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => (key.startsWith("tamu-seller-shell-") || key.startsWith("tamu-app-shell-")) && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.includes("/api/")) return;

  if (request.mode === "navigate" && (url.pathname.endsWith("/seller.html") || url.pathname.endsWith("/employee.html"))) {
    event.respondWith(
      fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          const cachePath = url.pathname.endsWith("/employee.html") ? "./employee.html" : "./seller.html";
          caches.open(CACHE_NAME).then((cache) => cache.put(cachePath, copy));
        }
        return response;
      }).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        const cachePath = url.pathname.endsWith("/employee.html") ? "./employee.html" : "./seller.html";
        return cache.match(cachePath) || Response.error();
      })
    );
    return;
  }

  if (APP_SHELL.some((path) => new URL(path, self.registration.scope).pathname === url.pathname)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cacheKey = new Request(`${url.origin}${url.pathname}`);
        const cached = await cache.match(cacheKey);
        if (cached) return cached;
        return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          cache.put(cacheKey, copy);
        }
        return response;
        });
      })
    );
  }
});
