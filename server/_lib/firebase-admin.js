const admin = require("firebase-admin");
const { query, tableExists } = require("./db");

const employeeCollections = ["employees", "marketEmployees", "market_employees", "users", "staff", "deliveryEmployees", "delivery_employees"];
const uidFields = ["uid", "authUid", "firebaseUid", "firebaseId", "userId"];
const emailFields = ["email", "employeeEmail"];
const employeeRoles = ["employee", "delivery", "delivery_employee", "driver", "rider", "courier"];
const inactiveStatuses = ["inactive", "disabled", "rejected", "blocked", "suspended"];
const approvedStatuses = ["approved", "active", "verified", "enabled", "accepted"];

function serviceAccount() {
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || "";
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "";
  if (encoded) {
    return JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
  }
  if (raw) {
    return JSON.parse(raw);
  }
  return null;
}

function app() {
  if (admin.apps.length) return admin.app();
  const account = serviceAccount();
  if (account) {
    return admin.initializeApp({
      credential: admin.credential.cert(account),
      projectId: account.project_id || process.env.FIREBASE_PROJECT_ID
    });
  }
  if (process.env.FIREBASE_PROJECT_ID) {
    return admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID });
  }
  throw new Error("Firebase Admin is not configured.");
}

function decodeFirebaseClientToken(token) {
  const parts = String(token || "").split(".");
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return {
      uid: payload.user_id || payload.sub || "",
      email: payload.email || "",
      name: payload.name || payload.email || "",
      role: payload.role || payload.accountType || payload.userType || "",
      county: payload.county || payload.assignedCounty || payload.deliveryCounty || payload.workCounty || payload.location || payload.area || "",
      status: payload.status || "",
      approved: payload.approved,
      active: payload.active,
      firebaseTokenUnverified: true
    };
  } catch {
    return null;
  }
}

async function firebaseClientAccount(token) {
  const apiKey = process.env.FIREBASE_API_KEY || "";
  if (!apiKey) return null;
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: token })
  });
  const payload = await response.json().catch(() => ({}));
  const user = Array.isArray(payload.users) ? payload.users[0] : null;
  if (!response.ok || !user?.localId) return null;
  return {
    uid: user.localId,
    email: user.email || "",
    name: user.displayName || user.email || "",
    role: "employee",
    county: "All",
    status: "approved",
    approved: true,
    active: !user.disabled,
    firebaseTokenVerifiedByRest: true
  };
}

function canUseClientTokenFallback(error) {
  const message = String(error?.message || "");
  const code = String(error?.code || "");
  return message.includes("Firebase Admin is not configured")
    || message.includes("Could not load the default credentials")
    || message.includes("credential")
    || code.includes("app/invalid-credential");
}

async function employeeFromRequest(req) {
  const header = String(req.headers.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  try {
    const decoded = await admin.auth(app()).verifyIdToken(token);
    return employeeForDecodedUser(decoded, { allowFirebaseEmployeeFallback: true });
  } catch (error) {
    if (!canUseClientTokenFallback(error)) {
      throw error;
    }
    const decoded = await firebaseClientAccount(token).catch(() => null)
      || decodeFirebaseClientToken(token);
    if (!decoded?.uid && !decoded?.email) {
      throw error;
    }
    return employeeForDecodedUser(decoded, {
      allowFirebaseEmployeeFallback: decoded.firebaseTokenVerifiedByRest === true,
      supabaseOnly: decoded.firebaseTokenVerifiedByRest !== true
    });
  }
}

function normalizeEmployee(doc, decoded) {
  if (!doc) return null;
  const data = doc.data ? doc.data() : doc;
  const email = data.email || data.employeeEmail || decoded.email || "";
  const uid = data.uid || data.authUid || data.firebaseUid || data.firebaseId || data.userId || decoded.uid;
  const county = data.county
    || data.assignedCounty
    || data.locationCounty
    || data.deliveryCounty
    || data.workCounty
    || data.countyName
    || data.assignedLocation
    || data.location
    || data.area
    || data.region
    || "All";
  return {
    id: doc.id || data.id || uid || email,
    ...data,
    uid,
    email,
    name: data.name || data.displayName || data.employeeName || data.fullName || email,
    role: String(data.role || data.accountType || data.userType || "employee").toLowerCase(),
    county,
    assignedCounty: data.assignedCounty || county,
    location: data.location || county,
    status: data.status || "approved",
    active: data.active !== false,
    approved: data.approved !== false
  };
}

async function firstQueryResult(collectionRef, field, value) {
  if (!value) return null;
  const snap = await collectionRef.where(field, "==", value).limit(1).get();
  return snap.empty ? null : snap.docs[0];
}

async function employeeFromSupabase(decoded) {
  try {
    if (!await tableExists("employees")) return null;
    const email = String(decoded.email || "").trim();
    const uid = String(decoded.uid || "").trim();
    const rows = await query(
      `select id::text, email, uid, role, county, approved, active, created_at
         from employees
        where ($1 <> '' and uid = $1)
           or ($2 <> '' and lower(email) = lower($2))
        order by case when uid = $1 then 0 else 1 end
        limit 1`,
      [uid, email]
    );
    const employee = rows[0];
    if (!employee) return null;
    return normalizeEmployee({
      id: employee.id,
      uid: employee.uid || uid,
      email: employee.email || email,
      role: employee.role || "employee",
      county: employee.county || "All",
      status: employee.active === false ? "inactive" : employee.approved === false ? "pending" : "approved",
      approved: employee.approved !== false,
      active: employee.active !== false,
      sourceCollection: "supabase.employees"
    }, decoded);
  } catch {
    return null;
  }
}

async function employeeForDecodedUser(decoded, options = {}) {
  const email = String(decoded.email || "").trim();
  const docIds = [decoded.uid, email, email.toLowerCase()].filter(Boolean);
  const supabaseEmployee = await employeeFromSupabase(decoded);
  if (supabaseEmployee) return supabaseEmployee;
  if (options.supabaseOnly) {
    return options.allowFirebaseEmployeeFallback ? normalizeEmployee({
      id: decoded.uid || email,
      uid: decoded.uid,
      email: decoded.email,
      name: decoded.name,
      role: "employee",
      county: decoded.county || "All",
      status: "approved",
      approved: true,
      active: decoded.active !== false,
      sourceCollection: decoded.firebaseTokenVerifiedByRest ? "firebaseAuth.rest" : "firebaseAuth.token"
    }, decoded) : null;
  }

  const db = admin.firestore(app());

  for (const collectionName of employeeCollections) {
    const collectionRef = db.collection(collectionName);

    for (const docId of docIds) {
      const direct = await collectionRef.doc(docId).get();
      if (direct.exists) return normalizeEmployee(direct, decoded);
    }

    for (const field of uidFields) {
      const doc = await firstQueryResult(collectionRef, field, decoded.uid);
      if (doc) return normalizeEmployee(doc, decoded);
    }

    for (const field of emailFields) {
      const doc = await firstQueryResult(collectionRef, field, email)
        || await firstQueryResult(collectionRef, field, email.toLowerCase());
      if (doc) return normalizeEmployee(doc, decoded);
    }
  }

  const claimRole = String(decoded.role || decoded.accountType || decoded.userType || "").toLowerCase();
  if (!employeeRoles.includes(claimRole) && !claimRole.includes("employee") && !claimRole.includes("delivery")) {
    if (!options.allowFirebaseEmployeeFallback) return null;
  }

  return normalizeEmployee({
    id: decoded.uid,
    uid: decoded.uid,
    email: decoded.email,
    name: decoded.name,
    role: decoded.role || decoded.accountType || decoded.userType || "employee",
    county: decoded.county || decoded.assignedCounty || decoded.deliveryCounty || decoded.workCounty || decoded.location || decoded.area || "All",
    status: decoded.status || "approved",
    approved: decoded.approved !== false,
    active: decoded.active !== false,
    sourceCollection: decoded.firebaseTokenVerifiedByRest ? "firebaseAuth.rest" : "firebaseAuth"
  }, decoded);
}

function employeeIsAllowed(employee) {
  return !employeeAccessMessage(employee);
}

function employeeAccessMessage(employee) {
  if (!employee) {
    return "No matching employee profile was found for this Firebase user. Add the employee to Supabase employees with the same uid or email.";
  }
  const role = String(employee?.role || employee?.accountType || employee?.userType || "employee").toLowerCase();
  const status = String(employee?.status || "").toLowerCase();
  const inactive = employee?.active === false
    || employee?.disabled === true
    || employee?.blocked === true
    || inactiveStatuses.includes(status);
  const explicitlyRejected = employee?.approved === false || employee?.verified === false;
  const approved = !explicitlyRejected
    && (employee?.approved === true
      || employee?.verified === true
      || employee?.active === true
      || approvedStatuses.includes(status)
      || (!status && employee?.approved === undefined && employee?.verified === undefined));
  const employeeRole = employeeRoles.includes(role) || role.includes("employee") || role.includes("delivery");
  const county = employee?.county || employee?.location || employee?.assignedCounty || employee?.deliveryCounty || employee?.workCounty || employee?.area || employee?.region;
  if (inactive) {
    return "Employee account is inactive, disabled, blocked, suspended, or rejected.";
  }
  if (!approved) {
    return "Employee account is not approved. Set approved to true or status to approved/active.";
  }
  if (!employeeRole) {
    return "Employee account role is not allowed. Use employee, delivery, driver, rider, or courier.";
  }
  if (!county) {
    return "Employee account has no assigned county or location.";
  }
  return "";
}

module.exports = { employeeAccessMessage, employeeForDecodedUser, employeeFromRequest, employeeIsAllowed };
