const admin = require("firebase-admin");

const employeeCollections = ["employees", "users", "staff", "deliveryEmployees", "delivery_employees"];
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

async function employeeFromRequest(req) {
  const header = String(req.headers.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  const decoded = await admin.auth(app()).verifyIdToken(token);
  return employeeForDecodedUser(decoded);
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

async function employeeForDecodedUser(decoded) {
  const db = admin.firestore(app());
  const email = String(decoded.email || "").trim();
  const docIds = [decoded.uid, email, email.toLowerCase()].filter(Boolean);

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

  return normalizeEmployee({
    id: decoded.uid,
    uid: decoded.uid,
    email: decoded.email,
    name: decoded.name,
    role: decoded.role || decoded.accountType || decoded.userType,
    county: decoded.county || decoded.assignedCounty || decoded.deliveryCounty || decoded.workCounty || decoded.location || decoded.area || "All",
    status: decoded.status || "approved",
    approved: decoded.approved !== false,
    active: decoded.active !== false
  }, decoded);
}

function employeeIsAllowed(employee) {
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
  return !inactive && approved && employeeRole && Boolean(county);
}

module.exports = { employeeForDecodedUser, employeeFromRequest, employeeIsAllowed };
