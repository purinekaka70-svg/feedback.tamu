const { requireRole } = require("../_lib/auth");
const { columnExists, query, tableExists } = require("../_lib/db");
const { body, method, send, text } = require("../_lib/http");

function normalizeBusiness(row) {
  return {
    ...row,
    id: String(row.id),
    userId: row.user_id,
    storeName: row.name,
    ownerName: row.owner_name || "",
    businessType: row.type || "retail",
    type: row.type || "retail",
    location: row.location_name || row.county || "Location pending",
    county: row.location_name || row.county || "",
    logoImage: row.logo_image || row.logo || "",
    status: row.status || "pending",
    createdAt: row.created_at
  };
}

module.exports = async function handler(req, res) {
  const session = requireRole(req, res, "admin");
  if (!session) return;
  if (!method(req, res, ["GET", "POST"])) return;

  try {
    if (!(await tableExists("businesses"))) {
      send(res, 200, { ok: true, applications: [] });
      return;
    }

    if (req.method === "POST") {
      const payload = await body(req);
      const id = Number(payload.id);
      const status = text(payload.status, 30);
      if (!id || !["pending", "approved", "rejected", "blocked"].includes(status)) {
        send(res, 422, { ok: false, message: "Invalid business status update." });
        return;
      }
      await query("UPDATE businesses SET status = ? WHERE id = ?", [status, id]);
      if (await columnExists("businesses", "user_id")) {
        const rows = await query("SELECT user_id FROM businesses WHERE id = ? LIMIT 1", [id]);
        if (rows[0]?.user_id) {
          await query("UPDATE users SET status = ? WHERE id = ?", [status, rows[0].user_id]);
        }
      }
      send(res, 200, { ok: true });
      return;
    }

    const rows = await query("SELECT * FROM businesses ORDER BY created_at DESC");
    send(res, 200, { ok: true, applications: rows.map(normalizeBusiness) });
  } catch (error) {
    send(res, 500, { ok: false, message: "Failed to load business applications." });
  }
};
