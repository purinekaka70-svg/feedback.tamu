const { issueAuth, verifyPassword } = require("../_lib/auth");
const { query } = require("../_lib/db");
const { body, method, send, text } = require("../_lib/http");

async function verifySupabasePassword(password, hash) {
  if (!hash) return false;
  if (await verifyPassword(password, hash)) return true;
  const rows = await query("select crypt($1, $2) = $2 as ok", [String(password || ""), String(hash || "")]);
  return rows[0]?.ok === true;
}

async function tableExists(table) {
  const rows = await query(
    "select 1 from information_schema.tables where table_schema = 'public' and table_name = $1 limit 1",
    [table]
  );
  return rows.length > 0;
}

function employeePayload(row) {
  const county = row.county || row.assigned_county || row.location || "";
  return {
    id: String(row.employee_id || row.user_id || row.id || row.email || ""),
    userId: row.user_id || row.id || "",
    email: row.email || "",
    name: row.name || row.email || "Employee",
    role: "employee",
    status: row.employee_status || row.user_status || "approved",
    county,
    assignedCounty: county,
    location: county,
    active: row.active !== false,
    approved: row.approved !== false
  };
}

module.exports = async function handler(req, res) {
  if (!method(req, res, "POST")) return;
  try {
    const databaseConfigured = Boolean(
      process.env.SUPABASE_DB_URL ||
      process.env.DATABASE_URL ||
      process.env.POSTGRES_URL ||
      process.env.SUPABASE_DB_HOST
    );
    if (!databaseConfigured) {
      send(res, 500, { ok: false, message: "Database connection is not configured." });
      return;
    }

    const payload = await body(req);
    const email = text(payload.email, 180).toLowerCase();
    const password = String(payload.password || "");
    if (!email || !password) {
      send(res, 422, { ok: false, message: "Employee email and password are required." });
      return;
    }

    const hasEmployees = await tableExists("employees");
    const rows = hasEmployees
      ? await query(
          `select u.id as user_id, u.name, u.email, u.password, u.status as user_status,
                  e.id as employee_id, e.county, e.role as employee_role,
                  e.approved, e.active, e.created_at, 'approved' as employee_status
             from users u
             left join employees e on lower(e.email) = lower(u.email)
            where lower(u.email) = lower($1) and u.role = 'employee'
            limit 1`,
          [email]
        )
      : await query(
          `select id as user_id, name, email, password, status as user_status,
                  '' as county, 'employee' as employee_role, true as approved, true as active
             from users
            where lower(email) = lower($1) and role = 'employee'
            limit 1`,
          [email]
        );

    const employee = rows[0];
    if (!employee || !(await verifySupabasePassword(password, employee.password))) {
      send(res, 401, { ok: false, message: "Invalid employee credentials." });
      return;
    }

    const status = String(employee.user_status || "").toLowerCase();
    const approved = employee.approved !== false && ["approved", "active", "enabled", ""].includes(status);
    const active = employee.active !== false;
    const county = text(employee.county || employee.location || payload.county, 120);
    if (!approved || !active) {
      send(res, 403, { ok: false, message: "Employee account is not approved or active." });
      return;
    }
    if (!county) {
      send(res, 403, { ok: false, message: "Employee account needs an assigned county before login." });
      return;
    }

    const account = employeePayload({ ...employee, county });
    issueAuth(res, {
      userId: account.userId,
      employeeId: account.id,
      role: "employee",
      email: account.email,
      county: account.county,
      status: "approved"
    });
    send(res, 200, { ok: true, employee: account });
  } catch (error) {
    send(res, 500, {
      ok: false,
      message: "Employee login failed.",
      error: String(error?.message || error).slice(0, 180)
    });
  }
};
