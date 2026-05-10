function oneSignalConfig() {
  return {
    appId: process.env.ONESIGNAL_APP_ID || "",
    apiKey: process.env.ONESIGNAL_REST_API_KEY || process.env.ONESIGNAL_API_KEY || ""
  };
}

function cleanExternalId(value) {
  return String(value || "").trim().toLowerCase().slice(0, 128);
}

function customerExternalId(phone) {
  const normalized = String(phone || "").replace(/[^\d+]/g, "").trim();
  return normalized ? `customer:${normalized}` : "";
}

function businessExternalId(id) {
  const value = String(id || "").trim();
  return value ? `business:${value}` : "";
}

function notificationPayload(notification = {}) {
  return {
    headings: { en: String(notification.title || "Tamu Express").slice(0, 120) },
    contents: { en: String(notification.message || "You have a new update.").slice(0, 240) },
    url: notification.url || "",
    data: notification.data || {}
  };
}

async function postNotification(payload, logLabel) {
  const { appId, apiKey } = oneSignalConfig();
  if (!appId || !apiKey) {
    console.warn("OneSignal notification skipped: missing ONESIGNAL_APP_ID or ONESIGNAL_REST_API_KEY.");
    return { ok: false, skipped: true };
  }

  try {
    const response = await fetch("https://api.onesignal.com/notifications", {
      method: "POST",
      headers: {
        "Authorization": `Key ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ app_id: appId, target_channel: "push", ...payload })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error(`${logLabel} failed:`, response.status, String(result?.errors || result?.message || "").slice(0, 180));
      return { ok: false, status: response.status, result };
    }
    return { ok: true, result };
  } catch (error) {
    console.error(`${logLabel} error:`, String(error?.message || error).slice(0, 180));
    return { ok: false };
  }
}

async function sendPushToExternalIds(externalIds, notification = {}) {
  const ids = [...new Set((externalIds || []).map(cleanExternalId).filter(Boolean))];
  if (!ids.length) {
    return { ok: false, skipped: true };
  }

  return postNotification({
    include_aliases: {
      external_id: ids
    },
    ...notificationPayload(notification)
  }, "OneSignal notification");
}

async function sendPushToFilters(filters, notification = {}) {
  const safeFilters = Array.isArray(filters) ? filters : [];
  if (!safeFilters.length) {
    return { ok: false, skipped: true };
  }

  return postNotification({
    filters: safeFilters,
    ...notificationPayload(notification)
  }, "OneSignal filtered notification");
}

function tagFilter(key, value) {
  return { field: "tag", key, relation: "=", value: String(value || "") };
}

function anyTagFilters(key, values) {
  return [...new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean))]
    .flatMap((value, index) => (index ? [{ operator: "OR" }, tagFilter(key, value)] : [tagFilter(key, value)]));
}

async function sendPushToRole(role, notification = {}) {
  const value = String(role || "").trim().toLowerCase();
  return value ? sendPushToFilters([tagFilter("role", value)], notification) : { ok: false, skipped: true };
}

async function sendPushToBusinessIds(businessIds, notification = {}) {
  const filters = anyTagFilters("business_id", businessIds);
  return filters.length ? sendPushToFilters(filters, notification) : { ok: false, skipped: true };
}

module.exports = {
  businessExternalId,
  customerExternalId,
  sendPushToBusinessIds,
  sendPushToExternalIds,
  sendPushToFilters,
  sendPushToRole,
  tagFilter
};
