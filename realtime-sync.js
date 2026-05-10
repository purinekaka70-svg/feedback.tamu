(function () {
  const CHANNEL_NAME = "tamu_realtime_updates";
  const STORAGE_KEY = "tamu_realtime_event";
  const DEFAULT_VISIBLE_MS = 4000;
  const DEFAULT_HIDDEN_MS = 20000;
  const DEFAULT_DEBOUNCE_MS = 350;
  const subscribers = new Map();
  const timers = new Map();
  const running = new Map();
  const pending = new Map();
  const lastEventIds = new Set();
  const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL_NAME) : null;

  function now() {
    return Date.now();
  }

  function safeArray(channelName) {
    if (!subscribers.has(channelName)) {
      subscribers.set(channelName, []);
    }
    return subscribers.get(channelName);
  }

  function nextDelay(entries) {
    const fallback = document.hidden ? DEFAULT_HIDDEN_MS : DEFAULT_VISIBLE_MS;
    return entries.reduce((delay, entry) => {
      if (entry.poll === false) return delay;
      const value = document.hidden ? entry.hiddenMs : entry.visibleMs;
      return Math.min(delay, value || fallback);
    }, fallback);
  }

  async function run(channelName, reason) {
    if (running.get(channelName)) {
      pending.set(channelName, reason || "queued");
      return;
    }
    running.set(channelName, true);
    try {
      const entries = [...safeArray(channelName)];
      for (const entry of entries) {
        if (entry.paused && entry.paused()) continue;
        await entry.handler({ channel: channelName, reason: reason || "refresh", at: now() });
      }
    } catch (error) {
      console.warn("Realtime refresh failed:", channelName, String(error?.message || error).slice(0, 160));
    } finally {
      running.set(channelName, false);
      const queued = pending.get(channelName);
      pending.delete(channelName);
      if (queued) {
        schedule(channelName, queued);
      }
    }
  }

  function schedule(channelName, reason, delay = DEFAULT_DEBOUNCE_MS) {
    const entries = safeArray(channelName);
    if (!entries.length) return;
    const key = `${channelName}:debounce`;
    window.clearTimeout(timers.get(key));
    timers.set(key, window.setTimeout(() => run(channelName, reason), Math.max(0, delay)));
  }

  function poll(channelName) {
    const entries = safeArray(channelName);
    if (!entries.length) return;
    schedule(channelName, "poll", 0);
    window.clearTimeout(timers.get(channelName));
    timers.set(channelName, window.setTimeout(() => poll(channelName), nextDelay(entries)));
  }

  function startPoller(channelName) {
    if (timers.has(channelName)) return;
    timers.set(channelName, window.setTimeout(() => poll(channelName), nextDelay(safeArray(channelName))));
  }

  function deliver(event) {
    if (!event?.id || lastEventIds.has(event.id)) return;
    lastEventIds.add(event.id);
    if (lastEventIds.size > 80) {
      lastEventIds.clear();
    }
    schedule(event.channel, event.reason || "event", 0);
  }

  function notify(channelName, detail = {}) {
    const event = {
      id: `${now()}-${Math.random().toString(36).slice(2, 10)}`,
      channel: channelName,
      reason: detail.reason || "mutation",
      detail,
      at: now()
    };
    deliver(event);
    try {
      channel?.postMessage(event);
    } catch {
      // BroadcastChannel may be blocked in some browsers.
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(event));
    } catch {
      // localStorage can be unavailable in private browsing.
    }
  }

  function subscribe(channelName, handler, options = {}) {
    if (!channelName || typeof handler !== "function") {
      return () => {};
    }
    const entry = {
      handler,
      poll: options.poll !== false,
      visibleMs: Math.max(1500, Number(options.visibleMs || DEFAULT_VISIBLE_MS)),
      hiddenMs: Math.max(8000, Number(options.hiddenMs || DEFAULT_HIDDEN_MS)),
      paused: typeof options.paused === "function" ? options.paused : null
    };
    safeArray(channelName).push(entry);
    if (entry.poll) {
      startPoller(channelName);
    }
    if (options.immediate) {
      schedule(channelName, "initial", 0);
    }
    return () => {
      const entries = safeArray(channelName).filter((item) => item !== entry);
      subscribers.set(channelName, entries);
    };
  }

  channel?.addEventListener("message", (event) => deliver(event.data));
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      deliver(JSON.parse(event.newValue));
    } catch {
      // Ignore malformed storage events.
    }
  });
  document.addEventListener("visibilitychange", () => {
    subscribers.forEach((entries, channelName) => {
      if (!entries.length) return;
      window.clearTimeout(timers.get(channelName));
      timers.delete(channelName);
      startPoller(channelName);
      if (!document.hidden) {
        schedule(channelName, "visible", 0);
      }
    });
  });

  window.TamuRealtime = {
    notify,
    refresh: (channelName) => schedule(channelName, "manual", 0),
    subscribe
  };
})();
