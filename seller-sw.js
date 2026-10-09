const CACHE_NAME = "tamu-seller-shell-v2";
const SELLER_SHELL = [
  "./seller.html",
  "./seller.css",
  "./storefront-commerce.css",
  "./responsive.css",
  "./notifications.css",
  "./header-menu-fix.css",
  "./seller.js",
  "./realtime-sync.js",
  "./security-client.js",
  "./seller.webmanifest",
  "./assets/tamu-icon-192.png",
  "./assets/tamu-icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SELLER_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("tamu-seller-shell-") && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.includes("/api/")) return;

  if (request.mode === "navigate" && url.pathname.endsWith("/seller.html")) {
    event.respondWith(
      fetch(request).then((response) => {
        if (response.ok && url.pathname.endsWith("/seller.html")) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("./seller.html", copy));
        }
        return response;
      }).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        return cache.match("./seller.html") || Response.error();
      })
    );
    return;
  }

  if (SELLER_SHELL.some((path) => new URL(path, self.registration.scope).pathname === url.pathname)) {
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
