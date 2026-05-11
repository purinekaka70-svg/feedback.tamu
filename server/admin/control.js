const { requireRole } = require("../_lib/auth");
const { query, tableExists } = require("../_lib/db");
const { body, method, send, text } = require("../_lib/http");
const { touchRealtime } = require("../_lib/realtime");
const { rateLimit } = require("../_lib/security");

const TABLES = {
  business: "businesses",
  businesses: "businesses",
  seller: "businesses",
  sellers: "businesses",
  product: "products",
  products: "products",
  category: "categories",
  categories: "categories",
  order: "orders",
  orders: "orders",
  user: "users",
  users: "users",
  employee: "employees",
  employees: "employees",
  payment: "payments",
  payments: "payments",
  offer: "seller_offers",
  offers: "seller_offers",
  location: "locations",
  locations: "locations"
};

async function deleteOrder(id) {
  const rows = await query("select id, public_id from orders where public_id = $1 or id::text = $1 limit 1", [id]);
  const order = rows[0];
  if (!order) return;
  if (await tableExists("order_items").catch(() => false)) {
    await query("delete from order_items where order_id = $1", [order.id]).catch(() => {});
  }
  if (await tableExists("order_route_breakdown").catch(() => false)) {
    await query("delete from order_route_breakdown where order_id = $1", [order.id]).catch(() => {});
  }
  if (await tableExists("payments").catch(() => false)) {
    await query("delete from payments where order_public_id = $1", [order.public_id]).catch(() => {});
  }
  if (await tableExists("deliveries").catch(() => false)) {
    await query("delete from deliveries where order_public_id = $1", [order.public_id]).catch(() => {});
  }
  await query("delete from orders where id = $1", [order.id]);
}

async function deleteOffer(id) {
  const productOffer = String(id || "").match(/^product-offer-(\d+)$/);
  if (productOffer) {
    await query("update products set offer_flag = false, offer_text = '' where id = $1", [Number(productOffer[1])]).catch(async () => {
      await query("update products set offer_flag = false where id = $1", [Number(productOffer[1])]);
    });
    return;
  }
  await query("delete from seller_offers where public_id = $1", [id]);
}

async function deleteLocation(id) {
  if (await tableExists("locations").catch(() => false)) {
    if (/^\d+$/.test(String(id))) {
      await query("delete from locations where id = $1", [Number(id)]);
      return;
    }
    await query("delete from locations where lower(name) = lower($1)", [id]);
    return;
  }
  await query("update businesses set location_name = '' where lower(location_name) = lower($1)", [id]).catch(() => {});
}

function realtimeChannelFor(type) {
  if (["order", "orders"].includes(type)) return "orders";
  if (["payment", "payments"].includes(type)) return "payments";
  if (["user", "users", "employee", "employees"].includes(type)) return "users";
  return "marketplace";
}

module.exports = async function handler(req, res) {
  if (!method(req, res, "POST")) return;
  if (!rateLimit(req, res, "admin-control", { limit: 80, windowMs: 10 * 60 * 1000 })) return;
  if (!requireRole(req, res, "admin")) return;
  try {
    const payload = await body(req);
    const type = text(payload.type || payload.target || payload.entity, 40).toLowerCase();
    const action = text(payload.action || (type ? "delete" : ""), 40).toLowerCase();
    const table = TABLES[type];
    if (!table) {
      send(res, 422, { ok: false, message: "Unknown admin control target." });
      return;
    }
    const id = text(payload.id, 120);
    if (action === "delete") {
      if (type === "offer" || type === "offers") {
        await deleteOffer(id);
      } else if (type === "order") {
        await deleteOrder(id);
      } else if (type === "location" || type === "locations") {
        await deleteLocation(id);
      } else if (type === "payment" || type === "payments") {
        await query(`delete from ${table} where id = $1`, [Number(id)]);
      } else {
        await query(`delete from ${table} where id = $1`, [Number(id)]);
      }
      await touchRealtime(realtimeChannelFor(type), `admin-${type}-deleted`);
      send(res, 200, { ok: true });
      return;
    }
    if (action === "status") {
      await query(`update ${table} set status = $2 where id = $1`, [Number(id), text(payload.status, 40)]);
      await touchRealtime(realtimeChannelFor(type), `admin-${type}-status`);
      send(res, 200, { ok: true });
      return;
    }
    send(res, 422, { ok: false, message: "Unsupported admin action." });
  } catch {
    send(res, 500, { ok: false, message: "Admin action failed." });
  }
};
