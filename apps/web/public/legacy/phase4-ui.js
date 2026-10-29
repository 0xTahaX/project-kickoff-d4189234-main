(function () {
  "use strict";

  const Core = window.DaraPhase4Core;
  const STORE_KEY = "dara.phase4.preview.v1";
  const CLASSIFICATION_LABELS = {
    unclassified: "دسته‌بندی‌نشده",
    external_deposit: "واریز خارجی",
    external_withdrawal: "برداشت خارجی",
    internal_transfer: "انتقال داخلی",
    swap: "تبدیل دارایی",
    network_fee: "کارمزد شبکه",
    contract_interaction: "تعامل قرارداد",
    reward: "پاداش/درآمد",
  };
  const STATUS_LABELS = {
    pending: "در انتظار",
    confirmed: "تأییدشده",
    failed: "ناموفق",
    unknown: "نامشخص",
  };
  const TRANSACTION_LABELS = {
    native_transfer: "انتقال ETH",
    token_transfer: "انتقال توکن",
    contract_interaction: "تعامل قرارداد",
    transaction: "تراکنش ترکیبی",
  };
  const MARKET_LABELS = {
    crypto: "رمزارز",
    stocks: "سهام",
    forex: "ارز",
    commodities: "کالا",
    other: "سایر",
  };
  const FILTERS = { market: "", status: "", strategy: "", currency: "", from: "", to: "" };
  const syncErrors = new Map();
  let state;
  let stateError = "";
  let busyWallet = "";

  try {
    const raw = localStorage.getItem(STORE_KEY);
    state = raw ? Core.validateState(JSON.parse(raw)) : Core.initialState();
  } catch (error) {
    state = Core.initialState();
    stateError = error instanceof Error ? error.message : "داده‌های فاز چهارم خوانده نشد.";
  }

  function updateState(operation) {
    const previous = JSON.stringify(state);
    try {
      const result = operation();
      save();
      return result;
    } catch (error) {
      state = Core.validateState(JSON.parse(previous));
      throw error;
    }
  }

  function escape(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
    );
  }

  function save() {
    if (stateError)
      throw new Error(`${stateError}؛ برای جلوگیری از بازنویسی، ذخیره‌سازی متوقف شد.`);
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (error) {
      throw new Error(
        error instanceof Error ? `ذخیره‌سازی محلی ناموفق بود: ${error.message}` : "ذخیره‌سازی محلی ناموفق بود.",
      );
    }
  }

  function format(value, digits = 8) {
    if (value == null || !Number.isFinite(Number(value))) return "—";
    return new Intl.NumberFormat("fa-IR", { maximumFractionDigits: digits }).format(Number(value));
  }

  function dateLabel(value) {
    if (!value) return "ثبت نشده";
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "تاریخ نامعتبر";
    return new Intl.DateTimeFormat("fa-IR", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Tehran",
    }).format(date);
  }

  function localDateTime(value = new Date()) {
    const date = new Date(value);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  }

  function optionTags(entries, selected) {
    return entries
      .map(([value, label]) => `<option value="${escape(value)}"${value === selected ? " selected" : ""}>${escape(label)}</option>`)
      .join("");
  }

  function fieldMarkup(field, value) {
    const inputValue = value ?? field.value ?? "";
    if (field.type === "select")
      return `<label>${escape(field.label)}<select name="${escape(field.name)}" ${field.required ? "required" : ""}>${field.options.map(([key, label]) => `<option value="${escape(key)}"${String(inputValue) === key ? " selected" : ""}>${escape(label)}</option>`).join("")}</select></label>`;
    if (field.type === "textarea")
      return `<label>${escape(field.label)}<textarea name="${escape(field.name)}" rows="3" ${field.required ? "required" : ""}>${escape(inputValue)}</textarea></label>`;
    return `<label>${escape(field.label)}<input name="${escape(field.name)}" type="${field.type || "text"}" value="${escape(inputValue)}" placeholder="${escape(field.placeholder || "")}" ${field.required ? "required" : ""} ${field.step ? `step="${field.step}"` : ""} ${field.min ? `min="${field.min}"` : ""}></label>`;
  }

  function openForm(title, fields, values, submit) {
    const dialog = document.getElementById("dlg");
    if (!dialog) throw new Error("پنجرهٔ فرم در صفحه پیدا نشد.");
    dialog.innerHTML = `<form method="dialog" class="asset-form"><h3>${escape(title)}</h3>${fields.map((field) => fieldMarkup(field, values?.[field.name])).join("")}<p class="err" role="alert" id="phase4-form-error"></p><div class="acts"><button class="pri" type="submit">ذخیره</button><button class="b" type="button" data-close>انصراف</button></div></form>`;
    const form = dialog.querySelector("form");
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      try {
        updateState(() => submit(Object.fromEntries(new FormData(form))));
        dialog.close();
        window.DARA_RENDER?.();
      } catch (error) {
        dialog.querySelector("#phase4-form-error").textContent =
          error instanceof Error ? error.message : "ثبت اطلاعات ناموفق بود.";
      }
    });
    dialog.querySelector("[data-close]").addEventListener("click", () => dialog.close());
    dialog.showModal();
  }

  function message(text, error = false) {
    return `<section class="card phase4-message${error ? " phase4-error" : ""}" role="status">${escape(text)}</section>`;
  }

  function walletList() {
    if (!state.wallets.length)
      return '<section class="card mu">هنوز کیف پولی ثبت نشده است. فقط نشانی عمومی ثبت کن؛ عبارت بازیابی یا کلید خصوصی لازم نیست و هرگز وارد نکن.</section>';
    return state.wallets.map((wallet) => {
      const snapshot = wallet.snapshot;
      const transactions = wallet.transactions || [];
      const syncedMs = Date.parse(wallet.lastSyncedAt || "");
      const syncStale =
        snapshot != null &&
        (!Number.isFinite(syncedMs) || Date.now() - syncedMs > 5 * 60 * 1000);
      const txRows = transactions.slice(0, 30).map((transaction) => {
        const status = STATUS_LABELS[transaction.status] || STATUS_LABELS.unknown;
        const classifications = Core.CLASSIFICATIONS.map((key) => [key, CLASSIFICATION_LABELS[key]]);
        const logIndex = transaction.networkIdentifier?.logIndex;
        return `<tr><td><a href="https://etherscan.io/tx/${encodeURIComponent(transaction.hash)}" target="_blank" rel="noopener noreferrer">${escape(transaction.hash.slice(0, 12))}…</a><small>${escape(TRANSACTION_LABELS[transaction.kind] || "تراکنش")}${logIndex == null ? "" : ` · log ${escape(logIndex)}`}</small></td><td>${escape(transaction.from || "—")}<small>به ${escape(transaction.to || "—")}</small></td><td>${escape(transaction.amount || "—")} ${escape(transaction.asset || "")}<small>کارمزد ${escape(transaction.fee || "—")} ETH</small></td><td>${escape(status)}<small>${escape(dateLabel(transaction.timestamp))}</small></td><td><select aria-label="دسته‌بندی تراکنش ${escape(transaction.hash.slice(0, 8))}" data-phase4-classify data-wallet-id="${escape(wallet.id)}" data-transaction-id="${escape(transaction.id)}">${optionTags(classifications, transaction.classification || "unclassified")}</select></td></tr>`;
      }).join("");
      const tokenRows = (snapshot?.tokens || []).map((token) =>
        `<li class="row"><span>${escape(token.name)} (${escape(token.symbol)})<small>${escape(token.contractAddress)}</small></span><b>${escape(token.balance ?? "نامشخص")}</b></li>`,
      ).join("");
      const warnings = snapshot?.warnings?.length
        ? `<ul class="phase4-warning-list">${snapshot.warnings.map((warning) => `<li>${escape(warning)}</li>`).join("")}</ul>`
        : "";
      const syncError = syncErrors.get(wallet.id);
      return `<section class="card phase4-wallet"><div class="top"><div><h3>${escape(wallet.name)}</h3><span class="phase4-tag">${wallet.ownership === "owned" ? "مالکیت ادعاشده" : wallet.ownership === "watched" ? "فقط رصد" : "مالکیت نامشخص"}</span>${syncStale ? '<span class="phase4-tag phase4-stale">داده قدیمی</span>' : ""}</div><button class="pri" type="button" data-phase4-action="sync-wallet" data-id="${escape(wallet.id)}" ${busyWallet === wallet.id ? "disabled" : ""}>${busyWallet === wallet.id ? "در حال همگام‌سازی…" : "همگام‌سازی"}</button></div><p class="phase4-address"><code>${escape(wallet.address)}</code></p><p>شبکه: Ethereum Mainnet · ارائه‌دهنده: ${escape(snapshot?.provider || "Blockscout")} · تاریخ ثبت: ${escape(dateLabel(wallet.createdAt))} · آخرین همگام‌سازی: ${escape(dateLabel(wallet.lastSyncedAt))}</p>${syncStale ? message("این snapshot بیش از ۵ دقیقه پیش دریافت شده؛ موجودی و تاریخچه را به‌عنوان دادهٔ فعلی در نظر نگیرید.", true) : ""}${wallet.type ? `<p>نوع: ${escape(wallet.type)}</p>` : ""}${wallet.notes ? `<p>${escape(wallet.notes)}</p>` : ""}${syncError ? message(`${syncError}${snapshot ? ` · دادهٔ قبلی با زمان ${dateLabel(wallet.lastSyncedAt)} نمایش داده می‌شود و ممکن است قدیمی باشد.` : ""}`, true) : ""}${snapshot ? `<div class="phase4-balance"><b>موجودی ETH: ${escape(snapshot.nativeBalance ?? "نامشخص")}</b><small>این موجودی و توکن‌ها در ارزش خالص/سبد سرمایه‌گذاری وارد نمی‌شوند تا دوباره‌شماری رخ ندهد.</small></div><h4>توکن‌ها</h4><ul>${tokenRows || '<li class="mu">موجودی توکن قابل نمایش دریافت نشد.</li>'}</ul>${warnings}${snapshot.partial ? message("اطلاعات ناقص است؛ ارائه‌دهنده همهٔ داده‌ها یا صفحه‌های تاریخچه را برنگرداند.", true) : ""}<h4>تراکنش‌های زنجیره‌ای (${transactions.length})</h4><p class="mu">واریز، برداشت یا تعامل قرارداد به‌صورت خودکار درآمد/هزینه محسوب نمی‌شود. دسته‌بندی‌ها فقط برای مرور هستند و دفتر مالی را تغییر نمی‌دهند.</p><div class="asset-table-wrap"><table class="phase4-table"><thead><tr><th>شناسهٔ شبکه</th><th>مبدأ / مقصد</th><th>مقدار / کارمزد</th><th>وضعیت / زمان</th><th>دسته‌بندی</th></tr></thead><tbody>${txRows || '<tr><td colspan="5">تراکنشی در صفحهٔ دریافت‌شده وجود ندارد.</td></tr>'}</tbody></table></div>${transactions.length > 30 ? `<small>${transactions.length - 30} تراکنش دیگر در حافظهٔ محلی ثبت شده‌اند.</small>` : ""}` : '<p class="mu">هنوز همگام‌سازی نشده است.</p>'}</section>`;
    }).join("");
  }

  function renderBlockchain() {
    const warning = stateError
      ? message(`${stateError}؛ ذخیره‌سازی و تغییر داده غیرفعال است.`, true)
      : "";
    return `<div class="top"><div><h2 style="margin:0">بلاک‌چین</h2><p class="market-intro">رصد فقط‌خواندنی کیف پول‌های عمومی</p></div><button class="pri" type="button" data-phase4-action="add-wallet">+ افزودن کیف پول</button></div>${warning}${message("نسخهٔ فعلی فقط Ethereum Mainnet را از Blockscout می‌خواند. نشانی عمومی اثبات مالکیت نیست. هیچ عبارت بازیابی، کلید خصوصی، رمز کیف پول یا مجوز برداشت ندهید.")}<p class="mu">تاریخچه در هر همگام‌سازی به حداکثر ۵۰ تراکنش و ۵۰ انتقال آخر محدود است؛ وضعیت ناقص/صفحه‌بندی‌نشده هشدار می‌گیرد. دادهٔ کیف پول از ارزش خالص و سبد جدا نگه داشته می‌شود.</p>${walletList()}`;
  }

  const tradeFields = [
    { name: "account", label: "حساب / کارگزار", required: true },
    {
      name: "market",
      label: "بازار",
      type: "select",
      options: Object.entries(MARKET_LABELS),
    },
    { name: "symbol", label: "نماد / جفت‌ارز", required: true },
    {
      name: "instrument",
      label: "نوع ابزار",
      type: "select",
      options: [["spot", "نقدی"], ["derivative", "مشتقه"]],
    },
    {
      name: "direction",
      label: "جهت",
      type: "select",
      options: [["long", "خرید / Long"], ["short", "فروش / Short"]],
    },
    { name: "currency", label: "ارز مظنه", required: true },
    { name: "entryDate", label: "تاریخ و ساعت ورود", type: "datetime-local", required: true },
    { name: "entryPrice", label: "قیمت ورود", required: true, step: "0.00000001" },
    { name: "quantity", label: "حجم / تعداد قرارداد", required: true, step: "0.00000001" },
    { name: "leverage", label: "اهرم (اختیاری)", step: "0.00000001" },
    { name: "stopLoss", label: "حد ضرر (اختیاری)", step: "0.00000001" },
    { name: "takeProfit", label: "حد سود (اختیاری)", step: "0.00000001" },
    { name: "entryFee", label: "کارمزد ورود (خالی = صفر)", step: "0.00000001" },
    { name: "strategy", label: "استراتژی" },
    { name: "tags", label: "برچسب‌ها (با ویرگول جدا شود)" },
    { name: "entryRationale", label: "دلیل ورود", type: "textarea" },
    { name: "psychologicalNotes", label: "یادداشت روان‌شناختی", type: "textarea" },
    {
      name: "ruleFollowing",
      label: "رعایت برنامه",
      type: "select",
      options: [["unrated", "ارزیابی‌نشده"], ["yes", "بله"], ["partial", "تاحدی"], ["no", "خیر"]],
    },
    { name: "notes", label: "یادداشت", type: "textarea" },
  ];

  function tradeDialog(trade = null) {
    const entry = trade
      ? { ...trade, entryDate: localDateTime(trade.entryDate) }
      : {
          market: "crypto",
          instrument: "spot",
          direction: "long",
          currency: window.DARA_APP_STATE?.cur === "تومان" ? "IRT" : window.DARA_APP_STATE?.cur || "USD",
          entryDate: localDateTime(),
          entryFee: "0",
        };
    openForm(trade ? "ویرایش معامله" : "ثبت معامله", tradeFields, entry, (data) => {
      const normalized = { ...data, entryDate: new Date(data.entryDate).toISOString() };
      if (trade) Core.editTrade(state, trade.id, normalized);
      else Core.createTrade(state, normalized);
    });
  }

  function closeDialog(trade) {
    openForm(
      `ثبت خروج · ${trade.symbol}`,
      [
        { name: "quantity", label: `حجم بسته‌شده (باقی‌مانده ${format(Core.amount(Core.remainingQuantity(trade)))})`, required: true, step: "0.00000001" },
        { name: "exitPrice", label: "قیمت خروج", required: true, step: "0.00000001" },
        { name: "closedAt", label: "تاریخ و ساعت خروج", type: "datetime-local", required: true, value: localDateTime() },
        { name: "exitFee", label: "کارمزد خروج (خالی = صفر)", step: "0.00000001" },
        { name: "fundingCost", label: "هزینهٔ تأمین مالی همین بخش (خالی = صفر)", step: "0.00000001" },
        { name: "rationale", label: "دلیل خروج", type: "textarea" },
      ],
      { closedAt: localDateTime(), exitFee: "0", fundingCost: "0" },
      (data) => Core.closeTrade(state, trade.id, {
        ...data,
        closedAt: new Date(data.closedAt).toISOString(),
      }),
    );
  }

  function markDialog(trade) {
    openForm(
      `ثبت قیمت دستی · ${trade.symbol}`,
      [
        { name: "price", label: `قیمت مرجع (${trade.currency})`, required: true, step: "0.00000001" },
        { name: "at", label: "زمان ثبت قیمت", type: "datetime-local", required: true },
        { name: "source", label: "منبع قیمت (مثلاً دستی/بازار)", required: true },
      ],
      { at: localDateTime(), source: "ورودی دستی" },
      (data) => Core.setMarkPrice(state, trade.id, {
        ...data,
        at: new Date(data.at).toISOString(),
      }),
    );
  }

  function addWallet() {
    openForm(
      "افزودن کیف پول عمومی",
      [
        { name: "name", label: "نام نمایشی", required: true },
        { name: "network", label: "شبکه", type: "select", options: [["ethereum", "Ethereum Mainnet"]] },
        { name: "address", label: "نشانی عمومی 0x…", required: true },
        { name: "type", label: "نوع کیف پول (اختیاری)" },
        {
          name: "ownership",
          label: "طبقه‌بندی مالکیت",
          type: "select",
          options: [["unknown", "نامشخص"], ["owned", "متعلق به من (اظهار کاربر)"], ["watched", "فقط رصد"]],
        },
        { name: "notes", label: "یادداشت (اختیاری)", type: "textarea" },
      ],
      { network: "ethereum", ownership: "unknown" },
      (data) => Core.addWallet(state, data),
    );
  }

  async function syncWallet(walletId) {
    const wallet = state.wallets.find((item) => item.id === walletId);
    if (!wallet || busyWallet) return;
    busyWallet = walletId;
    syncErrors.delete(walletId);
    window.DARA_RENDER?.();
    try {
      const response = await fetch(`/api/blockchain/ethereum/${encodeURIComponent(wallet.address)}`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message || "همگام‌سازی کیف پول ناموفق بود.");
      updateState(() => Core.mergeWalletSync(state, walletId, data));
    } catch (error) {
      syncErrors.set(
        walletId,
        error instanceof Error ? error.message : "همگام‌سازی کیف پول ناموفق بود.",
      );
    } finally {
      busyWallet = "";
      window.DARA_RENDER?.();
    }
  }

  function classify(walletId, transactionId, classification) {
    try {
      updateState(() => Core.classifyTransaction(state, walletId, transactionId, classification));
      window.DARA_RENDER?.();
    } catch (error) {
      alert(error instanceof Error ? error.message : "ذخیرهٔ دسته‌بندی ناموفق بود.");
    }
  }

  function renderTrades() {
    const currencies = [...new Set(state.trades.map((trade) => trade.currency))].sort();
    const strategies = [...new Set(state.trades.map((trade) => trade.strategy).filter(Boolean))].sort();
    const selectedCurrency = FILTERS.currency || currencies[0] || "";
    const filtered = { ...FILTERS, currency: selectedCurrency };
    const report = Core.analytics(state, filtered);
    const displayed = report.trades;
    const cards = [
      ["بروتوی تحقق‌یافته", report.realizedGross],
      ["خالص تحقق‌یافته", report.realizedNet],
      ["سود/زیان تحقق‌نیافته", report.unrealized],
      ["نرخ برد", report.winRatePercent == null ? "—" : `${format(report.winRatePercent, 2)}٪`],
      ["میانگین برد", report.averageWin],
      ["میانگین باخت", report.averageLoss],
      ["Profit Factor", report.profitFactor],
      ["Expectancy", report.expectancy],
      ["افت سرمایه", report.maxDrawdown ? `${format(report.maxDrawdown.amount)} · ${format(report.maxDrawdown.percent, 2)}٪` : "دادهٔ کافی نیست"],
    ].map(([label, value]) => `<div class="card kpi"><small>${escape(label)}${selectedCurrency ? ` · ${escape(selectedCurrency)}` : ""}</small><b>${value == null ? "—" : escape(value)}</b></div>`).join("");
    const rows = displayed.map((trade) => {
      const result = trade.result;
      const rr = Core.riskReward(trade);
      const stale = trade.markAt && Date.now() - Date.parse(trade.markAt) > 24 * 60 * 60 * 1000;
      const details = `<details class="phase4-details"><summary>جزئیات · ${escape(trade.symbol)}</summary><p>حساب: ${escape(trade.account)} · ابزار: ${trade.instrument === "spot" ? "نقدی" : "مشتقه"} · جهت: ${trade.direction === "long" ? "Long" : "Short"} · اهرم: ${escape(trade.leverage || "—")}</p><p>دلیل ورود: ${escape(trade.entryRationale || "ثبت نشده")} · دلیل خروج: ${escape(trade.exitRationale || "—")}</p><p>یادداشت روان‌شناختی: ${escape(trade.psychologicalNotes || "—")} · رعایت برنامه: ${escape(trade.ruleFollowing)}</p><p>هزینهٔ تأمین مالی خروج‌های ثبت‌شده در خالص P/L همین خروج‌ها منظور می‌شود. حجم ورود، کارمزد ورود و هزینه‌های هر خروج متناسب با حجم تخصیص می‌یابد.</p><ul>${trade.closes.map((close) => `<li class="row">خروج ${escape(dateLabel(close.closedAt))} · ${format(close.quantity)} @ ${format(close.exitPrice)} · خالص ${format(close.netPnl)} ${escape(trade.currency)}</li>`).join("") || '<li class="mu">خروجی ثبت نشده است.</li>'}</ul><p>برچسب‌ها: ${escape(trade.tags.join(", ") || "—")} · یادداشت: ${escape(trade.notes || "—")}</p></details>`;
      const actions = trade.status === "closed"
        ? ""
        : `<button class="b" data-phase4-action="close-trade" data-id="${escape(trade.id)}">ثبت خروج جزئی</button> <button class="b" data-phase4-action="mark-trade" data-id="${escape(trade.id)}">قیمت دستی</button> <button class="b" data-phase4-action="edit-trade" data-id="${escape(trade.id)}" ${trade.closes.length ? "disabled" : ""}>ویرایش</button>`;
      const unrealized = result.unrealized == null
        ? "بدون قیمت معتبر"
        : `${format(result.unrealized)} ${escape(trade.currency)}${stale ? " · قیمت قدیمی" : ""} · ${escape(trade.markSource || "منبع ثبت نشده")}`;
      return `<tr><td>${escape(trade.symbol)}<small>${escape(trade.account)} · ${escape(trade.strategy || "بدون استراتژی")}</small>${details}</td><td>${escape(MARKET_LABELS[trade.market])} · ${trade.direction === "long" ? "Long" : "Short"}<small>${escape(dateLabel(trade.entryDate))}</small></td><td>${format(result.remainingQuantity)} / ${format(trade.quantity)}</td><td>${escape(trade.status === "closed" ? "بسته" : trade.status === "partially_closed" ? "بخشی بسته" : "باز")}<small>${format(trade.entryPrice)} ${escape(trade.currency)}</small></td><td>${format(result.netRealized)} ${escape(trade.currency)}<small>بروتو: ${format(result.grossRealized)}</small></td><td>${escape(unrealized)}<small>هدف/ضرر: ${escape(rr || "—")}</small></td><td>${actions}</td></tr>`;
    }).join("");
    const groupPerformance = (heading, groups) =>
      `<section class="card"><h3>${escape(heading)}</h3><ul>${Object.entries(groups).map(([key, value]) => `<li class="row"><span>${escape(key)}</span><b>${escape(value)} ${escape(selectedCurrency)}</b></li>`).join("") || '<li class="mu">معاملهٔ بسته‌شده‌ای نیست.</li>'}</ul></section>`;
    const warnings = [
      report.missingMark ? `${report.missingMark} معاملهٔ باز قیمت مرجع ندارد و در P/L تحقق‌نیافته لحاظ نشده است.` : "",
      report.staleMarks ? `${report.staleMarks} قیمت دستی بیش از ۲۴ ساعت عمر دارد.` : "",
      report.maxDrawdown == null && report.realizedTrades ? "افت سرمایه بدون سرمایهٔ آغازین مثبت قابل محاسبه نیست." : "",
    ].filter(Boolean);
    const currencyWarning = currencies.length > 1
      ? message(`ارزها با هم جمع نمی‌شوند؛ نتایج فقط برای ${selectedCurrency || "ارز انتخاب‌شده"} هستند.`)
      : "";
    return `<div class="top"><div><h2 style="margin:0">ژورنال معاملات</h2><p class="market-intro">ثبت دستی معاملات؛ بدون اتصال معاملاتی یا توصیهٔ سرمایه‌گذاری</p></div><button class="pri" type="button" data-phase4-action="add-trade">+ ثبت معامله</button></div>${stateError ? message("داده‌ها فقط‌خواندنی هستند؛ خطای ذخیره‌سازی: " + stateError, true) : ""}${message("PnL تحقق‌یافته شامل کارمزد ورود تخصیص‌یافته، کارمزد خروج و هزینهٔ تأمین مالی واردشده برای همان بخش است. Break-even در نرخ برد شمرده می‌شود اما برد محسوب نمی‌شود. معاملات نیمه‌بسته تا تکمیل خروج از نرخ برد حذف‌اند. قیمت باز فقط با ثبت دستی معتبر است.")}${currencyWarning}<section class="card"><h3>تنظیم محاسبات</h3><label>سرمایهٔ آغازین برای افت سرمایه (اختیاری)<input type="text" inputmode="decimal" value="${escape(state.startingEquity || "")}" data-phase4-equity></label><div class="flt"><select aria-label="فیلتر ارز" data-phase4-filter="currency"><option value="">ارز اول</option>${optionTags(currencies.map((value) => [value, value]), selectedCurrency)}</select><select aria-label="فیلتر بازار" data-phase4-filter="market"><option value="">همهٔ بازارها</option>${optionTags(Object.entries(MARKET_LABELS), FILTERS.market)}</select><select aria-label="فیلتر وضعیت" data-phase4-filter="status"><option value="">همهٔ وضعیت‌ها</option>${optionTags([["open","باز"],["partially_closed","بخشی بسته"],["closed","بسته"]], FILTERS.status)}</select><select aria-label="فیلتر استراتژی" data-phase4-filter="strategy"><option value="">همهٔ استراتژی‌ها</option>${optionTags(strategies.map((value) => [value, value]), FILTERS.strategy)}</select><input aria-label="از تاریخ ورود" type="date" value="${escape(FILTERS.from)}" data-phase4-filter="from"><input aria-label="تا تاریخ ورود" type="date" value="${escape(FILTERS.to)}" data-phase4-filter="to"></div></section><div class="g">${cards}</div>${warnings.length ? `<section class="card phase4-message phase4-warning"><ul>${warnings.map((warning) => `<li>${escape(warning)}</li>`).join("")}</ul></section>` : ""}<div class="g">${groupPerformance("عملکرد به تفکیک استراتژی", report.byStrategy)}${groupPerformance("عملکرد به تفکیک بازار", report.byMarket)}${groupPerformance("عملکرد به تفکیک نماد", report.bySymbol)}</div><section class="card"><h3>فهرست معاملات (${displayed.length})</h3><div class="asset-table-wrap"><table class="phase4-table"><thead><tr><th>نماد / جزئیات</th><th>بازار / ورود</th><th>باقی‌مانده / کل</th><th>وضعیت / قیمت ورود</th><th>خالص تحقق‌یافته</th><th>تحقق‌نیافته</th><th>عملیات</th></tr></thead><tbody>${rows || '<tr><td colspan="7">معامله‌ای با این فیلتر ثبت نشده است.</td></tr>'}</tbody></table></div></section>`;
  }

  window.DaraPhase4UI = {
    renderBlockchain,
    renderTrades,
    addWallet,
    syncWallet,
    classify,
    addTrade: () => tradeDialog(),
    edit: (tradeId) => {
      const trade = state.trades.find((item) => item.id === tradeId);
      if (trade) tradeDialog(trade);
    },
    closeTrade: (tradeId) => {
      const trade = state.trades.find((item) => item.id === tradeId);
      if (trade) closeDialog(trade);
    },
    mark: (tradeId) => {
      const trade = state.trades.find((item) => item.id === tradeId);
      if (trade) markDialog(trade);
    },
    startingEquity: (value) => {
      try {
        updateState(() => Core.setStartingEquity(state, value));
        window.DARA_RENDER?.();
      } catch (error) {
        alert(error instanceof Error ? error.message : "ذخیرهٔ سرمایهٔ آغازین ناموفق بود.");
      }
    },
    filter: (key, value) => {
      FILTERS[key] = value;
      window.DARA_RENDER?.();
    },
  };

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest("[data-phase4-action]");
    if (!button || button.disabled) return;
    const action = button.dataset.phase4Action;
    const id = button.dataset.id;
    if (action === "add-wallet") addWallet();
    else if (action === "sync-wallet") syncWallet(id);
    else if (action === "add-trade") tradeDialog();
    else if (action === "edit-trade") window.DaraPhase4UI.edit(id);
    else if (action === "close-trade") window.DaraPhase4UI.closeTrade(id);
    else if (action === "mark-trade") window.DaraPhase4UI.mark(id);
  });

  document.addEventListener("change", (event) => {
    if (!(event.target instanceof Element)) return;
    const target = event.target;
    if (target.matches("[data-phase4-classify]")) {
      classify(target.dataset.walletId, target.dataset.transactionId, target.value);
    } else if (target.matches("[data-phase4-filter]")) {
      FILTERS[target.dataset.phase4Filter] = target.value;
      window.DARA_RENDER?.();
    } else if (target.matches("[data-phase4-equity]")) {
      window.DaraPhase4UI.startingEquity(target.value);
    }
  });
})();
