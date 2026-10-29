(function () {
  "use strict";

  const Core = window.DaraPhase5Core;
  const PREFS_KEY = "dara.phase5.preview.v1";
  const EVENT_STATE_KEY = "dara.phase5.events.preview.v1";
  const APP_KEY = `dara.v2.${window.DARA_USER_ID || "preview"}`;
  const UPLOAD_LIMIT = Core.MAX_CSV_BYTES;
  const CATEGORIES = {
    budgeting: "بودجه‌بندی",
    saving: "پس‌انداز",
    debt: "بدهی",
    investing: "سرمایه‌گذاری",
    trading: "معامله‌گری",
    privacy: "حریم خصوصی",
  };
  let prefs = Core.preferences();
  let prefsError = "";
  let eventState = { readIds: [] };
  let eventError = "";
  let aiStatus = {
    loading: true,
    configured: false,
    message: "در حال بررسی وضعیت تنظیمات سرور…",
  };
  let aiStatusRequest = null;
  let csvText = "";
  let csvMappings = { accounts: {}, categories: {} };
  let csvPreview = null;
  let csvError = "";
  let busy = false;

  function escape(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
    );
  }

  function readLocal(key, fallback, onError) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      onError(error instanceof Error ? error.message : "دادهٔ محلی خوانده نشد.");
      return fallback;
    }
  }

  const loadedPreferences = readLocal(PREFS_KEY, {}, (message) => { prefsError = message; });
  try {
    prefs = Core.preferences(loadedPreferences);
  } catch (error) {
    prefsError = error instanceof Error ? error.message : "ترجیحات محلی معتبر نیست.";
    prefs = Core.preferences();
  }
  const loadedEvents = readLocal(EVENT_STATE_KEY, { readIds: [] }, (message) => { eventError = message; });
  if (loadedEvents && Array.isArray(loadedEvents.readIds))
    eventState = { readIds: [...new Set(loadedEvents.readIds.filter((id) => typeof id === "string"))].slice(-1_000) };
  else
    eventError = "وضعیت یادآورها معتبر نیست.";

  function status(text, error = false) {
    return `<section class="card phase5-status${error ? " phase5-error" : ""}" role="status">${escape(text)}</section>`;
  }

  function savePrefs(next) {
    if (prefsError) throw new Error(`${prefsError}؛ ذخیرهٔ تنظیمات متوقف شد.`);
    const normalized = Core.preferences(next);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(normalized));
      prefs = normalized;
    } catch (error) {
      throw new Error(error instanceof Error ? `ذخیرهٔ تنظیمات ناموفق بود: ${error.message}` : "ذخیرهٔ تنظیمات ناموفق بود.");
    }
  }

  function saveEvents(next) {
    if (eventError) throw new Error(`${eventError}؛ ذخیرهٔ وضعیت یادآورها متوقف شد.`);
    try {
      localStorage.setItem(EVENT_STATE_KEY, JSON.stringify(next));
      eventState = next;
    } catch (error) {
      throw new Error(error instanceof Error ? `ذخیرهٔ یادآورها ناموفق بود: ${error.message}` : "ذخیرهٔ یادآورها ناموفق بود.");
    }
  }

  function checked(value) {
    return value ? " checked" : "";
  }

  function select(name, label, values, current) {
    return `<label>${escape(label)}<select data-phase5-pref="${escape(name)}">${values.map(([value, text]) => `<option value="${escape(value)}"${value === current ? " selected" : ""}>${escape(text)}</option>`).join("")}</select></label>`;
  }

  function preferenceForm() {
    const topics = Core.TOPICS.map((topic) =>
      `<label class="phase5-check"><input type="checkbox" data-phase5-topic="${topic}"${checked(prefs.topics.includes(topic))}>${escape(CATEGORIES[topic])}</label>`,
    ).join("");
    return `<form class="card phase5-preferences" data-phase5-preferences><h3>ترجیحات دستیار</h3>${prefsError ? status(`${prefsError}؛ تنظیمات فقط‌خواندنی است.`, true) : ""}<label>اهداف مالی اولیه (هر خط یک مورد)<textarea name="objectives" rows="3">${escape(prefs.objectives.join("\n"))}</textarea></label>${select("literacy", "سطح سواد مالی", [["beginner","مقدماتی"],["intermediate","متوسط"],["advanced","پیشرفته"]], prefs.literacy)}${select("explanation", "پیچیدگی توضیح", [["simple","ساده"],["balanced","متعادل"],["detailed","مفصل"]], prefs.explanation)}<fieldset><legend>موضوع‌های مورد علاقه</legend>${topics}</fieldset>${select("responseLength", "طول پاسخ", [["short","کوتاه"],["standard","معمولی"],["long","بلند"]], prefs.responseLength)}${select("reportFrequency", "تناوب گزارش پیشنهادی", [["off","خاموش"],["weekly","هفتگی (ترجیح ذخیره می‌شود؛ زمان‌بندی فعال نیست)"],["monthly","ماهانه (ترجیح ذخیره می‌شود؛ زمان‌بندی فعال نیست)"]], prefs.reportFrequency)}${select("guidanceStyle", "سبک پاسخ", [["educational","آموزشی عمومی"],["analytical","تحلیل داده‌های ثبت‌شده"]], prefs.guidanceStyle)}<label>منطقهٔ زمانی (شناسهٔ IANA)<input name="timeZone" value="${escape(prefs.timeZone)}" placeholder="Asia/Tehran" required></label><label class="phase5-check"><input name="consentToExternalAi" type="checkbox"${checked(prefs.consentToExternalAi)}> در آینده، در صورت فعال‌شدن ارائه‌دهنده و ورود امن، با ارسال حداقل دادهٔ مالی لازم به سرویس AI بیرونی موافقم.</label><p class="mu">این گزینه در حال حاضر هیچ داده‌ای ارسال نمی‌کند؛ حساب کاربری/احراز هویت و ارائه‌دهندهٔ AI در این نسخه فعال نیستند.</p><button class="pri" type="submit">ذخیرهٔ ترجیحات</button><span class="phase5-pref-message" role="status"></span></form>`;
  }

  function localAnalysis(state, period, helpers) {
    const records = state.tx.filter((transaction) =>
      transaction.date >= period.start && transaction.date <= period.end,
    );
    let income = 0;
    let expenses = 0;
    const byCategory = Object.create(null);
    for (const transaction of records) {
      if (transaction.type === "income") income += transaction.amount;
      if (transaction.type === "expense") {
        expenses += transaction.amount;
        byCategory[transaction.cat] = (byCategory[transaction.cat] || 0) + transaction.amount;
      }
    }
    const top = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const budgetRows = Object.entries(state.budgets).map(([categoryId, limit]) => {
      const spent = byCategory[categoryId] || 0;
      return { categoryId, limit, spent, remaining: limit - spent };
    });
    return `<section class="card"><h3>خلاصهٔ محلی محاسبه‌شده · بدون هوش مصنوعی</h3><p>بازه: ${escape(period.start)} تا ${escape(period.end)} · واحد: ${escape(state.cur)} · ${records.length} تراکنش ثبت‌شده · مبنای زمانی: تاریخ‌های واردشده در همین مرورگر</p><div class="g"><div class="card kpi"><small>درآمد ثبت‌شده</small><b>${helpers.money(income)}</b></div><div class="card kpi"><small>هزینهٔ ثبت‌شده</small><b>${helpers.money(expenses)}</b></div><div class="card kpi"><small>خالص ثبت‌شده</small><b>${helpers.money(income - expenses)}</b></div></div><h4>هزینه برحسب دسته</h4><ul>${top.map(([id, amount]) => `<li class="row"><span>${escape(helpers.categoryName(id))}</span><b>${helpers.money(amount)}</b></li>`).join("") || '<li class="mu">در این بازه هزینه‌ای ثبت نشده است.</li>'}</ul><h4>بودجه‌های این ماه</h4><ul>${budgetRows.map((row) => `<li class="row"><span>${escape(helpers.categoryName(row.categoryId))}</span><b>${helpers.money(row.spent)} از ${helpers.money(row.limit)}${row.remaining < 0 ? ` · ${helpers.money(-row.remaining)} بیش از سقف` : ""}</b></li>`).join("") || '<li class="mu">بودجه‌ای ثبت نشده است.</li>'}</ul><p class="mu">این جمع‌بندی فقط داده‌های همین مرورگر و بازهٔ انتخاب‌شده را پوشش می‌دهد؛ دادهٔ ناقص/ثبت‌نشده، علت تغییر هزینه، یا حساب‌های بانکی متصل را استنباط نمی‌کند.</p></section>`;
  }

  function renderAssistant(state, period, helpers) {
    if (aiStatus.loading) void refreshAiStatus();
    const providerMessage = aiStatus.configured
      ? "وضعیت سرور پیکربندی‌شده گزارش شده، اما ورود و سرویس دادهٔ مالی هنوز موجود نیست؛ گفتگو غیرفعال است."
      : aiStatus.message;
    return `<div class="top"><div><h2 style="margin:0">دستیار مالی</h2><p class="market-intro">تنظیم ترجیحات و تحلیل قطعیِ محلی</p></div><span class="phase5-tag">${aiStatus.configured ? "AI غیرفعال تا اتصال مجاز" : "AI پیکربندی نشده"}</span></div>${status(providerMessage, !aiStatus.loading && !aiStatus.configured)}${status("هیچ مدل زبانی یا پاسخ ساختگی فعال نیست. دستیار AI واقعی به احراز هویت، منبع مجاز داده، موافقت صریح و اتصال provider در سمت سرور نیاز دارد.")}${preferenceForm()}${localAnalysis(state, period, helpers)}<section class="card"><h3>آموزش مالی عمومی</h3><details><summary>بودجه‌بندی</summary><p>بودجه برنامه‌ای برای مقایسهٔ جریان‌های واقعی و هدف‌های انتخابی شماست؛ عبور از سقف به‌تنهایی به معنی تصمیم بد یا هزینهٔ غیرضروری نیست.</p></details><details><summary>بهرهٔ مرکب و تورم</summary><p>بهرهٔ مرکب رشد را روی اصل و سودهای انباشته محاسبه می‌کند؛ تورم قدرت خرید را تغییر می‌دهد. نتیجهٔ آینده قطعی نیست و به نرخ‌ها و زمان وابسته است.</p></details><details><summary>تنوع و ریسک</summary><p>تنوع می‌تواند تمرکز در یک دارایی یا بازار را کاهش دهد، اما ریسک زیان را حذف یا بازده را تضمین نمی‌کند.</p></details><p class="mu">مطالب آموزشی عمومی‌اند و توصیهٔ شخصی خرید/فروش یا سبد سرمایه‌گذاری نیستند.</p></section>`;
  }

  function refreshAiStatus() {
    if (aiStatusRequest) return aiStatusRequest;
    aiStatusRequest = (async () => {
      try {
        const response = await fetch("/api/assistant/status", { cache: "no-store", headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error(`وضعیت سرویس (${response.status}) دریافت نشد.`);
        const result = await response.json();
        aiStatus = {
          loading: false,
          configured: result.configured === true,
          message: typeof result.message === "string" ? result.message : "وضعیت AI نامشخص است.",
        };
      } catch {
        aiStatus = {
          loading: false,
          configured: false,
          message: "وضعیت سرور AI دریافت نشد؛ هیچ تحلیل AI یا ارسال داده‌ای انجام نمی‌شود.",
        };
      }
      if (window.DARA_CURRENT_PAGE === "ai") window.DARA_RENDER?.();
    })();
    return aiStatusRequest;
  }

  function renderNotifications(state, period) {
    const events = Core.notifications(state, period, prefs);
    const readIds = new Set(eventState.readIds);
    const unread = events.filter((event) => !readIds.has(event.id));
    const rows = events.map((event) =>
      `<li class="row phase5-notification${readIds.has(event.id) ? " phase5-read" : ""}"><div><b>${escape(event.title)}</b><small>${escape(event.detail)}</small><small>${event.dueDate ? `سررسید: ${escape(event.dueDate)} · ` : ""}${event.categoryId ? `دسته: ${escape(window.DARA_CATEGORY_NAME(event.categoryId))} · ` : ""}ثبت: ${escape(new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeZone: prefs.timeZone }).format(new Date(event.createdAt)))}</small></div><span>${event.amount == null ? "" : escape(window.DARA_MONEY(event.amount))}</span>${readIds.has(event.id) ? '<span class="mu">خوانده‌شده</span>' : `<button class="b" type="button" data-phase5-read="${escape(event.id)}">خواندم</button>`}</li>`,
    ).join("");
    return `<div class="top"><div><h2 style="margin:0">یادآورها</h2><p class="market-intro">یادآورهای محلی همین دستگاه</p></div><span class="phase5-tag">${unread.length} خوانده‌نشده</span></div>${eventError ? status(`${eventError}؛ وضعیت خواندن فقط‌خواندنی است.`, true) : ""}${status("اعلان‌ها فقط هنگام بازکردن این صفحه از داده‌های محلی ساخته می‌شوند. ارسال push، ایمیل، پیامک، زمان‌بندی پس‌زمینه و ارسال اطلاعات مالی به کانال بیرونی فعال نیست.")}<section class="card"><h3>دسته‌بندی اعلان‌ها</h3>${Object.entries({
      budgetThreshold: "نزدیک‌شدن به ۸۰٪ بودجه",
      budgetExceeded: "عبور از سقف بودجه",
      recurringDue: "سررسید پرداخت در ۳۰ روز",
      goalMilestone: "رسیدن هدف پس‌انداز به ۲۵٪، ۵۰٪، ۷۵٪ یا ۱۰۰٪",
    }).map(([key, label]) => `<label class="phase5-check"><input type="checkbox" data-phase5-notification="${key}"${checked(prefs.notifications[key])}>${escape(label)}</label>`).join("")}<p class="mu">منطقهٔ زمانی: ${escape(prefs.timeZone)}. برای اعلان‌های تقویمی/دوره‌ای پیش‌زمینه، تنظیم منطقهٔ زمانی دستگاه یا ذخیره‌شده استفاده می‌شود؛ scheduler سروری وجود ندارد.</p></section><section class="card"><h3>فهرست اعلان‌ها</h3><ul>${rows || '<li class="mu">در حال حاضر یادآوری تازه‌ای وجود ندارد.</li>'}</ul></section>`;
  }

  function download(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function exportCsv(state) {
    download(
      `dara-transactions-${new Date().toISOString().slice(0, 10)}.csv`,
      Core.exportTransactions(state.tx, state.accounts, state.cats),
      "text/csv;charset=utf-8",
    );
  }

  function exportBackup() {
    const keys = [APP_KEY, "dara.assets.preview.v1", "dara.phase4.preview.v1", PREFS_KEY, EVENT_STATE_KEY];
    const backup = { format: "dara-local-backup-v1", exportedAt: new Date().toISOString(), storage: {} };
    for (const key of keys) {
      const value = localStorage.getItem(key);
      if (value !== null) {
        try {
          backup.storage[key] = JSON.parse(value);
        } catch {
          throw new Error(`دادهٔ ${key} معتبر نیست؛ خروجی پشتیبان ساخته نشد.`);
        }
      }
    }
    download(
      `dara-local-backup-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(backup, null, 2),
      "application/json;charset=utf-8",
    );
  }

  function uniqueMappings(preview, state) {
    const accounts = new Set();
    const categories = new Set();
    for (const item of preview.items) {
      if (item.status !== "mapping_required") continue;
      if (item.error.includes("حساب «") && item.accountLabel) accounts.add(item.accountLabel);
      if (item.error.includes("حساب مقصد «") && item.targetLabel) accounts.add(item.targetLabel);
      if (item.error.includes("دسته‌بندی") && item.categoryLabel) categories.add(item.categoryLabel);
    }
    return [
      ...[...accounts].map((label) => ({
        type: "accounts",
        label,
        candidates: state.accounts.map((item) => [item.name, item.name]),
      })),
      ...[...categories].map((label) => ({
        type: "categories",
        label,
        candidates: state.cats.map((item) => [item.name, item.name]),
      })),
    ];
  }

  function importReview(state) {
    if (!csvPreview) return "";
    const mappings = uniqueMappings(csvPreview, state);
    return `<section class="card phase5-import-review"><h3>پیش‌نمایش CSV</h3><p>${csvPreview.totalRows} ردیف · آمادهٔ ورود: ${csvPreview.importable} · تکراری: ${csvPreview.duplicates} · نیازمند نگاشت: ${csvPreview.mappingRequired} · نامعتبر: ${csvPreview.invalid}</p>${mappings.map((mapping) => `<label>نگاشت ${mapping.type === "accounts" ? "حساب" : "دسته"} «${escape(mapping.label)}»<select data-phase5-map="${mapping.type}" data-source-label="${escape(mapping.label)}"><option value="">انتخاب…</option>${mapping.candidates.map(([value, label]) => `<option value="${escape(value)}"${csvMappings[mapping.type][mapping.label] === value ? " selected" : ""}>${escape(label)}</option>`).join("")}</select></label>`).join("")}<ul>${csvPreview.items.slice(0, 50).map((item) => `<li class="row"><span>ردیف ${item.line}</span><b>${escape(item.status)}</b><small>${escape(item.error || `${item.transaction?.date} · ${item.transaction?.type} · ${item.transaction?.amount}`)}</small></li>`).join("")}</ul>${csvPreview.items.length > 50 ? `<p>فقط ۵۰ ردیف اول پیش‌نمایش شده‌اند.</p>` : ""}<button type="button" class="pri" data-phase5-action="commit-csv" ${csvPreview.importable ? "" : "disabled"}>ورود ${csvPreview.importable} تراکنش معتبر</button><button type="button" class="b" data-phase5-action="cancel-csv">لغو پیش‌نمایش</button></section>`;
  }

  function renderPrivacy(state) {
    const periods = state.tx.map((transaction) => transaction.date).sort();
    return `<section class="card"><h3>حریم خصوصی و مدیریت داده</h3><p>این نسخه حالت مهمان دارد. تراکنش‌ها، تنظیمات دارایی، کیف‌پول، ژورنال، ترجیحات و یادآورها در localStorage دستگاه نگهداری می‌شوند؛ هیچ حسابی برای کاربر فعال نیست و حذف حساب سروری، نشست‌ها یا اتصال بیرونی در این نسخه وجود ندارد.</p><p>دادهٔ تراکنش در این مرورگر را می‌توان با CSV صادر کرد؛ پشتیبان JSON برای کلیدهای محلی برنامه نیز قابل دریافت است. فایل‌ها حاوی اطلاعات مالی حساس‌اند؛ آن‌ها را در مسیر امن نگهداری کنید.</p><p>تعداد تراکنش محلی: ${state.tx.length} · بازهٔ ثبت‌شده: ${escape(periods[0] || "—")} تا ${escape(periods.at(-1) || "—")} · رضایت AI بیرونی: ${prefs.consentToExternalAi ? "ثبت شده، ولی فعلاً هیچ داده‌ای ارسال نمی‌شود" : "داده‌ای ارسال نمی‌شود"}.</p><p>داده‌های محلی حذف نمی‌شوند مگر آنکه خودتان پاک‌سازی مرورگر/دادهٔ برنامه را انتخاب کنید. پاک‌سازی دستگاه برگشت‌پذیر نیست مگر فایل پشتیبان داشته باشید؛ حذف قانونی/سروری موضوعیت ندارد چون همگام‌سازی سروری نداریم.</p><div class="phase5-actions"><button class="b" type="button" data-phase5-action="export-csv">دانلود CSV تراکنش‌ها</button><button class="b" type="button" data-phase5-action="export-backup">دانلود پشتیبان JSON</button><label class="phase5-file">پیش‌نمایش ورود تراکنش CSV (حداکثر ۱ مگابایت، حداکثر ۵۰۰۰ ردیف)<input type="file" accept=".csv,text/csv" data-phase5-file></label></div>${csvError ? status(csvError, true) : ""}${importReview(state)}<button type="button" class="phase5-danger" data-phase5-action="clear-local">پاک‌سازی داده‌های همین دستگاه</button><p class="mu">این کار فقط کلیدهای Dara در این مرورگر را حذف می‌کند؛ نسخهٔ سروری یا نسخهٔ پشتیبان دیگری وجود ندارد.</p></section>`;
  }

  function applyCsv(state) {
    if (!csvText) throw new Error("ابتدا یک CSV معتبر را برای پیش‌نمایش انتخاب کنید.");
    csvPreview = Core.previewCsv(csvText, state, csvMappings);
    if (csvPreview.invalid || csvPreview.mappingRequired)
      throw new Error("ردیف نامعتبر یا نگاشت‌نشده وجود دارد؛ هیچ ردیفی وارد نشد. نگاشت‌ها را کامل یا فایل را اصلاح کنید.");
    if (!csvPreview.importable) throw new Error("ردیف جدیدی برای ورود وجود ندارد.");
    const next = state.tx.concat(
      csvPreview.items
        .filter((item) => item.status === "ready")
        .map((item) => ({ id: `csv-${crypto.randomUUID()}`, ...item.transaction })),
    );
    try {
      localStorage.setItem(APP_KEY, JSON.stringify({ ...state, tx: next }));
    } catch (error) {
      throw new Error(error instanceof Error ? `ذخیرهٔ تراکنش‌های واردشده ناموفق بود: ${error.message}` : "ذخیره‌سازی CSV ناموفق بود.");
    }
    state.tx = next;
    csvText = "";
    csvMappings = { accounts: {}, categories: {} };
    csvPreview = null;
    csvError = "";
  }

  function clearLocalData() {
    if (!window.confirm("داده‌های مالی و تنظیمات Dara در این مرورگر حذف شوند؟ این کار فقط همین دستگاه را پاک می‌کند و قابل بازگشت نیست.")) return;
    try {
      for (const key of [APP_KEY, "dara.assets.preview.v1", "dara.phase4.preview.v1", PREFS_KEY, EVENT_STATE_KEY])
        localStorage.removeItem(key);
      window.location.reload();
    } catch (error) {
      alert(error instanceof Error ? `پاک‌سازی کامل نشد: ${error.message}` : "پاک‌سازی داده‌های محلی ناموفق بود.");
    }
  }

  window.DaraPhase5UI = {
    renderAssistant,
    renderNotifications,
    renderPrivacy,
  };

  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.matches("[data-phase5-preferences]")) return;
    event.preventDefault();
    const data = new FormData(form);
    const next = {
      ...prefs,
      objectives: String(data.get("objectives") || "").split(/\r?\n/),
      literacy: data.get("literacy"),
      explanation: data.get("explanation"),
      responseLength: data.get("responseLength"),
      reportFrequency: data.get("reportFrequency"),
      guidanceStyle: data.get("guidanceStyle"),
      timeZone: data.get("timeZone"),
      consentToExternalAi: data.get("consentToExternalAi") === "on",
      topics: [...form.querySelectorAll("[data-phase5-topic]:checked")].map((item) => item.dataset.phase5Topic),
    };
    try {
      savePrefs(next);
      form.querySelector(".phase5-pref-message").textContent = "ترجیحات ذخیره شد؛ سرویس AI یا گزارش زمان‌بندی‌شده همچنان فعال نیست.";
    } catch (error) {
      form.querySelector(".phase5-pref-message").textContent =
        error instanceof Error ? error.message : "ذخیرهٔ ترجیحات ناموفق بود.";
    }
  });

  document.addEventListener("change", async (event) => {
    if (!(event.target instanceof Element)) return;
    const target = event.target;
    if (target.matches("[data-phase5-notification]")) {
      try {
        const notifications = { ...prefs.notifications, [target.dataset.phase5Notification]: target.checked };
        savePrefs({ ...prefs, notifications });
        window.DARA_RENDER?.();
      } catch (error) {
        target.checked = !target.checked;
        alert(error instanceof Error ? error.message : "ذخیرهٔ ترجیحات اعلان ناموفق بود.");
      }
    } else if (target.matches("[data-phase5-map]")) {
      csvMappings[target.dataset.phase5Map][target.dataset.sourceLabel] = target.value;
      const state = window.DARA_APP_STATE;
      try {
        csvPreview = Core.previewCsv(csvText, state, csvMappings);
        csvError = "";
      } catch (error) {
        csvError = error instanceof Error ? error.message : "پیش‌نمایش ناموفق بود.";
      }
      window.DARA_RENDER?.();
    } else if (target.matches("[data-phase5-file]")) {
      const file = target.files?.[0];
      csvText = "";
      csvMappings = { accounts: {}, categories: {} };
      csvPreview = null;
      csvError = "";
      if (!file) return;
      if (!file.name.toLowerCase().endsWith(".csv") || file.size > UPLOAD_LIMIT) {
        csvError = "فقط فایل CSV تا حداکثر ۱ مگابایت پذیرفته می‌شود.";
      } else {
        try {
          csvText = await file.text();
          csvPreview = Core.previewCsv(csvText, window.DARA_APP_STATE);
        } catch (error) {
          csvError = error instanceof Error ? error.message : "خواندن CSV ناموفق بود.";
          csvText = "";
        }
      }
      window.DARA_RENDER?.();
    }
  });

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest("[data-phase5-action], [data-phase5-read]");
    if (!button || button.disabled || busy) return;
    const action = button.dataset.phase5Action;
    const state = window.DARA_APP_STATE;
    if (button.dataset.phase5Read) {
      try {
        const readIds = [...new Set([...eventState.readIds, button.dataset.phase5Read])].slice(-1_000);
        saveEvents({ readIds });
        window.DARA_RENDER?.();
      } catch (error) {
        alert(error instanceof Error ? error.message : "ثبت وضعیت یادآور ناموفق بود.");
      }
      return;
    }
    if (action === "export-csv") {
      try {
        exportCsv(state);
      } catch (error) {
        alert(error instanceof Error ? error.message : "خروجی CSV ناموفق بود.");
      }
    } else if (action === "export-backup") {
      try {
        exportBackup();
      } catch (error) {
        alert(error instanceof Error ? error.message : "ساخت پشتیبان ناموفق بود.");
      }
    } else if (action === "clear-local") {
      clearLocalData();
    } else if (action === "commit-csv") {
      busy = true;
      try {
        applyCsv(state);
        window.DARA_RENDER?.();
      } catch (error) {
        csvError = error instanceof Error ? error.message : "ورود CSV ناموفق بود.";
        window.DARA_RENDER?.();
      } finally {
        busy = false;
      }
    } else if (action === "cancel-csv") {
      csvText = "";
      csvMappings = { accounts: {}, categories: {} };
      csvPreview = null;
      csvError = "";
      window.DARA_RENDER?.();
    }
  });
})();
