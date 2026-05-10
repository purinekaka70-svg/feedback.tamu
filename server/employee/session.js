const { employeeAccessMessage, employeeFromRequest } = require("../_lib/firebase-admin");
const { method, send } = require("../_lib/http");

module.exports = async function handler(req, res) {
  if (!method(req, res, ["GET"])) return;

  try {
    const header = String(req.headers.authorization || "");
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) {
      send(res, 401, { ok: false, message: "Firebase employee login is required." });
      return;
    }

    const employee = await employeeFromRequest(req);
    const accessMessage = employeeAccessMessage(employee);
    if (accessMessage) {
      send(res, 403, { ok: false, message: accessMessage });
      return;
    }

    send(res, 200, { ok: true, employee });
  } catch (error) {
    const message = String(error?.message || "");
    send(res, 401, {
      ok: false,
      message: message.includes("Firebase Admin is not configured")
        ? "Firebase Admin is not configured on the server, so employee tokens cannot be verified."
        : "Firebase employee session could not be verified."
    });
  }
};
