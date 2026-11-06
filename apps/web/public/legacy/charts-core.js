(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.DaraCharts = api;
})(typeof globalThis === "undefined" ? this : globalThis, function () {
  "use strict";

  const esc = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
    );
  const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
  const fa = (value) => String(value).replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[digit]);
  const COLORS = ["var(--g)", "var(--r)", "#4f6bed", "#b7791f", "#8b5cf6", "#0ea5a4", "#d97706", "#64748b"];

  function empty(message = "داده‌ای برای نمایش وجود ندارد.") {
    return `<div class="chart-empty" role="status"><span>📊</span><p>${esc(message)}</p></div>`;
  }

  // نمودار ستونی گروهی (درآمد/هزینه در طول زمان)
  function bar({ labels = [], series = [], height = 240, format = (v) => String(v), ariaLabel = "نمودار ستونی", meta = [], name = "" }) {
    if (!labels.length || !series.length || series.every((s) => s.values.every((v) => num(v) === 0)))
      return empty();
    const width = 720;
    const pad = { top: 16, right: 12, bottom: 30, left: 56 };
    const innerW = width - pad.left - pad.right;
    const innerH = height - pad.top - pad.bottom;
    const max = Math.max(1, ...series.flatMap((s) => s.values.map(num)));
    const step = innerW / labels.length;
    const groupW = step * 0.62;
    const barW = groupW / series.length;
    const grid = [0, 0.25, 0.5, 0.75, 1]
      .map((ratio) => {
        const y = pad.top + innerH - innerH * ratio;
        return `<line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" class="chart-grid"></line><text x="${pad.left - 8}" y="${y + 4}" class="chart-axis" text-anchor="end">${esc(format(max * ratio))}</text>`;
      })
      .join("");
    const bars = labels
      .map((label, index) => {
        const x0 = pad.left + step * index + (step - groupW) / 2;
        const barsHtml = series
          .map((serie, serieIndex) => {
            const value = num(serie.values[index]);
            const h = (value / max) * innerH;
            const x = x0 + barW * serieIndex;
            return `<rect x="${x}" y="${pad.top + innerH - h}" width="${barW - 2}" height="${Math.max(0, h)}" rx="3" fill="${serie.color || COLORS[serieIndex % COLORS.length]}" data-chart-key="${esc(meta[index] ?? "")}"${meta[index] == null ? "" : ' style="cursor:pointer"'}><title>${esc(label)} · ${esc(serie.name)}: ${esc(format(value))}</title></rect>`;
          })
          .join("");
        return `${barsHtml}<text x="${pad.left + step * index + step / 2}" y="${height - 8}" class="chart-axis" text-anchor="middle">${esc(label)}</text>`;
      })
      .join("");
    return `<figure class="chart" role="img" data-chart-name="${esc(name)}" aria-label="${esc(ariaLabel)}"><svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">${grid}${bars}</svg><figcaption class="chart-legend">${series.map((serie, index) => `<span><i style="background:${serie.color || COLORS[index % COLORS.length]}"></i>${esc(serie.name)}</span>`).join("")}</figcaption></figure>`;
  }

  // نمودار دونات با legend و درصد
  function donut({ items = [], size = 220, title = "", name = "" }) {
    const data = items.map((item) => ({ ...item, value: num(item.value) })).filter((item) => item.value > 0);
    const total = data.reduce((sum, item) => sum + item.value, 0);
    if (!total) return empty();
    const radius = 70;
    const circumference = 2 * Math.PI * radius;
    let offset = 0;
    const arcs = data
      .map((item, index) => {
        const fraction = item.value / total;
        const dash = `${(fraction * circumference).toFixed(2)} ${circumference.toFixed(2)}`;
        const circle = `<circle r="${radius}" cx="110" cy="110" fill="none" stroke="${item.color || COLORS[index % COLORS.length]}" stroke-width="26" stroke-dasharray="${dash}" stroke-dashoffset="${(-offset * circumference).toFixed(2)}" transform="rotate(-90 110 110)" data-chart-key="${esc(item.key ?? "")}"${item.key == null ? "" : ' style="cursor:pointer"'}><title>${esc(item.label)}: ${esc(item.display ?? item.value)}</title></circle>`;
        offset += fraction;
        return circle;
      })
      .join("");
    const legend = data
      .map(
        (item, index) => `<li data-chart-key="${esc(item.key ?? "")}"${item.key == null ? "" : ' style="cursor:pointer"'}><i style="background:${item.color || COLORS[index % COLORS.length]}"></i><span>${esc(item.label)}</span><b>${esc(item.display ?? item.value)}</b><small>${fa(Math.round((item.value / total) * 100))}٪</small></li>`,
      )
      .join("");
    return `<div class="donut-wrap"><figure class="chart donut" role="img" data-chart-name="${esc(name)}" aria-label="${esc(title || "نمودار سهم دسته‌ها")}"><svg viewBox="0 0 220 220">${arcs}<text x="110" y="106" text-anchor="middle" class="donut-total">${esc(title || "مجموع")}</text><text x="110" y="128" text-anchor="middle" class="donut-value">${esc(fa(data.length))} دسته</text></svg></figure><ul class="donut-legend" data-chart-name="${esc(name)}">${legend}</ul></div>`;
  }

  // نمودار خطی/سطحی (روند سرمایه یا پس‌انداز)
  function line({ labels = [], values = [], height = 220, format = (v) => String(v), ariaLabel = "نمودار روند" }) {
    const points = values.map(num);
    if (!labels.length || points.length !== labels.length || points.every((v) => v === 0)) return empty();
    const width = 720;
    const pad = { top: 16, right: 16, bottom: 28, left: 56 };
    const innerW = width - pad.left - pad.right;
    const innerH = height - pad.top - pad.bottom;
    const max = Math.max(...points, 1);
    const min = Math.min(...points, 0);
    const span = max - min || 1;
    const coords = points.map((value, index) => ({
      x: pad.left + (innerW * index) / Math.max(1, points.length - 1),
      y: pad.top + innerH - ((value - min) / span) * innerH,
    }));
    const path = coords.map((point) => `${point.x},${point.y}`).join(" ");
    const area = `${pad.left},${pad.top + innerH} ${path} ${coords[coords.length - 1].x},${pad.top + innerH}`;
    return `<figure class="chart" role="img" aria-label="${esc(ariaLabel)}"><svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><polygon points="${area}" class="chart-area"></polygon><polyline points="${path}" class="chart-line"></polyline>${coords.map((point, index) => `<circle cx="${point.x}" cy="${point.y}" r="3" class="chart-dot"><title>${esc(labels[index])}: ${esc(format(points[index]))}</title></circle>`).join("")}${labels.map((label, index) => `<text x="${coords[index].x}" y="${height - 8}" class="chart-axis" text-anchor="middle">${esc(label)}</text>`).join("")}</svg></figure>`;
  }

  return { bar, donut, line, empty, COLORS };
});
