const { send } = require("../server/_lib/http");

const routes = {
  "admin/applications": "../server/admin/applications",
  "admin/control": "../server/admin/control",
  "admin/debug-login": "../server/admin/debug-login",
  "admin/login": "../server/admin/login",
  "auth/logout": "../server/auth/logout",
  "auth/session": "../server/auth/session",
  "cart/index": "../server/cart",
  "categories/delete": "../server/categories/delete",
  "categories/index": "../server/categories",
  "categories/save": "../server/categories/save",
  "employee/orders": "../server/employee/orders",
  "firebase/config": "../server/firebase/config",
  "health": "../server/health",
  "marketplace/list": "../server/marketplace/list",
  "offers/delete": "../server/offers/delete",
  "offers/save": "../server/offers/save",
  "orders/create": "../server/orders/create",
  "orders/delete": "../server/orders/delete",
  "orders/list": "../server/orders/list",
  "orders/update": "../server/orders/update",
  "payments/index": "../server/payments",
  "products/delete": "../server/products/delete",
  "products/save": "../server/products/save",
  "sellers/login": "../server/sellers/login",
  "sellers/register": "../server/sellers/register",
  "sellers/update": "../server/sellers/update",
  "users/index": "../server/users"
};

function routeKey(req) {
  const queryPath = req.query?.path;
  const rawPath = Array.isArray(queryPath)
    ? queryPath.join("/")
    : String(queryPath || "");
  return rawPath
    .replace(/\.php$/i, "")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/index$/i, "/index");
}

module.exports = async function handler(req, res) {
  const key = routeKey(req);
  const modulePath = routes[key] || routes[`${key}/index`];
  if (!modulePath) {
    send(res, 404, { ok: false, message: "API endpoint was not found." });
    return;
  }
  const endpoint = require(modulePath);
  return endpoint(req, res);
};
