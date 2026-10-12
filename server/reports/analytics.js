const { requireRole } = require("../_lib/auth");
const { query } = require("../_lib/db");
const { method, send } = require("../_lib/http");

const PERIODS = {
  daily: { trunc: "day", days: 7 },
  weekly: { trunc: "week", days: 84 },
  monthly: { trunc: "month", days: 366 },
  yearly: { trunc: "year", days: 365 * 5 }
};

function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}

function dateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function nairobiToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

module.exports = async function handler(req, res) {
  if (!method(req, res, "GET")) return;
  const session = requireRole(req, res, ["admin", "seller"]);
  if (!session) return;

  try {
    const url = new URL(req.url, "http://local");
    const period = PERIODS[url.searchParams.get("period")] ? url.searchParams.get("period") : "daily";
    const { trunc, days } = PERIODS[period];
    const toDate = parseDate(url.searchParams.get("to")) || parseDate(nairobiToday());
    const fromDate = parseDate(url.searchParams.get("from")) || new Date(toDate.getTime() - (days - 1) * 86_400_000);

    if (fromDate > toDate || toDate.getTime() - fromDate.getTime() > 3_660 * 86_400_000) {
      send(res, 422, { ok: false, message: "Choose a valid report range of ten years or less." });
      return;
    }

    const params = [trunc, dateOnly(fromDate), dateOnly(toDate)];
    let scopedOrders;
    if (session.role === "seller") {
      const businessId = Number(session.businessId || 0);
      if (!Number.isSafeInteger(businessId) || businessId < 1) {
        send(res, 403, { ok: false, message: "Seller account is not linked to a business." });
        return;
      }
      params.push(businessId, String(businessId));
      scopedOrders = `
        select o.id, o.created_at, o.status::text as status, o.payment_status,
               sum(oi.line_total)::numeric as sales, 0::numeric as delivery
          from orders o
          join order_items oi on oi.order_id = o.id
         where (oi.business_id = $4 or oi.store_public_id = $5)
           and o.created_at >= ($2::date::timestamp at time zone 'Africa/Nairobi')
           and o.created_at < (($3::date + 1)::timestamp at time zone 'Africa/Nairobi')
         group by o.id, o.created_at, o.status, o.payment_status`;
    } else {
      scopedOrders = `
        select o.id, o.created_at, o.status::text as status, o.payment_status,
               o.total::numeric as sales, o.delivery_fee::numeric as delivery
          from orders o
         where o.created_at >= ($2::date::timestamp at time zone 'Africa/Nairobi')
           and o.created_at < (($3::date + 1)::timestamp at time zone 'Africa/Nairobi')`;
    }

    const rows = await query(`
      with scoped_orders as (${scopedOrders})
      select to_char(date_trunc($1::text, created_at at time zone 'Africa/Nairobi'), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as bucket,
             count(*)::int as orders,
             count(*) filter (where status = 'delivered')::int as delivered,
             count(*) filter (where payment_status in ('paid', 'confirmed'))::int as paid_orders,
             coalesce(sum(sales), 0)::numeric as sales,
             coalesce(sum(sales) filter (where payment_status in ('paid', 'confirmed')), 0)::numeric as paid_sales,
             coalesce(sum(delivery), 0)::numeric as delivery
        from scoped_orders
       group by 1
       order by 1 asc`, params);

    const points = rows.map((row) => ({
      bucket: row.bucket,
      orders: Number(row.orders || 0),
      delivered: Number(row.delivered || 0),
      paidOrders: Number(row.paid_orders || 0),
      sales: Number(row.sales || 0),
      paidSales: Number(row.paid_sales || 0),
      delivery: Number(row.delivery || 0)
    }));
    const totals = points.reduce((total, point) => ({
      orders: total.orders + point.orders,
      delivered: total.delivered + point.delivered,
      paidOrders: total.paidOrders + point.paidOrders,
      sales: total.sales + point.sales,
      paidSales: total.paidSales + point.paidSales,
      delivery: total.delivery + point.delivery
    }), { orders: 0, delivered: 0, paidOrders: 0, sales: 0, paidSales: 0, delivery: 0 });

    send(res, 200, {
      ok: true,
      scope: session.role,
      period,
      from: dateOnly(fromDate),
      to: dateOnly(toDate),
      totals,
      points
    });
  } catch (error) {
    console.error("Report query failed:", String(error?.code || error?.message || error).slice(0, 180));
    send(res, 500, { ok: false, message: "Could not load report data." });
  }
};
