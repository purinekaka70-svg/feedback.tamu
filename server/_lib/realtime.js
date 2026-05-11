const { query } = require("./db");

const CHANNELS = ["marketplace", "orders", "payments", "users", "cart"];
let ensured = false;

function clean(value, fallback = "marketplace", max = 80) {
  const next = String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max);
  return next || fallback;
}

async function ensureRealtimeTable() {
  if (ensured) return;
  await query(`
    create table if not exists app_realtime_events (
      id bigserial primary key,
      channel text not null,
      reason text not null default 'mutation',
      created_at timestamptz not null default now()
    )
  `);
  await query("create index if not exists app_realtime_events_channel_id_idx on app_realtime_events (channel, id desc)");
  ensured = true;
}

async function touchRealtime(channel, reason = "mutation") {
  try {
    await ensureRealtimeTable();
    await query(
      "insert into app_realtime_events (channel, reason) values ($1, $2)",
      [clean(channel), clean(reason, "mutation", 120)]
    );
  } catch (error) {
    console.warn("Realtime event write failed:", String(error?.message || error).slice(0, 160));
  }
}

async function realtimeState() {
  await ensureRealtimeTable();
  const rows = await query(`
    select channel,
           coalesce(max(id), 0)::text as version,
           max(created_at) as updated_at,
           count(*)::int as events
      from app_realtime_events
     group by channel
  `);
  const channels = Object.fromEntries(CHANNELS.map((channel) => [
    channel,
    { version: "0", updatedAt: null, events: 0 }
  ]));
  rows.forEach((row) => {
    channels[row.channel] = {
      version: String(row.version || "0"),
      updatedAt: row.updated_at || null,
      events: Number(row.events || 0)
    };
  });
  return {
    at: new Date().toISOString(),
    channels
  };
}

module.exports = { realtimeState, touchRealtime };
