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

async function sendPushToExternalIds(externalIds, notification = {}) {
  const { appId, apiKey } = oneSignalConfig();
  const ids = [...new Set((externalIds || []).map(cleanExternalId).filter(Boolean))];
  if (!appId || !apiKey || !ids.length) {
    return { ok: false, skipped: true };
  }

  const payload = {
    app_id: appId,
    target_channel: "push",
    include_aliases: {
      external_id: ids
    },
    headings: { en: String(notification.title || "Tamu Express").slice(0, 120) },
    contents: { en: String(notification.message || "You have a new update.").slice(0, 240) },
    url: notification.url || "",
    data: notification.data || {}
  };

  try {
    const response = await fetch("https://api.onesignal.com/notifications", {
      method: "POST",
      headers: {
        "Authorization": `Key ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("OneSignal notification failed:", response.status, String(result?.errors || result?.message || "").slice(0, 180));
      return { ok: false, status: response.status };
    }
    return { ok: true, result };
  } catch (error) {
    console.error("OneSignal notification error:", String(error?.message || error).slice(0, 180));
    return { ok: false };
  }
}

module.exports = { businessExternalId, customerExternalId, sendPushToExternalIds };
