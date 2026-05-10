const { send } = require("../server/_lib/http");

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
  "employee/login": () => require("../server/employee/login"),
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
  const key = routeKey(req);
  const loadEndpoint = routes[key] || routes[`${key}/index`];
  if (!loadEndpoint) {
    send(res, 404, { ok: false, message: "API endpoint was not found.", key });
    return;
  }
  const endpoint = loadEndpoint();
  return endpoint(req, res);
};
