const { send } = require("../server/_lib/http");
const { logRequest, rateLimit, securityHeaders } = require("../server/_lib/security");

const routes = {
  "admin/applications": () => require("../server/admin/applications"),
  "admin/control": () => require("../server/admin/control"),
  "admin/login": () => require("../server/admin/login"),
  "auth/logout": () => require("../server/auth/logout"),
  "auth/session": () => require("../server/auth/session"),
  "cart/index": () => require("../server/cart"),
  "categories/delete": () => require("../server/categories/delete"),
  "categories/index": () => require("../server/categories"),
  "categories/save": () => require("../server/categories/save"),
  "employee/orders": () => require("../server/employee/orders"),
  "employee/session": () => require("../server/employee/session"),
  "firebase/config": () => require("../server/firebase/config"),
  "health": () => require("../server/health"),
  "marketplace/list": () => require("../server/marketplace/list"),
  "offers/delete": () => require("../server/offers/delete"),
  "offers/save": () => require("../server/offers/save"),
  "orders/create": () => require("../server/orders/create"),
  "orders/delete": () => require("../server/orders/delete"),
  "orders/list": () => require("../server/orders/list"),
  "orders/update": () => require("../server/orders/update"),
  "payments/index": () => require("../server/payments"),
  "products/delete": () => require("../server/products/delete"),
  "products/save": () => require("../server/products/save"),
  "sellers/login": () => require("../server/sellers/login"),
  "sellers/register": () => require("../server/sellers/register"),
  "sellers/update": () => require("../server/sellers/update"),
  "users/index": () => require("../server/users")
};

function routeKey(req) {
  const queryPath = req.query?.path;
  const parsedPath = String(req.url || "").split("?")[0].replace(/^\/api\/?/, "");
  const rawPath = Array.isArray(queryPath)
    ? queryPath.join("/")
    : String(queryPath || parsedPath || "");
  return rawPath
    .replace(/\.php$/i, "")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/index$/i, "/index");
}

module.exports = async function handler(req, res) {
  securityHeaders(res);
  if (!rateLimit(req, res, "api-global", { limit: 240, windowMs: 60_000 })) return;
  if (!["GET", "HEAD", "OPTIONS"].includes(String(req.method || "").toUpperCase())) {
    if (!rateLimit(req, res, "api-write", { limit: 90, windowMs: 60_000 })) return;
  }
  const key = routeKey(req);
  const loadEndpoint = routes[key] || routes[`${key}/index`];
  if (!loadEndpoint) {
    send(res, 404, { ok: false, message: "API endpoint was not found." });
    return;
  }
  const endpoint = loadEndpoint();
  try {
    const result = await endpoint(req, res);
    logRequest(req, res.statusCode || 200);
    return result;
  } catch (error) {
    console.error("Unhandled API route error:", String(error?.message || error).slice(0, 180));
    send(res, 500, { ok: false, message: "API request failed." });
    logRequest(req, 500);
  }
};
