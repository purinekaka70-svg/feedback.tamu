(function () {
  const CHANNEL_NAME = "tamu_realtime_updates";
  const STORAGE_KEY = "tamu_realtime_event";
  const STATE_ENDPOINT = "./api/realtime/state.php";
  const DEFAULT_VISIBLE_MS = 4000;
  const DEFAULT_HIDDEN_MS = 20000;
  const DEFAULT_DEBOUNCE_MS = 250;
  const STATE_TIMEOUT_MS = 5500;
  const subscribers = new Map();
  const timers = new Map();
  const running = new Map();
  const pending = new Map();
  const lastEventIds = new Set();
  const versions = new Map();
  const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL_NAME) : null;
  let stateTimer = null;
  let stateRunning = false;
  let stateFailures = 0;

  function now() {
    return Date.now();
  }

  function safeArray(channelName) {
    if (!subscribers.has(channelName)) {
      subscribers.set(channelName, []);
    }
    return subscribers.get(channelName);
  }

  function activePollingChannels() {
    return [...subscribers.entries()]
      .filter(([, entries]) => entries.some((entry) => entry.poll !== false && !(entry.paused && entry.paused())))
      .map(([channelName]) => channelName);
  }

  function entriesDelay(entries) {
    const fallback = document.hidden ? DEFAULT_HIDDEN_MS : DEFAULT_VISIBLE_MS;
    return entries.reduce((delay, entry) => {
      if (entry.poll === false || (entry.paused && entry.paused())) return delay;
      const value = document.hidden ? entry.hiddenMs : entry.visibleMs;
      return Math.min(delay, value || fallback);
    }, fallback);
  }

  function stateDelay() {
    const channels = activePollingChannels();
    if (!channels.length) return DEFAULT_VISIBLE_MS;
    return channels.reduce((delay, channelName) => {
      return Math.min(delay, entriesDelay(safeArray(channelName)));
    }, document.hidden ? DEFAULT_HIDDEN_MS : DEFAULT_VISIBLE_MS);
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
    schedule(channelName, "fallback-poll", 0);
    window.clearTimeout(timers.get(channelName));
    timers.set(channelName, window.setTimeout(() => poll(channelName), entriesDelay(entries)));
  }

  function startLegacyPoller(channelName) {
    if (timers.has(channelName)) return;
    timers.set(channelName, window.setTimeout(() => poll(channelName), entriesDelay(safeArray(channelName))));
  }

  function stopLegacyPoller(channelName) {
    window.clearTimeout(timers.get(channelName));
    timers.delete(channelName);
  }

  async function fetchState() {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeout = controller ? window.setTimeout(() => controller.abort(), STATE_TIMEOUT_MS) : null;
    try {
      const response = await window.fetch(STATE_ENDPOINT, {
        cache: "no-store",
        credentials: "same-origin",
        signal: controller?.signal
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok || !data.channels) {
        throw new Error(data.message || `Realtime state failed (${response.status})`);
      }
      const active = new Set(activePollingChannels());
      Object.entries(data.channels).forEach(([channelName, value]) => {
        const nextVersion = String(value?.version ?? "0");
        const previousVersion = versions.get(channelName);
        versions.set(channelName, nextVersion);
        if (!active.has(channelName)) return;
        if (previousVersion === undefined || previousVersion !== nextVersion) {
          schedule(channelName, previousVersion === undefined ? "database-initial" : "database-change", 0);
        }
      });
      return true;
    } finally {
      if (timeout) {
        window.clearTimeout(timeout);
      }
    }
  }

  function queueStatePoll(delay = stateDelay()) {
    if (stateTimer || !activePollingChannels().length) return;
    stateTimer = window.setTimeout(pollState, Math.max(0, delay));
  }

  async function pollState() {
    stateTimer = null;
    const active = activePollingChannels();
    if (!active.length) return;
    if (stateRunning) {
      queueStatePoll(750);
      return;
    }
    stateRunning = true;
    try {
      const ok = await fetchState();
      if (ok) {
        stateFailures = 0;
        active.forEach(stopLegacyPoller);
      }
    } catch (error) {
      stateFailures += 1;
      if (stateFailures >= 2) {
        active.forEach(startLegacyPoller);
      }
      if (stateFailures <= 3 || stateFailures % 10 === 0) {
        console.warn("Realtime state check failed:", String(error?.message || error).slice(0, 160));
      }
    } finally {
      stateRunning = false;
      queueStatePoll(stateFailures >= 2 ? Math.min(stateDelay(), 8000) : stateDelay());
    }
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
    queueStatePoll(0);
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
      visibleMs: Math.max(1800, Number(options.visibleMs || DEFAULT_VISIBLE_MS)),
      hiddenMs: Math.max(8000, Number(options.hiddenMs || DEFAULT_HIDDEN_MS)),
      paused: typeof options.paused === "function" ? options.paused : null
    };
    safeArray(channelName).push(entry);
    if (entry.poll) {
      queueStatePoll(0);
    }
    if (options.immediate) {
      schedule(channelName, "initial", 0);
    }
    return () => {
      const entries = safeArray(channelName).filter((item) => item !== entry);
      subscribers.set(channelName, entries);
      if (!entries.length) {
        stopLegacyPoller(channelName);
      }
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
    activePollingChannels().forEach((channelName) => {
      stopLegacyPoller(channelName);
      if (!document.hidden) {
        schedule(channelName, "visible", 0);
      }
    });
    queueStatePoll(0);
  });

  window.TamuRealtime = {
    notify,
    refresh: (channelName) => schedule(channelName, "manual", 0),
    subscribe
  };
})();
