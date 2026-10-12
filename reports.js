(function () {
  const PERIODS = [
    ["daily", "Daily · last 7 days"],
    ["weekly", "Weekly · last 12 weeks"],
    ["monthly", "Monthly · last 12 months"],
    ["yearly", "Yearly · last 5 years"]
  ];

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
  }

  function money(value) {
    return `KSh ${Number(value || 0).toLocaleString()}`;
  }

  function periodLabel(value, period) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    const options = period === "yearly"
      ? { year: "numeric", timeZone: "UTC" }
      : period === "monthly"
        ? { month: "short", year: "numeric", timeZone: "UTC" }
        : period === "weekly"
          ? { day: "numeric", month: "short", timeZone: "UTC" }
          : { day: "numeric", month: "short", timeZone: "UTC" };
    return new Intl.DateTimeFormat(undefined, options).format(date);
  }

  function optionsMarkup(selected) {
    return PERIODS.map(([value, label]) =>
      `<option value="${value}"${value === selected ? " selected" : ""}>${label}</option>`
    ).join("");
  }

  function completePoints(report) {
    const start = new Date(`${report.from}T00:00:00.000Z`);
    const end = new Date(`${report.to}T00:00:00.000Z`);
    const step = report.period;
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return report.points || [];
    if (step === "weekly") start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
    if (step === "monthly") start.setUTCDate(1);
    if (step === "yearly") { start.setUTCMonth(0, 1); }

    const byBucket = new Map((report.points || []).map((point) => [
      new Date(point.bucket).toISOString().slice(0, 10), point
    ]));
    const points = [];
    for (const date = new Date(start); date <= end; ) {
      const key = date.toISOString().slice(0, 10);
      points.push(byBucket.get(key) || {
        bucket: `${key}T00:00:00.000Z`, orders: 0, delivered: 0,
        paidOrders: 0, sales: 0, paidSales: 0, delivery: 0
      });
      if (step === "daily") date.setUTCDate(date.getUTCDate() + 1);
      else if (step === "weekly") date.setUTCDate(date.getUTCDate() + 7);
      else if (step === "monthly") date.setUTCMonth(date.getUTCMonth() + 1);
      else date.setUTCFullYear(date.getUTCFullYear() + 1);
    }
    return points;
  }

  function renderWidget(widget, report) {
    const { period, totals, points, from, to } = report;
    const chartPoints = completePoints(report);
    const summary = widget.querySelector("[data-report-summary]");
    if (summary) {
      summary.textContent = `${from} to ${to} · ${totals.orders} orders · ${money(totals.sales)} sales · ${totals.paidOrders} paid`;
    }

    const chart = widget.querySelector("[data-report-chart]");
    if (chart) {
      if (!chartPoints.length) {
        chart.innerHTML = '<p class="report-empty">No orders were recorded in this period.</p>';
      } else {
        const max = Math.max(1, ...chartPoints.map((point) => Number(point.sales || 0)));
        chart.innerHTML = `<div class="report-bars">${chartPoints.map((point) => {
          const label = periodLabel(point.bucket, period);
          const sales = Number(point.sales || 0);
          const height = sales ? Math.max(4, Math.round((sales / max) * 100)) : 2;
          return `<div class="report-bar-group" title="${escapeHtml(label)}: ${escapeHtml(money(sales))}, ${Number(point.orders || 0)} orders">
            <span class="report-bar-value">${escapeHtml(sales ? money(sales) : "—")}</span>
            <div class="report-bar-track"><span class="report-bar" style="height:${height}%"></span></div>
            <span class="report-bar-label">${escapeHtml(label)}</span>
          </div>`;
        }).join("")}</div>`;
      }
    }

    const table = widget.querySelector("[data-report-table]");
    if (table) {
      table.innerHTML = chartPoints.length
        ? `<div class="report-table-scroll"><table><thead><tr><th>Period</th><th>Orders</th><th>Paid</th><th>Sales</th><th>Paid sales</th><th>Delivery fees</th></tr></thead><tbody>${chartPoints.map((point) => `<tr>
            <td>${escapeHtml(periodLabel(point.bucket, period))}</td><td>${Number(point.orders || 0)}</td>
            <td>${Number(point.paidOrders || 0)}</td><td>${escapeHtml(money(point.sales))}</td>
            <td>${escapeHtml(money(point.paidSales))}</td><td>${escapeHtml(money(point.delivery))}</td>
          </tr>`).join("")}</tbody></table></div>`
        : "";
    }
  }

  async function loadWidget(widget) {
    const status = widget.querySelector("[data-report-status]");
    const select = widget.querySelector("[data-report-period]");
    const summary = widget.querySelector("[data-report-summary]");
    const period = PERIODS.some(([value]) => value === select?.value) ? select.value : "daily";
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    if (status) status.textContent = "Loading report…";
    try {
      const response = await fetch(`./api/reports/analytics.php?period=${encodeURIComponent(period)}`, {
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal
      });
      const report = await response.json();
      if (!response.ok || !report.ok) throw new Error(report.message || "Report could not be loaded.");
      renderWidget(widget, report);
      if (status) status.textContent = "Report updated.";
    } catch (error) {
      const message = error.name === "AbortError"
        ? "The report request timed out. Select Refresh to try again."
        : error.message || "Report could not be loaded. Select Refresh to try again.";
      if (summary) summary.textContent = "Sales data is currently unavailable.";
      if (status) status.textContent = message;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function bindWidget(widget) {
    if (widget.dataset.reportBound === "true") return;
    widget.dataset.reportBound = "true";
    const select = widget.querySelector("[data-report-period]");
    if (select) select.innerHTML = optionsMarkup("daily");
    widget.querySelector("[data-report-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      loadWidget(widget);
    });
    select?.addEventListener("change", () => loadWidget(widget));
    widget.querySelector("[data-report-print]")?.addEventListener("click", () => {
      document.querySelectorAll("[data-report-widget].print-target").forEach((item) => item.classList.remove("print-target"));
      widget.classList.add("print-target");
      document.body.classList.add("report-printing");
      window.print();
    });
    loadWidget(widget);
  }

  window.addEventListener("afterprint", () => {
    document.body.classList.remove("report-printing");
    document.querySelectorAll("[data-report-widget].print-target").forEach((item) => item.classList.remove("print-target"));
  });

  window.TamuReports = {
    mount() {
      document.querySelectorAll("[data-report-widget]").forEach(bindWidget);
    },
    refresh() {
      document.querySelectorAll("[data-report-widget]").forEach(loadWidget);
    }
  };
})();
