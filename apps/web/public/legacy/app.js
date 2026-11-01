/*CORE*/
const P = (s) =>
  String(s)
    .replace(/[۰-۹]/g, (c) => "۰۱۲۳۴۵۶۷۸۹".indexOf(c))
    .replace(/[٠-٩]/g, (c) => "٠١٢٣٤٥٦٧٨٩".indexOf(c))
    .replace(/[,٬،\s]/g, "");
const parseAmt = (s, z) => {
  const t = P(s);
  // حداکثر ۶ رقم اعشار، هم‌تراز با Decimal(20,6) دیتابیس.
  if (!/^\d{1,14}(?:\.\d{1,6})?$/.test(t)) return null;
  const n = Number(t);
  return n >= (z ? 0 : 0.000001) && n <= 1e13 ? n : null;
};
const okDate = (s) =>
  /^\d{4}-\d\d-\d\d$/.test(s) &&
  new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;
const addDays = (iso, n) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const jf = new Intl.DateTimeFormat("en-u-ca-persian-nu-latn", {
  year: "numeric",
  month: "numeric",
  day: "numeric",
  timeZone: "UTC",
});
const jp = (iso) => {
  const o = {};
  jf.formatToParts(new Date(iso + "T00:00:00Z")).forEach(
    (p) => (o[p.type] = parseInt(p.value)),
  );
  return { y: o.year, m: o.month, d: o.day };
};
const range = (iso) => {
  const j = jp(iso),
    s = addDays(iso, 1 - j.d);
  let e = addDays(s, 28);
  while (jp(addDays(e, 1)).m === j.m) e = addDays(e, 1);
  return { s, e };
};
const shift = (iso, k) => {
  for (; k > 0; k--) iso = addDays(range(iso).e, 1);
  for (; k < 0; k++) iso = addDays(range(iso).s, -1);
  return iso;
};
const nextDate = (iso, f) => {
  if (f === "weekly") return addDays(iso, 7);
  const d = jp(iso).d,
    n = addDays(range(iso).e, 1);
  return addDays(n, Math.min(d, jp(range(n).e).d) - 1);
};
const inR = (t, r) => t.date >= r.s && t.date <= r.e;
const balances = (S) => {
  const b = {};
  S.accounts.forEach((a) => (b[a.id] = a.opening));
  S.tx.forEach((t) => {
    if (t.type === "income") b[t.acc] += t.amount;
    else if (t.type === "expense") b[t.acc] -= t.amount;
    else {
      b[t.acc] -= t.amount;
      b[t.to] += t.amount;
    }
  });
  return b;
};
const sum = (o) => Object.values(o).reduce((x, y) => x + y, 0);
const totals = (tx) => {
  let i = 0,
    e = 0;
  tx.forEach((t) => {
    if (t.type === "income") i += t.amount;
    if (t.type === "expense") e += t.amount;
  });
  return { i, e, n: i - e };
};
const byCat = (tx) => {
  const m = {};
  tx.filter((t) => t.type === "expense").forEach(
    (t) => (m[t.cat] = (m[t.cat] || 0) + t.amount),
  );
  return m;
};
const budget = (spent, limit) => ({
  pct: limit ? Math.round((spent / limit) * 100) : 0,
  left: limit - spent,
  lvl: spent > limit ? 2 : spent >= limit * 0.8 ? 1 : 0,
});
// مانده و سهم ماهانه بر اساس موجودی مشتق‌شده از مشارکت‌ها محاسبه می‌شود.
const goalNeed = (g, t) => {
  const saved = DaraGoals.savedOf(g);
  const target = Number.isSafeInteger(g.target) ? g.target : 0;
  const left = Math.max(0, target - saved);
  if (!g.date || !left) return { left, m: null, months: 0 };
  const a = jp(t),
    b = jp(g.date),
    months = Math.max(1, (b.y - a.y) * 12 + b.m - a.m);
  return { left, months, m: Math.ceil(left / months), late: g.date <= t };
};
const occ = (r, a, b) => {
  const o = [];
  let d = r.next,
    n = 0;
  while (d <= b && n++ < 400) {
    if (d >= a) o.push(d);
    d = nextDate(d, r.freq);
  }
  return o;
};
const forecast = (S, t, planned = 0) => {
  const r = range(t),
    bal = sum(balances(S));
  let inc = 0,
    exp = 0;
  S.rec.forEach((x) => {
    const n = occ(x, r.s, r.e).length;
    if (x.type === "income") inc += n * x.amount;
    else exp += n * x.amount;
  });
  const el = jp(t).d,
    left = jp(r.e).d - el,
    sf = totals(S.tx.filter((x) => inR(x, { s: r.s, e: t }))).e,
    pace = Math.round((sf / el) * left),
    base = bal - 0 + inc - exp - planned;
  return { bal, inc, exp, planned, base, pace, withPace: base - pace };
};
/*ENDCORE*/
let K = `dara.v2.${window.DARA_USER_ID}`;
const uid = () => crypto.randomUUID(),
  $ = (id) => document.getElementById(id);
const today = () =>
  new Date(Date.now() - new Date().getTimezoneOffset() * 6e4)
    .toISOString()
    .slice(0, 10);
const E = (s) =>
  String(s ?? "").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
const nf = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 6 }),
  M = (n) => nf.format(n) + " " + S.cur;
const fd = (i) =>
  new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(i + "T00:00:00Z"));
const fmn = (i) =>
  new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(i + "T00:00:00Z"));
const CATS = [
  ["food", "خوراک"],
  ["trans", "حمل‌ونقل"],
  ["home", "مسکن"],
  ["bills", "قبوض"],
  ["fun", "تفریح"],
  ["health", "سلامت"],
  ["edu", "آموزش"],
  ["shop", "خرید"],
  ["oth", "سایر"],
];
// حالت اولیه: همه‌چیز خالی است و کاربر خودش مقدار می‌دهد.
// فقط یک حساب «نقد» با موجودی صفر و چند دسته‌بندی پیش‌فرض وجود دارد.
const newState = (cur = "تومان") => ({
  v: 3,
  cur,
  accounts: [{ id: uid(), name: "نقد", type: "cash", opening: 0 }],
  cats: CATS.map((c) => ({
    id: uid(),
    name: c[1],
    kind: "expense",
    emoji: DaraEmoji.defaultForCategory(c[1]),
  })).concat([
    { id: uid(), name: "حقوق", kind: "income", emoji: DaraEmoji.defaultForCategory("حقوق") },
    { id: uid(), name: "درآمد جانبی", kind: "income", emoji: DaraEmoji.defaultForCategory("درآمد جانبی") },
  ]),
  tx: [],
  budgets: {},
  goals: [],
  rec: [],
});
// دسته‌بندی‌های قدیمی بدون ایموجی، ایموجی پیش‌فرض متناسب می‌گیرند (یک‌بار ذخیره می‌شود).
const withCategoryEmojis = (state) => {
  if (!state || !Array.isArray(state.cats)) return { state, changed: false };
  let changed = false;
  const cats = state.cats.map((category) => {
    if (!category || typeof category !== "object") return category;
    const emoji = DaraGoals.normalizeEmoji(category.emoji) || DaraEmoji.defaultForCategory(category.name);
    if (category.emoji === emoji) return category;
    changed = true;
    return { ...category, emoji };
  });
  return { state: changed ? { ...state, cats } : state, changed };
};
// state نسخهٔ ۲ (اهداف با saved) هنگام بارگذاری به مدل مشارکتی مهاجرت می‌کند؛
// مهاجرت idempotent است و دادهٔ سایر بخش‌ها دست‌نخورده می‌ماند.
let stateUpgraded = false;
const loadState = () => {
  let raw = null;
  try {
    raw = JSON.parse(localStorage.getItem(K));
  } catch {
    raw = null;
  }
  const migrated = DaraGoals.migrateState(raw, today());
  if (migrated.changed) stateUpgraded = true;
  if (!migrated.state) return newState();
  const normalized = withCategoryEmojis(migrated.state);
  if (normalized.changed) stateUpgraded = true;
  return normalized.state;
};
let S = loadState();
const persist = () => {
  try {
    localStorage.setItem(K, JSON.stringify(S));
  } catch (error) {
    Cloud.syncError =
      error instanceof Error ? `ذخیرهٔ محلی ناموفق بود: ${error.message}` : "ذخیرهٔ محلی ناموفق بود.";
    return;
  }
  if (Cloud.status === "in") window.DARA_SYNC_WORKSPACE?.("dashboard", S);
};
let ui = {
  page: "dash",
  off: 0,
  plan: 0,
  chat: [],
  q: "",
  flash: "",
  ft: "",
  fc: "",
  fa: "",
};
const cn = (id) => (S.cats.find((c) => c.id === id) || { name: "—" }).name,
  an = (id) => (S.accounts.find((a) => a.id === id) || { name: "—" }).name;
// ایموجی هدف/دسته: انتخاب کاربر یا پیش‌فرض متناسب با نام.
const goalEmoji = (goal) =>
  DaraGoals.normalizeEmoji(goal.emoji) || DaraEmoji.defaultForGoal(goal.name);
const categoryEmoji = (category) =>
  (category &&
    (DaraGoals.normalizeEmoji(category.emoji) || DaraEmoji.defaultForCategory(category.name))) ||
  DaraEmoji.FALLBACK_CATEGORY;
const categoryById = (id) => S.cats.find((category) => category.id === id) || null;
const catText = (id) => {
  const category = categoryById(id);
  return category ? `${categoryEmoji(category)} ${category.name}` : "—";
};
const accO = () => S.accounts.map((a) => [a.id, a.name]),
  catO = () =>
    S.cats.map((c) => [
      c.id,
      `${categoryEmoji(c)} ${c.name}${c.kind === "income" ? " (درآمد)" : ""}`,
    ]);
const bar = (p, l) =>
    `<div class=bar><i class="l${l || 0}" style="width:${Math.min(100, p)}%"></i></div>`,
  card = (t, b) => `<section class=card><h3>${t}</h3>${b}</section>`;
const kpi = (l, v, c = "") =>
    `<div class="card kpi"><small>${l}</small><b class="${c}">${v}</b></div>`,
  none = (t) => `<p class=mu>${t}</p>`;
const per = () => {
  const b = shift(today(), ui.off);
  return { b, r: range(b) };
};
const pnav = () =>
  `<div class=top><h2 style="margin:0">${fmn(per().b)}</h2><span><button class=b onclick="A.sh(-1)">ماه قبل</button> <button class=b onclick="A.sh(0)">این ماه</button> <button class=b onclick="A.sh(1)">ماه بعد</button></span></div>`;
const form = (t, f, v, save) => {
  const dl = $("dlg");
  // فیلدهای پولی همه از همان ورودی مشترک data-money استفاده می‌کنند (فرمت زنده + پیش‌نمایش).
  const fieldHtml = (x) => {
    if (x.t === "sel")
      return `<label>${x.l}<select name=${x.k}>${x.o.map((o) => `<option value="${E(o[0])}"${o[0] == v[x.k] ? " selected" : ""}>${E(o[1])}</option>`).join("")}</select></label>`;
    if (x.t === "emoji") return `<div class="emoji-field-label">${x.l}</div>${emojiPickerHtml(x.k, v[x.k] || "", DaraEmoji.FALLBACK_CATEGORY)}`;
    if (x.t === "amt") {
      const amount = DaraGoals.parseMoney(v[x.k]);
      return `<label>${x.l}<input name=${x.k} inputmode="numeric" autocomplete="off" data-money value="${amount ? E(DaraGoals.formatMoney(amount)) : ""}"></label><small class="money-words" data-money-words aria-live="polite"></small>`;
    }
    return `<label>${x.l}<input name=${x.k} type="${x.t === "date" ? "date" : "text"}" value="${E(v[x.k] ?? "")}"></label>`;
  };
  dl.innerHTML = `<form><h3>${t}</h3>${f.map(fieldHtml).join("")}<p class=err id=er></p><div class=acts><button class=pri>ذخیره</button><button type=button class=b onclick="$('dlg').close()">انصراف</button></div></form>`;
  enhanceMoneyInputs(dl);
  f.filter((field) => field.t === "emoji").forEach((field) => bindEmojiPicker(dl, field.k, DaraEmoji.FALLBACK_CATEGORY));
  const fo = dl.querySelector("form");
  fo.onsubmit = (e) => {
    e.preventDefault();
    const m = save(Object.fromEntries(new FormData(fo)));
    if (m) $("er").textContent = m;
    else {
      dl.close();
      persist();
      R();
    }
  };
  dl.showModal();
};
// داده‌های حساب از API دارا خوانده و در PostgreSQL همان حساب ذخیره می‌شوند.
const Cloud = {
  user: null,
  status: "loading",
  err: "",
  syncError: "",
  authNotice: "",
  authMode: "login",
  workspaceValues: new Map(),
  workspaceSyncing: new Set(),
};
const api = async (method, path, body) => {
  let r;
  try {
    r = await fetch("/api" + path, {
      method,
      credentials: "same-origin",
      headers: {
        "X-Requested-With": "dara",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    const e = new Error("ارتباط با سرور برقرار نشد.");
    e.status = 0;
    throw e;
  }
  const data = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) {
    const e = new Error(
      (data && data.fields && Object.values(data.fields)[0]) ||
        (data && data.message) ||
        "درخواست ناموفق بود.",
    );
    e.status = r.status;
    e.code = data && data.code;
    throw e;
  }
  return data;
};
const syncWorkspace = (key, data) => {
  if (Cloud.status !== "in") return;
  if (key === "dashboard" && data && typeof data === "object" && !Array.isArray(data)) {
    data = { ...data };
    delete data.tx;
  }
  Cloud.workspaceValues.set(key, data);
  if (Cloud.workspaceSyncing.has(key)) return;
  Cloud.workspaceSyncing.add(key);
  const flush = async () => {
    while (Cloud.workspaceValues.has(key)) {
      const current = Cloud.workspaceValues.get(key);
      Cloud.workspaceValues.delete(key);
      try {
        await api("PUT", "/finance/workspace/" + key, { data: current });
        Cloud.syncError = "";
      } catch (error) {
        if (!Cloud.workspaceValues.has(key)) Cloud.workspaceValues.set(key, current);
        Cloud.syncError = error.message;
        Cloud.workspaceSyncing.delete(key);
        R();
        return;
      }
    }
    Cloud.workspaceSyncing.delete(key);
  };
  void flush();
};
window.DARA_SYNC_WORKSPACE = syncWorkspace;
// مبالغ داشبورد به «تومان» است و ارز پایهٔ حساب ریال؛ هر تومان ده ریال است.
const factor = () =>
  Cloud.user && Cloud.user.primary_currency === "IRR" && S.cur === "تومان" ? 10 : 1;
// واحد نمایش فقط می‌تواند یکی از واحدهای ارز اصلی باشد؛ تغییر نام واحد هرگز به معنی تبدیل ارز نیست.
const displayUnits = () => {
  const primary = Cloud.user && Cloud.user.primary_currency;
  return !primary || primary === "IRR" ? ["تومان", "ریال"] : [primary];
};
const ACC_T = { cash: "CASH", bank: "BANK", savings: "SAVINGS", investment: "INVESTMENT" };
const accDto = (a) => ({
  id: a.id,
  name: a.name,
  type: ACC_T[a.type] || "CASH",
  // ضرب دقیق اعشاری؛ Math.round قبلی برای ارزهای غیر ریال باعث از دست رفتن اعشار می‌شد.
  opening_balance: DaraMoney.multiply(a.opening || 0, factor()),
});
const txDto = (t) => {
  const accs = [t.acc, t.to].filter(Boolean).map((id) => S.accounts.find((a) => a.id === id));
  const c = t.cat ? S.cats.find((x) => x.id === t.cat) : null;
  return {
    transaction: {
      id: t.id,
      kind: t.type.toUpperCase(),
      amount: DaraMoney.multiply(t.amount, factor()),
      occurred_on: t.date,
      account_id: t.acc,
      target_id: t.to || null,
      category_id: t.cat || null,
      description: t.desc || "",
      note: t.note || "",
    },
    accounts: accs.filter(Boolean).map(accDto),
    category: c ? { id: c.id, name: c.name, kind: c.kind.toUpperCase() } : null,
  };
};
window.DARA_IMPORT_TRANSACTIONS = (transactions) =>
  api("POST", "/finance/transactions/import", {
    accounts: S.accounts.map(accDto),
    categories: S.cats.map((category) => ({
      id: category.id,
      name: category.name,
      kind: category.kind.toUpperCase(),
    })),
    transactions: transactions.map((transaction) => txDto(transaction).transaction),
  });
// تغییر را فوراً نمایش می‌دهد و اگر ذخیره در سرور شکست خورد، به حالت قبل برمی‌گرداند.
// در حالت مهمان/بدون نشست، هیچ درخواستی فرستاده نمی‌شود و داده فقط در localStorage می‌ماند.
const cloudWrite = (prevTx, work) => {
  if (Cloud.status !== "in") return;
  work().catch((e) => {
    S.tx = prevTx;
    persist();
    R();
    alert("ذخیره در پایگاه داده ناموفق بود: " + e.message);
  });
};
const cloudSaveTx = (prevTx, t) =>
  cloudWrite(prevTx, () => api("PUT", "/finance/transactions/" + t.id, txDto(t)));
async function cloudLoad() {
  const L = await api("GET", "/finance/ledger");
  K = `dara.v2.${Cloud.user.id}`;
  let local;
  try {
    local = JSON.parse(localStorage.getItem(K));
  } catch {}
  // دادهٔ قدیمی همین حساب (v2) پیش از استفاده مهاجرت می‌شود؛ نسخهٔ جدید هرگز با دادهٔ قدیمی بازنویسی نمی‌شود.
  const migrated = DaraGoals.migrateState(local, today());
  if (migrated.changed) stateUpgraded = true;
  S = migrated.state ?? newState();
  // واحد نمایش ذخیره‌شده اگر با ارز اصلی نخواند، به واحد معتبر برمی‌گردد تا مبالغ بدتفسیر نشوند.
  if (!displayUnits().includes(S.cur)) S.cur = displayUnits()[0];
  const f = factor();
  const sa = L.accounts.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type.toLowerCase(),
    opening: Number(DaraMoney.divide(a.opening_balance, f)),
  }));
  S.accounts = sa.concat(S.accounts.filter((a) => !sa.some((x) => x.id === a.id)));
  const sc = L.categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind.toLowerCase() }));
  S.cats = sc.concat(S.cats.filter((c) => !sc.some((x) => x.id === c.id)));
  S.tx = L.transactions.map((t) => ({
    id: t.id,
    type: t.kind.toLowerCase(),
    amount: Number(DaraMoney.divide(t.amount, f)),
    date: t.occurred_on,
    acc: t.account_id,
    to: t.target_id,
    cat: t.category_id,
    desc: t.description,
    note: t.note,
  }));
  Cloud.status = "in";
  window.DARA_IS_AUTHENTICATED = true;
  persist();
  R();
}
async function cloudBoot() {
  try {
    Cloud.user = await api("GET", "/me");
    if (window.DARA_BOOT_ERROR) throw new Error(window.DARA_BOOT_ERROR);
  } catch (e) {
    Cloud.status = e.status === 401 && !window.DARA_BOOT_ERROR ? "out" : "offline";
    R();
    return;
  }
  try {
    await cloudLoad();
  } catch (e) {
    Cloud.status = "offline";
    Cloud.err = e.message;
    R();
  }
}
// ورود با نام کاربری و گذرواژه است؛ ورود Google بعداً به همین کارت اضافه می‌شود.
const googleButton = () =>
  `<button class="b auth-google" type="button" disabled title="به‌زودی">ورود با Google (به‌زودی)</button>`;
const authNotice = () =>
  Cloud.authNotice
    ? `<p class="phase5-status" role="status">${E(Cloud.authNotice)}</p>`
    : "";
const authTabs = () =>
  `<p class=auth-tabs><button type=button class="${Cloud.authMode === "login" ? "pri" : "b"}" onclick="A.authMode('login')">ورود</button> <button type=button class="${Cloud.authMode === "register" ? "pri" : "b"}" onclick="A.authMode('register')">ثبت‌نام</button></p>`;
const loginForm = () => card(
  "ورود",
  `<form onsubmit="A.login(event)">
    <label>نام کاربری<input name=username autocomplete=username autocapitalize=none spellcheck=false minlength=3 maxlength=32 required></label>
    <label>گذرواژه<input name=password type=password autocomplete=current-password required></label>
    <label class=phase5-check><input name=remember type=checkbox checked> مرا به خاطر بسپار</label>
    <p class=err id=le role=alert></p>
    <button class=pri>ورود</button>
  </form>
  <p class=mu><button type=button class=auth-link onclick="A.authMode('forgot')">گذرواژه را فراموش کرده‌ام</button></p>
  ${googleButton()}`,
);
const registerForm = () => card(
  "ساخت حساب",
  `<form onsubmit="A.register(event)">
    <label>نام نمایشی (اختیاری)<input name=first_name autocomplete=nickname maxlength=50></label>
    <label>نام کاربری<input name=username autocomplete=username autocapitalize=none spellcheck=false minlength=3 maxlength=32 required></label>
    <p class=mu>با حرف شروع شود؛ حرف، عدد، نقطه، خط تیره و زیرخط مجاز است.</p>
    <label>گذرواژه (حداقل ۱۰ کاراکتر، شامل حرف و عدد)<input name=password type=password autocomplete=new-password minlength=10 required></label>
    <label>تکرار گذرواژه<input name=confirm type=password autocomplete=new-password minlength=10 required></label>
    <label>ایمیل برای بازیابی گذرواژه (اختیاری)<input name=email type=email autocomplete=email maxlength=254></label>
    <label class=phase5-check><input name=accepted_terms type=checkbox required> <a href="/terms" target=_blank>شرایط استفاده</a> را می‌پذیرم</label>
    <p class=err id=re role=alert></p>
    <button class=pri>ساخت حساب</button>
  </form>
  ${googleButton()}`,
);
const authPageBody = () => {
  if (Cloud.status === "loading")
    return card("دارا", "<p>در حال بررسی ورود…</p>");
  if (Cloud.status === "offline")
    return card(
      "سرور در دسترس نیست",
      `<p>${E(Cloud.err || "ارتباط با سرور برقرار نشد؛ ذخیره‌سازی آنلاین در دسترس نیست.")}</p><button class=b onclick="location.reload()">تلاش دوباره</button> <button class=pri onclick="A.continueAsGuest()">ادامه به عنوان مهمان</button>`,
    );
  const resetToken = new URLSearchParams(location.search).get("reset");
  if (resetToken)
    return card(
      "تعیین گذرواژهٔ جدید",
      `<form onsubmit="A.resetPassword(event)"><label>گذرواژهٔ جدید<input name=password type=password autocomplete=new-password minlength=10 required></label><label>تکرار گذرواژهٔ جدید<input name=confirm type=password autocomplete=new-password minlength=10 required></label><p class=mu>حداقل ۱۰ کاراکتر و شامل حرف و عدد.</p><p class=err id=rp role=alert></p><button class=pri>ذخیرهٔ گذرواژه</button></form>`,
    );
  if (Cloud.authMode === "forgot")
    return card(
      "بازیابی گذرواژه",
      `<p class=mu>لینک بازیابی فقط برای حسابی ارسال می‌شود که ایمیل ثبت کرده باشد. اگر بدون ایمیل ثبت‌نام کرده‌اید، از نام کاربری و گذرواژهٔ خود استفاده کنید.</p><form onsubmit="A.forgotPassword(event)"><label>ایمیل<input name=email type=email autocomplete=email required></label><p class=err id=fe role=alert></p><button class=pri>ارسال لینک</button> <button type=button class=b onclick="A.authMode('login')">بازگشت</button></form>`,
    );
  if (Cloud.authMode === "register")
    return `<h2>ساخت حساب دارا</h2><p class=mu>با نام کاربری و گذرواژه حساب بسازید؛ برای شروع کار به ایمیل نیازی نیست. حساب و اطلاعات شما در پایگاه داده ذخیره می‌شوند و از دستگاه‌های دیگر هم قابل دسترسی‌اند.</p><button class=b onclick="A.continueAsGuest()">ادامه بدون حساب (مهمان)</button>${authNotice()}<div class=auth-panel>${authTabs()}${registerForm()}</div>`;
  return `<h2>ورود به دارا</h2><p class=mu>با نام کاربری و گذرواژه وارد شوید. حساب و اطلاعات شما در پایگاه داده ذخیره می‌شوند و از دستگاه‌های دیگر هم قابل دسترسی‌اند.</p><button class=b onclick="A.continueAsGuest()">ادامه بدون حساب (مهمان)</button>${authNotice()}<div class=auth-panel>${authTabs()}${loginForm()}</div>`;
};
// کل صفحهٔ ورود در یک ستون باریک و وسط‌چین نمایش داده می‌شود.
const authPage = () => `<div class=auth-page>${authPageBody()}</div>`;
const signedIn = async (username, password, remember) => {
  await api("POST", "/auth/login", { username, password, remember });
  window.location.reload();
};
const A = {
  continueAsGuest: () => {
    window.location.replace("/legacy/index.html?preview=1");
  },
  openAccount: () => {
    window.location.replace("/legacy/index.html");
  },
  retryWorkspace: () => {
    Cloud.syncError = "";
    for (const [key, data] of Cloud.workspaceValues) syncWorkspace(key, data);
  },
  authMode: (mode) => {
    Cloud.authMode = mode;
    Cloud.authNotice = "";
    R();
  },
  login: async (e) => {
    e.preventDefault();
    const form = e.target;
    const d = Object.fromEntries(new FormData(form));
    const button = form.querySelector("button.pri");
    button.disabled = true;
    try {
      await signedIn(String(d.username || "").trim(), d.password, d.remember === "on");
    } catch (x) {
      $("le").textContent = x.message;
      button.disabled = false;
    }
  },
  register: async (e) => {
    e.preventDefault();
    const form = e.target;
    const d = Object.fromEntries(new FormData(form));
    const password = String(d.password || "");
    if (password !== d.confirm) {
      $("re").textContent = "گذرواژهٔ دوم با گذرواژهٔ اول یکسان نیست.";
      return;
    }
    if (!/\p{L}/u.test(password) || !/\p{N}/u.test(password)) {
      $("re").textContent = "گذرواژه باید شامل حرف و عدد باشد.";
      return;
    }
    const body = {
      first_name: d.first_name || "",
      username: String(d.username || "").trim(),
      password,
      accepted_terms: d.accepted_terms === "on",
    };
    if (d.email) body.email = d.email;
    const button = form.querySelector("button.pri");
    button.disabled = true;
    try {
      // سرور در همان پاسخ نشست را می‌سازد؛ فقط بارگذاری دوباره لازم است.
      await api("POST", "/auth/register", body);
      window.location.reload();
    } catch (x) {
      $("re").textContent = x.message;
      button.disabled = false;
    }
  },
  forgotPassword: async (e) => {
    e.preventDefault();
    const { email } = Object.fromEntries(new FormData(e.target));
    try {
      const result = await api("POST", "/auth/forgot-password", { email });
      $("fe").textContent = result.message;
    } catch (error) {
      $("fe").textContent = error.message;
    }
  },
  resetPassword: async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    const password = String(d.password || "");
    const token = new URLSearchParams(location.search).get("reset");
    if (password !== d.confirm) {
      $("rp").textContent = "گذرواژهٔ دوم با گذرواژهٔ اول یکسان نیست.";
      return;
    }
    if (!/\p{L}/u.test(password) || !/\p{N}/u.test(password)) {
      $("rp").textContent = "گذرواژه باید شامل حرف و عدد باشد.";
      return;
    }
    try {
      const result = await api("POST", "/auth/reset-password", {
        token,
        new_password: password,
      });
      history.replaceState(null, "", "/legacy/index.html");
      Cloud.authMode = "login";
      Cloud.authNotice = result.message;
      R();
    } catch (error) {
      $("rp").textContent = error.message;
    }
  },
  logout: async () => {
    try {
      await api("POST", "/auth/logout");
      window.location.reload();
    } catch (error) {
      alert("خروج از حساب ناموفق بود: " + error.message);
    }
  },
  nav: (p) => {
    ui.page = p;
    R();
    scrollTo(0, 0);
  },
  sh: (k) => {
    ui.off = k ? ui.off + k : 0;
    R();
  },
  tx: (id) => openTransactionDialog(id),
  dtx: (id) => {
    if (confirm("این تراکنش حذف شود؟")) {
      const prevTx = S.tx;
      S.tx = S.tx.filter((t) => t.id !== id);
      persist();
      R();
      cloudWrite(prevTx, () => api("DELETE", "/finance/transactions/" + id));
    }
  },
  bud: (c, v) => {
    if (!v.trim()) delete S.budgets[c];
    else {
      const a = parseAmt(v);
      if (!a) return alert("سقف بودجه باید عددی مثبت باشد.");
      S.budgets[c] = a;
    }
    persist();
    R();
  },
  goal: (id, templateName) => openGoalDialog(id, templateName),
  goalPlan: (goalId) => openPlanDialog(goalId),
  goalPay: (goalId, installmentId) => openPayDialog(goalId, installmentId),
  goalCancelInst: (goalId, installmentId) => {
    if (!confirm("این دوره لغو شود؟ پس‌اندازی برای آن ثبت نمی‌شود.")) return;
    S.goals = S.goals.map((goal) =>
      goal.id === goalId ? DaraGoals.cancelInstallment(goal, installmentId) : goal,
    );
    persist();
    R();
  },
  goalPause: (goalId) => {
    S.goals = S.goals.map((goal) => (goal.id === goalId ? DaraGoals.pausePlan(goal, today()) : goal));
    persist();
    R();
  },
  goalResume: (goalId) => {
    S.goals = S.goals.map((goal) => (goal.id === goalId ? DaraGoals.resumePlan(goal, today()) : goal));
    persist();
    R();
  },
  add: (goalId) => openContributionDialog(goalId, null),
  cedit: (goalId, contributionId) => openContributionDialog(goalId, contributionId),
  cdel: (goalId, contributionId) => {
    if (!confirm("این پس‌انداز حذف شود؟ مبلغ هدف تغییری نمی‌کند.")) return;
    S.goals = S.goals.map((goal) =>
      goal.id === goalId ? DaraGoals.deleteContribution(goal, contributionId) : goal,
    );
    persist();
    R();
  },
  dg: (id) => {
    if (confirm("این هدف و تاریخچهٔ پس‌اندازش حذف شود؟")) {
      S.goals = S.goals.filter((goal) => goal.id !== id);
      persist();
      R();
    }
  },
  rec: () =>
    form(
      "تراکنش تکرارشونده",
      [
        { k: "name", l: "عنوان" },
        {
          k: "type",
          l: "نوع",
          t: "sel",
          o: [
            ["expense", "هزینه"],
            ["income", "درآمد"],
          ],
        },
        { k: "amount", l: "مبلغ", t: "amt" },
        { k: "cat", l: "دسته‌بندی", t: "sel", o: catO() },
        { k: "acc", l: "حساب", t: "sel", o: accO() },
        {
          k: "freq",
          l: "تناوب",
          t: "sel",
          o: [
            ["monthly", "ماهانه (شمسی)"],
            ["weekly", "هفتگی"],
          ],
        },
        { k: "next", l: "تاریخ سررسید بعدی", t: "date" },
      ],
      { next: today() },
      (d) => {
        const a = parseAmt(d.amount),
          c = S.cats.find((c) => c.id === d.cat);
        if (!d.name.trim()) return "عنوان را وارد کنید.";
        if (!a) return "مبلغ معتبر نیست.";
        if (!okDate(d.next)) return "تاریخ معتبر نیست.";
        if (c.kind !== d.type) return "دسته‌بندی با نوع سازگار نیست.";
        S.rec.push({
          id: uid(),
          name: d.name.trim(),
          type: d.type,
          amount: a,
          cat: d.cat,
          acc: d.acc,
          freq: d.freq,
          next: d.next,
        });
      },
    ),
  post: (id) => {
    const r = S.rec.find((x) => x.id === id);
    const prevTx = S.tx.slice();
    S.tx.push({
      id: uid(),
      type: r.type,
      amount: r.amount,
      date: r.next,
      acc: r.acc,
      to: null,
      cat: r.cat,
      desc: r.name,
      note: "از تکرارشونده",
    });
    cloudSaveTx(prevTx, S.tx[S.tx.length - 1]);
    r.next = nextDate(r.next, r.freq);
    persist();
    R();
  },
  dr: (id) => {
    S.rec = S.rec.filter((x) => x.id !== id);
    persist();
    R();
  },
  acct: () =>
    form(
      "حساب جدید",
      [
        { k: "name", l: "نام حساب" },
        {
          k: "type",
          l: "نوع",
          t: "sel",
          o: [
            ["cash", "نقد"],
            ["bank", "بانکی"],
            ["savings", "پس‌انداز"],
          ],
        },
        { k: "op", l: "موجودی اولیه (۰ مجاز)", t: "amt" },
      ],
      { op: "0" },
      (d) => {
        const o = d.op.trim() === "" ? 0 : parseAmt(d.op, 1);
        if (!d.name.trim()) return "نام حساب را وارد کنید.";
        if (o === null) return "موجودی اولیه معتبر نیست.";
        S.accounts.push({
          id: uid(),
          name: d.name.trim(),
          type: d.type,
          opening: o,
        });
      },
    ),
  da: (id) => {
    if (
      S.tx.some((t) => t.acc === id || t.to === id) ||
      S.rec.some((r) => r.acc === id)
    )
      return alert("این حساب تراکنش دارد و قابل حذف نیست.");
    const removed = S.accounts.find((account) => account.id === id);
    if (!removed) return;
    S.accounts = S.accounts.filter((a) => a.id !== id);
    persist();
    R();
    if (Cloud.status === "in") {
      api("DELETE", "/finance/accounts/" + id).catch((error) => {
        if (!S.accounts.some((account) => account.id === id))
          S.accounts = S.accounts.concat(removed);
        persist();
        R();
        alert("حذف حساب از پایگاه داده ناموفق بود: " + error.message);
      });
    }
  },
  cat: () =>
    form(
      "دسته‌بندی سفارشی",
      [
        { k: "name", l: "نام" },
        {
          k: "kind",
          l: "نوع",
          t: "sel",
          o: [
            ["expense", "هزینه"],
            ["income", "درآمد"],
          ],
        },
        { k: "emoji", l: "ایموجی (اختیاری)", t: "emoji" },
      ],
      {},
      (d) => {
        const error = DaraCategories.validate(d.name, d.kind, S.cats);
        if (error) return error;
        S.cats.push({
          ...DaraCategories.create(d.name, d.kind, uid()),
          emoji: DaraGoals.normalizeEmoji(d.emoji),
        });
      },
    ),
  reset: () => {
    if (confirm("همه داده‌ها پاک شود؟ این کار قابل بازگشت نیست.")) {
      S = newState(S.cur);
      persist();
      R();
    }
  },
  cur: (v) => {
    // واحد نمایش از فهرست مجاز انتخاب می‌شود تا مبالغ با واحد ناشناخته ذخیره نشوند.
    const unit = String(v ?? "").trim();
    S.cur = displayUnits().includes(unit) ? unit : displayUnits()[0];
    persist();
    R();
  },
  plan: (v) => {
    ui.plan = parseAmt(v, 1) || 0;
    R();
  },
  ask: (q) => {
    ui.chat.push({ u: 1, t: q }, { t: answer(q) });
    R();
  },
};
const txRow = (t) => {
  const tr = t.type === "transfer",
    s = tr ? "" : t.type === "income" ? "+" : "−";
  return `<li class=row><div><b>${E(t.desc || (t.cat ? catText(t.cat) : "—"))}</b><small>${fd(t.date)} · ${tr ? `از ${E(an(t.acc))} به ${E(an(t.to))}` : E(cn(t.cat)) + " · " + E(an(t.acc))}</small></div><span class="${tr ? "mu" : t.type === "income" ? "pos" : "neg"}">${s}${M(t.amount)}</span><span><button class=b onclick="A.tx('${t.id}')">ویرایش</button> <button class=b onclick="A.dtx('${t.id}')">حذف</button></span></li>`;
};
const budRows = (bc, only) =>
  Object.entries(S.budgets)
    .map(([c, l]) => {
      const s = bc[c] || 0,
        x = budget(s, l);
      return `<div><div class=row style="border:0;padding:2px 0"><span>${E(catText(c))}</span><small>${M(s)} از ${M(l)} (${nf.format(x.pct)}٪)</small></div>${bar(x.pct, x.lvl)}${x.lvl ? `<span class="tag ${x.lvl > 1 ? "r" : ""}">${x.lvl > 1 ? "بیش از سقف: " + M(-x.left) : "نزدیک سقف: " + M(x.left) + " باقی است"}</span>` : ""}</div>`;
    })
    .join("") ||
  none("هنوز بودجه‌ای تعیین نشده است؛ از صفحه بودجه‌ها شروع کنید.");
// ─── اهداف پس‌انداز: اجزای رابط کاربری ────────────────────────────────────────
const faNum = (value) => nf.format(value);

const openDialog = (html) => {
  const dialog = $("dlg");
  dialog.innerHTML = html;
  enhanceMoneyInputs(dialog);
  dialog.showModal();
  return dialog;
};

const setFieldError = (scope, field, message) => {
  const element = scope.querySelector(`[data-error="${field}"]`);
  if (element) element.textContent = message;
};

// ورودی پول: ارقام فارسی/عربی/لاتین و جداکننده را می‌پذیرد و فقط عدد صحیح را برمی‌گرداند.
const moneyFieldHtml = (name, label, value) =>
  `<label>${label}<input name="${name}" inputmode="numeric" autocomplete="off" value="${value ? E(DaraGoals.formatMoney(value)) : ""}" data-money="${name}"></label><small class="money-words" data-money-words="${name}" aria-live="polite"></small><p class="err" data-error="${name}" role="alert"></p>`;

const moneyValue = (input) => (input ? DaraGoals.parseMoney(input.value) : null);

// یک پیاده‌سازی مشترک برای همهٔ ورودی‌های پولی: جداکنندهٔ سه‌رقمی زنده + پیش‌نمایش فارسی.
// مکان‌نما بر اساس تعداد ارقام قبل از آن حفظ می‌شود تا تایپ/ویرایش طبیعی بماند.
const formatMoneyInput = (input) => {
  const words =
    input.parentElement?.nextElementSibling?.matches?.("[data-money-words]")
      ? input.parentElement.nextElementSibling
      : input.nextElementSibling?.matches?.("[data-money-words]")
        ? input.nextElementSibling
        : null;
  const raw = input.value;
  const caret = input.selectionStart ?? raw.length;
  const digitsBefore = raw.slice(0, caret).replace(/[^\d۰-۹٠-٩]/g, "").length;
  const amount = DaraGoals.parseMoney(raw);
  if (!amount) {
    if (words) words.textContent = raw.trim() ? "مبلغ معتبر نیست." : "";
    return;
  }
  input.value = DaraGoals.formatMoney(amount);
  let seen = 0;
  let position = 0;
  while (position < input.value.length && seen < digitsBefore) {
    if (/[0-9]/.test(input.value[position])) seen += 1;
    position += 1;
  }
  input.setSelectionRange(position, position);
  if (words) words.textContent = DaraGoals.moneyPreview(amount, S.cur);
};

// هر ورودی data-money را یک‌بار آماده می‌کند و پیش‌نمایش مقدار اولیه را می‌سازد.
const enhanceMoneyInputs = (scope) => {
  (scope ?? document).querySelectorAll("input[data-money]").forEach((input) => {
    if (input.dataset.moneyReady) {
      const amount = DaraGoals.parseMoney(input.value);
      const words = input.parentElement?.nextElementSibling;
      if (words?.matches?.("[data-money-words]") && amount)
        words.textContent = DaraGoals.moneyPreview(amount, S.cur);
      return;
    }
    input.dataset.moneyReady = "1";
    let words = input.parentElement?.nextElementSibling;
    if (!words?.matches?.("[data-money-words]")) {
      words = document.createElement("small");
      words.className = "money-words";
      words.setAttribute("data-money-words", "");
      words.setAttribute("aria-live", "polite");
      if (input.parentElement?.parentElement) input.parentElement.after(words);
    }
    const amount = DaraGoals.parseMoney(input.value);
    if (amount) input.value = DaraGoals.formatMoney(amount);
    if (words) words.textContent = amount ? DaraGoals.moneyPreview(amount, S.cur) : "";
  });
};

// یک شنوندهٔ سراسری برای همهٔ فیلدهای پولی (حتی آن‌هایی که بعداً رندر می‌شوند).
document.addEventListener("input", (event) => {
  const input = event.target?.closest?.("input[data-money]");
  if (input) formatMoneyInput(input);
});

// انتخاب تاریخ شمسی با سه select؛ تعداد روزها با ماه/سال (و کبیسه) هماهنگ می‌شود.
const datePickerHtml = (iso, options = {}) => {
  const todayJalali = DaraGoals.isoToJalali(today()) ?? { jy: 1404, jm: 1, jd: 1 };
  const selected = iso ? DaraGoals.isoToJalali(iso) : null;
  const active = selected ?? { jy: todayJalali.jy, jm: todayJalali.jm, jd: todayJalali.jd };
  const yearsBack = options.yearsBack ?? 0;
  const yearsForward = options.yearsForward ?? 10;
  const minYear = Math.min(todayJalali.jy - yearsBack, active.jy);
  const maxYear = Math.max(todayJalali.jy + yearsForward, active.jy);
  const years = [];
  for (let year = minYear; year <= maxYear; year += 1) years.push(year);
  return `<div class="date-picker" data-date-picker>
    <label>سال<select data-date-year>${years.map((year) => `<option value="${year}"${year === active.jy ? " selected" : ""}>${faNum(year)}</option>`).join("")}</select></label>
    <label>ماه<select data-date-month>${DaraGoals.JALALI_MONTHS.map((name, index) => `<option value="${index + 1}"${index + 1 === active.jm ? " selected" : ""}>${name}</option>`).join("")}</select></label>
    <label>روز<select data-date-day data-selected="${active.jd}"></select></label>
  </div>`;
};

const bindDatePicker = (scope) => {
  const yearEl = scope.querySelector("[data-date-year]");
  const monthEl = scope.querySelector("[data-date-month]");
  const dayEl = scope.querySelector("[data-date-day]");
  const fillDays = () => {
    const length = DaraGoals.jalaliMonthLength(Number(yearEl.value), Number(monthEl.value));
    // روز انتخاب‌شده (یا روز اولیه از تاریخ موجود) حفظ می‌شود و فقط با طول ماه جدید محدود می‌شود.
    const previous = Number(dayEl.value) || Number(dayEl.dataset.selected) || 1;
    const selected = Math.min(previous, length);
    dayEl.dataset.selected = String(selected);
    dayEl.innerHTML = Array.from(
      { length },
      (_, index) =>
        `<option value="${index + 1}"${index + 1 === selected ? " selected" : ""}>${faNum(index + 1)}</option>`,
    ).join("");
  };
  yearEl.addEventListener("change", fillDays);
  monthEl.addEventListener("change", fillDays);
  fillDays();
  return {
    value: () =>
      DaraGoals.jalaliToIso(Number(yearEl.value), Number(monthEl.value), Number(dayEl.value)),
    focus: () => yearEl.focus(),
  };
};

// ─── انتخابگر ایموجی مشترک (اهداف، دسته‌بندی‌ها) ─────────────────────────────
const PLAN_PERIOD_LABELS = { daily: "روزانه", weekly: "هفتگی", monthly: "ماهانه" };
const PLAN_STATUS_LABELS = { active: "فعال", paused: "متوقف", completed: "تکمیل‌شده" };
const INSTALLMENT_LABELS = {
  done: "انجام‌شده",
  late: "تأخیردار",
  pending: "در انتظار",
  cancelled: "لغوشده",
  paused: "متوقف",
};

const emojiPickerHtml = (name, selected, fallback) => `<div class="emoji-picker" data-emoji-picker>
  <div class="emoji-current">
    <button type="button" class="b emoji-trigger" data-emoji-trigger><span data-emoji-preview>${E(selected || fallback)}</span> انتخاب ایموجی</button>
    <button type="button" class="b" data-emoji-clear>حذف ایموجی</button>
  </div>
  <input type="hidden" name="${name}" value="${E(selected)}">
  <div class="emoji-panel" data-emoji-panel hidden>
    <input type="search" data-emoji-search placeholder="جست‌وجوی ایموجی…" autocomplete="off">
    <div class="emoji-tabs">${DaraEmoji.CATEGORIES.map((category) => `<button type="button" class="b" data-emoji-tab="${category.key}">${category.label}</button>`).join("")}</div>
    <div class="emoji-grid" data-emoji-grid></div>
  </div>
</div>`;

const bindEmojiPicker = (scope, name, fallback) => {
  const root = scope.querySelector("[data-emoji-picker]");
  if (!root) return { value: () => "" };
  const input = root.querySelector(`input[name="${name}"]`);
  const preview = root.querySelector("[data-emoji-preview]");
  const trigger = root.querySelector("[data-emoji-trigger]");
  const clear = root.querySelector("[data-emoji-clear]");
  const panel = root.querySelector("[data-emoji-panel]");
  const search = root.querySelector("[data-emoji-search]");
  const grid = root.querySelector("[data-emoji-grid]");
  const tabs = Array.from(root.querySelectorAll("[data-emoji-tab]"));
  let activeTab = "home";
  const render = (query) => {
    const list = query ? DaraEmoji.search(query) : DaraEmoji.byCategory(activeTab);
    grid.innerHTML = list.length
      ? list
          .map(
            (emoji) =>
              `<button type="button" class="emoji-item" data-emoji="${emoji}" aria-label="${emoji}">${emoji}</button>`,
          )
          .join("")
      : '<small class="mu">ایموجی‌ای پیدا نشد.</small>';
  };
  tabs.forEach((tab) => {
    tab.onclick = () => {
      activeTab = tab.dataset.emojiTab;
      search.value = "";
      tabs.forEach((entry) => entry.classList.toggle("on", entry === tab));
      render("");
    };
  });
  grid.onclick = (event) => {
    const button = event.target.closest("[data-emoji]");
    if (!button) return;
    input.value = button.dataset.emoji;
    preview.textContent = button.dataset.emoji;
    panel.hidden = true;
  };
  search.oninput = () => render(search.value);
  trigger.onclick = () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) render(search.value);
  };
  clear.onclick = () => {
    input.value = "";
    preview.textContent = fallback || DaraEmoji.FALLBACK_GOAL;
  };
  return { value: () => input.value };
};

// ─── برنامهٔ پس‌انداز ────────────────────────────────────────────────────────
const openPlanDialog = (goalId) => {
  const goal = S.goals.find((entry) => entry.id === goalId);
  if (!goal) return;
  const plan = goal.plan;
  const dialog = openDialog(`<form novalidate>
    <h3>برنامهٔ پس‌انداز «${E(goal.name)}»</h3>
    ${moneyFieldHtml("planAmount", "مبلغ هر دوره", plan ? plan.amount : null)}
    <label>دورهٔ پس‌انداز<select name="period">${Object.entries(PLAN_PERIOD_LABELS)
      .map(
        ([value, label]) =>
          `<option value="${value}"${plan && plan.period === value ? " selected" : ""}>${label}</option>`,
      )
      .join("")}</select></label>
    <fieldset class="goal-date"><legend>تاریخ شروع برنامه</legend>
      <div data-plan-start>${datePickerHtml(plan ? plan.start_date : today())}</div>
      <p class="err" data-error="planStart" role="alert"></p>
    </fieldset>
    <label>وضعیت برنامه<select name="status">${Object.entries(PLAN_STATUS_LABELS)
      .map(
        ([value, label]) =>
          `<option value="${value}"${(plan ? plan.status : "active") === value ? " selected" : ""}>${label}</option>`,
      )
      .join("")}</select></label>
    <p class="mu">با ثبت هر دوره، مبلغ واقعی به مشارکت‌های هدف اضافه می‌شود؛ هیچ تراکنش درآمد/هزینه‌ای خودکار ساخته نمی‌شود.</p>
    <p class="err" data-error="plan" role="alert"></p>
    <div class="acts"><button class="pri">ذخیره</button><button type="button" class="b" data-cancel>انصراف</button>${plan ? '<button type="button" class="b" data-remove>حذف برنامه</button>' : ""}</div>
  </form>`);
  const form = dialog.querySelector("form");
  const amountInput = dialog.querySelector('[data-money="planAmount"]');
  const picker = bindDatePicker(dialog.querySelector("[data-plan-start]"));
  dialog.querySelector("[data-cancel]").onclick = () => dialog.close();
  const remove = dialog.querySelector("[data-remove]");
  if (remove)
    remove.onclick = () => {
      if (!confirm("برنامهٔ پس‌انداز حذف شود؟ مشارکت‌های ثبت‌شده حفظ می‌شوند.")) return;
      S.goals = S.goals.map((entry) =>
        entry.id === goalId ? DaraGoals.removePlan(entry) : entry,
      );
      persist();
      dialog.close();
      R();
    };
  form.onsubmit = (event) => {
    event.preventDefault();
    const amount = moneyValue(amountInput);
    const start = picker.value();
    const period = form.querySelector('[name="period"]').value;
    const status = form.querySelector('[name="status"]').value;
    setFieldError(dialog, "plan", amount ? "" : "مبلغ هر دوره باید عدد صحیح و بزرگ‌تر از صفر باشد.");
    const range = DaraGoals.validateGoalDates(start, goal.date);
    setFieldError(dialog, "planStart", range || "");
    if (!amount) {
      amountInput.focus();
      return;
    }
    if (range) {
      picker.focus();
      return;
    }
    S.goals = S.goals.map((entry) =>
      entry.id === goalId
        ? DaraGoals.applyPlan(
            entry,
            { id: plan ? plan.id : undefined, amount, period, start_date: start, status },
            today(),
          )
        : entry,
    );
    persist();
    dialog.close();
    R();
  };
  amountInput.focus();
};

// ثبت انجام یک دوره: مبلغ واقعی وارد می‌شود و به مشارکت‌ها اضافه می‌گردد.
const openPayDialog = (goalId, installmentId) => {
  const goal = S.goals.find((entry) => entry.id === goalId);
  if (!goal) return;
  const installment = (goal.installments || []).find((entry) => entry.id === installmentId);
  if (!installment) return;
  const dialog = openDialog(`<form novalidate>
    <h3>ثبت پس‌انداز دوره</h3>
    <p class="mu">سررسید ${fd(installment.due)} · مبلغ برنامه ${M(installment.amount)}</p>
    ${moneyFieldHtml("amount", "مبلغ واقعی پس‌انداز", installment.amount)}
    <label>یادداشت (اختیاری)<input name="note" maxlength="200"></label>
    <p class="err" data-error="amount" role="alert"></p>
    <div class="acts"><button class="pri">ثبت پس‌انداز</button><button type="button" class="b" data-cancel>انصراف</button></div>
  </form>`);
  const form = dialog.querySelector("form");
  const amountInput = dialog.querySelector('[data-money="amount"]');
  dialog.querySelector("[data-cancel]").onclick = () => dialog.close();
  form.onsubmit = (event) => {
    event.preventDefault();
    const amount = moneyValue(amountInput);
    if (!amount) {
      setFieldError(dialog, "amount", "مبلغ باید عدد صحیح و بزرگ‌تر از صفر باشد.");
      amountInput.focus();
      return;
    }
    const result = DaraGoals.payInstallment(
      goal,
      installmentId,
      {
        id: uid(),
        amount,
        date: today(),
        note: form.querySelector('[name="note"]').value.trim(),
      },
      today(),
    );
    if (!result.changed) {
      setFieldError(dialog, "amount", "این دوره قبلاً ثبت شده است.");
      return;
    }
    S.goals = S.goals.map((entry) => (entry.id === goalId ? result.goal : entry));
    persist();
    dialog.close();
    ui.flash = "پس‌انداز این دوره ثبت شد. آفرین!";
    R();
  };
  amountInput.focus();
};
const openGoalDialog = (id, templateName) => {
  const existing = id ? S.goals.find((goal) => goal.id === id) : null;
  if (id && !existing) return;
  const saved = existing ? DaraGoals.savedOf(existing) : 0;
  const initialDate = existing ? existing.date : addDays(today(), 90);
  const initialStart = existing ? existing.start_date || existing.created_at || today() : today();
  const initialEmoji = existing ? DaraGoals.normalizeEmoji(existing.emoji) : "";
  const emojiDefault = DaraEmoji.defaultForGoal(existing ? existing.name : templateName || "");
  const dialog = openDialog(`<form novalidate>
    <h3>${existing ? "ویرایش هدف" : "هدف جدید"}</h3>
    <label>نام هدف<input name="name" maxlength="100" value="${E(existing ? existing.name : templateName || "")}"></label>
    <p class="err" data-error="name" role="alert"></p>
    <label>توضیحات (اختیاری)<textarea name="description" rows="2" maxlength="${DaraGoals.DESCRIPTION_MAX}" placeholder="چرا این هدف را انتخاب کرده‌اید؟">${E(existing ? existing.description || "" : "")}</textarea></label>
    ${emojiPickerHtml("emoji", initialEmoji, emojiDefault)}
    ${moneyFieldHtml("target", "مبلغ هدف", existing ? existing.target : null)}
    <fieldset class="goal-date"><legend>تاریخ شروع هدف</legend>
      <div data-start-wrap>${datePickerHtml(initialStart)}</div>
      <p class="err" data-error="start" role="alert"></p>
    </fieldset>
    <fieldset class="goal-date"><legend>تاریخ هدف (اختیاری)</legend>
      <label class="phase5-check"><input type="checkbox" data-no-date${existing && !existing.date ? " checked" : ""}> بدون تاریخ هدف</label>
      <div data-date-wrap>${datePickerHtml(initialDate)}</div>
      <p class="err" data-error="date" role="alert"></p>
    </fieldset>
    <label>اولویت هدف<select name="priority">${priorityOptions(existing ? existing.priority : DaraGoals.DEFAULT_PRIORITY)}</select></label>
    <p class="mu">${saved ? `پس‌انداز فعلی: ${M(saved)} — مبلغ هدف نمی‌تواند کمتر از آن باشد.` : "پس‌اندازها از تاریخچهٔ مشارکت‌ها محاسبه می‌شوند."}</p>
    <div class="acts"><button class="pri">ذخیره</button><button type="button" class="b" data-cancel>انصراف</button></div>
  </form>`);
  const form = dialog.querySelector("form");
  const nameInput = form.querySelector('[name="name"]');
  const targetInput = dialog.querySelector('[data-money="target"]');
  const dateWrap = dialog.querySelector("[data-date-wrap]");
  const picker = bindDatePicker(dateWrap);
  const noDate = dialog.querySelector("[data-no-date]");
  const startPicker = bindDatePicker(dialog.querySelector("[data-start-wrap]"));
  const emoji = bindEmojiPicker(dialog, "emoji", emojiDefault);
  const syncDate = () => {
    dateWrap.hidden = noDate.checked;
  };
  noDate.addEventListener("change", syncDate);
  syncDate();
  dialog.querySelector("[data-cancel]").onclick = () => dialog.close();
  form.onsubmit = (event) => {
    event.preventDefault();
    const name = nameInput.value.trim();
    const description = form.querySelector('[name="description"]').value;
    const target = moneyValue(targetInput);
    const chosenDate = noDate.checked ? "" : picker.value();
    const startDate = startPicker.value();
    setFieldError(dialog, "name", name ? "" : "نام هدف را وارد کنید.");
    setFieldError(dialog, "target", target ? "" : "مبلغ هدف باید عدد صحیح و بزرگ‌تر از صفر باشد.");
    const rangeError = DaraGoals.validateGoalDates(startDate, noDate.checked ? "" : chosenDate);
    setFieldError(dialog, "start", startDate ? rangeError || "" : "تاریخ شروع معتبر نیست.");
    setFieldError(
      dialog,
      "date",
      noDate.checked || (chosenDate && chosenDate > today()) ? "" : "تاریخ هدف باید در آینده باشد.",
    );
    if (!name) {
      nameInput.focus();
      return;
    }
    if (!target) {
      targetInput.focus();
      return;
    }
    if (target < saved) {
      setFieldError(dialog, "target", "مبلغ هدف نمی‌تواند کمتر از مبلغ پس‌انداز‌شده باشد.");
      targetInput.focus();
      return;
    }
    if (!startDate) {
      startPicker.focus();
      return;
    }
    if (rangeError) {
      startPicker.focus();
      return;
    }
    if (!noDate.checked && !chosenDate) {
      setFieldError(dialog, "date", "تاریخ انتخابی معتبر نیست.");
      picker.focus();
      return;
    }
    const priority = DaraGoals.normalizePriority(dialog.querySelector('[name="priority"]').value);
    if (existing)
      S.goals = S.goals.map((goal) =>
        goal.id === existing.id
          ? DaraGoals.updateGoal(goal, {
              name,
              description,
              emoji: emoji.value(),
              target,
              date: chosenDate,
              start_date: startDate,
              priority,
            })
          : goal,
      );
    else
      S.goals = [
        ...S.goals,
        DaraGoals.createGoal(
          { name, description, emoji: emoji.value(), target, date: chosenDate, start_date: startDate, priority },
          { id: uid(), todayIso: today() },
        ),
      ];
    persist();
    dialog.close();
    R();
  };
  nameInput.focus();
};
const openContributionDialog = (goalId, contributionId) => {
  const goal = S.goals.find((entry) => entry.id === goalId);
  if (!goal) return;
  const existing = contributionId
    ? (goal.contributions || []).find((contribution) => contribution.id === contributionId)
    : null;
  const dialog = openDialog(`<form novalidate>
    <h3>${existing ? "ویرایش پس‌انداز" : "ثبت پس‌انداز"}</h3>
    <p class="mu">${E(goal.name)}</p>
    ${moneyFieldHtml("amount", "مبلغ پس‌انداز", existing ? existing.amount : null)}
    <fieldset class="goal-date"><legend>تاریخ پس‌انداز</legend>
      ${datePickerHtml(existing ? existing.date : today(), { yearsBack: 10, yearsForward: 0 })}
      <p class="err" data-error="date" role="alert"></p>
    </fieldset>
    <label>یادداشت (اختیاری)<input name="note" maxlength="200" value="${E(existing ? existing.note : "")}"></label>
    <p class="mu">ثبت پس‌انداز، تراکنش درآمد یا هزینه نمی‌سازد و موجودی حساب‌ها را تغییر نمی‌دهد.</p>
    <div class="acts"><button class="pri">ذخیره</button><button type="button" class="b" data-cancel>انصراف</button></div>
  </form>`);
  const form = dialog.querySelector("form");
  const amountInput = dialog.querySelector('[data-money="amount"]');
  const picker = bindDatePicker(dialog.querySelector("[data-date-picker]"));
  dialog.querySelector("[data-cancel]").onclick = () => dialog.close();
  form.onsubmit = (event) => {
    event.preventDefault();
    const amount = moneyValue(amountInput);
    const date = picker.value();
    setFieldError(dialog, "amount", amount ? "" : "مبلغ پس‌انداز باید عدد صحیح و بزرگ‌تر از صفر باشد.");
    setFieldError(dialog, "date", date && date <= today() ? "" : "تاریخ پس‌انداز نمی‌تواند در آینده باشد.");
    if (!amount) {
      money.focus();
      return;
    }
    if (!date || date > today()) {
      picker.focus();
      return;
    }
    const note = form.querySelector('[name="note"]').value.trim();
    if (existing) {
      S.goals = S.goals.map((entry) =>
        entry.id === goalId
          ? DaraGoals.updateContribution(entry, existing.id, { amount, date, note })
          : entry,
      );
    } else {
      S.goals = S.goals.map((entry) =>
        entry.id === goalId
          ? DaraGoals.addContribution(entry, { id: uid(), amount, date, note })
          : entry,
      );
    }
    persist();
    dialog.close();
    R();
  };
  money.focus();
};

const GOAL_PRIORITY_LABELS = {
  1: "اولویت پایین",
  2: "اولویت متوسط",
  3: "اولویت بالا",
  4: "اولویت خیلی بالا",
};

const priorityOptions = (selected) =>
  DaraGoals.PRIORITIES.map(
    (value) =>
      `<option value="${value}"${DaraGoals.normalizePriority(selected) === value ? " selected" : ""}>${GOAL_PRIORITY_LABELS[value]}</option>`,
  ).join("");

// ─── فرم تراکنش: دسته‌بندی وابسته به نوع + افزودن دستهٔ جدید ─────────────────
const TRANSACTION_TYPES = [
  ["expense", "هزینه"],
  ["income", "درآمد"],
  ["transfer", "انتقال بین حساب‌ها"],
];

const accountOptions = (selected) =>
  accO()
    .map(
      ([id, name]) => `<option value="${E(id)}"${id === selected ? " selected" : ""}>${E(name)}</option>`,
    )
    .join("");

const categoryOptions = (kind, selected) =>
  DaraCategories.ofKind(S.cats, kind)
    .map(
      (category) =>
        `<option value="${E(category.id)}"${category.id === selected ? " selected" : ""}>${E(`${categoryEmoji(category)} ${category.name}`)}</option>`,
    )
    .join("");

const openTransactionDialog = (id) => {
  const existing = id ? S.tx.find((transaction) => transaction.id === id) : null;
  const initial = existing || {
    type: "expense",
    date: today(),
    acc: S.accounts[0]?.id,
    to: S.accounts[1]?.id,
    cat: "",
  };
  // شناسه یک‌بار و هنگام باز شدن فرم ساخته می‌شود؛ دوبار کلیک یا retry همان رکورد را می‌نویسد.
  const txId = existing?.id ?? uid();
  const dialog = openDialog(`<form novalidate>
    <h3>${existing ? "ویرایش تراکنش" : "تراکنش جدید"}</h3>
    <label>نوع<select name="type" data-type>${TRANSACTION_TYPES.map(([value, label]) => `<option value="${value}"${value === initial.type ? " selected" : ""}>${label}</option>`).join("")}</select></label>
    <label>مبلغ (${E(S.cur)})<input name="amount" inputmode="numeric" autocomplete="off" data-money="amount" value="${existing ? E(DaraGoals.formatMoney(existing.amount)) : ""}"></label>
    <small class="money-words" data-money-words aria-live="polite"></small>
    <label>تاریخ (میلادی در ورودی؛ نمایش شمسی)<input name="date" type="date" value="${E(initial.date || today())}"></label>
    <label>حساب (مبدأ)<select name="acc" data-acc>${accountOptions(initial.acc)}</select></label>
    <label data-target-wrap>حساب مقصد<select name="to" data-to>${accountOptions(initial.to)}</select></label>
    <div data-category-wrap>
      <label>دسته‌بندی<select name="cat" data-cat></select></label>
      <button type="button" class="b" data-new-category>+ افزودن دسته‌بندی جدید</button>
      <div data-new-category-box hidden>
        <label>نام دسته‌بندی جدید<input name="newCategory" maxlength="80" autocomplete="off"></label>
        ${emojiPickerHtml("newCategoryEmoji", "", DaraEmoji.FALLBACK_CATEGORY)}
        <p class="err" data-error="newCategory" role="alert"></p>
        <div class="acts"><button type="button" class="b" data-add-category>افزودن</button><button type="button" class="b" data-cancel-category>انصراف</button></div>
      </div>
    </div>
    <label>توضیح<input name="desc" maxlength="200" value="${E(existing?.desc ?? "")}"></label>
    <label>یادداشت (اختیاری)<input name="note" maxlength="1000" value="${E(existing?.note ?? "")}"></label>
    <p class="err" data-error="form" role="alert"></p>
    <div class="acts"><button class="pri">ذخیره</button><button type="button" class="b" data-cancel>انصراف</button></div>
  </form>`);
  const form = dialog.querySelector("form");
  const typeSelect = dialog.querySelector("[data-type]");
  const categoryWrap = dialog.querySelector("[data-category-wrap]");
  const targetWrap = dialog.querySelector("[data-target-wrap]");
  const categorySelect = dialog.querySelector("[data-cat]");
  const newBox = dialog.querySelector("[data-new-category-box]");
  const newInput = newBox.querySelector('[name="newCategory"]');
  const newEmoji = bindEmojiPicker(dialog, "newCategoryEmoji", DaraEmoji.FALLBACK_CATEGORY);

  // با تغییر نوع، فیلدهای نامرتبط پنهان و دسته‌بندی‌ها به همان نوع محدود می‌شوند.
  const syncType = () => {
    const type = typeSelect.value;
    const transfer = type === "transfer";
    targetWrap.hidden = !transfer;
    categoryWrap.hidden = transfer;
    if (transfer) return;
    const previous = categorySelect.value;
    categorySelect.innerHTML = categoryOptions(type, previous);
    const stillValid = DaraCategories.ofKind(S.cats, type).some((category) => category.id === previous);
    if (stillValid) categorySelect.value = previous;
  };
  typeSelect.addEventListener("change", syncType);
  categorySelect.innerHTML = categoryOptions(initial.type, initial.cat);
  syncType();

  dialog.querySelector("[data-new-category]").onclick = () => {
    newBox.hidden = false;
    newInput.focus();
  };
  dialog.querySelector("[data-cancel-category]").onclick = () => {
    newBox.hidden = true;
    newInput.value = "";
    setFieldError(dialog, "newCategory", "");
  };
  dialog.querySelector("[data-add-category]").onclick = () => {
    const type = typeSelect.value;
    if (type === "transfer") return;
    const error = DaraCategories.validate(newInput.value, type, S.cats);
    setFieldError(dialog, "newCategory", error || "");
    if (error) {
      newInput.focus();
      return;
    }
    const category = {
      ...DaraCategories.create(newInput.value, type, uid()),
      emoji: DaraGoals.normalizeEmoji(newEmoji.value()),
    };
    S.cats.push(category);
    // دسته‌بندی فوراً ذخیره و با فضای کاری همگام می‌شود تا بعد از رفرش بماند.
    persist();
    categorySelect.innerHTML = categoryOptions(type, category.id);
    newInput.value = "";
    newBox.hidden = true;
  };

  dialog.querySelector("[data-cancel]").onclick = () => dialog.close();
  form.onsubmit = (event) => {
    event.preventDefault();
    const type = typeSelect.value;
    const amount = moneyValue(dialog.querySelector('[data-money="amount"]'));
    const date = form.querySelector('[name="date"]').value;
    const acc = form.querySelector("[data-acc]").value;
    const to = form.querySelector("[data-to]").value;
    const categoryId = categorySelect.value;
    const fail = (message, field) => {
      setFieldError(dialog, "form", message);
      field?.focus?.();
    };
    if (!amount) return fail("مبلغ باید یک عدد صحیح مثبت باشد.", dialog.querySelector('[data-money="amount"]'));
    if (!okDate(date)) return fail("تاریخ معتبر نیست.", form.querySelector('[name="date"]'));
    if (type === "transfer") {
      if (!to || to === acc) return fail("حساب مبدأ و مقصد باید متفاوت باشند.");
    } else {
      const category = DaraCategories.findById(S.cats, categoryId);
      if (!category || category.kind !== type)
        return fail("دسته‌بندی با نوع تراکنش سازگار نیست.", categorySelect);
    }
    const transfer = type === "transfer";
    const prevTx = S.tx;
    S.tx = S.tx
      .filter((transaction) => transaction.id !== txId)
      .concat({
        id: txId,
        type,
        amount,
        date,
        acc,
        to: transfer ? to : null,
        cat: transfer ? null : categoryId,
        desc: form.querySelector('[name="desc"]').value.trim(),
        note: form.querySelector('[name="note"]').value.trim(),
      });
    cloudSaveTx(prevTx, S.tx[S.tx.length - 1]);
    persist();
    dialog.close();
    R();
  };
  const amountInput = dialog.querySelector('[data-money="amount"]');
  amountInput.focus();
};

const contributionRow = (goalId, contribution) =>
  `<li class="row contrib-row"><div><b>${M(contribution.amount)}</b>${contribution.note ? `<small>${E(contribution.note)}</small>` : ""}${contribution.invalid ? '<small class="neg">این مشارکت نامعتبر است و در جمع حساب نمی‌شود.</small>' : ""}</div><small>${contribution.date ? fd(contribution.date) : "بدون تاریخ"}</small><span><button class="b" onclick="A.cedit('${goalId}','${contribution.id}')">ویرایش</button> <button class="b" onclick="A.cdel('${goalId}','${contribution.id}')">حذف</button></span></li>`;

const goalContributions = (goal) => {
  const items = DaraGoals.sortContributions(goal.contributions || []);
  if (!items.length) return `<p class="mu">هنوز پس‌اندازی ثبت نشده است.</p>`;
  return `<ul class="contrib-list">${items.map((contribution) => contributionRow(goal.id, contribution)).join("")}</ul>`;
};

const GOAL_STATUS_LABELS = {
  completed: "تکمیل‌شده",
  ahead: "جلوتر از برنامه",
  on_track: "طبق برنامه",
  behind: "عقب‌تر از برنامه",
  not_started: "شروع نشده",
  unknown: "وضعیت نامشخص",
};

// متن تخمین: تاریخ ساختگی نمی‌سازد و تخمینی‌بودن را صریح اعلام می‌کند.
const installmentStatusLabel = (status) => INSTALLMENT_LABELS[status] || status;

const goalEstimateText = (estimate, status) => {
  if (status.status === "completed") return "این هدف تکمیل شده است.";
  if (status.status === "not_started") return "این هدف هنوز شروع نشده است.";
  if (estimate.reason === "ok" && estimate.date)
    return `تخمین تکمیل (تخمینی، نه تضمینی): ${fd(estimate.date)} · میانگین سه ماه اخیر ${M(estimate.monthlyAverage)} در ماه`;
  if (estimate.reason === "too_far") return "با نرخ پس‌انداز فعلی، تخمین در بازهٔ معقول نیست.";
  return "برای تخمین زمان تکمیل، اطلاعات کافی از پس‌اندازهای اخیر وجود ندارد.";
};

const goalPlanHtml = (goal) => {
  const summary = DaraGoals.planSummary(goal, today());
  if (!summary) {
    const progress = DaraGoals.progressOf(goal);
    if (progress && progress.completed) return "";
    return `<div class="goal-plan"><button class="b" onclick="A.goalPlan('${goal.id}')">تنظیم برنامهٔ پس‌انداز</button></div>`;
  }
  const warnings = [];
  if (summary.counts.late > 0)
    warnings.push(
      `یک برنامهٔ پس‌انداز معوق داری (${faNum(summary.counts.late)} دوره). برای ادامهٔ برنامه اقدام کن.`,
    );
  if (summary.plan.status === "active") {
    const dueToday = (goal.installments || []).some(
      (installment) =>
        installment.due === today() &&
        DaraGoals.installmentStatus(installment, goal.plan, today()) === "pending",
    );
    if (dueToday) warnings.push("پس‌انداز امروزت هنوز ثبت نشده است.");
  }
  const installments = goal.installments || [];
  const visible = installments
    .filter(
      (installment) =>
        installment.due <= today() || installment === installments[installments.length - 1],
    )
    .slice(-4);
  const rows = visible
    .map((installment) => {
      const status = DaraGoals.installmentStatus(installment, goal.plan, today());
      const canPay = status === "late" || status === "pending";
      return `<div class="installment-row">
        <span>${fd(installment.due)}</span>
        <b>${M(installment.paidAmount || installment.amount)}</b>
        <span class="inst-status inst-${status}">${installmentStatusLabel(status)}</span>
        ${canPay ? `<button class="b" onclick="A.goalPay('${goal.id}', '${installment.id}')">ثبت پرداخت</button>` : ""}
        ${canPay ? `<button class="b" onclick="A.goalCancelInst('${goal.id}', '${installment.id}')">لغو دوره</button>` : ""}
      </div>`;
    })
    .join("");
  const forecast = summary.forecast
    ? ` · تخمین تکمیل با این برنامه: ${fd(summary.forecast.date)}`
    : "";
  return `<div class="goal-plan">
    ${warnings.length ? `<p class="goal-alert" role="status">${warnings.join(" ")}</p>` : ""}
    <p class="goal-plan-line">برنامهٔ ${PLAN_PERIOD_LABELS[summary.plan.period]} · ${M(summary.plan.amount)} هر دوره · وضعیت ${PLAN_STATUS_LABELS[summary.plan.status]} · انجام‌شده ${faNum(summary.counts.done)} · تأخیر ${faNum(summary.counts.late)}</p>
    ${summary.nextDue ? `<small>نزدیک‌ترین سررسید: ${fd(summary.nextDue)}${forecast}</small>` : ""}
    ${rows ? `<div class="installments">${rows}</div>` : ""}
    <div class="goal-plan-actions">
      <button class="b" onclick="A.goalPlan('${goal.id}')">ویرایش برنامه</button>
      ${
        summary.plan.status === "paused"
          ? `<button class="b" onclick="A.goalResume('${goal.id}')">فعال‌سازی برنامه</button>`
          : `<button class="b" onclick="A.goalPause('${goal.id}')">توقف موقت</button>`
      }
    </div>
  </div>`;
};

const goalCard = (goal) => {
  const progress = DaraGoals.progressOf(goal);
  const status = DaraGoals.goalStatus(goal, today());
  const estimate = DaraGoals.estimateCompletion(goal, today());
  const emoji = goalEmoji(goal);
  const actions = `<span><button class="b" onclick="A.goal('${goal.id}')">ویرایش هدف</button> <button class="b" onclick="A.dg('${goal.id}')">حذف</button></span>`;
  const head = `<div class="top"><h3 style="margin:0">${E(emoji)} ${E(goal.name)}</h3>${actions}</div>`;
  if (!progress)
    return `<section class="card goal-card">${head}<p class="err">مبلغ هدف این هدف نامعتبر است؛ آن را ویرایش کنید.</p>${goalContributions(goal)}</section>`;
  const priority = DaraGoals.normalizePriority(goal.priority);
  const badge = `<span class="tag goal-status goal-status-${status.status}">${GOAL_STATUS_LABELS[status.status]}</span> <span class="tag goal-priority goal-priority-${priority}">${GOAL_PRIORITY_LABELS[priority]}</span>`;
  const summary = DaraGoals.planSummary(goal, today());
  const remaining = progress.completed ? "به هدف رسیده‌اید 🎉" : `مانده ${M(progress.remaining)}`;
  const deadline = goal.date ? ` · تاریخ هدف ${fd(goal.date)}` : "";
  const start = goal.start_date ? `شروع ${fd(goal.start_date)}` : "";
  const expected =
    !progress.completed && status.expectedPercent !== null
      ? `<small class="goal-expected">پیشرفت مورد انتظار تا امروز: ${faNum(status.expectedPercent)}٪</small>`
      : "";
  const description = goal.description ? `<p class="goal-desc">${E(goal.description)}</p>` : "";
  const estimateText =
    summary && summary.forecast
      ? ""
      : `<small class="goal-estimate">${goalEstimateText(estimate, status)}</small>`;
  return `<section class="card goal-card">${head}
    ${description}
    <p class="goal-amounts"><b>${M(progress.saved)}</b> از <b>${M(goal.target)}</b> <span class="goal-percent">${faNum(progress.percent)}٪</span> ${badge}</p>
    ${bar(progress.percent)}
    ${expected}
    <small>${remaining}${start ? ` · ${start}` : ""}${deadline}</small>
    ${estimateText}
    ${goalPlanHtml(goal)}
    <button class="b goal-add" onclick="A.add('${goal.id}')">+ ثبت پس‌انداز</button>
    <h4 class="goal-history-title">تاریخچهٔ پس‌انداز</h4>
    ${goalContributions(goal)}
  </section>`;
};
const goalSummaryRow = (goal) => {
  const progress = DaraGoals.progressOf(goal);
  if (!progress)
    return `<div class="row"><div><b>${E(goalEmoji(goal))} ${E(goal.name)}</b><small class="neg">مبلغ هدف نامعتبر است</small></div></div>`;
  return `<div><div class="row" style="border:0;padding:2px 0"><span>${E(goalEmoji(goal))} ${E(goal.name)}</span><small>${M(progress.saved)} از ${M(goal.target)} (${faNum(progress.percent)}٪)</small></div>${bar(progress.percent)}</div>`;
};

const goalsEmpty = () => `<section class="card goal-empty">
  <h3>اولین هدف پس‌اندازتان را بسازید</h3>
  <p class="mu">هدف پس‌انداز یک مقصد مالی است: مبلغ هدف را تعیین می‌کنید و هر بار که پس‌انداز می‌کنید، پیشرفت ثبت می‌شود. این کار تراکنش درآمد یا هزینه نمی‌سازد.</p>
  <p class="mu">برای شروع یکی از قالب‌ها را انتخاب کنید؛ فقط نام هدف پر می‌شود و مبلغ و تاریخ را خودتان تعیین می‌کنید.</p>
  <div class="goal-templates">${DaraGoals.GOAL_TEMPLATES.map((name) => `<button class="b" onclick="A.goal(null, '${name}')">${name}</button>`).join("")}</div>
</section>`;
const recUp = () =>
  S.rec
    .filter((r) => r.next <= addDays(today(), 30))
    .sort((a, b) => (a.next < b.next ? -1 : 1))
    .map(
      (r) =>
        `<li class=row><div><b>${E(r.name)}</b><small>${fd(r.next)}${r.next < today() ? " · سررسید گذشته" : ""}</small></div><span class="${r.type === "income" ? "pos" : "neg"}">${M(r.amount)}</span></li>`,
    )
    .join("") || none("سررسیدی در ۳۰ روز آینده نیست.");
const fcHtml = () => {
  const f = forecast(S, today(), ui.plan),
    e = range(today()).e;
  return card(
    "برآورد پایان ماه (تخمین، نه تضمین)",
    `<p>موجودی امروز (واقعیت ثبت‌شده): <b>${M(f.bal)}</b></p><p>پیش‌بینی تا ${fd(e)}: <b class="${f.base >= 0 ? "pos" : "neg"}">${M(f.base)}</b> <small>= موجودی + درآمدهای تکرارشونده ${M(f.inc)} − هزینه‌های تکرارشونده ${M(f.exp)} − خرید برنامه‌ریزی‌شده ${M(f.planned)}</small></p><p>اگر با همین سرعت ماه جاری خرج کنید: <b class="${f.withPace >= 0 ? "pos" : "neg"}">${M(f.withPace)}</b> <small>(سرعت هزینه تا امروز ≈ ${M(f.pace)} در روزهای باقی‌مانده؛ ممکن است شامل هزینه‌های تکراری ثبت‌شده هم باشد)</small></p><label>خرید برنامه‌ریزی‌شده (${S.cur})<input value="${ui.plan || ""}" onchange="A.plan(this.value)" inputmode=numeric></label><small>فرض‌ها: فقط تراکنش‌های تکرارشونده‌ی سررسیدنشده یا عقب‌افتاده‌ی این ماه لحاظ می‌شوند و درآمد دیگری فرض نمی‌شود.</small>`,
  );
};
const pages = {
  dash() {
    const { r } = per(),
      tx = S.tx.filter((t) => inR(t, r)),
      T = totals(tx),
      bc = byCat(tx),
      bl = balances(S),
      cs = Object.entries(bc).sort((a, b) => b[1] - a[1]),
      mx = cs[0] ? cs[0][1] : 1;
    const ins = [];
    if (cs[0])
      ins.push(
        `بیشترین هزینه شما «${E(cn(cs[0][0]))}» است (${M(cs[0][1])}، ${nf.format(Math.round((cs[0][1] / T.e) * 100))}٪ از هزینه‌ها).`,
      );
    if (T.i > 0)
      ins.push(
        `نرخ پس‌انداز این ماه: ${nf.format(Math.round((T.n / T.i) * 100))}٪ از درآمد ثبت‌شده.`,
      );
    Object.entries(S.budgets).forEach(([c, l]) => {
      if ((bc[c] || 0) > l)
        ins.push(`بودجه «${E(cn(c))}» ${M(bc[c] - l)} بیشتر شده است.`);
    });
    return (
      pnav() +
      `<div class=g>${kpi("موجودی کل حساب‌ها", M(sum(bl)))}${kpi("درآمد", M(T.i), "pos")}${kpi("هزینه", M(T.e), "neg")}${kpi("جریان نقدی خالص", M(T.n), T.n >= 0 ? "pos" : "neg")}</div><div class=g>${card("هزینه به تفکیک دسته", cs.map(([c, v]) => `<div class=row style="border:0;padding:2px 0"><span>${E(catText(c))}</span><small>${M(v)}</small></div>${bar((v / mx) * 100)}`).join("") || none("در این ماه هزینه‌ای ثبت نشده است."))}${card("بودجه‌ها", budRows(bc))}${card("اهداف پس‌انداز", S.goals.map(goalSummaryRow).join("") || none("هنوز هدفی نساخته‌اید."))}${card("سررسیدهای پیش‌رو", `<ul>${recUp()}</ul>`)}</div>${card("بینش‌ها", ins.length ? `<ul>${ins.map((i) => `<li class=row>${i}</li>`).join("")}</ul>` : none("با ثبت چند تراکنش، بینش‌ها اینجا ظاهر می‌شوند."))}${ui.off === 0 ? fcHtml() : ""}${card(
        "آخرین تراکنش‌ها",
        `<ul>${
          S.tx
            .slice()
            .sort((a, b) => (a.date < b.date ? 1 : -1))
            .slice(0, 5)
            .map(txRow)
            .join("") || none("تراکنشی ثبت نشده است.")
        }</ul>`,
      )}`
    );
  },
  tx() {
    const { r } = per(),
      q = ui.q.trim();
    const l = S.tx
        .filter(
          (t) =>
            inR(t, r) &&
            (!ui.ft || t.type === ui.ft) &&
            (!ui.fc || t.cat === ui.fc) &&
            (!ui.fa || t.acc === ui.fa || t.to === ui.fa) &&
            (!q || (t.desc + " " + t.note).includes(q)),
        )
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
      T = totals(l),
      so = (k, o) =>
        `<select onchange="ui.${k}=this.value;R()"><option value="">همه</option>${o.map((x) => `<option value="${E(x[0])}"${ui[k] === x[0] ? " selected" : ""}>${E(x[1])}</option>`).join("")}</select>`;
    return (
      pnav() +
      `<div class=top><h2 style="margin:0">تراکنش‌ها</h2><button class=pri onclick="A.tx()">+ تراکنش جدید</button></div><div class=flt><input placeholder="جستجو…" value="${E(ui.q)}" onchange="ui.q=this.value;R()">${so(
        "ft",
        [
          ["expense", "هزینه"],
          ["income", "درآمد"],
          ["transfer", "انتقال"],
        ],
      )}${so("fc", catO())}${so("fa", accO())}</div>${card("جمع نتایج فیلتر‌شده", `درآمد <b class=pos>${M(T.i)}</b> · هزینه <b class=neg>${M(T.e)}</b> · خالص <b>${M(T.n)}</b> <small>(انتقال‌ها در جمع‌ها نیستند)</small>`)}<section class=card><ul>${l.map(txRow).join("") || none("تراکنشی با این فیلترها پیدا نشد.")}</ul></section>`
    );
  },
  bud() {
    const { r } = per(),
      bc = byCat(S.tx.filter((t) => inR(t, r)));
    return (
      pnav() +
      card(
        "سقف ماهانه هر دسته (خالی = بدون بودجه)",
        S.cats
          .filter((c) => c.kind === "expense")
          .map(
            (c) =>
              `<label>${E(categoryEmoji(c))} ${E(c.name)}<input inputmode=numeric data-money value="${S.budgets[c.id] ? DaraGoals.formatMoney(S.budgets[c.id]) : ""}" placeholder="سقف به ${S.cur}" onchange="A.bud('${c.id}',this.value)"></label>`,
          )
          .join(""),
      ) +
      card("وضعیت این ماه", budRows(bc))
    );
  },
  goals() {
    const help = `<details class="goal-help"><summary>سهم ماهانه چگونه محاسبه می‌شود؟</summary><p>سهم ماهانه = مانده ÷ تعداد ماه‌های شمسی تا تاریخ هدف (حداقل ۱)، بدون سود و تورم. مبلغ هدف مستقل از موجودی حساب‌هاست و ثبت پس‌انداز، تراکنش درآمد یا هزینه نمی‌سازد.</p></details>`;
    const totalSaved = S.goals.reduce((sum, goal) => sum + DaraGoals.savedOf(goal), 0);
    const completed = S.goals.filter((goal) => {
      const progress = DaraGoals.progressOf(goal);
      return progress && progress.completed;
    }).length;
    const active = S.goals.length - completed;
    const stats = S.goals.length
      ? `<div class="goal-stats"><span>${M(totalSaved)} پس‌انداز شده</span><span>${faNum(active)} هدف فعال</span><span>${faNum(completed)} تکمیل‌شده</span></div>`
      : "";
    return `<div class="top"><h2 style="margin:0">اهداف پس‌انداز</h2><button class="pri" onclick="A.goal()">+ هدف جدید</button></div>${stats}${help}${S.goals.length ? S.goals.map(goalCard).join("") : goalsEmpty()}`;
  },
  rec() {
    return `<div class=top><h2 style="margin:0">تراکنش‌های تکرارشونده</h2><button class=pri onclick="A.rec()">+ قانون جدید</button></div><section class=card><ul>${S.rec.map((r) => `<li class=row><div><b>${E(r.name)}</b><small>${r.freq === "weekly" ? "هفتگی" : "ماهانه"} · بعدی: ${fd(r.next)}${r.next <= today() ? " · سررسید شده" : ""}</small></div><span class="${r.type === "income" ? "pos" : "neg"}">${M(r.amount)}</span><span><button class=b onclick="A.post('${r.id}')">ثبت تراکنش</button> <button class=b onclick="A.dr('${r.id}')">حذف</button></span></li>`).join("") || none("قانونی ثبت نشده است.")}</ul></section><small>تراکنشی به‌طور خودکار ساخته نمی‌شود: با «ثبت تراکنش» یک تراکنش ساخته و سررسید بعدی یک دوره جلو می‌رود، پس تکرار دوباره‌ای رخ نمی‌دهد.</small>`;
  },
  assets() {
    return window.DaraAssetsUI.renderAssets(S);
  },
  net() {
    return window.DaraAssetsUI.renderNetWorth(S);
  },
  portfolio() {
    return window.DaraAssetsUI.renderPortfolio(S);
  },
  markets() {
    return window.DaraMarketsUI
      ? window.DaraMarketsUI.render()
      : `<h2>بازارها</h2><section class="card">بارگذاری بخش بازارها ناموفق بود. فایل‌های برنامه را بررسی کنید.</section>`;
  },
  blockchain() {
    return window.DaraPhase4UI
      ? window.DaraPhase4UI.renderBlockchain()
      : `<h2>بلاک‌چین</h2><section class="card">بارگذاری ماژول بلاک‌چین ناموفق بود. فایل‌های برنامه را بررسی کنید.</section>`;
  },
  journal() {
    return window.DaraPhase4UI
      ? window.DaraPhase4UI.renderTrades()
      : `<h2>ژورنال معاملات</h2><section class="card">بارگذاری ماژول ژورنال ناموفق بود. فایل‌های برنامه را بررسی کنید.</section>`;
  },
  ai() {
    const current = per().r;
    return window.DaraPhase5UI
      ? window.DaraPhase5UI.renderAssistant(
          S,
          { start: current.s, end: current.e },
          { money: M, categoryName: cn },
        )
      : `<h2>دستیار مالی</h2><section class="card">ماژول دستیار مالی هنوز بارگذاری نشده است.</section>`;
  },
  notifications() {
    const current = per().r;
    return window.DaraPhase5UI
      ? window.DaraPhase5UI.renderNotifications(S, { start: current.s, end: current.e })
      : `<h2>یادآورها</h2><section class="card">ماژول یادآورها هنوز بارگذاری نشده است.</section>`;
  },
  set() {
    const bl = balances(S);
    return `<h2>تنظیمات</h2>${card("حساب‌ها", `<ul>${S.accounts.map((a) => `<li class=row><div><b>${E(a.name)}</b><small>موجودی اولیه: ${M(a.opening)}</small></div><span>${M(bl[a.id])}</span><button class=b onclick="A.da('${a.id}')">حذف</button></li>`).join("")}</ul><button class=b onclick="A.acct()">+ حساب</button><p><small>موجودی = موجودی اولیه + درآمد − هزینه ± انتقال‌ها. انتقال‌ها درآمد یا هزینه حساب نمی‌شوند.</small></p>`)}${card("دسته‌بندی‌ها", `<p>${S.cats.map((c) => `<span class="tag ${c.kind === "income" ? "g" : ""}">${E(c.name)}</span> `).join("")}</p><button class=b onclick="A.cat()">+ دسته</button>`)}${card("واحد پول", `<label>نام واحد (همه مبالغ یک واحد دارند و تبدیل ارز انجام نمی‌شود)<select onchange="A.cur(this.value)">${displayUnits().map((u) => `<option value="${E(u)}"${S.cur === u ? " selected" : ""}>${E(u)}</option>`).join("")}</select></label>`)}${card("داده‌ها", `<button class=b onclick="A.reset()">پاک‌سازی داده‌های دفتر اصلی</button>`) }${window.DaraPhase5UI ? window.DaraPhase5UI.renderPrivacy(S) : ""}`;
  },
};
const answer = (q) => {
  const t = P(q),
    { r } = per(),
    rr = range(today()),
    tx = S.tx.filter((x) => inR(x, rr)),
    bc = byCat(tx);
  if (/بودجه|سقف|گذشته/.test(q)) {
    const o = Object.entries(S.budgets).filter(([c, l]) => (bc[c] || 0) > l);
    return o.length
      ? "دسته‌های فراتر از بودجه این ماه:\n" +
          o
            .map(([c, l]) => `• ${cn(c)}: ${M(bc[c] - l)} بیشتر از سقف ${M(l)}`)
            .join("\n")
      : Object.keys(S.budgets).length
        ? "در این ماه هیچ دسته‌ای از سقف بودجه فراتر نرفته است."
        : "هنوز بودجه‌ای تعیین نکرده‌اید.";
  }
  if (/هدف|پس.?انداز/.test(q)) {
    if (!S.goals.length) return "هنوز هدفی ندارید.";
    return S.goals
      .map((g) => {
        const n = goalNeed(g, today());
        return (
          `• ${g.name}: باقی‌مانده ${M(n.left)}` +
          (n.m
            ? `؛ حدود ${M(n.m)} در ماه برای ${nf.format(n.months)} ماه (بدون سود و تورم)`
            : g.date
              ? ""
              : "؛ تاریخ هدف ندارد، پس سهم ماهانه قابل محاسبه نیست")
        );
      })
      .join("\n");
  }
  if (/خرید|اگر/.test(q)) {
    const m = t.match(/[\d.]+/);
    if (!m)
      return "مبلغ خرید را بنویسید، مثلاً «اگر ۵ میلیون خرید کنم چه می‌شود؟»";
    const a = Math.round(
        +m[0] * (/میلیون/.test(q) ? 1e6 : /هزار/.test(q) ? 1e3 : 1),
      ),
      f = forecast(S, today(), a);
    return `با خرید ${M(a)}، برآورد موجودی پایان ماه (فقط با تعهدات تکرارشونده) از ${M(f.base + a)} به ${M(f.base)} می‌رسد؛ با فرض ادامه سرعت هزینه فعلی ${M(f.withPace)}. این یک تخمین است نه تضمین.`;
  }
  if (/بیشترین|بیش‌?ترین|خرج|هزینه/.test(q)) {
    const c = Object.entries(bc)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    return c.length
      ? "بیشترین هزینه‌های این ماه:\n" +
          c
            .map(([k, v], i) => `${nf.format(i + 1)}. ${cn(k)}: ${M(v)}`)
            .join("\n")
      : "در این ماه هزینه‌ای ثبت نشده است.";
  }
  return "فعلاً این سؤال‌ها را پشتیبانی می‌کنم: بیشترین هزینه، بودجه‌های فراتر از سقف، سهم ماهانه هدف و اثر یک خرید بر موجودی پایان ماه.";
};
const NAV = [
  ["dash", "داشبورد"],
  ["tx", "تراکنش‌ها"],
  ["bud", "بودجه‌ها"],
  ["goals", "اهداف"],
  ["assets", "دارایی‌ها"],
  ["net", "ارزش خالص"],
  ["portfolio", "سرمایه‌گذاری"],
  ["markets", "بازارها"],
  ["blockchain", "بلاک‌چین"],
  ["journal", "ژورنال معاملات"],
  ["notifications", "یادآورها"],
  ["rec", "تکرارشونده"],
  ["ai", "دستیار"],
  ["set", "تنظیمات"],
];
const takeFlash = () => {
  if (!ui.flash) return "";
  const message = ui.flash;
  ui.flash = "";
  return `<div class="flash" role="status">${E(message)}</div>`;
};
function R() {
  window.DARA_IS_AUTHENTICATED = Cloud.status === "in";
  if (Cloud.status !== "in" && Cloud.status !== "guest") {
    $("nav").innerHTML = "<b>دارا</b>";
    $("m").innerHTML = authPage();
    enhanceMoneyInputs($("m"));
    return;
  }
  window.DARA_APP_STATE = S;
  window.DARA_CURRENT_PAGE = ui.page;
  window.DARA_KPI = kpi;
  window.DARA_CARD = card;
  window.DARA_MONEY = M;
  window.DARA_CATEGORY_NAME = cn;
  $("nav").innerHTML =
    "<b>دارا</b>" +
    NAV.map(
      (n) =>
        `<button class="${ui.page === n[0] ? "on" : ""}" onclick="A.nav('${n[0]}')">${n[1]}</button>`,
    ).join("") +
    (Cloud.status === "in"
      ? `<button onclick="A.logout()">خروج (${E(Cloud.user.first_name || Cloud.user.username)})</button>`
      : '<button onclick="A.openAccount()">ورود / ساخت حساب</button>');
  $("m").innerHTML = takeFlash() +
    (Cloud.syncError
      ? `<section class="card" role="alert"><p>همگام‌سازی داده با سرور ناموفق بود: ${E(Cloud.syncError)}</p><button class="b" onclick="A.retryWorkspace()">تلاش دوباره</button></section>`
      : "") + pages[ui.page === "goals" ? "goals" : ui.page]();
  enhanceMoneyInputs($("m"));
}
window.DARA_RENDER = R;
if (new URLSearchParams(location.search).get("preview") === "1") {
  Cloud.status = "guest";
  R();
  // مهاجرت state در حافظه انجام شده؛ یک‌بار ذخیره می‌شود تا نسخهٔ ۳ پایدار بماند.
  if (stateUpgraded) persist();
} else {
  R();
  cloudBoot();
}
