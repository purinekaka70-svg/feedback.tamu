const CACHE_NAME = "tamu-express-v70";
const APP_SHELL = [
  "./",
  "./index.html",
  "./categories.html",
  "./cart.html",
  "./seller.html",
  "./admin.html",
  "./employee.html",
  "./about.html",
  "./contact.html",
  "./index.css",
  "./categories.css",
  "./cart.css",
  "./seller.css",
  "./admin.css",
  "./employee.css",
  "./about.css",
  "./contact.css",
  "./responsive.css",
  "./index.js",
  "./categories.js",
  "./cart.js",
  "./seller.js",
  "./admin.js",
  "./employee.js",
  "./about.js",
  "./contact.js",
  "./pwa.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    fetch(event.request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match(event.request).then((cached) => cached || caches.match("./index.html")))
  );
});
