const { getPool } = require("../_lib/db");
const { body, method, number, send, text } = require("../_lib/http");
const { normalizeStatus } = require("../_lib/market");
const { rateLimit } = require("../_lib/security");

function publicId(value) {
  return text(value, 120) || `order-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function paymentStatus(value) {
  const normalized = String(value || "pending").toLowerCase().replace(/-/g, "_");
  if (normalized === "pending_payment") return "pending";
  if (normalized === "confirmed") return "paid";
  if (normalized === "partially_paid") return "submitted";
  return ["pending", "submitted", "paid", "failed"].includes(normalized) ? normalized : "pending";
}

async function existingBusinessId(client, value) {
  const id = Number(value || 0);
  if (!Number.isInteger(id) || id <= 0) return null;
  const result = await client.query("select id from businesses where id = $1 limit 1", [id]);
  return result.rows.length ? id : null;
}

function validCoordinate(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0
    ? { latitude: lat, longitude: lng }
    : null;
}

function haversineDistanceKm(from, to) {
  const toRadians = (value) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);
  const a =
    Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2) +
    Math.cos(fromLatitude) *
      Math.cos(toLatitude) *
      Math.sin(longitudeDelta / 2) *
      Math.sin(longitudeDelta / 2);
  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 1.25;
}

function affordableDeliveryFee(distanceKm, quantity = 1) {
  const distance = Math.max(0, Number(distanceKm) || 0);
  const qty = Math.max(1, Math.trunc(Number(quantity) || 1));
  const bulkFee = Math.min(80, Math.max(0, qty - 2) * 6);
  let fee;

  if (distance <= 2) {
    fee = 25 + distance * 5;
  } else if (distance <= 5) {
    fee = 35 + distance * 6;
  } else if (distance <= 12) {
    fee = 55 + distance * 5;
  } else if (distance <= 25) {
    fee = 95 + distance * 4;
  } else if (distance <= 80) {
    fee = 160 + distance * 2;
  } else {
    fee = 280 + distance * 1.4;
  }

  return Math.max(30, Math.round((fee + bulkFee) / 10) * 10);
}

function fallbackDeliveryFee(storeCount = 1, quantity = 1) {
  const stores = Math.max(1, Number(storeCount) || 1);
  const qty = Math.max(1, Number(quantity) || 1);
  return Math.min(250, Math.max(40, 50 + (stores - 1) * 20 + Math.max(0, qty - 2) * 6));
}

async function deliveryFromBusinessCoordinates(client, items, payload, businessIdFor) {
  const subtotal = items.reduce((sum, item) => sum + number(item.lineTotal), 0);
  const buyerPoint = validCoordinate(payload.buyerLatitude, payload.buyerLongitude);
  const groups = new Map();

  for (const item of items) {
    const businessId = await businessIdFor(item.businessId || item.storeId);
    const key = businessId ? String(businessId) : text(item.storeId, 120);
    if (!key) continue;
    const current = groups.get(key) || {
      businessId,
      storeId: text(item.storeId || businessId, 120),
      storeName: text(item.storeName, 150),
      quantity: 0,
      subtotal: 0
    };
    current.quantity += Math.max(1, Math.trunc(number(item.quantity)));
    current.subtotal += number(item.lineTotal);
    groups.set(key, current);
  }

  const numericBusinessIds = [...groups.values()].map((group) => group.businessId).filter(Boolean);
  const businesses = numericBusinessIds.length
    ? await client.query(
        "select id, name, latitude, longitude from businesses where id = any($1::bigint[])",
        [numericBusinessIds]
      )
    : { rows: [] };
  const businessById = new Map(businesses.rows.map((row) => [String(row.id), row]));

  const breakdown = [...groups.values()].map((group) => {
    const business = businessById.get(String(group.businessId || ""));
    const storePoint = business ? validCoordinate(business.latitude, business.longitude) : null;
    const distanceKm = buyerPoint && storePoint ? haversineDistanceKm(storePoint, buyerPoint) : 0;
    const estimated = !buyerPoint || !storePoint;
    const fee = estimated
      ? fallbackDeliveryFee(1, group.quantity)
      : affordableDeliveryFee(distanceKm, group.quantity);

    return {
      storeId: group.storeId || String(group.businessId || ""),
      storeName: business?.name || group.storeName || "Business",
      distanceKm,
      fee,
      quantity: group.quantity,
      subtotal: group.subtotal,
      estimated
    };
  });

  const consolidationFee = breakdown.length > 1 ? Math.min(50, (breakdown.length - 1) * 10) : 0;
  const deliveryFee = breakdown.length
    ? breakdown.reduce((sum, route) => sum + route.fee, 0) + consolidationFee
    : fallbackDeliveryFee(1, items.reduce((sum, item) => sum + Number(item.quantity || 1), 0));

  return {
    subtotal,
    deliveryFee,
    total: subtotal + deliveryFee,
    distanceKm: breakdown.reduce((sum, route) => sum + Number(route.distanceKm || 0), 0),
    breakdown
  };
}

async function tableExists(client, table) {
  const result = await client.query(
    "select 1 from information_schema.tables where table_schema = 'public' and table_name = $1 limit 1",
    [table]
  );
  return result.rows.length > 0;
}

async function columnExists(client, table, column) {
  const result = await client.query(
    "select 1 from information_schema.columns where table_schema = 'public' and table_name = $1 and column_name = $2 limit 1",
    [table, column]
  );
  return result.rows.length > 0;
}

async function tableColumns(client, table) {
  const result = await client.query(
    "select column_name from information_schema.columns where table_schema = 'public' and table_name = $1",
    [table]
  );
  return new Set(result.rows.map((row) => row.column_name));
}

async function orderSchema(client) {
  return {
    orders: await tableColumns(client, "orders"),
    orderItemsBusinessId: await columnExists(client, "order_items", "business_id"),
    payments: await tableExists(client, "payments"),
    paymentsBusinessId: await columnExists(client, "payments", "business_id"),
    routeBreakdown: await tableExists(client, "order_route_breakdown"),
    deliveries: await tableExists(client, "deliveries"),
    cart: await tableExists(client, "cart")
  };
}

function compactError(error) {
  return [error?.code, error?.constraint, error?.column, error?.table, error?.message]
    .filter(Boolean)
    .join(" | ")
    .slice(0, 260);
}

module.exports = async function handler(req, res) {
  if (!method(req, res, "POST")) return;
  if (!rateLimit(req, res, "order-create", { limit: 30, windowMs: 10 * 60 * 1000 })) return;
  const client = await getPool().connect();
  try {
    const payload = await body(req);
    const items = Array.isArray(payload.items) ? payload.items : [];
    if (!items.length) {
      send(res, 422, { ok: false, message: "Order items are required." });
      return;
    }
    const id = publicId(payload.id);
    const schema = await orderSchema(client);
    await client.query("begin");
    const businessIdCache = new Map();
    const businessIdFor = async (value) => {
      const key = String(value || "");
      if (!businessIdCache.has(key)) {
        businessIdCache.set(key, await existingBusinessId(client, value));
      }
      return businessIdCache.get(key);
    };
    const delivery = await deliveryFromBusinessCoordinates(client, items, payload, businessIdFor);
    const orderFields = [
      ["public_id", id],
      ["marketplace_id", text(payload.marketplaceId || payload.marketplace_id || "tamu-express", 120)],
      ["customer_name", text(payload.customer, 120)],
      ["customer_phone", text(payload.phone, 40)],
      ["buyer_location", text(payload.buyerLocation, 220)],
      ["buyer_latitude", number(payload.buyerLatitude)],
      ["buyer_longitude", number(payload.buyerLongitude)],
      ["payment_method", text(payload.paymentMethod, 40)],
      ["payment_status", text(payload.paymentStatus || "pending_payment", 40)],
      ["mpesa_name", text(payload.mpesaName, 120)],
      ["mpesa_number", text(payload.mpesaNumber || payload.phone, 40)],
      ["mpesa_reference", text(payload.mpesaReference, 120)],
      ["notes", text(payload.note, 500)],
      ["store_summary", text(payload.storeName, 220)],
      ["subtotal", delivery.subtotal || number(payload.subtotal)],
      ["delivery_fee", delivery.deliveryFee],
      ["total", delivery.total || number(payload.total)]
    ].filter(([column]) => schema.orders.has(column));
    if (schema.orders.has("status")) {
      orderFields.push(["status", normalizeStatus(payload.status || "pending_payment", ["pending_payment", "paid", "confirmed", "processing", "delivering", "delivered", "cancelled"], "pending_payment")]);
    }
    if (!orderFields.some(([column]) => column === "public_id")) {
      send(res, 500, { ok: false, message: "Orders table is missing public_id column." });
      return;
    }
    const orderColumns = orderFields.map(([column]) => column);
    const orderValues = orderFields.map(([, value]) => value);
    const orderPlaceholders = orderValues.map((_, index) => `$${index + 1}`);
    const orderResult = await client.query(
      `insert into orders (${orderColumns.join(", ")}) values (${orderPlaceholders.join(", ")}) returning id`,
      orderValues
    );
    const orderId = orderResult.rows[0].id;
    for (const item of items) {
      const baseItemValues = [
        orderId,
        text(item.productId, 120),
        text(item.productName, 150),
        text(item.storeId, 120),
        text(item.storeName, 150),
        Math.max(1, Math.trunc(number(item.quantity))),
        number(item.unitPrice),
        number(item.lineTotal)
      ];
      if (schema.orderItemsBusinessId) {
        const businessId = await businessIdFor(item.businessId || item.storeId);
        await client.query(
          `insert into order_items
           (order_id, product_public_id, product_name, store_public_id, business_id, store_name, quantity, unit_price, line_total)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [baseItemValues[0], baseItemValues[1], baseItemValues[2], baseItemValues[3], businessId, baseItemValues[4], baseItemValues[5], baseItemValues[6], baseItemValues[7]]
        );
      } else {
        await client.query(
          `insert into order_items
           (order_id, product_public_id, product_name, store_public_id, store_name, quantity, unit_price, line_total)
           values ($1,$2,$3,$4,$5,$6,$7,$8)`,
          baseItemValues
        );
      }
    }
    if (schema.routeBreakdown) {
      for (const route of delivery.breakdown.length ? delivery.breakdown : Array.isArray(payload.routeBreakdown) ? payload.routeBreakdown : []) {
        await client.query(
          `insert into order_route_breakdown (order_id, store_public_id, store_name, distance_km, route_fee, quantity, subtotal)
           values ($1,$2,$3,$4,$5,$6,$7)`,
          [orderId, text(route.storeId, 120), text(route.storeName, 150), number(route.distanceKm), number(route.fee), Math.trunc(number(route.quantity)), number(route.subtotal)]
        );
      }
    }
    if (schema.payments) {
      for (const payment of Array.isArray(payload.businessPayments) ? payload.businessPayments : []) {
        const reference = text(payment.reference || payment.ref, 120);
        if (!reference) continue;
        const paymentValues = [id, text(payment.method || payload.paymentMethod, 40), reference, number(payment.amount), paymentStatus(payment.status)];
        if (schema.paymentsBusinessId) {
          const businessId = await businessIdFor(payment.storeId || payment.businessId);
          await client.query(
            "insert into payments (order_public_id, business_id, method, reference, amount, status) values ($1,$2,$3,$4,$5,$6)",
            [paymentValues[0], businessId, paymentValues[1], paymentValues[2], paymentValues[3], paymentValues[4]]
          );
        } else {
          await client.query(
            "insert into payments (order_public_id, method, reference, amount, status) values ($1,$2,$3,$4,$5)",
            paymentValues
          );
        }
      }
    }
    if (schema.deliveries) {
      await client.query(
        "insert into deliveries (order_public_id, status, distance_km, delivery_fee) values ($1,$2,$3,$4)",
        [id, normalizeStatus(payload.deliveryStatus || "pending", ["pending", "assigned", "picked_up", "delivered", "cancelled"], "pending"), delivery.distanceKm, delivery.deliveryFee]
      );
    }
    if (payload.sessionId && schema.cart) {
      await client.query("delete from cart where session_id = $1", [text(payload.sessionId, 120)]);
    }
    await client.query("commit");
    send(res, 201, { ok: true, message: "Order saved.", order: { id: orderId, publicId: id } });
  } catch (error) {
    await client.query("rollback").catch(() => {});
    console.error("Order create failed:", error);
    send(res, 500, { ok: false, message: "Failed to save order.", detail: compactError(error) });
  } finally {
    client.release();
  }
};
