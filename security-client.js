(function () {
  const local = ["localhost", "127.0.0.1", ""].includes(window.location.hostname);
  const debug = new URLSearchParams(window.location.search).get("debug") === "1";
  if (local || debug) return;

  document.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  document.addEventListener("keydown", (event) => {
    const key = String(event.key || "").toLowerCase();
    const blocked = event.key === "F12"
      || (event.ctrlKey && event.shiftKey && ["i", "j", "c"].includes(key))
      || (event.ctrlKey && key === "u");
    if (blocked) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);

  if (window.console) {
    ["debug", "log", "info"].forEach((method) => {
      window.console[method] = function () {};
    });
  }
})();
