const { claims } = require("../_lib/auth");
const { employeeFromRequest, employeeIsAllowed } = require("../_lib/firebase-admin");
const { method, send } = require("../_lib/http");

module.exports = async function handler(req, res) {
  if (!method(req, res, ["GET"])) return;

  try {
    const header = String(req.headers.authorization || "");
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    const session = claims(req);
    if (!token && session?.role === "employee") {
      const county = session.county || session.assignedCounty || session.location || "";
      if (!county) {
        send(res, 403, { ok: false, message: "Employee account needs an assigned county." });
        return;
      }
      send(res, 200, {
        ok: true,
        employee: {
          id: String(session.employeeId || session.userId || session.email || ""),
          userId: session.userId || "",
          email: session.email || "",
          name: session.name || session.email || "Employee",
          role: "employee",
          status: session.status || "approved",
          county,
          assignedCounty: county,
          location: county,
          active: true,
          approved: true
        }
      });
      return;
    }
    if (!token) {
      send(res, 401, { ok: false, message: "Firebase employee login is required." });
      return;
    }

    const employee = await employeeFromRequest(req);
    if (!employeeIsAllowed(employee)) {
      send(res, 403, { ok: false, message: "Employee account is not active, approved, or assigned to a county." });
      return;
    }

    send(res, 200, { ok: true, employee });
  } catch (error) {
    send(res, 401, { ok: false, message: "Firebase employee session could not be verified." });
  }
};
