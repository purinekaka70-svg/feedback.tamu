(() => {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./seller-sw.js", { scope: "./" }).catch(() => {
      // The seller portal remains fully usable without offline support.
    });
  }, { once: true });
})();
