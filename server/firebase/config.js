const { method, send } = require("../_lib/http");

module.exports = async function handler(req, res) {
  if (!method(req, res, "GET")) return;
  send(res, 200, {
    ok: true,
    config: {
      apiKey: process.env.FIREBASE_API_KEY || "",
      authDomain: process.env.FIREBASE_AUTH_DOMAIN || "",
      projectId: process.env.FIREBASE_PROJECT_ID || "",
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "",
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "",
      appId: process.env.FIREBASE_APP_ID || ""
    }
  });
};
