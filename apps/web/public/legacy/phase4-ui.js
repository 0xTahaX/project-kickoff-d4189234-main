(function () {
  "use strict";

  const Core = window.DaraPhase4Core;
  const STORE_KEY = () => {
    const userId = window.DARA_USER_ID || "preview";
    return userId === "preview" ? "dara.phase4.preview.v1" : `dara.phase4.${userId}.v1`;
  };
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
  const FILTERS = { account: "", market: "", status: "", strategy: "", currency: "", from: "", to: "" };
  const syncErrors = new Map();
  let state;
  let stateError = "";
  let busyWallet = "";

  try {
    const raw = localStorage.getItem(STORE_KEY());
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
      localStorage.setItem(STORE_KEY(), JSON.stringify(state));
      window.DARA_SYNC_WORKSPACE?.("blockchain", state);
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
    { name: "account", label: "حساب / کارگزار (متن اختیاری)" },
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
    { name: "entryFeeRate", label: "نرخ کارمزد ورود (٪، جایگزین مبلغ)", step: "0.00000001" },
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

  function tradeDialog(trade = null, template = null) {
    const entry = trade
      ? { ...trade, entryDate: localDateTime(trade.entryDate) }
      : {
          market: "crypto",
          instrument: template?.instrument === "linear" ? "derivative" : "spot",
          direction: template?.side || "long",
          currency:
            template?.currency ||
            (window.DARA_APP_STATE?.cur === "تومان" ? "IRT" : window.DARA_APP_STATE?.cur || "USD"),
          entryDate: localDateTime(template?.entryDate || new Date()),
          entryFee: "0",
          accountId: template?.accountId || (state.accounts[0] ? state.accounts[0].id : ""),
          ...(template || {}),
        };
    const fields = [...tradeFields];
    if (state.accounts.length)
      fields.push({
        name: "accountId",
        label: "حساب معاملاتی",
        type: "select",
        options: [["", "بدون حساب"], ...state.accounts.map((account) => [account.id, `${account.name} (${account.currency})`])],
      });
    openForm(trade ? "ویرایش معامله" : "ثبت معامله", fields, entry, (data) => {
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
        { name: "exitFeeRate", label: "نرخ کارمزد خروج (٪، جایگزین مبلغ)", step: "0.00000001" },
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


  function accountDialog() {
    const currency = window.DARA_APP_STATE?.cur === "تومان" ? "IRT" : window.DARA_APP_STATE?.cur || "USD";
    openForm(
      "حساب معاملاتی جدید",
      [
        { name: "name", label: "نام حساب", required: true },
        { name: "broker", label: "کارگزار / صرافی" },
        { name: "currency", label: "ارز حساب (مثلاً USD یا IRT)", required: true },
        { name: "initialBalance", label: "موجودی اولیه", required: true, step: "0.00000001" },
      ],
      { currency, initialBalance: "0" },
      (data) => Core.createAccount(state, data),
    );
  }

  function accountEventDialog(accountId, type) {
    const account = state.accounts.find((entry) => entry.id === accountId);
    if (!account) return;
    openForm(
      `${type === "deposit" ? "واریز سرمایه" : "برداشت سرمایه"} · ${account.name}`,
      [
        { name: "amount", label: `مبلغ (${account.currency})`, required: true, step: "0.00000001" },
        { name: "at", label: "تاریخ و ساعت", type: "datetime-local", required: true },
        { name: "note", label: "یادداشت (اختیاری)" },
      ],
      { at: localDateTime() },
      (data) =>
        Core.recordAccountEvent(state, {
          accountId,
          type,
          amount: data.amount,
          at: new Date(data.at).toISOString(),
          note: data.note,
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


  // ─── ماشین‌حساب مدیریت سرمایه و خروج پله‌ای (فاز ۲) ────────────────────────
  const mmTarget = () => ({ enabled: false, price: "", mode: "percent", basis: "initial", rr: "", percent: "" });
  const MM = {
    accountId: "",
    balance: "",
    riskPercent: "1",
    side: "long",
    instrument: "spot",
    symbol: "",
    entry: "",
    stop: "",
    leverage: "1",
    entryFeeRate: "0.06",
    exitFeeRate: "0.06",
    maintenanceMarginRate: "",
    targets: [{ ...mmTarget(), enabled: true }, mmTarget(), mmTarget(), mmTarget(), mmTarget()],
  };

  const mmInput = (name, label, attrs = "") =>
    `<label>${escape(label)}<input inputmode="decimal" data-mm="${escape(name)}" value="${escape(MM[name])}" ${attrs}></label>`;

  function renderMoneyManagement() {
    const accountOptions = [
      ["", "ورودی دستی"],
      ...state.accounts.map((account) => [account.id, `${account.name} (${account.currency})`]),
    ];
    const rows = MM.targets
      .map(
        (target, index) => `<tr data-mm-target="${index}">
          <td><input type="checkbox" data-mm-t="${index}" data-mm-field="enabled"${target.enabled ? " checked" : ""} aria-label="فعال بودن تارگت ${index + 1}"></td>
          <td>T${index + 1}</td>
          <td><input inputmode="decimal" data-mm-t="${index}" data-mm-field="price" value="${escape(target.price)}" aria-label="قیمت تارگت ${index + 1}"></td>
          <td><select data-mm-t="${index}" data-mm-field="mode" aria-label="روش تارگت ${index + 1}"><option value="percent"${target.mode === "percent" ? " selected" : ""}>درصد حجم</option><option value="rr"${target.mode === "rr" ? " selected" : ""}>RR هدف</option></select></td>
          <td><select data-mm-t="${index}" data-mm-field="basis" aria-label="مبنای تارگت ${index + 1}"><option value="initial"${target.basis === "initial" ? " selected" : ""}>از حجم اولیه</option><option value="remaining"${target.basis === "remaining" ? " selected" : ""}>از حجم باقی‌مانده</option></select></td>
          <td><input inputmode="decimal" data-mm-t="${index}" data-mm-field="rr" value="${escape(target.rr)}" aria-label="RR تارگت ${index + 1}"></td>
          <td><input inputmode="decimal" data-mm-t="${index}" data-mm-field="percent" value="${escape(target.percent)}" aria-label="درصد خروج تارگت ${index + 1}"></td>
          <td data-mm-out="${index}">—</td>
        </tr>`,
      )
      .join("");
    return `<details class="card mm" open><summary>ماشین‌حساب مدیریت سرمایه و خروج پله‌ای</summary>
      <p class="mu">ابزار مستقل و فقط‌محاسباتی؛ هیچ معامله‌ای ثبت نمی‌کند. مدل پشتیبانی‌شده: Spot و Linear Perpetual با مارجین ایزوله. Inverse، Funding، Slippage و محدودیت Tick/Lot خارج از محدوده‌اند.</p>
      <div class="mm-grid">
        <label>حساب معاملاتی<select data-mm-account>${accountOptions.map(([value, label]) => `<option value="${escape(value)}"${MM.accountId === value ? " selected" : ""}>${escape(label)}</option>`).join("")}</select></label>
        ${mmInput("balance", "موجودی حساب")}
        ${mmInput("riskPercent", "ریسک هر معامله (٪)")}
        <label>جهت معامله<select data-mm="side"><option value="long"${MM.side === "long" ? " selected" : ""}>Long</option><option value="short"${MM.side === "short" ? " selected" : ""}>Short</option></select></label>
        <label>نوع قرارداد<select data-mm="instrument"><option value="spot"${MM.instrument === "spot" ? " selected" : ""}>Spot</option><option value="linear"${MM.instrument === "linear" ? " selected" : ""}>Linear Perpetual</option></select></label>
        ${mmInput("symbol", "نماد", 'placeholder="BTCUSDT"')}
        ${mmInput("entry", "قیمت ورود")}
        ${mmInput("stop", "حد ضرر")}
        ${mmInput("leverage", "اهرم")}
        ${mmInput("entryFeeRate", "کارمزد ورود (٪)")}
        ${mmInput("exitFeeRate", "کارمزد خروج (٪)")}
        ${mmInput("maintenanceMarginRate", "مارجین نگهداری (٪، اختیاری)")}
      </div>
      <div class="mm-results" data-mm-results></div>
      <div class="asset-table-wrap"><table class="phase4-table mm-table"><thead><tr><th>فعال</th><th>#</th><th>قیمت</th><th>روش</th><th>مبنا</th><th>RR هدف</th><th>درصد خروج</th><th>نتیجه</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div data-mm-warnings></div>
      <button class="b" type="button" data-mm-to-trade>انتقال ورودی‌ها به فرم ثبت معامله</button>
    </details>`;
  }

  function renderMMResults() {
    const box = document.querySelector("[data-mm-results]");
    if (!box) return;
    const out = Core.moneyManagement({ ...MM, targets: MM.targets });
    if (!out.ok) {
      box.innerHTML = `<div class="mm-error">${out.errors.map((message) => `<div>${escape(message)}</div>`).join("")}</div>`;
    } else {
      const cards = [
        ["Risk Amount", out.riskAmount],
        ["Stop Distance", `${out.stopDistance} (${format(out.stopPercent, 2)}٪)`],
        ["Position Size", out.quantity],
        ["Position Value", out.positionValue],
        ["Required Margin", out.requiredMargin],
        ["حداکثر زیان", out.maxLoss],
        ["اهرم", out.leverage],
        ["لیکوییدیشن", out.liquidation ? `${out.liquidation.price} (تقریبی)` : "قابل محاسبهٔ دقیق نیست"],
      ];
      box.innerHTML =
        cards
          .map(
            ([label, value]) =>
              `<div class="card kpi"><small>${escape(label)}</small><b>${escape(value)}</b></div>`,
          )
          .join("") +
        `<div class="mm-summary">مجموع خروج: <b>${format(out.summary.closedPercent, 2)}٪</b> · باقی‌مانده: <b>${format(out.summary.remainingPercent, 2)}٪</b> · سود تخمینی خروج‌های معتبر: <b>${escape(out.summary.estimatedProfit)}</b> · وضعیت: <b>${out.summary.validPlan ? "معتبر" : "نامعتبر"}</b></div>`;
    }
    MM.targets.forEach((target, index) => {
      const cell = document.querySelector(`[data-mm-out="${index}"]`);
      if (!cell) return;
      const item = out.targets ? out.targets[index] : null;
      if (!item || !item.enabled) {
        cell.textContent = "غیرفعال";
      } else if (!item.valid) {
        cell.textContent = item.reason || "نامعتبر";
      } else {
        cell.textContent = `RR ${format(item.actualRR, 2)} · ${format(item.closePercent, 2)}٪ · ${format(item.closeQty, 8)} واحد · سود ${format(item.estimatedProfit, 8)}`;
      }
    });
    const warnings = document.querySelector("[data-mm-warnings]");
    if (warnings)
      warnings.innerHTML = out.ok
        ? out.warnings.map((message) => `<p class="mm-warning">${escape(message)}</p>`).join("")
        : "";
  }

  function syncMM(target) {
    if (target.matches("[data-mm-account]")) {
      MM.accountId = target.value;
      const account = state.accounts.find((entry) => entry.id === MM.accountId);
      if (account) {
        MM.balance = Core.accountBalance(state, account.id).current;
        const balanceInput = document.querySelector('[data-mm="balance"]');
        if (balanceInput) balanceInput.value = MM.balance;
      }
      renderMMResults();
      return;
    }
    if (target.matches("[data-mm]")) {
      MM[target.dataset.mm] = target.value;
      renderMMResults();
      return;
    }
    if (target.matches("[data-mm-t]")) {
      const index = Number(target.dataset.mmT);
      const field = target.dataset.mmField;
      MM.targets[index][field] = field === "enabled" ? target.checked : target.value;
      renderMMResults();
    }
  }

  function mmToTrade() {
    const out = Core.moneyManagement({ ...MM, targets: MM.targets });
    if (!out.ok || Number(out.quantity) <= 0) {
      alert("ابتدا ورودی‌های معتبر را کامل کنید.");
      return;
    }
    const account = state.accounts.find((entry) => entry.id === MM.accountId);
    const first = out.targets.find((target) => target.valid);
    tradeDialog(null, {
      account: account ? account.name : "",
      accountId: account ? account.id : "",
      currency: account ? account.currency : "",
      symbol: MM.symbol,
      side: MM.side,
      instrument: MM.instrument,
      entryPrice: MM.entry,
      quantity: out.quantity,
      stopLoss: MM.stop,
      takeProfit: first ? first.price : "",
      leverage: MM.instrument === "linear" ? MM.leverage : "",
      entryFeeRate: MM.entryFeeRate,
    });
  }
  function renderTrades() {
    const currencies = [...new Set(state.trades.map((trade) => trade.currency))].sort();
    const strategies = [...new Set(state.trades.map((trade) => trade.strategy).filter(Boolean))].sort();
    const accounts = state.accounts || [];
    const selectedAccount = FILTERS.account || (accounts[0] ? accounts[0].id : "");
    const accountRow = accounts.find((account) => account.id === selectedAccount) || null;
    const summary = selectedAccount ? Core.journalSummary(state, { accountId: selectedAccount }) : null;
    const selectedCurrency = FILTERS.currency || currencies[0] || "";
    const filtered = { ...FILTERS, accountId: selectedAccount, currency: selectedCurrency };
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
    const charts = window.DaraCharts;
    const closedFiltered = displayed.filter((trade) => trade.status === "closed");
    const shortDate = (iso) =>
      new Intl.DateTimeFormat("fa-IR", { month: "short", day: "numeric", timeZone: "Asia/Tehran" }).format(new Date(iso));
    const equityPoints = selectedAccount ? Core.equityCurve(state, selectedAccount) : [];
    const equityChart = charts && equityPoints.length > 1
      ? charts.line({ labels: equityPoints.map((point) => shortDate(point.at)), values: equityPoints.map((point) => Number(point.balance)), format: (value) => format(value, 2), ariaLabel: "Equity Curve" })
      : charts ? charts.empty("برای رسم Equity Curve به تراکنش‌های ثبت‌شده و حساب نیاز است.") : "";
    const directionData = ["long", "short"].map((direction) => {
      const trades = closedFiltered.filter((trade) => trade.direction === direction);
      const net = trades.reduce((total, trade) => total + Number(Core.tradeResult(trade).netRealized), 0);
      return { direction, net, count: trades.length };
    });
    const directionChart = charts
      ? charts.bar({ labels: ["Long", "Short"], series: [{ name: "خالص", values: directionData.map((item) => item.net), color: "var(--pri)" }], format: (value) => format(value, 2), ariaLabel: "عملکرد Long و Short" })
      : "";
    const winCount = closedFiltered.filter((trade) => Number(Core.tradeResult(trade).netRealized) > 0).length;
    const lossCount = closedFiltered.filter((trade) => Number(Core.tradeResult(trade).netRealized) < 0).length;
    const evenCount = closedFiltered.filter((trade) => Number(Core.tradeResult(trade).netRealized) === 0).length;
    const outcomeChart = charts
      ? charts.donut({ items: [{ label: "برد", value: winCount, color: "var(--g)" }, { label: "باخت", value: lossCount, color: "var(--r)" }, { label: "سربه‌سر", value: evenCount, color: "var(--mu)" }], title: "نتیجه" })
      : charts.empty();
    const groupEntries = (groups) => Object.entries(groups).slice(0, 8);
    const symbolEntries = groupEntries(report.bySymbol);
    const strategyEntries = groupEntries(report.byStrategy);
    const symbolChart = charts && symbolEntries.length
      ? charts.bar({ labels: symbolEntries.map(([label]) => label), series: [{ name: "خالص", values: symbolEntries.map(([, value]) => Number(value)), color: "var(--g)" }], format: (value) => format(value, 2), ariaLabel: "عملکرد نمادها" })
      : charts ? charts.empty("معاملهٔ بسته‌شده‌ای برای تحلیل نماد نیست.") : "";
    const strategyChart = charts && strategyEntries.length
      ? charts.bar({ labels: strategyEntries.map(([label]) => label), series: [{ name: "خالص", values: strategyEntries.map(([, value]) => Number(value)), color: "var(--pri)" }], format: (value) => format(value, 2), ariaLabel: "عملکرد استراتژی‌ها" })
      : charts ? charts.empty("معاملهٔ بسته‌شده‌ای برای تحلیل استراتژی نیست.") : "";
    const rrBuckets = [0, 0, 0, 0, 0];
    closedFiltered.forEach((trade) => {
      const rr = Core.riskReward(trade);
      if (rr == null) return;
      const value = Number(rr);
      if (!Number.isFinite(value) || value <= 0) return;
      const index = value < 1 ? 0 : value < 2 ? 1 : value < 3 ? 2 : value < 5 ? 3 : 4;
      rrBuckets[index] += 1;
    });
    const rrChart = charts && rrBuckets.some(Boolean)
      ? charts.bar({ labels: ["<1", "1–2", "2–3", "3–5", "5+"], series: [{ name: "تعداد", values: rrBuckets, color: "var(--pri)" }], format: (value) => format(value, 0), ariaLabel: "توزیع R:R" })
      : charts ? charts.empty("برای توزیع R:R به معامله با حد ضرر و حد سود نیاز است.") : "";
    const chartsHtml = charts
      ? `<div class="dash-grid">
          <section class="card chart-card wide"><header class="card-head"><div><h3>Equity Curve</h3><small>موجودی حساب بر اساس رویدادهای واقعی</small></div></header>${equityChart}</section>
          <section class="card chart-card"><header class="card-head"><div><h3>Long و Short</h3><small>سود خالص تحقق‌یافته</small></div></header>${directionChart}</section>
        </div>
        <div class="dash-grid">
          <section class="card chart-card"><header class="card-head"><div><h3>عملکرد نماد</h3><small>تا هشت نماد برتر</small></div></header>${symbolChart}</section>
          <section class="card chart-card"><header class="card-head"><div><h3>عملکرد استراتژی</h3><small>خالص تحقق‌یافته</small></div></header>${strategyChart}</section>
        </div>
        <div class="dash-grid">
          <section class="card chart-card"><header class="card-head"><div><h3>توزیع R:R</h3><small>تعداد معاملات در بازه‌های R</small></div></header>${rrChart}</section>
          <section class="card chart-card"><header class="card-head"><div><h3>نتیجهٔ معاملات</h3><small>برد / باخت / سربه‌سر</small></div></header>${outcomeChart}</section>
        </div>`
      : "";
    const rows = displayed.map((trade) => {
      const result = trade.result;
      const rr = Core.riskReward(trade);
      const stale = trade.markAt && Date.now() - Date.parse(trade.markAt) > 24 * 60 * 60 * 1000;
      const accountLabel = trade.accountId ? (state.accounts.find((account) => account.id === trade.accountId)?.name || trade.account) : trade.account;
      const details = `<details class="phase4-details"><summary>جزئیات · ${escape(trade.symbol)}</summary><p>حساب: ${escape(accountLabel)} · ابزار: ${trade.instrument === "spot" ? "نقدی" : "مشتقه"} · جهت: ${trade.direction === "long" ? "Long" : "Short"} · اهرم: ${escape(trade.leverage || "—")}</p><p>دلیل ورود: ${escape(trade.entryRationale || "ثبت نشده")} · دلیل خروج: ${escape(trade.exitRationale || "—")}</p><p>یادداشت روان‌شناختی: ${escape(trade.psychologicalNotes || "—")} · رعایت برنامه: ${escape(trade.ruleFollowing)}</p><p>هزینهٔ تأمین مالی خروج‌های ثبت‌شده در خالص P/L همین خروج‌ها منظور می‌شود. حجم ورود، کارمزد ورود و هزینه‌های هر خروج متناسب با حجم تخصیص می‌یابد.</p><ul>${trade.closes.map((close) => `<li class="row">خروج ${escape(dateLabel(close.closedAt))} · ${format(close.quantity)} @ ${format(close.exitPrice)} · خالص ${format(close.netPnl)} ${escape(trade.currency)}</li>`).join("") || '<li class="mu">خروجی ثبت نشده است.</li>'}</ul><p>برچسب‌ها: ${escape(trade.tags.join(", ") || "—")} · یادداشت: ${escape(trade.notes || "—")}</p></details>`;
      const actions = trade.status === "closed"
        ? ""
        : `<button class="b" data-phase4-action="close-trade" data-id="${escape(trade.id)}">ثبت خروج جزئی</button> <button class="b" data-phase4-action="mark-trade" data-id="${escape(trade.id)}">قیمت دستی</button> <button class="b" data-phase4-action="edit-trade" data-id="${escape(trade.id)}" ${trade.closes.length ? "disabled" : ""}>ویرایش</button>`;
      const unrealized = result.unrealized == null
        ? "بدون قیمت معتبر"
        : `${format(result.unrealized)} ${escape(trade.currency)}${stale ? " · قیمت قدیمی" : ""} · ${escape(trade.markSource || "منبع ثبت نشده")}`;
      return `<tr><td>${escape(trade.symbol)}<small>${escape(accountLabel)} · ${escape(trade.strategy || "بدون استراتژی")}</small>${details}</td><td>${escape(MARKET_LABELS[trade.market])} · ${trade.direction === "long" ? "Long" : "Short"}<small>${escape(dateLabel(trade.entryDate))}</small></td><td>${format(result.remainingQuantity)} / ${format(trade.quantity)}</td><td>${escape(trade.status === "closed" ? "بسته" : trade.status === "partially_closed" ? "بخشی بسته" : "باز")}<small>${format(trade.entryPrice)} ${escape(trade.currency)}</small></td><td>${format(result.netRealized)} ${escape(trade.currency)}<small>بروتو: ${format(result.grossRealized)}</small></td><td>${escape(unrealized)}<small>هدف/ضرر: ${escape(rr || "—")}</small></td><td>${actions}</td></tr>`;
    }).join("");
    const groupPerformance = (heading, groups) =>
      `<section class="card"><h3>${escape(heading)}</h3><ul>${Object.entries(groups).map(([key, value]) => `<li class="row"><span>${escape(key)}</span><b>${escape(value)} ${escape(selectedCurrency)}</b></li>`).join("") || '<li class="mu">معاملهٔ بسته‌شده‌ای نیست.</li>'}</ul></section>`;
    const accountCards = summary
      ? [
          ["موجودی فعلی", `${summary.balance.current} ${accountRow ? accountRow.currency : ""}`],
          ["سود ناخالص", summary.grossProfit],
          ["زیان ناخالص", summary.grossLoss],
          ["کارمزدها", summary.fees],
          ["سود/زیان خالص", summary.netTotal],
          ["ریسک معاملات باز", summary.totalRisk],
        ]
          .map(([label, value]) => `<div class="card kpi"><small>${escape(label)}</small><b>${escape(value == null ? "—" : value)}</b></div>`)
          .join("")
      : "";
    const mmSection = renderMoneyManagement();
    const accountsSection = `<section class="card"><h3>حساب‌های معاملاتی و انتقال سرمایه</h3>${accounts.length ? accounts.map((account) => { const balance = Core.accountBalance(state, account.id); return `<div class="row"><div><b>${escape(account.name)}</b><small>${escape(account.broker || "کارگزار نامشخص")} · ${escape(account.currency)} · اولیه ${escape(balance.initial)}</small></div><div><b>${escape(balance.current)} ${escape(account.currency)}</b><small>قابل استفاده ${escape(balance.available)} · مارجین ${escape(balance.usedMargin)}</small></div><span><button class="b" type="button" data-phase4-action="deposit" data-id="${escape(account.id)}">واریز</button> <button class="b" type="button" data-phase4-action="withdraw" data-id="${escape(account.id)}">برداشت</button></span></div>`; }).join("") : `<p class="mu">حساب معاملاتی ثبت نشده است. موجودی حساب فقط از واریز/برداشت و سود و زیان تحقق‌یافتهٔ واقعی محاسبه می‌شود.</p>`}<button class="b" type="button" data-phase4-action="add-account">+ حساب معاملاتی جدید</button><small>واریز و برداشت هرگز سود/زیان معاملاتی نیستند و مارجین رزروشده با زیان تحقق‌یافته اشتباه نمی‌شود.</small></section>`;
    const warnings = [
      report.missingMark ? `${report.missingMark} معاملهٔ باز قیمت مرجع ندارد و در P/L تحقق‌نیافته لحاظ نشده است.` : "",
      report.staleMarks ? `${report.staleMarks} قیمت دستی بیش از ۲۴ ساعت عمر دارد.` : "",
      report.maxDrawdown == null && report.realizedTrades ? "افت سرمایه بدون سرمایهٔ آغازین مثبت قابل محاسبه نیست." : "",
    ].filter(Boolean);
    const currencyWarning = currencies.length > 1
      ? message(`ارزها با هم جمع نمی‌شوند؛ نتایج فقط برای ${selectedCurrency || "ارز انتخاب‌شده"} هستند.`)
      : "";
    setTimeout(renderMMResults, 0);
    return `<div class="top"><div><h2 style="margin:0">ژورنال معاملات</h2><p class="market-intro">ثبت دستی معاملات؛ بدون اتصال معاملاتی یا توصیهٔ سرمایه‌گذاری</p></div><button class="pri" type="button" data-phase4-action="add-trade">+ ثبت معامله</button></div>${stateError ? message("داده‌ها فقط‌خواندنی هستند؛ خطای ذخیره‌سازی: " + stateError, true) : ""}${message("PnL تحقق‌یافته شامل کارمزد ورود تخصیص‌یافته، کارمزد خروج و هزینهٔ تأمین مالی واردشده برای همان بخش است. Break-even در نرخ برد شمرده می‌شود اما برد محسوب نمی‌شود. معاملات نیمه‌بسته تا تکمیل خروج از نرخ برد حذف‌اند. قیمت باز فقط با ثبت دستی معتبر است.")}${currencyWarning}<section class="card"><h3>تنظیم محاسبات</h3><label>سرمایهٔ آغازین برای افت سرمایه (اختیاری)<input type="text" inputmode="decimal" value="${escape(state.startingEquity || "")}" data-phase4-equity></label><div class="flt"><select aria-label="حساب معاملاتی" data-phase4-account>${accounts.map((account) => `<option value="${escape(account.id)}"${account.id === selectedAccount ? " selected" : ""}>${escape(account.name)} (${escape(account.currency)})</option>`).join("")}${accounts.length ? "" : `<option value="">بدون حساب</option>`}</select><select aria-label="فیلتر ارز" data-phase4-filter="currency"><option value="">ارز اول</option>${optionTags(currencies.map((value) => [value, value]), selectedCurrency)}</select><select aria-label="فیلتر بازار" data-phase4-filter="market"><option value="">همهٔ بازارها</option>${optionTags(Object.entries(MARKET_LABELS), FILTERS.market)}</select><select aria-label="فیلتر وضعیت" data-phase4-filter="status"><option value="">همهٔ وضعیت‌ها</option>${optionTags([["open","باز"],["partially_closed","بخشی بسته"],["closed","بسته"]], FILTERS.status)}</select><select aria-label="فیلتر استراتژی" data-phase4-filter="strategy"><option value="">همهٔ استراتژی‌ها</option>${optionTags(strategies.map((value) => [value, value]), FILTERS.strategy)}</select><input aria-label="از تاریخ ورود" type="date" value="${escape(FILTERS.from)}" data-phase4-filter="from"><input aria-label="تا تاریخ ورود" type="date" value="${escape(FILTERS.to)}" data-phase4-filter="to"></div></section>${accountsSection}${mmSection}<div class="g">${accountCards}</div><div class="g">${cards}</div>${chartsHtml}${warnings.length ? `<section class="card phase4-message phase4-warning"><ul>${warnings.map((warning) => `<li>${escape(warning)}</li>`).join("")}</ul></section>` : ""}<div class="g">${groupPerformance("عملکرد به تفکیک استراتژی", report.byStrategy)}${groupPerformance("عملکرد به تفکیک بازار", report.byMarket)}${groupPerformance("عملکرد به تفکیک نماد", report.bySymbol)}</div><section class="card"><h3>فهرست معاملات (${displayed.length})</h3><div class="asset-table-wrap"><table class="phase4-table"><thead><tr><th>نماد / جزئیات</th><th>بازار / ورود</th><th>باقی‌مانده / کل</th><th>وضعیت / قیمت ورود</th><th>خالص تحقق‌یافته</th><th>تحقق‌نیافته</th><th>عملیات</th></tr></thead><tbody>${rows || '<tr><td colspan="7">معامله‌ای با این فیلتر ثبت نشده است.</td></tr>'}</tbody></table></div></section>`;
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


  document.addEventListener("input", (event) => {
    if (event.target instanceof Element) syncMM(event.target);
  });
  document.addEventListener("change", (event) => {
    if (event.target instanceof Element) syncMM(event.target);
  });
  document.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("[data-mm-to-trade]")) mmToTrade();
  });
  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest("[data-phase4-action]");
    if (!button || button.disabled) return;
    const action = button.dataset.phase4Action;
    const id = button.dataset.id;
    if (action === "add-wallet") addWallet();
    else if (action === "sync-wallet") syncWallet(id);
    else if (action === "add-trade") tradeDialog();
    else if (action === "add-account") accountDialog();
    else if (action === "deposit") accountEventDialog(id, "deposit");
    else if (action === "withdraw") accountEventDialog(id, "withdraw");
    else if (action === "edit-trade") window.DaraPhase4UI.edit(id);
    else if (action === "close-trade") window.DaraPhase4UI.closeTrade(id);
    else if (action === "mark-trade") window.DaraPhase4UI.mark(id);
  });

  document.addEventListener("change", (event) => {
    if (!(event.target instanceof Element)) return;
    const target = event.target;
    if (target.matches("[data-phase4-classify]")) {
      classify(target.dataset.walletId, target.dataset.transactionId, target.value);
    } else if (target.matches("[data-phase4-account]")) {
      FILTERS.account = target.value;
      window.DARA_RENDER?.();
    } else if (target.matches("[data-phase4-filter]")) {
      FILTERS[target.dataset.phase4Filter] = target.value;
      window.DARA_RENDER?.();
    } else if (target.matches("[data-phase4-equity]")) {
      window.DaraPhase4UI.startingEquity(target.value);
    }
  });
})();
