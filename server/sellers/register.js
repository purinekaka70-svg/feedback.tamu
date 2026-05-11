const bcrypt = require("bcryptjs");
const { getPool } = require("../_lib/db");
const { body, method, send, text } = require("../_lib/http");
const { touchRealtime } = require("../_lib/realtime");
const { rateLimit } = require("../_lib/security");

async function tableColumns(client, table) {
  const result = await client.query(
    `select column_name, data_type
            , is_nullable, column_default
       from information_schema.columns
      where table_schema = 'public'
        and table_name = $1`,
    [table]
  );
  return new Map(result.rows.map((row) => [row.column_name, row]));
}

function addColumn(columns, names, field, value, cast = "") {
  const name = names.find((candidate) => columns.has(candidate));
  if (!name) return;
  field.names.push(name);
  field.values.push(value);
  field.casts.push(cast);
}

function needsManualId(columns) {
  const id = columns.get("id");
  return id && id.is_nullable === "NO" && !id.column_default;
}

function passwordColumn(columns) {
  return ["password", "password_hash", "password_digest", "hash"].find((candidate) => columns.has(candidate));
}

async function nextId(client, table) {
  const result = await client.query(`select coalesce(max(id), 0) + 1 as id from ${table}`);
  return Number(result.rows[0]?.id || 1);
}

module.exports = async function handler(req, res) {
  if (!method(req, res, "POST")) return;
  if (!rateLimit(req, res, "seller-register", { limit: 6, windowMs: 60 * 60 * 1000 })) return;
  const pool = getPool();
  let client;
  try {
    client = await pool.connect();
    const payload = await body(req);
    const email = text(payload.email, 180).toLowerCase();
    const password = String(payload.password || "");
    const businessName = text(payload.businessName || payload.storeName || payload.name, 150);
    const ownerName = text(payload.sellerName || payload.ownerName, 150);
    const phone = text(payload.phone, 40);
    const type = text(payload.businessType || payload.type, 80);
    const location = text(payload.location || payload.county || payload.locationName, 180);
    if (!email || !password || !businessName || !ownerName) {
      send(res, 422, { ok: false, message: "Business name, seller name, email and password are required." });
      return;
    }
    if (password.length < 8) {
      send(res, 422, { ok: false, message: "Password must be at least 8 characters." });
      return;
    }
    const exists = await client.query("select id from users where lower(email) = lower($1) limit 1", [email]);
    if (exists.rows.length) {
      send(res, 409, { ok: false, message: "This seller email is already registered." });
      return;
    }
    await client.query("begin");
    const userColumns = await tableColumns(client, "users");
    const businessColumns = await tableColumns(client, "businesses");
    const userPasswordColumn = passwordColumn(userColumns);
    if (!userPasswordColumn) {
      throw new Error("Users table has no supported password column.");
    }
    const hash = await bcrypt.hash(password, 10);
    const userFields = { names: [], values: [], casts: [] };
    if (needsManualId(userColumns)) {
      addColumn(userColumns, ["id"], userFields, await nextId(client, "users"));
    }
    addColumn(userColumns, ["name"], userFields, ownerName);
    addColumn(userColumns, ["email"], userFields, email);
    addColumn(userColumns, [userPasswordColumn], userFields, hash);
    addColumn(userColumns, ["role"], userFields, "seller");
    addColumn(userColumns, ["status"], userFields, "pending");
    const userPlaceholders = userFields.values.map((_, index) => `$${index + 1}${userFields.casts[index] || ""}`);
    const userResult = await client.query(
      `insert into users (${userFields.names.map((name) => `"${name}"`).join(", ")})
       values (${userPlaceholders.join(", ")})
       returning id`,
      userFields.values
    );
    const columns = businessColumns;
    const fields = { names: [], values: [], casts: [] };
    if (needsManualId(columns)) {
      addColumn(columns, ["id"], fields, await nextId(client, "businesses"));
    }
    addColumn(columns, ["user_id"], fields, userResult.rows[0].id);
    addColumn(columns, ["name", "store_name", "business_name"], fields, businessName);
    addColumn(columns, ["owner_name", "seller_name"], fields, ownerName);
    addColumn(columns, ["phone"], fields, phone);
    addColumn(columns, ["email", "business_email", "owner_email"], fields, email);
    addColumn(columns, [passwordColumn(columns)], fields, hash);
    addColumn(columns, ["type", "business_type"], fields, type || "Retail");
    addColumn(columns, ["location_name", "location", "county"], fields, location);
    addColumn(columns, ["latitude", "lat"], fields, Number(payload.latitude || 0));
    addColumn(columns, ["longitude", "lng"], fields, Number(payload.longitude || 0));
    const paymentColumn = ["payment_methods", "payment_options"].find((candidate) => columns.has(candidate));
    if (paymentColumn) {
      const dataType = columns.get(paymentColumn)?.data_type;
      const cast = dataType === "json" ? "::json" : dataType === "jsonb" ? "::jsonb" : "";
      addColumn(columns, [paymentColumn], fields, JSON.stringify(payload.paymentOptions || []), cast);
    }
    addColumn(columns, ["till_number"], fields, text(payload.tillNumber, 80));
    addColumn(columns, ["pochi_number"], fields, text(payload.pochiNumber, 80));
    addColumn(columns, ["bank_account", "card_account"], fields, text(payload.bankAccount || payload.cardAccount, 120));
    addColumn(columns, ["delivery_availability"], fields, text(payload.deliveryAvailability, 80));
    addColumn(columns, ["delivery_notes"], fields, text(payload.deliveryNotes, 500));
    addColumn(columns, ["logo"], fields, text(payload.logo || payload.logoImage, 204800));
    addColumn(columns, ["logo_image"], fields, text(payload.logoImage || payload.logo, 204800));
    addColumn(columns, ["status"], fields, "pending");

    if (!fields.names.length) {
      throw new Error("Businesses table has no supported columns.");
    }
    const placeholders = fields.values.map((_, index) => `$${index + 1}${fields.casts[index] || ""}`);
    const businessResult = await client.query(
      `insert into businesses (${fields.names.map((name) => `"${name}"`).join(", ")})
       values (${placeholders.join(", ")})
       returning id`,
      fields.values
    );
    await client.query("commit");
    await touchRealtime("marketplace", "seller-registered");
    await touchRealtime("users", "seller-user-created");
    send(res, 201, {
      ok: true,
      message: "Successfully registered. Please wait for admin approval.",
      seller: { id: businessResult.rows[0].id, status: "pending" }
    });
  } catch (error) {
    if (client) {
      await client.query("rollback").catch(() => {});
    }
    console.error("Seller registration failed:", String(error?.code || error?.message || error).slice(0, 180));
    send(res, 500, {
      ok: false,
      message: "Seller registration failed."
    });
  } finally {
    if (client) {
      client.release();
    }
  }
};
