(function () {
  "use strict";

  const Core = window.DaraAssetsCore;
  const STORE_KEY = "dara.assets.preview.v1";
  const labels = {
    cash: "نقد و سپرده",
    precious_metal: "فلزات گران‌بها",
    stock: "سهام",
    fund: "صندوق",
    crypto: "رمزارز",
    real_estate: "ملک",
    vehicle: "خودرو",
    foreign_currency: "ارز خارجی",
    other: "سایر",
    liquid: "نقدشونده",
    semi_liquid: "نیمه‌نقدشونده",
    illiquid: "غیرنقدشونده",
    buy: "خرید",
    sell: "فروش",
    deposit: "واریز به سبد",
    withdrawal: "برداشت از سبد",
    transfer: "انتقال دارایی",
    fee: "کارمزد",
    dividend: "سود نقدی",
    split: "تعدیل تعداد",
  };
  let state;
  let loadError = "";
  let selectedAssetId = "";
  let filters = { type: "", currency: "", account: "", from: "", to: "" };

  function escape(value) {
    return String(value ?? "").replace(/[&<>"]/g, (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char],
    );
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      state = raw ? Core.validateState(JSON.parse(raw)) : Core.initialState();
    } catch (error) {
      state = Core.initialState();
      loadError =
        error instanceof Error
          ? `داده‌های دارایی خوانده نشد: ${error.message}`
          : "داده‌های دارایی خوانده نشد.";
    }
  }

  function save() {
    if (loadError) throw new Error(`${loadError}؛ برای جلوگیری از بازنویسی، ذخیره‌سازی متوقف شد.`);
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (error) {
      throw new Error(
        error instanceof Error ? `ذخیره‌سازی مرورگر ناموفق بود: ${error.message}` : "ذخیره‌سازی مرورگر ناموفق بود.",
      );
    }
  }

  function money(value, currency = "") {
    if (value == null) return "قیمت ثبت نشده";
    return `${new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 8 }).format(Number(value))} ${escape(currency)}`;
  }

  function dateLabel(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "تاریخ نامعتبر";
    return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium" }).format(date);
  }

  function options(items, selected = "") {
    return items
      .map(
        (item) =>
          `<option value="${escape(item.value)}"${item.value === selected ? " selected" : ""}>${escape(item.label)}</option>`,
      )
      .join("");
  }

  function fieldMarkup(field) {
    const value = field.value ?? "";
    if (field.type === "select") {
      return `<label>${escape(field.label)}<select name="${escape(field.name)}" ${field.required ? "required" : ""}>${field.empty ? '<option value="">انتخاب کنید</option>' : ""}${options(field.options, String(value))}</select></label>`;
    }
    if (field.type === "checkbox") {
      return `<label class="asset-check"><input type="checkbox" name="${escape(field.name)}" ${value ? "checked" : ""}>${escape(field.label)}</label>`;
    }
    return `<label>${escape(field.label)}<input name="${escape(field.name)}" type="${field.type || "text"}" value="${escape(value)}" placeholder="${escape(field.placeholder || "")}" ${field.required ? "required" : ""} ${field.min != null ? `min="${field.min}"` : ""} ${field.step ? `step="${field.step}"` : ""}></label>`;
  }

  function openForm(title, fields, submit) {
    const dialog = document.getElementById("dlg");
    dialog.innerHTML = `<form method="dialog" class="asset-form"><h3>${escape(title)}</h3>${fields.map(fieldMarkup).join("")}<p class="err" role="alert" id="asset-form-error"></p><div class="acts"><button class="pri" type="submit">ذخیره</button><button class="b" type="button" data-close>انصراف</button></div></form>`;
    const form = dialog.querySelector("form");
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      form.querySelectorAll('input[type="checkbox"]').forEach((input) => {
        data[input.name] = input.checked;
      });
      try {
        submit(data);
        save();
        dialog.close();
        selectedAssetId = "";
        window.DARA_RENDER?.();
      } catch (error) {
        dialog.querySelector("#asset-form-error").textContent =
          error instanceof Error ? error.message : "ذخیره‌سازی ناموفق بود.";
      }
    });
    dialog.querySelector("[data-close]").addEventListener("click", () => dialog.close());
    dialog.showModal();
  }

  function allCurrencies() {
    return [...new Set([
      state.baseCurrency,
      ...(window.DARA_APP_STATE ? [window.DARA_APP_STATE.cur] : []),
      ...state.assets.map((asset) => asset.currency),
      ...state.valuations.map((valuation) => valuation.currency),
      ...state.liabilities.map((liability) => liability.currency),
      ...state.exchangeRates.flatMap((rate) => [rate.from, rate.to]),
    ].filter(Boolean))].sort();
  }

  function investmentAssets() {
    return state.assets.filter((asset) => Core.INVESTMENT_TYPES.includes(asset.type));
  }

  function currentBalances(appState) {
    if (!appState) return {};
    const output = {};
    appState.accounts.forEach((account) => (output[account.id] = account.opening));
    appState.tx.forEach((transaction) => {
      if (transaction.type === "income") output[transaction.acc] += transaction.amount;
      else if (transaction.type === "expense") output[transaction.acc] -= transaction.amount;
      else {
        output[transaction.acc] -= transaction.amount;
        output[transaction.to] += transaction.amount;
      }
    });
    return output;
  }

  function accountList(appState) {
    if (!appState) return [];
    const balances = currentBalances(appState);
    return appState.accounts.map((account) => ({
      id: account.id,
      name: account.name,
      balance: String(balances[account.id] || 0),
      currency: appState.cur,
    }));
  }

  function warningBox(messages) {
    if (!messages.length) return "";
    return `<section class="card asset-warning"><b>نیازمند توجه</b><ul>${messages.map((message) => `<li>${escape(message)}</li>`).join("")}</ul></section>`;
  }

  function assetTypeOptions() {
    return Core.ASSET_TYPES.map((type) => ({ value: type, label: labels[type] || type }));
  }

  function assetRows(items) {
    return items
      .map((asset) => {
        const valuation = Core.valuationFor(state, asset.id);
        const price = valuation
          ? money(valuation.totalValue, valuation.currency)
          : "قیمت ثبت نشده";
        const stale =
          !valuation || Date.now() - Date.parse(valuation.at) > Core.STALE_DAYS * 86_400_000;
        return `<tr><td><button class="asset-link" onclick="DaraAssetsUI.showAsset('${escape(asset.id)}')">${escape(asset.name)}</button><small>${escape(asset.identifier || labels[asset.type] || asset.type)}</small></td><td>${escape(labels[asset.type] || asset.type)}</td><td>${escape(asset.quantity)} ${escape(asset.unit)}</td><td>${price}<small>${stale ? "قیمت قدیمی یا ثبت‌نشده" : `به‌روز: ${dateLabel(valuation.at)}`}</small></td><td>${asset.acquisitionCost == null ? "ثبت نشده" : money(asset.acquisitionCost, asset.acquisitionCurrency)}</td><td>${escape(asset.ownershipPercent)}٪</td><td><button class="b" onclick="DaraAssetsUI.addValuation('${escape(asset.id)}')">ثبت ارزش</button> <button class="b" onclick="DaraAssetsUI.dispose('${escape(asset.id)}')">واگذاری</button></td></tr>`;
      })
      .join("");
  }

  function renderAssetDetails(asset) {
    const records = state.valuations
      .filter((valuation) => valuation.assetId === asset.id)
      .sort((left, right) => right.at.localeCompare(left.at));
    const attachedLiabilities = state.liabilities.filter((item) => item.linkedAssetId === asset.id);
    return `<section class="card"><div class="top"><h3>${escape(asset.name)}</h3><button class="b" onclick="DaraAssetsUI.closeAsset()">بازگشت</button></div><p>${escape(labels[asset.type] || asset.type)} · شناسه: ${escape(asset.identifier || "ثبت نشده")} · مالکیت: ${escape(asset.ownershipPercent)}٪</p><p>مقدار: ${escape(asset.quantity)} ${escape(asset.unit)} · ارز: ${escape(asset.currency)} · نقدشوندگی: ${escape(labels[asset.liquidity])}</p><p>تاریخ خرید: ${dateLabel(asset.acquiredAt)} · بهای خرید: ${asset.acquisitionCost == null ? "ثبت نشده (با صفر تفاوت دارد)" : money(asset.acquisitionCost, asset.acquisitionCurrency)}</p><p>روش ارزش‌گذاری: ${escape(asset.valuationMethod)} · منبع: ${escape(asset.priceSource)} · آخرین به‌روزرسانی: ${dateLabel(records[0]?.at)}</p>${asset.linkedAccountId ? `<p>حساب مرتبط: ${escape(window.DARA_APP_STATE?.accounts.find((account) => account.id === asset.linkedAccountId)?.name || "حساب حذف‌شده")}${asset.valueAlreadyInAccount ? " · ارزش در موجودی حساب لحاظ شده و از جمع دارایی‌ها کنار گذاشته شده است." : ""}</p>` : ""}${asset.liabilityAmount != null ? `<p>بدهی مرتبط: ${money(asset.liabilityAmount, asset.liabilityCurrency)}</p>` : ""}${attachedLiabilities.map((liability) => `<p>بدهی ${escape(liability.name)}: ${money(liability.amount, liability.currency)}</p>`).join("")}${asset.notes ? `<p>یادداشت: ${escape(asset.notes)}</p>` : ""}<h3>تاریخچهٔ ارزش‌گذاری</h3><div class="asset-table-wrap"><table><thead><tr><th>زمان</th><th>مقدار</th><th>قیمت واحد</th><th>ارزش کل</th><th>منبع</th><th>روش</th></tr></thead><tbody>${records.map((item) => `<tr><td>${dateLabel(item.at)}</td><td>${escape(item.quantity)}</td><td>${item.unitPrice == null ? "—" : money(item.unitPrice, item.currency)}</td><td>${money(item.totalValue, item.currency)}</td><td>${escape(item.source)}</td><td>دستی</td></tr>`).join("") || '<tr><td colspan="6">هنوز ارزش‌گذاری ثبت نشده است.</td></tr>'}</tbody></table></div></section>`;
  }

  function filterMarkup(appState, assets) {
    const currencies = [...new Set(assets.map((asset) => asset.currency))].sort();
    const accounts = appState?.accounts || [];
    return `<div class="flt asset-filters"><select aria-label="فیلتر نوع دارایی" onchange="DaraAssetsUI.setFilter('type',this.value)"><option value="">همهٔ انواع</option>${options(assetTypeOptions(), filters.type)}</select><select aria-label="فیلتر ارز دارایی" onchange="DaraAssetsUI.setFilter('currency',this.value)"><option value="">همهٔ ارزها</option>${options(currencies.map((currency) => ({ value: currency, label: currency })), filters.currency)}</select><select aria-label="فیلتر حساب دارایی" onchange="DaraAssetsUI.setFilter('account',this.value)"><option value="">همهٔ حساب‌ها</option>${options(accounts.map((account) => ({ value: account.id, label: account.name })), filters.account)}</select><input aria-label="از تاریخ خرید" type="date" value="${escape(filters.from)}" onchange="DaraAssetsUI.setFilter('from',this.value)"><input aria-label="تا تاریخ خرید" type="date" value="${escape(filters.to)}" onchange="DaraAssetsUI.setFilter('to',this.value)"></div>`;
  }

  function renderAssets(appState) {
    if (loadError) return `<h2>دارایی‌ها و ارزش خالص</h2>${warningBox([loadError])}`;
    if (!state.baseCurrency) state.baseCurrency = appState?.cur || "IRR";
    const accounts = accountList(appState);
    const assets = state.assets.filter((asset) => asset.status === "active");
    const net = Core.netWorth(state, accounts);
    const activeAsset = assets.find((asset) => asset.id === selectedAssetId);
    const rows = assets.filter(
      (asset) =>
        (!filters.type || asset.type === filters.type) &&
        (!filters.currency || asset.currency === filters.currency) &&
        (!filters.account || asset.linkedAccountId === filters.account) &&
        (!filters.from || !asset.acquiredAt || asset.acquiredAt >= filters.from) &&
        (!filters.to || !asset.acquiredAt || asset.acquiredAt <= filters.to),
    );
    const byCurrency = (values) =>
      Object.entries(values).map(([currency, value]) =>
        `<li class="row"><span>${escape(currency)}</span><b>${money(value, currency)}</b></li>`,
      ).join("") || '<li class="mu">موردی ثبت نشده است.</li>';
    const freshness = net.complete
      ? "داده‌های لازم ثبت شده و نرخ‌های تبدیل منقضی نیستند."
      : "این برآورد ناقص است؛ مبلغ‌های تبدیل‌نشده و قیمت‌های قدیمی جداگانه نمایش داده می‌شوند.";
    return `<div class="top"><h2 style="margin:0">دارایی‌ها و ارزش خالص</h2><button class="pri" onclick="DaraAssetsUI.addAsset()">+ دارایی</button></div><p class="asset-disclaimer">برآورد شخصی و غیررسمی؛ صورت مالی تأییدشده یا قیمت لحظه‌ای نیست. فضای مهمان در همین مرورگر ذخیره می‌شود.</p><div class="g">${window.DARA_KPI("ارزش خالص برآوردی", net.convertedNetWorth == null ? "قابل محاسبه نیست" : money(net.convertedNetWorth, net.baseCurrency))}${window.DARA_KPI("دارایی‌های فعال", String(assets.length))}${window.DARA_KPI("بدهی‌های ثبت‌شده", String(state.liabilities.length))}</div>${warningBox(net.warnings.concat(net.unconverted.map((item) => `تبدیل ${item.value} ${item.currency} (${item.kind === "asset" ? "دارایی" : "بدهی"}) به ${net.baseCurrency} به نرخ معتبر نیاز دارد.`)))}${window.DARA_CARD("جمع به تفکیک ارز — بدون تجمیع ضمنی", `<p>${escape(freshness)} تاریخ محاسبه: ${dateLabel(net.at)}</p><h3>دارایی‌ها</h3><ul>${byCurrency(net.assetsByCurrency)}</ul><h3>بدهی‌ها</h3><ul>${byCurrency(net.liabilitiesByCurrency)}</ul><p>واحد مبنا: ${escape(net.baseCurrency)} · فقط نرخ‌های ثبت‌شدهٔ معتبر اعمال می‌شوند.</p><button class="b" onclick="DaraAssetsUI.addExchangeRate()">ثبت نرخ تبدیل</button> <button class="b" onclick="DaraAssetsUI.setBaseCurrency()">تغییر واحد مبنا</button>`)}${window.DARA_CARD("بدهی‌های مستقل", `<button class="b" onclick="DaraAssetsUI.addLiability()">+ ثبت بدهی</button><ul>${state.liabilities.filter((item) => !item.linkedAssetId).map((item) => `<li class="row"><span>${escape(item.name)} · ${dateLabel(item.dueAt)}</span><b>${money(item.amount, item.currency)}</b></li>`).join("") || '<li class="mu">بدهی جداگانه‌ای ثبت نشده است.</li>'}</ul>`)}${activeAsset ? renderAssetDetails(activeAsset) : `${filterMarkup(appState, assets)}<div class="asset-table-wrap card"><table><thead><tr><th>دارایی</th><th>نوع</th><th>مقدار</th><th>ارزش و تازگی</th><th>بهای تمام‌شده</th><th>مالکیت</th><th>عملیات</th></tr></thead><tbody>${assetRows(rows) || '<tr><td colspan="7">هنوز دارایی‌ای ثبت نشده است. برای نگهداری تاریخچه، ارزش‌گذاری بعدی را ثبت کنید.</td></tr>'}</tbody></table></div><section class="card"><h3>دارایی‌های واگذارشده</h3><ul>${state.assets.filter((asset) => asset.status === "disposed").map((asset) => `<li class="row">${escape(asset.name)} · واگذاری: ${dateLabel(asset.disposedAt)}</li>`).join("") || '<li class="mu">دارایی واگذارشده‌ای ندارید.</li>'}</ul></section>`}`;
  }

  function renderNetWorth(appState) {
    if (loadError) return `<h2>ارزش خالص</h2>${warningBox([loadError])}`;
    if (!state.baseCurrency) state.baseCurrency = appState?.cur || "IRR";
    const report = Core.netWorth(state, accountList(appState));
    const rows = (values) =>
      Object.entries(values).map(([currency, value]) =>
        `<li class="row"><span>${escape(currency)}</span><b>${money(value, currency)}</b></li>`,
      ).join("") || '<li class="mu">داده‌ای ثبت نشده است.</li>';
    const duplicates = state.assets.filter((asset) => asset.valueAlreadyInAccount);
    const incomplete = report.warnings.concat(
      report.unconverted.map(
        (item) =>
          `${item.kind === "asset" ? "دارایی" : "بدهی"} ${item.value} ${item.currency} به نرخ تبدیل معتبر به ${report.baseCurrency} نیاز دارد.`,
      ),
    );
    return `<h2>داشبورد ارزش خالص</h2><p class="asset-disclaimer">ارزش خالص = دارایی − بدهی. این یک برآورد شخصی است، نه صورت مالی تأییدشده. محاسبه برای تاریخ ${dateLabel(report.at)} انجام شده است.</p>${warningBox(incomplete)}<div class="g">${window.DARA_KPI("ارزش خالص برآوردی", report.convertedNetWorth == null ? "قابل محاسبه نیست" : money(report.convertedNetWorth, report.baseCurrency))}${window.DARA_KPI("تکمیل داده", report.complete ? "کامل بر اساس داده‌های ثبت‌شده" : "ناقص / نیازمند بررسی")}</div><div class="g">${window.DARA_CARD("دارایی‌ها به تفکیک ارز", `<ul>${rows(report.assetsByCurrency)}</ul>`)}${window.DARA_CARD("بدهی‌ها به تفکیک ارز", `<ul>${rows(report.liabilitiesByCurrency)}</ul>`)}</div>${window.DARA_CARD("نرخ تبدیل", `<p>تجمیع فقط با نرخ دستی دارای منبع و تاریخ معتبر انجام می‌شود. نرخ بیش از ${Core.STALE_DAYS} روز قدیمی محسوب می‌شود.</p><button class="pri" onclick="DaraAssetsUI.addExchangeRate()">+ نرخ دستی</button> <button class="b" onclick="DaraAssetsUI.setBaseCurrency()">واحد مبنا: ${escape(report.baseCurrency)}</button><ul>${state.exchangeRates.slice().sort((a, b) => b.at.localeCompare(a.at)).map((rate) => `<li class="row"><span>۱ ${escape(rate.from)} = ${escape(rate.rate)} ${escape(rate.to)}</span><small>${escape(rate.source)} · ${dateLabel(rate.at)}${Date.now() - Date.parse(rate.at) > Core.STALE_DAYS * 86_400_000 ? " · قدیمی" : ""}</small></li>`).join("") || '<li class="mu">هنوز نرخ تبدیلی ثبت نشده است.</li>'}</ul>`)}${window.DARA_CARD("کنترل دوباره‌شماری", `<p>حساب‌های موجود به‌علاوهٔ دارایی‌های جداگانه جمع می‌شوند. برای هر دارایی که ارزشش قبلاً داخل موجودی یکی از حساب‌هاست، گزینهٔ «ارزش در حساب لحاظ شده» را فعال کنید.</p>${duplicates.map((asset) => `<p>${escape(asset.name)} · ${escape(asset.currency)} · از جمع جداست چون در حساب لحاظ شده</p>`).join("") || '<p class="mu">دارایی تکراری علامت‌گذاری نشده است.</p>'}<p>تراکنش خرید/فروش سبد فقط اثر نقدی خودش را روی حساب ثبت می‌کند. همان خرید/فروش را دوباره به‌عنوان هزینه/درآمد عادی وارد نکنید.</p>`)}${window.DARA_CARD("فرض‌ها و هشدارها", `<ul>${incomplete.map((warning) => `<li class="row">${escape(warning)}</li>`).join("") || '<li class="mu">هشدار ثبت‌نشده‌ای وجود ندارد.</li>'}</ul><p>قیمت دستی یا برآوردی است؛ هیچ منبع قیمت زنده یا صورت مالی تأییدشده‌ای در این نسخه ارائه نمی‌شود. موجودی حساب‌های عادی سابقهٔ تاریخی ندارد؛ از این‌رو ارزش خالص گذشته قابل محاسبه نیست.</p>`)}`;
  }

  function groupBars(source, currency) {
    const entries = Object.entries(source).filter(([, value]) => Number(value) > 0);
    const sum = entries.reduce((total, [, value]) => total + Number(value), 0);
    if (!entries.length) return '<p class="mu">برای این فیلتر داده‌ای ثبت نشده است.</p>';
    return entries
      .sort((left, right) => Number(right[1]) - Number(left[1]))
      .map(([key, value]) => {
        const percent = Math.round((Number(value) / sum) * 100);
        return `<div class="row"><span>${escape(labels[key] || key)}</span><b>${money(value, currency)} · ${percent}٪</b></div><div class="bar"><i style="width:${percent}%"></i></div>`;
      })
      .join("");
  }

  function renderTransactions(transactions, accounts) {
    return `<div class="asset-table-wrap"><table><thead><tr><th>تاریخ</th><th>نوع</th><th>دارایی</th><th>تعداد/مبلغ</th><th>قیمت/کارمزد</th><th>حساب / کارگزار</th></tr></thead><tbody>${transactions.map((transaction) => {
      const asset = state.assets.find((item) => item.id === transaction.assetId);
      const account = accounts.find((item) => item.id === transaction.linkedAccountId);
      const detail = ["buy", "sell", "transfer", "split"].includes(transaction.kind)
        ? `${transaction.quantity} ${asset?.unit || ""}`
        : money(transaction.amount, transaction.currency);
      return `<tr><td>${dateLabel(transaction.at)}</td><td>${escape(labels[transaction.kind] || transaction.kind)}</td><td>${escape(asset?.name || (transaction.kind === "deposit" || transaction.kind === "withdrawal" || transaction.kind === "dividend" || transaction.kind === "fee" ? "نقد سبد" : "—"))}</td><td>${detail}</td><td>${transaction.unitPrice !== "0" ? money(transaction.unitPrice, transaction.currency) : "—"}${transaction.fee !== "0" ? `<small>کارمزد ${money(transaction.fee, transaction.currency)}</small>` : ""}</td><td>${escape(account?.name || "—")}${transaction.broker ? `<small>${escape(transaction.broker)}</small>` : ""}</td></tr>`;
    }).join("") || '<tr><td colspan="6">تراکنشی ثبت نشده است.</td></tr>'}</tbody></table></div>`;
  }

  function renderPortfolio(appState) {
    if (loadError) return `<h2>سبد سرمایه‌گذاری</h2>${warningBox([loadError])}`;
    const accountRows = accountList(appState);
    const report = Core.analytics(state);
    const currencies = [...new Set(report.holdings.map((holding) => holding.currency))].sort();
    const holdings = report.holdings.filter(
      (holding) =>
        (!filters.type || holding.asset.type === filters.type) &&
        (!filters.currency || holding.currency === filters.currency) &&
        (!filters.account || holding.asset.linkedAccountId === filters.account),
    );
    const txs = report.transactions.filter(
      (transaction) =>
        (!filters.account || transaction.linkedAccountId === filters.account) &&
        (!filters.currency || transaction.currency === filters.currency) &&
        (!filters.type ||
          state.assets.find((asset) => asset.id === transaction.assetId)?.type === filters.type) &&
        (!filters.from || transaction.at.slice(0, 10) >= filters.from) &&
        (!filters.to || transaction.at.slice(0, 10) <= filters.to),
    );
    const currencySummary = (heading, values, sign = "") =>
      window.DARA_CARD(heading, Object.entries(values).map(([currency, value]) =>
        `<div class="row"><span>${escape(currency)}</span><b class="${sign}${Number(value) >= 0 ? "pos" : "neg"}">${money(value, currency)}</b></div>`,
      ).join("") || '<p class="mu">هنوز داده‌ای وجود ندارد.</p>');
    const portfolioFilters = `<div class="flt asset-filters"><select aria-label="فیلتر کلاس سرمایه‌گذاری" onchange="DaraAssetsUI.setFilter('type',this.value)"><option value="">همهٔ کلاس‌ها</option>${options(assetTypeOptions().filter((item) => Core.INVESTMENT_TYPES.includes(item.value)), filters.type)}</select><select aria-label="فیلتر ارز سبد" onchange="DaraAssetsUI.setFilter('currency',this.value)"><option value="">همهٔ ارزها</option>${options(currencies.map((currency) => ({ value: currency, label: currency })), filters.currency)}</select><select aria-label="فیلتر حساب سرمایه‌گذاری" onchange="DaraAssetsUI.setFilter('account',this.value)"><option value="">همهٔ حساب‌ها</option>${options((appState?.accounts || []).map((account) => ({ value: account.id, label: account.name })), filters.account)}</select><input aria-label="از تاریخ تراکنش سرمایه‌گذاری" type="date" value="${escape(filters.from)}" onchange="DaraAssetsUI.setFilter('from',this.value)"><input aria-label="تا تاریخ تراکنش سرمایه‌گذاری" type="date" value="${escape(filters.to)}" onchange="DaraAssetsUI.setFilter('to',this.value)"></div>`;
    const rows = holdings.map((holding) => `<tr><td>${escape(holding.asset.name)}<small>${escape(holding.asset.identifier || labels[holding.asset.type])}</small></td><td>${escape(labels[holding.asset.type])}</td><td>${holding.quantityText} ${escape(holding.asset.unit)}</td><td>${money(holding.marketValueText, holding.currency)}<small>${holding.stale ? "قیمت قدیمی یا ثبت‌نشده" : `به‌روز: ${dateLabel(holding.valuation.at)}`}</small></td><td>${holding.asset.acquisitionCost == null && holding.costBasis === 0n ? "بهای خرید ثبت نشده" : money(holding.costBasisText, holding.asset.currency)}</td><td>${holding.currency === holding.asset.currency ? money(Core.amount(holding.marketValue == null ? 0n : holding.marketValue - holding.costBasis), holding.currency) : "تبدیل ارز برای محاسبهٔ سود لازم است"}</td><td>${escape(window.DARA_APP_STATE?.accounts.find((account) => account.id === holding.asset.linkedAccountId)?.name || "—")}</td></tr>`).join("");
    const allocations = currencies.map((currency) =>
      window.DARA_CARD(`تخصیص دارایی به تفکیک نوع · ${currency}`, groupBars(
        Object.fromEntries(
          holdings
            .filter((holding) => holding.currency === currency && holding.marketValue != null)
            .map((holding) => [holding.asset.type, Core.amount(Core.ratio(
              holding.marketValue,
              Core.decimal(holding.asset.ownershipPercent),
              100n * 100_000_000n,
            ))]),
        ),
        currency,
      )),
    ).join("");
    const transactionOptions = [
      ["buy", "خرید"],
      ["sell", "فروش"],
      ["deposit", "واریز نقد به سبد"],
      ["withdrawal", "برداشت نقد از سبد"],
      ["transfer", "انتقال بین دارایی‌ها"],
      ["fee", "کارمزد"],
      ["dividend", "سود نقدی"],
      ["split", "تعدیل تعداد"],
    ];
    return `<div class="top"><h2 style="margin:0">سبد سرمایه‌گذاری</h2><button class="pri" onclick="DaraAssetsUI.addTransaction()">+ رویداد سرمایه‌گذاری</button></div><p class="asset-disclaimer">قیمت‌ها فقط بر اساس ارزش‌گذاری‌های دستی این مرورگر هستند؛ منبع قیمت زنده متصل نیست. بازده قیمت از سود نقدی جداست و بازده زمان‌وزن یا پول‌وزن محاسبه نمی‌شود.</p>${warningBox(report.warnings)}<div class="g">${currencySummary("ارزش بازار برآوردی", report.marketValueByCurrency)}${currencySummary("بهای تمام‌شدهٔ باقیمانده", report.costBasisByCurrency)}${currencySummary("سود/زیان تحقق‌یافتهٔ قیمتی", report.realizedByCurrency)}${currencySummary("سود/زیان تحقق‌نیافتهٔ قیمتی", report.unrealizedByCurrency)}${currencySummary("بازده قیمت ساده", report.priceReturnByCurrency)}${currencySummary("بازده قیمت درصدی", report.priceReturnPercentByCurrency)}${currencySummary("بازده کل ساده با سود نقدی", report.totalReturnByCurrency)}${currencySummary("درصد بازده کل ساده", report.totalReturnPercentByCurrency)}${currencySummary("درآمد سرمایه‌گذاری (جدا از بازده قیمت)", report.incomeByCurrency, "pos")}${currencySummary("کارمزد ثبت‌شده", report.feesByCurrency)}</div><section class="card"><h3>بازده ساده</h3><p>بازده قیمت = سود/زیان تحقق‌یافته + تحقق‌نیافته؛ سود نقدی جداگانه نمایش داده می‌شود. بازده کل ساده = بازده قیمت + سود نقدی. درصد بازده بر بهای lotهای خرید فروخته‌شده و باقیمانده محاسبه شده و فقط درون ارز یکسان قابل مقایسه است.</p><p>پوشش قیمت: ${Math.round(report.completeness * 100)}٪ · آخرین ارزش‌گذاری: ${dateLabel(report.lastPriceAt)}</p><small>هزینهٔ خرید در بهای lot و کارمزد فروش از عایدی کم می‌شود. رویداد سود نقدی در این بخش، خودش جریان نقدی حساب را ثبت می‌کند؛ آن را دوباره به‌عنوان درآمد عادی ثبت نکنید.</small></section>${portfolioFilters}<div class="asset-table-wrap card"><table><thead><tr><th>دارایی</th><th>کلاس</th><th>مقدار</th><th>ارزش/تازگی</th><th>بهای lot</th><th>بازده قیمت باز</th><th>حساب</th></tr></thead><tbody>${rows || '<tr><td colspan="7">هنوز دارایی سرمایه‌گذاری فعالی ندارید. ابتدا دارایی بسازید، سپس خرید یا موجودی اولیه را ثبت کنید.</td></tr>'}</tbody></table></div><div class="g">${allocations || window.DARA_CARD("تخصیص", '<p class="mu">برای محاسبهٔ تخصیص، قیمت معتبر ثبت کنید.</p>')}</div>${window.DARA_CARD("تاریخچهٔ تراکنش‌ها", renderTransactions(txs, accountRows))}${window.DARA_CARD("روند ارزش تاریخی سبد", renderHistory(report))}<section class="card"><small>منبع دادهٔ بازار فعال نیست. فایل‌های دادهٔ رایگان ممکن است پوشش ناقص، تأخیر، محدودیت نرخ یا محدودیت استفاده داشته باشند؛ هیچ قیمت خالی با صفر یا قیمت ساختگی جایگزین نمی‌شود.</small></section>`;
  }

  function renderHistory(report) {
    const rows = report.historical.map((point) =>
      `<tr><td>${dateLabel(point.at)}</td>${Object.entries(point.valuesByCurrency).map(([currency, value]) => `<td>${money(value, currency)}</td>`).join("") || "<td>قیمت تاریخی کافی نیست</td>"}</tr>`,
    );
    const currencies = [...new Set(report.historical.flatMap((point) => Object.keys(point.valuesByCurrency)))];
    return `<p>تاریخچه فقط از زمان‌هایی ساخته می‌شود که هم تراکنش و هم ارزش‌گذاری ذخیره‌شده وجود دارند؛ برای هر ارز جمع جدا می‌ماند.</p><div class="asset-table-wrap"><table><thead><tr><th>تاریخ</th>${currencies.map((currency) => `<th>${escape(currency)}</th>`).join("")}</tr></thead><tbody>${rows.join("") || '<tr><td colspan="2">برای نمودار تاریخی دادهٔ کافی وجود ندارد.</td></tr>'}</tbody></table></div>`;
  }

  function addAsset(appState) {
    const currency = appState?.cur || "IRR";
    const accounts = appState?.accounts || [];
    openForm("ثبت دارایی", [
      { name: "name", label: "نام", required: true },
      { name: "type", label: "نوع دارایی", type: "select", options: assetTypeOptions(), value: "other" },
      { name: "identifier", label: "شناسهٔ نماد/دارایی (اختیاری)" },
      { name: "quantity", label: "مقدار", value: "1", required: true, step: "0.00000001" },
      { name: "unit", label: "واحد", value: "واحد", required: true },
      { name: "currency", label: "ارز ارزش‌گذاری", value: currency, required: true },
      { name: "acquiredAt", label: "تاریخ خرید (اختیاری)", type: "date" },
      { name: "acquisitionCost", label: "بهای تمام‌شدهٔ کل (خالی = نامشخص؛ صفر = رایگان)", step: "0.00000001" },
      { name: "currentValue", label: "ارزش فعلی کل (اختیاری)", step: "0.00000001" },
      { name: "unitPrice", label: "قیمت واحد فعلی (برای سبد سرمایه‌گذاری)", step: "0.00000001" },
      { name: "ownershipPercent", label: "درصد مالکیت", value: "100", required: true, step: "0.00000001" },
      { name: "liquidity", label: "نقدشوندگی", type: "select", options: Core.LIQUIDITY_TYPES.map((value) => ({ value, label: labels[value] })), value: "semi_liquid" },
      { name: "linkedAccountId", label: "حساب مالی مرتبط (اختیاری)", type: "select", empty: true, options: accounts.map((account) => ({ value: account.id, label: account.name })) },
      { name: "valueAlreadyInAccount", label: "ارزش این دارایی از قبل در موجودی حساب انتخاب‌شده لحاظ شده است؛ برای جلوگیری از شمارش دوباره", type: "checkbox" },
      { name: "liabilityAmount", label: "بدهی مرتبط با این دارایی (اختیاری)", step: "0.00000001" },
      { name: "liabilityCurrency", label: "ارز بدهی مرتبط", value: currency },
      { name: "notes", label: "یادداشت (اختیاری)" },
    ], (data) => {
      const asset = Core.addAsset(state, data);
      if (data.currentValue !== "" || data.unitPrice !== "") {
        Core.addValuation(state, {
          assetId: asset.id,
          quantity: data.quantity,
          totalValue: data.currentValue,
          unitPrice: data.unitPrice,
          currency: data.currency,
          source: "ورودی دستی",
        });
      }
    });
  }

  function addValuation(assetId) {
    const asset = state.assets.find((item) => item.id === assetId);
    if (!asset) return;
    openForm(`ارزش‌گذاری ${asset.name}`, [
      { name: "at", label: "تاریخ ارزش‌گذاری", type: "date", value: new Date().toISOString().slice(0, 10), required: true },
      { name: "quantity", label: "مقدار در زمان ارزش‌گذاری", value: asset.quantity, required: true, step: "0.00000001" },
      { name: "unitPrice", label: "قیمت واحد (برای سهام/صندوق/رمزارز)", step: "0.00000001" },
      { name: "totalValue", label: "ارزش کل (برای ارزش‌گذاری دستی)", step: "0.00000001" },
      { name: "currency", label: "ارز", value: asset.currency, required: true },
      { name: "source", label: "منبع قیمت/برآورد", value: "ثبت دستی", required: true },
    ], (data) => {
      if (!data.at) throw new Error("تاریخ ارزش‌گذاری را وارد کنید.");
      Core.addValuation(state, { ...data, at: `${data.at}T12:00:00.000Z`, method: "manual" });
    });
  }

  function addLiability(appState) {
    openForm("ثبت بدهی", [
      { name: "name", label: "عنوان بدهی", required: true },
      { name: "amount", label: "ماندهٔ بدهی", required: true, step: "0.00000001" },
      { name: "currency", label: "ارز بدهی", value: appState?.cur || state.baseCurrency, required: true },
      { name: "dueAt", label: "سررسید (اختیاری)", type: "date" },
    ], (data) => Core.addLiability(state, data));
  }

  function addExchangeRate() {
    const currencies = allCurrencies();
    openForm("ثبت نرخ تبدیل دستی", [
      { name: "from", label: "از ارز", type: "select", options: currencies.map((currency) => ({ value: currency, label: currency })), required: true },
      { name: "to", label: "به ارز", type: "select", options: currencies.map((currency) => ({ value: currency, label: currency })), required: true },
      { name: "rate", label: "به ازای یک واحد از ارز مبدأ", required: true, step: "0.00000001" },
      { name: "source", label: "منبع/روش نرخ", required: true },
      { name: "at", label: "تاریخ نرخ", type: "date", value: new Date().toISOString().slice(0, 10), required: true },
    ], (data) => {
      Core.addExchangeRate(state, { ...data, at: `${data.at}T12:00:00.000Z` });
    });
  }

  function setBaseCurrency() {
    openForm("واحد مبنای ارزش خالص", [
      { name: "currency", label: "ارز مبنا (کد یا نام)", value: state.baseCurrency, required: true },
    ], (data) => {
      state.baseCurrency = data.currency.trim().toUpperCase();
    });
  }

  function addTransaction(appState) {
    const assets = investmentAssets().filter((asset) => asset.status === "active");
    const accounts = appState?.accounts || [];
    const kindOptions = [
      ["buy", "خرید"],
      ["sell", "فروش"],
      ["deposit", "واریز به سبد"],
      ["withdrawal", "برداشت از سبد"],
      ["transfer", "انتقال بین دارایی‌ها"],
      ["fee", "کارمزد"],
      ["dividend", "سود نقدی"],
      ["split", "تعدیل تعداد (نسبت جدید/قدیم)"],
    ].map(([value, label]) => ({ value, label }));
    openForm("تراکنش سرمایه‌گذاری", [
      { name: "kind", label: "نوع رویداد", type: "select", options: kindOptions, required: true, value: "buy" },
      { name: "assetId", label: "دارایی", type: "select", empty: true, options: assets.map((asset) => ({ value: asset.id, label: `${asset.name} (${asset.currency})` })) },
      { name: "targetAssetId", label: "دارایی مقصد (انتقال)", type: "select", empty: true, options: assets.map((asset) => ({ value: asset.id, label: asset.name })) },
      { name: "quantity", label: "مقدار سهم/واحد", step: "0.00000001" },
      { name: "unitPrice", label: "قیمت خرید/فروش هر واحد", step: "0.00000001" },
      { name: "amount", label: "مبلغ واریز/برداشت/سود/کارمزد", step: "0.00000001" },
      { name: "fee", label: "کارمزد معامله", step: "0.00000001", value: "0" },
      { name: "currency", label: "ارز معامله/مبلغ", value: assets[0]?.currency || appState?.cur || "IRR", required: true },
      { name: "numerator", label: "صورت نسبت تعدیل", value: "1" },
      { name: "denominator", label: "مخرج نسبت تعدیل", value: "1" },
      { name: "at", label: "تاریخ معامله", type: "date", value: new Date().toISOString().slice(0, 10), required: true },
      { name: "linkedAccountId", label: "حساب نقدی/سرمایه‌گذاری مرتبط (اختیاری)", type: "select", empty: true, options: accounts.map((account) => ({ value: account.id, label: account.name })) },
      { name: "cashAmount", label: `تأثیر بر حساب در ارز ${appState?.cur || "حساب"} (برای تفاوت ارز دستی وارد کنید)`, step: "0.00000001" },
      { name: "cashCurrency", label: "ارز تأثیر نقدی حساب", value: appState?.cur || "IRR" },
      { name: "cashConversionSource", label: "منبع تبدیل مبلغ نقدی، اگر ارزها متفاوت‌اند" },
      { name: "cashConversionAt", label: "تاریخ تبدیل مبلغ نقدی (اگر ارزها متفاوت‌اند)", type: "date" },
      { name: "broker", label: "کارگزار/صرافی (اختیاری)" },
      { name: "notes", label: "یادداشت (اختیاری)" },
    ], (data) => {
      if (!data.at) throw new Error("تاریخ تراکنش را وارد کنید.");
      const asset = assets.find((item) => item.id === data.assetId);
      const currency = data.currency || asset?.currency || appState?.cur;
      Core.addInvestmentTransaction(state, {
        ...data,
        currency,
        at: `${data.at}T12:00:00.000Z`,
        cashConversionAt: data.cashConversionAt
          ? `${data.cashConversionAt}T12:00:00.000Z`
          : "",
      });
    });
  }

  function dispose(assetId) {
    const asset = state.assets.find((item) => item.id === assetId);
    if (!asset || !confirm(`«${asset.name}» به‌عنوان واگذارشده ثبت شود؟ تاریخچه حفظ می‌شود.`)) return;
    try {
      Core.disposeAsset(state, assetId);
      save();
      window.DARA_RENDER?.();
    } catch (error) {
      alert(error instanceof Error ? error.message : "ثبت واگذاری ناموفق بود.");
    }
  }

  load();
  window.DaraAssetsUI = {
    renderAssets: (appState) => {
      window.DARA_APP_STATE = appState;
      return renderAssets(appState);
    },
    renderPortfolio: (appState) => {
      window.DARA_APP_STATE = appState;
      return renderPortfolio(appState);
    },
    renderNetWorth: (appState) => {
      window.DARA_APP_STATE = appState;
      return renderNetWorth(appState);
    },
    addAsset: () => addAsset(window.DARA_APP_STATE),
    addValuation,
    addLiability: () => addLiability(window.DARA_APP_STATE),
    addExchangeRate,
    setBaseCurrency,
    addTransaction: () => addTransaction(window.DARA_APP_STATE),
    dispose,
    showAsset: (assetId) => {
      selectedAssetId = assetId;
      window.DARA_RENDER?.();
    },
    closeAsset: () => {
      selectedAssetId = "";
      window.DARA_RENDER?.();
    },
    setFilter: (key, value) => {
      filters[key] = value;
      window.DARA_RENDER?.();
    },
  };
})();
