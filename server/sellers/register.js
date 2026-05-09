const bcrypt = require("bcryptjs");
const { getPool } = require("../_lib/db");
const { body, method, send, text } = require("../_lib/http");

async function tableColumns(client, table) {
  const result = await client.query(
    `select column_name, data_type
       from information_schema.columns
      where table_schema = 'public'
        and table_name = $1`,
    [table]
  );
  return new Map(result.rows.map((row) => [row.column_name, row.data_type]));
}

function addColumn(columns, names, field, value, cast = "") {
  const name = names.find((candidate) => columns.has(candidate));
  if (!name) return;
  field.names.push(name);
  field.values.push(value);
  field.casts.push(cast);
}

module.exports = async function handler(req, res) {
  if (!method(req, res, "POST")) return;
  const pool = getPool();
  const client = await pool.connect();
  try {
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
    const exists = await client.query("select id from users where lower(email) = lower($1) limit 1", [email]);
    if (exists.rows.length) {
      send(res, 409, { ok: false, message: "This seller email is already registered." });
      return;
    }
    await client.query("begin");
    const hash = await bcrypt.hash(password, 10);
    const userResult = await client.query(
      "insert into users (name, email, password, role, status) values ($1, $2, $3, 'seller', 'pending') returning id",
      [ownerName, email, hash]
    );
    const columns = await tableColumns(client, "businesses");
    const fields = { names: [], values: [], casts: [] };
    addColumn(columns, ["user_id"], fields, userResult.rows[0].id);
    addColumn(columns, ["name", "store_name", "business_name"], fields, businessName);
    addColumn(columns, ["owner_name", "seller_name"], fields, ownerName);
    addColumn(columns, ["phone"], fields, phone);
    addColumn(columns, ["email"], fields, email);
    addColumn(columns, ["type", "business_type"], fields, type || "Retail");
    addColumn(columns, ["location_name", "location", "county"], fields, location);
    addColumn(columns, ["latitude", "lat"], fields, Number(payload.latitude || 0));
    addColumn(columns, ["longitude", "lng"], fields, Number(payload.longitude || 0));
    const paymentColumn = ["payment_methods", "payment_options"].find((candidate) => columns.has(candidate));
    if (paymentColumn) {
      const dataType = columns.get(paymentColumn);
      addColumn(columns, [paymentColumn], fields, JSON.stringify(payload.paymentOptions || []), dataType === "json" ? "::json" : "::jsonb");
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
    send(res, 201, {
      ok: true,
      message: "Your account has been submitted successfully. Please wait for admin approval.",
      seller: { id: businessResult.rows[0].id, status: "pending" }
    });
  } catch (error) {
    await client.query("rollback").catch(() => {});
    send(res, 500, {
      ok: false,
      message: "Seller registration failed.",
      error: String(error?.message || error).slice(0, 220)
    });
  } finally {
    client.release();
  }
};
