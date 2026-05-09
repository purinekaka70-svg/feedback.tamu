const admin = require("firebase-admin");

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
  const db = admin.firestore(app());
  const direct = await db.collection("employees").doc(decoded.uid).get();
  if (direct.exists) {
    return { id: direct.id, uid: decoded.uid, email: decoded.email, ...direct.data() };
  }
  const snap = await db.collection("employees").where("uid", "==", decoded.uid).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, uid: decoded.uid, email: decoded.email, ...doc.data() };
}

function employeeIsAllowed(employee) {
  return employee?.approved === true &&
    employee?.active === true &&
    String(employee?.role || "employee").toLowerCase() === "employee" &&
    Boolean(employee?.county || employee?.location || employee?.assignedCounty);
}

module.exports = { employeeFromRequest, employeeIsAllowed };
