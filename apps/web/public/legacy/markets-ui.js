(function () {
  "use strict";

  const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
  const STATUSES = {
    fresh: "به‌روز",
    stale: "قدیمی",
    unavailable: "قیمت در دسترس نیست",
  };
  const UNAVAILABLE_PRICES = [
    {
      id: "usd_free",
      name: "دلار آمریکا (بازار آزاد)",
      unit: "هر دلار",
      currencyLabel: "تومان",
    },
    { id: "gold_18k", name: "طلای ۱۸ عیار", unit: "هر گرم", currencyLabel: "تومان" },
    {
      id: "gold_ounce",
      name: "اونس جهانی طلا",
      unit: "هر اونس تروا",
      currencyLabel: "دلار آمریکا",
    },
    {
      id: "silver_ounce",
      name: "اونس جهانی نقره",
      unit: "هر اونس تروا",
      currencyLabel: "دلار آمریکا",
    },
    {
      id: "silver_999",
      name: "نقرهٔ ۹۹۹ در بازار ایران",
      unit: "هر گرم",
      currencyLabel: "تومان",
    },
  ].map((price) => ({
    ...price,
    price: null,
    change: null,
    changePercent: null,
    updatedAt: null,
    source: null,
    status: "unavailable",
    message: null,
  }));
  let snapshot = null;
  let loading = false;
  let requestError = "";
  let requestPromise = null;

  function escape(value) {
    return String(value ?? "").replace(/[&<>"]/g, (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char],
    );
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 2 }).format(value);
  }

  function formatDate(value) {
    if (!value) return "زمان ثبت نشده";
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "زمان نامعتبر";
    return new Intl.DateTimeFormat("fa-IR", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Tehran",
    }).format(date);
  }

  function renderPrice(price, forceStale) {
    const statusKey =
      forceStale && price.status === "fresh" ? "stale" : price.status;
    const status = STATUSES[statusKey] || STATUSES.unavailable;
    const priceValue =
      Number.isFinite(price.price) && price.price > 0
        ? `<strong class="market-price">${formatNumber(price.price)} ${escape(price.currencyLabel)}</strong>`
        : `<strong class="market-price market-unavailable">قیمت در دسترس نیست</strong>`;
    const hasChange =
      Number.isFinite(price.change) && Number.isFinite(price.changePercent);
    const change = hasChange
      ? `<p class="market-change ${price.change < 0 ? "neg" : "pos"}">تغییر نسبت به قیمت پایانی قبلی: ${price.change > 0 ? "+" : ""}${formatNumber(price.change)} ${escape(price.currencyLabel)} · ${price.changePercent > 0 ? "+" : ""}${formatNumber(price.changePercent)}٪</p>`
      : '<p class="market-change mu">تغییر معتبر در دسترس نیست</p>';
    const statusClass =
      statusKey === "fresh"
        ? "market-status-fresh"
        : statusKey === "stale"
          ? "market-status-stale"
          : "market-status-unavailable";

    return `<article class="card market-card"><div class="market-card-heading"><h3>${escape(price.name)}</h3><span class="market-status ${statusClass}">${status}</span></div><p class="market-unit">${escape(price.unit)}</p>${priceValue}${change}<p class="market-updated">آخرین ثبت قیمت: ${escape(formatDate(price.updatedAt))}</p>${price.source ? `<small>منبع داده: ${escape(price.source)}</small>` : ""}${price.message ? `<small class="market-warning">${escape(price.message)}</small>` : ""}</article>`;
  }

  function render() {
    if (!snapshot && !loading && !requestPromise) queueMicrotask(refresh);
    const prices = Array.isArray(snapshot?.prices)
      ? snapshot.prices
      : requestError
        ? UNAVAILABLE_PRICES
        : [];
    const banner = snapshot?.message || requestError;
    return `<div class="top"><div><h2 style="margin:0">بازارها</h2><p class="market-intro">قیمت‌های مرجع بازار؛ نه پیشنهاد خریدوفروش. دلار نمایش‌داده‌شده نرخ بازار آزاد است، نه نرخ رسمی.</p></div><button class="pri" type="button" onclick="DaraMarketsUI.refresh()" ${loading ? "disabled" : ""}>${loading ? "در حال دریافت…" : "به‌روزرسانی"}</button></div>${banner ? `<section class="card market-banner" role="status">${escape(banner)}</section>` : ""}${loading && !snapshot ? '<section class="card" role="status">در حال دریافت قیمت بازار…</section>' : ""}<div class="market-grid">${prices.map((price) => renderPrice(price, Boolean(requestError))).join("")}</div>${snapshot?.fetchedAt ? `<p class="market-footnote">زمان دریافت فید: ${escape(formatDate(snapshot.fetchedAt))} · منبع: <a href="${escape(snapshot.sourceUrl)}" target="_blank" rel="noopener noreferrer">Iran Market Data</a> · نرخ خرید و فروش جداگانه از این فید دریافت نمی‌شود.</p>` : !loading && !requestError ? '<section class="card market-banner" role="status">قیمت بازار هنوز دریافت نشده است.</section>' : ""}`;
  }

  async function refresh() {
    if (requestPromise) return requestPromise;
    loading = true;
    if (window.DARA_CURRENT_PAGE === "markets") window.DARA_RENDER?.();
    requestPromise = (async () => {
      try {
        const response = await fetch("/api/markets", {
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!data || !Array.isArray(data.prices))
          throw new Error("Invalid market response");
        snapshot = data;
        requestError = "";
      } catch {
        requestError = "ارتباط با سرویس بازار برقرار نشد. برای تلاش دوباره دکمهٔ به‌روزرسانی را بزنید.";
      } finally {
        loading = false;
        requestPromise = null;
        if (window.DARA_CURRENT_PAGE === "markets") window.DARA_RENDER?.();
      }
    })();
    return requestPromise;
  }

  window.setInterval(() => {
    if (window.DARA_CURRENT_PAGE === "markets") void refresh();
  }, REFRESH_INTERVAL_MS);

  window.DaraMarketsUI = { render, refresh };
})();
