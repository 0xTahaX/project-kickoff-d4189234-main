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

// ─── تم روشن/تاریک، هدر و منوی همبرگری ──────────────────────────────────────
const THEME_KEY = "dara.theme";
const readTheme = () => {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "dark" || saved === "light") return saved;
  } catch {}
  return "light";
};
const applyTheme = (theme) => {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {}
};
const initialTheme = readTheme();
applyTheme(initialTheme);

const PAGE_ICONS = {
  dash: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  tx: '<path d="M4 7h16M4 12h10M4 17h16"/><path d="M17 15l3 2-3 2"/>',
  accounts: '<path d="M3 7h15a3 3 0 0 1 3 3v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z"/><path d="M3 7V6a2 2 0 0 1 2-2h11"/><path d="M16 13h2"/>',
  reports: '<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h6M9 16h6M9 8h3"/>',  bud: '<path d="M4 5h16v14H4z"/><path d="M8 5v14M4 10h4M4 14h4"/>',
  goals: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 4v2M20 12h-2"/>',
  assets: '<path d="M4 8l8-4 8 4-8 4-8-4z"/><path d="M4 12l8 4 8-4M4 16l8 4 8-4"/>',
  net: '<path d="M4 19V5M4 19h16"/><path d="M7 15l4-5 3 3 5-7"/>',
  portfolio: '<circle cx="12" cy="12" r="8"/><path d="M12 8v8M8 12h8"/>',
  markets: '<path d="M4 17l5-5 4 3 7-9"/><path d="M15 6h5v5"/>',
  blockchain: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/><path d="M11 7h4v6M7 11v4h6"/>',
  journal: '<path d="M5 4h11l3 3v13H5z"/><path d="M9 8h6M9 12h6M9 16h4"/>',
  notifications: '<path d="M6 9a6 6 0 1 1 12 0c0 4 2 5 2 5H4s2-1 2-5"/><path d="M10 20h4"/>',
  rec: '<path d="M4 11a8 8 0 0 1 14-5l2 2M20 13a8 8 0 0 1-14 5l-2-2"/><path d="M20 4v4h-4M4 20v-4h4"/>',
  ai: '<path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/><path d="M19 15l1 2 2 1-2 1-1 2-1-2-2-1 2-1z"/>',
  set: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',
};
const navIcon = (key) =>
  `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PAGE_ICONS[key] || PAGE_ICONS.dash}</svg>`;

const NAV_GROUPS = [
  { title: "نمای کلی", items: [["dash", "داشبورد"]] },
  {
    title: "مدیریت مالی",
    items: [
      ["tx", "تراکنش‌ها"],
      ["accounts", "حساب‌ها"],
      ["bud", "بودجه‌ها"],
      ["goals", "اهداف"],
    ],
  },
  {
    title: "دارایی و تحلیل",
    items: [
      ["reports", "گزارش‌ها"],
      ["assets", "دارایی‌ها"],
      ["net", "ارزش خالص"],
      ["portfolio", "سرمایه‌گذاری"],
      ["markets", "بازارها"],
      ["blockchain", "بلاک‌چین"],
    ],
  },
  {
    title: "معاملات",
    items: [
      ["journal", "ژورنال معاملات"],
      ["notifications", "یادآورها"],
      ["rec", "تکرارشونده"],
    ],
  },
  {
    title: "ابزارها",
    items: [
      ["ai", "دستیار"],
      ["set", "تنظیمات"],
    ],
  },
];
const NAV = NAV_GROUPS.flatMap((group) => group.items);
const PAGE_TITLES = Object.fromEntries(NAV);
let ui = {
  page: "dash",
  off: 0,
  plan: 0,
  chat: [],
  q: "",
  flash: "",
  theme: initialTheme,
  navOpen: window.innerWidth >= 1024,
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
    if (window.innerWidth < 1024) ui.navOpen = false;
    R();
    scrollTo(0, 0);
  },
  toggleNav: () => {
    ui.navOpen = !ui.navOpen;
    document.body.classList.toggle("nav-open", ui.navOpen);
    const backdrop = $("drawerBackdrop");
    if (backdrop) backdrop.hidden = !ui.navOpen || window.innerWidth >= 1024;
    const button = document.querySelector("[data-menu-button]");
    if (button) button.setAttribute("aria-expanded", String(ui.navOpen));
  },
  theme: () => {
    ui.theme = ui.theme === "dark" ? "light" : "dark";
    applyTheme(ui.theme);
    R();
  },
  sh: (k) => {
    ui.off = k ? ui.off + k : 0;
    R();
  },

  reportCsv: () => {
    const state = ui.report;
    if (!state) return;
    const rows = [["تاریخ", "نوع", "دسته", "حساب", "مبلغ", "توضیح", "یادداشت"]];
    S.tx
      .filter(
        (entry) =>
          entry.date >= state.from &&
          entry.date <= state.to &&
          (!state.acc || entry.acc === state.acc || entry.to === state.acc) &&
          (!state.cat || entry.cat === state.cat),
      )
      .sort((left, right) => (left.date < right.date ? -1 : 1))
      .forEach((entry) => {
        rows.push([
          entry.date,
          entry.type === "income" ? "درآمد" : entry.type === "expense" ? "هزینه" : "انتقال",
          entry.cat ? cn(entry.cat) : "",
          an(entry.acc),
          String(entry.amount),
          entry.desc || "",
          entry.note || "",
        ]);
      });
    const csv =
      "\uFEFF" +
      rows
        .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
        .join("\r\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    link.download = `dara-report-${state.from}-to-${state.to}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
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
    const { r } = per();
    const tx = S.tx.filter((entry) => inR(entry, r));
    const totalsNow = totals(tx);
    const previous = totals(S.tx.filter((entry) => inR(entry, range(shift(today(), ui.off - 1)))));
    const balancesNow = balances(S);
    const cash = sum(balancesNow);
    const byCategory = byCat(tx);
    const categories = Object.entries(byCategory).sort((left, right) => right[1] - left[1]);
    const change = (current, prior, goodWhenUp = true) => {
      if (!prior) return "";
      const percent = Math.round(((current - prior) / Math.abs(prior)) * 100);
      if (!percent) return "<span class=\"delta\">بدون تغییر</span>";
      const good = percent > 0 ? goodWhenUp : !goodWhenUp;
      return `<span class="delta ${good ? "good" : "bad"}">${percent > 0 ? "▲" : "▼"} ${faNum(Math.abs(percent))}٪ نسبت به ماه قبل</span>`;
    };
    const cards = [
      ["مجموع موجودی حساب‌ها", M(cash), "assets", "", "موجودی نقدی همهٔ حساب‌ها"],
      ["درآمد این ماه", M(totalsNow.i), "net", "pos", change(totalsNow.i, previous.i)],
      ["هزینه این ماه", M(totalsNow.e), "tx", "neg", change(totalsNow.e, previous.e, false)],
      ["جریان نقدی خالص", M(totalsNow.n), "goals", totalsNow.n >= 0 ? "pos" : "neg", change(totalsNow.n, previous.n)],
    ];
    const kpis = cards
      .map(
        ([label, value, icon, tone, hint]) => `<article class="card kpi-card"><span class="kpi-icon">${navIcon(icon)}</span><div><small>${label}</small><b class="${tone}">${value}</b>${hint ? `<p class="kpi-hint">${hint}</p>` : ""}</div></article>`,
      )
      .join("");
    const months = [];
    for (let offset = 5; offset >= 0; offset -= 1) {
      const base = shift(today(), ui.off - offset);
      const monthTotals = totals(S.tx.filter((entry) => inR(entry, range(base))));
      months.push({ label: fmn(base), income: monthTotals.i, expense: monthTotals.e });
    }
    const flowChart = DaraCharts.bar({
      labels: months.map((month) => month.label),
      series: [
        { name: "درآمد", values: months.map((month) => month.income), color: "var(--g)" },
        { name: "هزینه", values: months.map((month) => month.expense), color: "var(--r)" },
      ],
      format: (value) => faNum(Math.round(value)),
      ariaLabel: "نمودار جریان نقدی شش ماه اخیر",
    });
    const palette = ["#4f6bed", "#0ea5a4", "#f59e0b", "#ef4444", "#8b5cf6", "#10b981", "#f97316", "#64748b"];
    const donutItems = categories.slice(0, 6).map(([id, value], index) => ({
      label: cn(id),
      value,
      display: M(value),
      color: palette[index % palette.length],
    }));
    const other = categories.slice(6).reduce((total, [, value]) => total + value, 0);
    if (other) donutItems.push({ label: "سایر", value: other, display: M(other), color: "#94a3b8" });
    const donutChart = categories.length
      ? DaraCharts.donut({ items: donutItems, title: "هزینه" })
      : DaraCharts.empty("در این ماه هزینه‌ای ثبت نشده است.");
    const recent = S.tx
      .slice()
      .sort((left, right) => (left.date < right.date ? 1 : -1))
      .slice(0, 6)
      .map(
        (entry) => `<tr><td><b>${E(entry.desc || (entry.cat ? cn(entry.cat) : "—"))}</b><small>${entry.cat ? E(catText(entry.cat)) : "بدون دسته"}</small></td><td>${E(an(entry.acc))}</td><td>${fd(entry.date)}</td><td><span class="badge badge-${entry.type}">${entry.type === "income" ? "درآمد" : entry.type === "transfer" ? "انتقال" : "هزینه"}</span></td><td class="${entry.type === "income" ? "pos" : entry.type === "expense" ? "neg" : ""}">${entry.type === "transfer" ? M(entry.amount) : `${entry.type === "income" ? "+" : "−"}${M(entry.amount)}`}</td></tr>`,
      )
      .join("");
    const goals = S.goals.slice(0, 4).map(goalSummaryRow).join("");
    const insights = [];
    if (categories[0])
      insights.push(`بیشترین هزینهٔ این ماه «${cn(categories[0][0])}» با ${M(categories[0][1])} است.`);
    if (totalsNow.i > 0)
      insights.push(`نرخ پس‌انداز این ماه ${faNum(Math.round((totalsNow.n / totalsNow.i) * 100))}٪ از درآمد ثبت‌شده است.`);
    if (tx.length) {
      const day = Math.max(1, new Date(today()).getUTCDate());
      insights.push(`میانگین هزینهٔ روزانه ${M(Math.round(totalsNow.e / day))} است.`);
    }
    Object.entries(S.budgets).forEach(([categoryId, limit]) => {
      if ((byCategory[categoryId] || 0) > limit)
        insights.push(`بودجهٔ «${cn(categoryId)}» ${M(byCategory[categoryId] - limit)} بیشتر شده است.`);
    });
    const firstUse = !S.tx.length && !S.goals.length;
    const monthNav = `<div class="page-toolbar"><div class="segmented"><button class="btn btn-ghost" type="button" onclick="A.sh(-1)" aria-label="ماه قبل">›</button><span>${fmn(per().b)}</span><button class="btn btn-ghost" type="button" onclick="A.sh(1)" aria-label="ماه بعد">‹</button>${ui.off ? '<button class="btn btn-ghost" type="button" onclick="A.sh(0)">این ماه</button>' : ""}</div><span class="toolbar-hint">${faNum(tx.length)} تراکنش در این ماه</span></div>`;
    return `${monthNav}
      <div class="kpi-grid">${kpis}</div>
      ${
        firstUse
          ? `<section class="card onboarding"><h3>به دارا خوش آمدید</h3><p class="mu">اولین تراکنش یا هدف مالی‌تان را ثبت کنید تا داشبورد از دادهٔ واقعی شما ساخته شود.</p><div class="onboarding-actions"><button class="btn btn-primary" type="button" onclick="A.tx()">+ ثبت اولین تراکنش</button><button class="btn btn-ghost" type="button" onclick="A.goal()">+ ساخت هدف</button></div></section>`
          : ""
      }
      <div class="dash-grid">
        <section class="card chart-card wide"><header class="card-head"><div><h3>جریان نقدی</h3><small>درآمد در برابر هزینه · شش ماه اخیر</small></div></header>${flowChart}</section>
        <section class="card chart-card"><header class="card-head"><div><h3>ترکیب هزینه‌ها</h3><small>${fmn(per().b)}</small></div></header>${donutChart}</section>
      </div>
      <div class="dash-grid">
        <section class="card"><header class="card-head"><div><h3>اهداف پس‌انداز</h3><small>پیشرفت پس‌انداز</small></div><button class="btn btn-ghost" type="button" onclick="A.nav('goals')">مشاهدهٔ همه</button></header>${goals || `<p class="mu">هنوز هدفی نساخته‌اید. <button class="link-btn" type="button" onclick="A.goal()">ساخت هدف</button></p>`}</section>
        <section class="card"><header class="card-head"><div><h3>بینش‌های سریع</h3><small>بر پایهٔ دادهٔ همین ماه</small></div></header>${insights.length ? `<ul class="insight-list">${insights.map((item) => `<li>${E(item)}</li>`).join("")}</ul>` : '<p class="mu">با ثبت چند تراکنش، بینش‌ها اینجا ظاهر می‌شوند.</p>'}<div class="insight-actions"><button class="btn btn-ghost" type="button" onclick="A.nav('bud')">بودجه‌ها</button><button class="btn btn-ghost" type="button" onclick="A.nav('tx')">فهرست کامل</button></div></section>
      </div>
      <section class="card"><header class="card-head"><div><h3>تراکنش‌های اخیر</h3><small>آخرین فعالیت‌های ثبت‌شده</small></div><button class="btn btn-primary" type="button" onclick="A.tx()">+ تراکنش</button></header>${recent ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>عنوان</th><th>حساب</th><th>تاریخ</th><th>نوع</th><th>مبلغ (${S.cur})</th></tr></thead><tbody>${recent}</tbody></table></div>` : '<p class="mu">هنوز تراکنشی ثبت نشده است.</p>'}</section>
      <div class="dash-grid">
        <section class="card"><header class="card-head"><div><h3>بودجه‌ها</h3><small>مصرف این ماه</small></div></header>${budRows(byCategory)}</section>
        <section class="card"><header class="card-head"><div><h3>سررسیدهای پیش‌رو</h3><small>۳۰ روز آینده</small></div></header><ul class="plain-list">${recUp()}</ul></section>
      </div>
      ${ui.off === 0 ? fcHtml() : ""}`;
  },  tx() {
    const { r } = per();
    const query = ui.q.trim();
    const list = S.tx
      .filter(
        (entry) =>
          inR(entry, r) &&
          (!ui.ft || entry.type === ui.ft) &&
          (!ui.fc || entry.cat === ui.fc) &&
          (!ui.fa || entry.acc === ui.fa || entry.to === ui.fa) &&
          (!query || (entry.desc + " " + entry.note).includes(query)),
      )
      .sort((left, right) => (left.date < right.date ? 1 : -1));
    const summary = totals(list);
    const select = (key, options) =>
      `<select onchange="ui.${key}=this.value;R()"><option value="">همه</option>${options.map(([value, label]) => `<option value="${E(value)}"${ui[key] === value ? " selected" : ""}>${E(label)}</option>`).join("")}</select>`;
    const months = [];
    for (let offset = 5; offset >= 0; offset -= 1) {
      const base = shift(today(), ui.off - offset);
      const subset = S.tx.filter((entry) => inR(entry, range(base)));
      months.push({ label: fmn(base), count: subset.length, ...totals(subset), offset: ui.off - offset });
    }
    const flow = DaraCharts.bar({
      labels: months.map((month) => month.label),
      series: [{ name: "درآمد", values: months.map((month) => month.i), color: "var(--g)" }, { name: "هزینه", values: months.map((month) => month.e), color: "var(--r)" }],
      format: (value) => faNum(Math.round(value)),
      meta: months.map((month) => String(month.offset)),
      name: "tx-month",
      ariaLabel: "روند درآمد و هزینه با امکان انتخاب ماه",
    });
    const counts = DaraCharts.line({
      labels: months.map((month) => month.label),
      values: months.map((month) => month.count),
      format: (value) => faNum(value),
      ariaLabel: "تعداد تراکنش‌ها در ماه",
    });
    const palette = ["#4f6bed", "#0ea5a4", "#f59e0b", "#ef4444", "#8b5cf6", "#10b981", "#f97316", "#64748b"];
    const categories = Object.entries(byCat(list)).sort((left, right) => right[1] - left[1]);
    const donut = categories.length
      ? DaraCharts.donut({
          items: categories.slice(0, 8).map(([id, value], index) => ({ label: cn(id), value, display: M(value), color: palette[index % palette.length], key: id })),
          title: "هزینه",
          name: "tx-cat",
        })
      : DaraCharts.empty("با این فیلترها هزینه‌ای وجود ندارد.");
    const chips = [
      ui.ft ? `<button class="chip" type="button" onclick="ui.ft='';R()">نوع: ${ui.ft === "income" ? "درآمد" : ui.ft === "transfer" ? "انتقال" : "هزینه"} ✕</button>` : "",
      ui.fc ? `<button class="chip" type="button" onclick="ui.fc='';R()">دسته: ${E(cn(ui.fc))} ✕</button>` : "",
      ui.fa ? `<button class="chip" type="button" onclick="ui.fa='';R()">حساب: ${E(an(ui.fa))} ✕</button>` : "",
      ui.q.trim() ? `<button class="chip" type="button" onclick="ui.q='';R()">جستجو: ${E(ui.q)} ✕</button>` : "",
    ].filter(Boolean).join("");
    return `${pnav()}
      <div class="top"><h2>تراکنش‌ها</h2><button class="pri" type="button" onclick="A.tx()">+ تراکنش جدید</button></div>
      <div class="flt">
        <input placeholder="جستجو…" value="${E(ui.q)}" onchange="ui.q=this.value;R()">
        ${select("ft", [["expense", "هزینه"], ["income", "درآمد"], ["transfer", "انتقال"]])}
        ${select("fc", catO())}
        ${select("fa", accO())}
      </div>
      ${chips ? `<div class="filter-chips">${chips}<button class="chip chip-clear" type="button" onclick="ui.ft='';ui.fc='';ui.fa='';ui.q='';R()">پاک کردن همه</button></div>` : ""}
      ${card("جمع نتایج فیلترشده", `درآمد <b class="pos">${M(summary.i)}</b> · هزینه <b class="neg">${M(summary.e)}</b> · خالص <b>${M(summary.n)}</b> <small>(انتقال‌ها در جمع‌ها نیستند)</small>`)}
      <div class="dash-grid">
        <section class="card chart-card wide"><header class="card-head"><div><h3>روند درآمد و هزینه</h3><small>شش ماه اخیر · برای فیلتر ماه روی ستون کلیک کنید</small></div></header>${flow}</section>
        <section class="card chart-card"><header class="card-head"><div><h3>تفکیک هزینه‌ها</h3><small>برای فیلتر دسته روی بخش کلیک کنید</small></div></header>${donut}</section>
      </div>
      <div class="dash-grid">
        <section class="card chart-card"><header class="card-head"><div><h3>تعداد تراکنش‌ها</h3><small>روند شش‌ماهه</small></div></header>${counts}</section>
        <section class="card"><header class="card-head"><div><h3>راهنمای نمودارها</h3><small>تعامل سریع</small></div></header><ul class="insight-list"><li>ستون‌های ماه: همان ماه در فهرست پایین نمایش داده می‌شود.</li><li>بخش‌های Donut: دستهٔ هزینه را فیلتر می‌کند.</li><li>انتقال بین حساب‌ها در درآمد/هزینه شمرده نمی‌شود.</li></ul></section>
      </div>
      <section class="card"><header class="card-head"><div><h3>فهرست تراکنش‌ها</h3><small>${faNum(list.length)} نتیجه</small></div></header><ul>${list.map(txRow).join("") || '<p class="mu">تراکنشی با این فیلترها پیدا نشد.</p>'}</ul></section>`;
  },
  bud() {
    const { r } = per();
    const spentByCategory = byCat(S.tx.filter((entry) => inR(entry, r)));
    const budgetIds = Object.keys(S.budgets).filter((id) => S.cats.some((category) => category.id === id));
    const palette = ["#4f6bed", "#0ea5a4", "#f59e0b", "#ef4444", "#8b5cf6", "#10b981"];
    const budgetChart = budgetIds.length
      ? DaraCharts.bar({
          labels: budgetIds.map((id) => cn(id)),
          series: [{ name: "بودجه", values: budgetIds.map((id) => S.budgets[id]), color: "var(--pri)" }, { name: "هزینه", values: budgetIds.map((id) => spentByCategory[id] || 0), color: "var(--r)" }],
          format: (value) => faNum(Math.round(value)),
          ariaLabel: "بودجه در برابر هزینهٔ واقعی",
        })
      : DaraCharts.empty("هنوز بودجه‌ای تعیین نشده است.");
    const monthSpend = [];
    for (let offset = 5; offset >= 0; offset -= 1) {
      const base = shift(today(), ui.off - offset);
      monthSpend.push({ label: fmn(base), value: totals(S.tx.filter((entry) => inR(entry, range(base)))).e });
    }
    const spendLine = DaraCharts.line({
      labels: monthSpend.map((month) => month.label),
      values: monthSpend.map((month) => month.value),
      format: (value) => faNum(Math.round(value)),
      ariaLabel: "روند هزینهٔ شش ماه",
    });
    const nearLimit = budgetIds
      .map((id) => {
        const spent = spentByCategory[id] || 0;
        const limit = S.budgets[id];
        return { id, spent, limit, percent: limit ? Math.round((spent / limit) * 100) : 0, left: limit - spent };
      })
      .filter((item) => item.percent >= 80);
    const rows = budgetIds
      .map((id) => {
        const spent = spentByCategory[id] || 0;
        const limit = S.budgets[id];
        const percent = limit ? Math.round((spent / limit) * 100) : 0;
        const left = limit - spent;
        const status = percent > 100 ? `<span class="badge badge-expense">بیش از سقف</span>` : percent >= 80 ? `<span class="badge" style="background:var(--warn-soft);color:var(--warn)">نزدیک سقف</span>` : `<span class="badge badge-income">در محدوده</span>`;
        return `<tr><td><b>${E(catText(id))}</b></td><td>${M(limit)}</td><td>${M(spent)}</td><td>${left >= 0 ? M(left) : "−" + M(-left)}</td><td>${faNum(percent)}٪</td><td>${status}</td></tr>`;
      })
      .join("");
    return `${pnav()}
      <div class="top"><h2>بودجه‌بندی</h2><button class="pri" type="button" onclick="A.nav('tx')">مشاهدهٔ تراکنش‌ها</button></div>
      <section class="card"><header class="card-head"><div><h3>سقف ماهانه هر دسته</h3><small>خالی = بدون بودجه · با ثبت، فوراً ذخیره می‌شود</small></div></header>${S.cats.filter((category) => category.kind === "expense").map((category) => `<label class="budget-input">${E(categoryEmoji(category))} ${E(category.name)}<input inputmode="numeric" data-money value="${S.budgets[category.id] ? DaraGoals.formatMoney(S.budgets[category.id]) : ""}" placeholder="سقف به ${S.cur}" onchange="A.bud('${category.id}',this.value)"></label>`).join("")}</section>
      <div class="dash-grid"><section class="card chart-card wide"><header class="card-head"><div><h3>بودجه در برابر هزینه</h3><small>${fmn(per().b)}</small></div></header>${budgetChart}</section><section class="card"><header class="card-head"><div><h3>نزدیک به سقف</h3><small>۸۰٪ به بالا</small></div></header>${nearLimit.length ? `<ul class="insight-list">${nearLimit.map((item) => `<li>${E(catText(item.id))}: ${faNum(item.percent)}٪${item.left < 0 ? ` · ${M(-item.left)} بیش از سقف` : ` · ${M(item.left)} باقی`}</li>`).join("")}</ul>` : '<p class="mu">همهٔ دسته‌ها در محدودهٔ امن هستند.</p>'}<button class="btn btn-ghost" type="button" onclick="A.nav('tx')">ثبت هزینه</button></section></div>
      <div class="dash-grid"><section class="card chart-card wide"><header class="card-head"><div><h3>روند هزینه</h3><small>شش ماه اخیر (بودجه‌های تاریخی ذخیره نمی‌شوند)</small></div></header>${spendLine}</section><section class="card"><header class="card-head"><div><h3>وضعیت دسته‌ها</h3><small>مصرف بودجه</small></div></header><div class="table-wrap"><table class="data-table"><thead><tr><th>دسته</th><th>بودجه</th><th>هزینه</th><th>باقی‌مانده</th><th>درصد</th><th>وضعیت</th></tr></thead><tbody>${rows || '<tr><td colspan="6" class="mu">بودجه‌ای تعیین نشده است.</td></tr>'}</tbody></table></div></section></div>`;
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
    const topGoals = S.goals.filter((goal) => DaraGoals.progressOf(goal)).slice(0, 6);
    const compare = topGoals.length
      ? DaraCharts.bar({
          labels: topGoals.map((goal) => goal.name),
          series: [{ name: "مبلغ هدف", values: topGoals.map((goal) => goal.target), color: "var(--pri)" }, { name: "پس‌اندازشده", values: topGoals.map((goal) => DaraGoals.savedOf(goal)), color: "var(--g)" }],
          format: (value) => faNum(Math.round(value)),
          ariaLabel: "مقایسهٔ مبلغ هدف و پس‌انداز",
        })
      : DaraCharts.empty("برای مقایسه، حداقل یک هدف معتبر لازم است.");
    const allContributions = S.goals
      .flatMap((goal) => (goal.contributions || []).filter((contribution) => !contribution.invalid && contribution.date))
      .sort((left, right) => (left.date < right.date ? -1 : 1));
    const months = [];
    for (let offset = 5; offset >= 0; offset -= 1) {
      const span = range(shift(today(), ui.off - offset));
      const cumulative = allContributions.filter((contribution) => contribution.date <= span.e).reduce((sum, contribution) => sum + contribution.amount, 0);
      months.push({ label: fmn(span.s), value: cumulative });
    }
    const trend = allContributions.length
      ? DaraCharts.line({ labels: months.map((month) => month.label), values: months.map((month) => month.value), format: (value) => faNum(Math.round(value)), ariaLabel: "روند تجمعی پس‌انداز" })
      : DaraCharts.empty("هنوز مشارکت پس‌اندازی ثبت نشده است.");
    const planCounts = { active: 0, paused: 0, completed: 0, late: 0 };
    S.goals.forEach((goal) => {
      if (!goal.plan) return;
      planCounts[goal.plan.status] = (planCounts[goal.plan.status] || 0) + 1;
      const summary = DaraGoals.planSummary(goal, today());
      if (summary) planCounts.late += summary.counts.late;
    });
    const statusChips = `<div class="filter-chips"><span class="chip">فعال: ${faNum(planCounts.active)}</span><span class="chip">متوقف: ${faNum(planCounts.paused)}</span><span class="chip">تکمیل‌شده: ${faNum(planCounts.completed)}</span><span class="chip">دورهٔ تأخیردار: ${faNum(planCounts.late)}</span></div>`;
    return `<div class="top"><h2>اهداف پس‌انداز</h2><button class="pri" onclick="A.goal()">+ هدف جدید</button></div>
      ${stats}${help}
      <div class="dash-grid">
        <section class="card chart-card wide"><header class="card-head"><div><h3>هدف در برابر پس‌انداز</h3><small>مقایسهٔ مبلغ هدف و موجودی فعلی</small></div></header>${compare}</section>
        <section class="card chart-card"><header class="card-head"><div><h3>روند پس‌انداز</h3><small>تجمعی شش ماه</small></div></header>${trend}</section>
      </div>
      <section class="card"><header class="card-head"><div><h3>وضعیت برنامه‌های پس‌انداز</h3><small>روزانه/هفتگی/ماهانه</small></div></header>${statusChips}<small class="mu">دوره‌های تأخیردار از برنامه‌های فعال محاسبه می‌شوند و دوره‌های آینده تأخیر محسوب نمی‌شوند.</small></section>
      ${S.goals.length ? S.goals.map(goalCard).join("") : goalsEmpty()}`;
  },
  rec() {
    return `<div class=top><h2 style="margin:0">تراکنش‌های تکرارشونده</h2><button class=pri onclick="A.rec()">+ قانون جدید</button></div><section class=card><ul>${S.rec.map((r) => `<li class=row><div><b>${E(r.name)}</b><small>${r.freq === "weekly" ? "هفتگی" : "ماهانه"} · بعدی: ${fd(r.next)}${r.next <= today() ? " · سررسید شده" : ""}</small></div><span class="${r.type === "income" ? "pos" : "neg"}">${M(r.amount)}</span><span><button class=b onclick="A.post('${r.id}')">ثبت تراکنش</button> <button class=b onclick="A.dr('${r.id}')">حذف</button></span></li>`).join("") || none("قانونی ثبت نشده است.")}</ul></section><small>تراکنشی به‌طور خودکار ساخته نمی‌شود: با «ثبت تراکنش» یک تراکنش ساخته و سررسید بعدی یک دوره جلو می‌رود، پس تکرار دوباره‌ای رخ نمی‌دهد.</small>`;
  },

  accounts() {
    const balancesNow = balances(S);
    const total = sum(balancesNow);
    const palette = ["#4f6bed", "#0ea5a4", "#f59e0b", "#ef4444", "#8b5cf6", "#10b981"];
    const accountRows = S.accounts.map((account) => {
      const balance = balancesNow[account.id] || 0;
      const related = S.tx.filter((entry) => entry.acc === account.id || entry.to === account.id);
      const last = related.reduce((latest, entry) => (latest == null || entry.date > latest ? entry.date : latest), null);
      const type = account.type === "bank" ? "بانکی" : account.type === "savings" ? "پس‌انداز" : "نقدی";
      return `<tr><td><b>${E(account.name)}</b><small>${type}${account.emoji ? " " + E(account.emoji) : ""}</small></td><td>${M(balance)} ${E(S.cur)}</td><td>${total ? faNum(Math.round((balance / total) * 100)) : "۰"}٪</td><td>${faNum(related.length)}</td><td>${last ? fd(last) : "بدون فعالیت"}</td></tr>`;
    }).join("");
    const items = S.accounts.map((account, index) => ({
      label: account.name,
      value: Math.max(0, balancesNow[account.id] || 0),
      display: M(balancesNow[account.id] || 0),
      color: palette[index % palette.length],
      key: account.id,
    }));
    const share = S.accounts.length
      ? DaraCharts.donut({ items, title: "سهم حساب‌ها", name: "accounts-share" })
      : DaraCharts.empty("حسابی ثبت نشده است.");
    const comparison = S.accounts.length
      ? DaraCharts.bar({
          labels: S.accounts.map((account) => account.name),
          series: [{ name: "موجودی", values: S.accounts.map((account) => balancesNow[account.id] || 0), color: "var(--pri)" }],
          format: (value) => faNum(Math.round(value)),
          name: "accounts-balance",
          ariaLabel: "مقایسهٔ موجودی حساب‌ها",
        })
      : DaraCharts.empty("حسابی ثبت نشده است.");
    const shortDate = (iso) => new Intl.DateTimeFormat("fa-IR", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(iso + "T00:00:00Z"));
    const histories = S.accounts.slice(0, 3).map((account) => {
      let value = account.opening;
      const points = [{ date: null, value }];
      S.tx
        .slice()
        .sort((left, right) => (left.date < right.date ? -1 : 1))
        .forEach((entry) => {
          if (entry.acc === account.id) {
            value += entry.type === "income" ? entry.amount : entry.type === "expense" ? -entry.amount : -entry.amount;
            points.push({ date: entry.date, value });
          } else if (entry.to === account.id) {
            value += entry.amount;
            points.push({ date: entry.date, value });
          }
        });
      const usable = points.filter((point) => point.date).slice(-12);
      return `<section class="card chart-card"><header class="card-head"><div><h3>روند موجودی · ${E(account.name)}</h3><small>از تراکنش‌های واقعی بازسازی شده است</small></div></header>${usable.length > 1 ? DaraCharts.line({ labels: usable.map((point) => shortDate(point.date)), values: usable.map((point) => point.value), format: (value) => faNum(Math.round(value)), ariaLabel: `روند موجودی ${account.name}` }) : DaraCharts.empty("برای این حساب تاریخچهٔ کافی برای نمودار وجود ندارد.")}</section>`;
    }).join("");
    return `<div class="top"><h2>حساب‌ها</h2><button class="pri" type="button" onclick="A.acct()">+ حساب جدید</button></div>
      ${S.accounts.some((account) => (balancesNow[account.id] || 0) < 0) ? `<p class="mm-warning">یک یا چند حساب موجودی منفی دارند؛ نمودار سهم فقط حساب‌های با موجودی نامنفی را نمایش می‌دهد و مبلغ واقعی در جدول دیده می‌شود.</p>` : ""}
      <div class="kpi-grid"><article class="card kpi-card"><span class="kpi-icon">${navIcon("accounts")}</span><div><small>مجموع موجودی</small><b>${M(total)} ${E(S.cur)}</b></div></article><article class="card kpi-card"><span class="kpi-icon">${navIcon("tx")}</span><div><small>تعداد حساب‌ها</small><b>${faNum(S.accounts.length)}</b></div></article></div>
      <div class="dash-grid"><section class="card chart-card"><header class="card-head"><div><h3>مقایسهٔ موجودی</h3><small>موجودی فعلی هر حساب</small></div></header>${comparison}</section><section class="card chart-card"><header class="card-head"><div><h3>سهم از موجودی کل</h3><small>ترکیب نقدی</small></div></header>${share}</section></div>
      <section class="card"><header class="card-head"><div><h3>فهرست حساب‌ها</h3><small>شامل تعداد تراکنش و آخرین فعالیت</small></div></header><div class="table-wrap"><table class="data-table"><thead><tr><th>حساب</th><th>موجودی</th><th>سهم</th><th>تراکنش‌ها</th><th>آخرین فعالیت</th></tr></thead><tbody>${accountRows || '<tr><td colspan="5" class="mu">حسابی ثبت نشده است.</td></tr>'}</tbody></table></div></section>
      ${histories}`;
  },
  reports() {
    const state = ui.report || (ui.report = { from: per().r.s, to: per().r.e, acc: "", cat: "", compare: false });
    const filter = (entry, from, to, acc, cat) =>
      entry.date >= from && entry.date <= to && (!acc || entry.acc === acc || entry.to === acc) && (!cat || entry.cat === cat);
    const filtered = S.tx.filter((entry) => filter(entry, state.from, state.to, state.acc, state.cat));
    const summary = totals(filtered);
    const byCategory = byCat(filtered);
    const categories = Object.entries(byCategory).sort((left, right) => right[1] - left[1]);
    const months = [];
    let cursor = range(state.from).s;
    while (cursor <= state.to && months.length < 24) {
      const span = range(cursor);
      const monthTotals = totals(filtered.filter((entry) => entry.date >= span.s && entry.date <= span.e));
      months.push({ label: fmn(cursor), ...monthTotals });
      cursor = addDays(span.e, 1);
    }
    const flow = DaraCharts.bar({
      labels: months.map((month) => month.label),
      series: [{ name: "درآمد", values: months.map((month) => month.i), color: "var(--g)" }, { name: "هزینه", values: months.map((month) => month.e), color: "var(--r)" }],
      format: (value) => faNum(Math.round(value)),
      name: "report-flow",
      ariaLabel: "گزارش درآمد و هزینه",
    });
    const palette = ["#4f6bed", "#0ea5a4", "#f59e0b", "#ef4444", "#8b5cf6", "#10b981", "#f97316", "#64748b"];
    const donut = categories.length
      ? DaraCharts.donut({ items: categories.slice(0, 8).map(([id, value], index) => ({ label: cn(id), value, display: M(value), color: palette[index % palette.length], key: id })), title: "هزینه", name: "report-cat" })
      : DaraCharts.empty("در این بازه هزینه‌ای ثبت نشده است.");
    const days = Math.max(1, Math.round((new Date(state.to) - new Date(state.from)) / 86_400_000) + 1);
    let comparison = "";
    if (state.compare) {
      const previousTo = addDays(state.from, -1);
      const previousFrom = addDays(previousTo, -(days - 1));
      const prior = totals(S.tx.filter((entry) => filter(entry, previousFrom, previousTo, state.acc, state.cat)));
      comparison = `<section class="card"><header class="card-head"><div><h3>مقایسه با بازهٔ قبل</h3><small>${fd(previousFrom)} تا ${fd(previousTo)}</small></div></header><div class="table-wrap"><table class="data-table"><thead><tr><th>شاخص</th><th>بازهٔ فعلی</th><th>بازهٔ قبل</th><th>تغییر</th></tr></thead><tbody>${[["درآمد", summary.i, prior.i], ["هزینه", summary.e, prior.e], ["خالص", summary.n, prior.n]].map(([label, now, before]) => `<tr><td>${label}</td><td>${M(now)}</td><td>${M(before)}</td><td class="${now - before >= 0 ? "pos" : "neg"}">${before ? `${now - before >= 0 ? "+" : "−"}${M(Math.abs(now - before))}` : "—"}</td></tr>`).join("")}</tbody></table></div></section>`;
    }
    const rows = months.map((month) => `<tr><td>${E(month.label)}</td><td class="pos">${M(month.i)}</td><td class="neg">${M(month.e)}</td><td>${M(month.n)}</td></tr>`).join("");
    const categoryOptions = [["", "همهٔ دسته‌ها"], ...S.cats.map((category) => [category.id, category.name])];
    const accountOptions = [["", "همهٔ حساب‌ها"], ...S.accounts.map((account) => [account.id, account.name])];
    return `<div class="top"><h2>گزارش‌های مالی</h2><button class="pri" type="button" onclick="A.reportCsv()">خروجی CSV</button></div>
      <section class="card"><div class="flt">
        <label>از تاریخ<input type="date" value="${state.from}" onchange="ui.report.from=this.value;R()"></label>
        <label>تا تاریخ<input type="date" value="${state.to}" onchange="ui.report.to=this.value;R()"></label>
        <label>حساب<select onchange="ui.report.acc=this.value;R()">${accountOptions.map(([value, label]) => `<option value="${value}"${state.acc === value ? " selected" : ""}>${label}</option>`).join("")}</select></label>
        <label>دسته<select onchange="ui.report.cat=this.value;R()">${categoryOptions.map(([value, label]) => `<option value="${value}"${state.cat === value ? " selected" : ""}>${label}</option>`).join("")}</select></label>
        <label class="phase5-check"><input type="checkbox"${state.compare ? " checked" : ""} onchange="ui.report.compare=this.checked;R()"> مقایسه با بازهٔ قبل</label>
      </div></section>
      <div class="kpi-grid"><article class="card kpi-card"><span class="kpi-icon">${navIcon("net")}</span><div><small>درآمد بازه</small><b class="pos">${M(summary.i)}</b></div></article><article class="card kpi-card"><span class="kpi-icon">${navIcon("tx")}</span><div><small>هزینهٔ بازه</small><b class="neg">${M(summary.e)}</b></div></article><article class="card kpi-card"><span class="kpi-icon">${navIcon("goals")}</span><div><small>جریان نقدی خالص</small><b>${M(summary.n)}</b></div></article><article class="card kpi-card"><span class="kpi-icon">${navIcon("reports")}</span><div><small>تعداد تراکنش</small><b>${faNum(filtered.length)}</b></div></article></div>
      <div class="dash-grid"><section class="card chart-card wide"><header class="card-head"><div><h3>درآمد و هزینه در بازه</h3><small>${fd(state.from)} تا ${fd(state.to)}</small></div></header>${flow}</section><section class="card chart-card"><header class="card-head"><div><h3>تفکیک هزینه</h3><small>بر اساس دسته‌بندی</small></div></header>${donut}</section></div>
      ${comparison}
      <section class="card"><header class="card-head"><div><h3>خلاصهٔ ماهانه</h3><small>جمع درآمد، هزینه و خالص هر ماه</small></div></header>${rows ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>ماه</th><th>درآمد</th><th>هزینه</th><th>خالص</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="mu">در این بازه داده‌ای وجود ندارد.</p>'}</section>`;
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

const takeFlash = () => {
  if (!ui.flash) return "";
  const message = ui.flash;
  ui.flash = "";
  return `<div class="flash" role="status">${E(message)}</div>`;
};

const themeButtonHtml = () =>
  ui.theme === "dark"
    ? '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg>'
    : '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.5 6.5 0 0 0 9.8 9.8z"/></svg>';

const userLabel = () =>
  Cloud.status === "in" ? E(Cloud.user.first_name || Cloud.user.username) : "مهمان";

const drawerHtml = () => `<div class="drawer-head">
  <div class="brand">دارا<small>مدیریت مالی شخصی</small></div>
  <button class="icon-btn" type="button" onclick="A.toggleNav()" aria-label="بستن منو">✕</button>
</div>
<div class="drawer-scroll">
  ${NAV_GROUPS.map(
    (group) => `<div class="nav-group"><p class="nav-title">${group.title}</p>${group.items
      .map(
        ([key, label]) =>
          `<button class="nav-item${ui.page === key ? " on" : ""}" type="button" onclick="A.nav('${key}')"${ui.page === key ? ' aria-current="page"' : ""}>${navIcon(key)}<span>${label}</span></button>`,
      )
      .join("")}</div>`,
  ).join("")}
</div>
<div class="drawer-foot">
  <div class="drawer-user"><span class="avatar">${E(userLabel().slice(0, 1))}</span><div><b>${userLabel()}</b><small>${Cloud.status === "in" ? "حساب متصل" : "حالت مهمان"}</small></div></div>
  <div class="drawer-actions">
    <button class="btn btn-ghost" type="button" onclick="A.theme()">${themeButtonHtml()}<span>${ui.theme === "dark" ? "حالت روشن" : "حالت تاریک"}</span></button>
    ${
      Cloud.status === "in"
        ? '<button class="btn btn-ghost" type="button" onclick="A.logout()">خروج</button>'
        : '<button class="btn btn-ghost" type="button" onclick="A.openAccount()">ورود / ساخت حساب</button>'
    }
  </div>
</div>`;

const topbarHtml = () => `<button class="icon-btn menu-btn" type="button" data-menu-button onclick="A.toggleNav()" aria-label="باز کردن منو" aria-expanded="${ui.navOpen}">
    <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
  </button>
  <div class="topbar-title"><small>دارا</small><span class="topbar-title-text">${E(PAGE_TITLES[ui.page] || "داشبورد")}</span></div>
  <div class="topbar-actions">
    <button class="btn btn-primary" type="button" onclick="A.tx()">+ تراکنش</button>
    <button class="icon-btn" type="button" onclick="A.theme()" aria-label="تغییر تم">${themeButtonHtml()}</button>
    <button class="icon-btn" type="button" onclick="A.nav('set')" aria-label="پروفایل">${navIcon("set")}</button>
  </div>`;
function R() {
  window.DARA_IS_AUTHENTICATED = Cloud.status === "in";
  if (Cloud.status !== "in" && Cloud.status !== "guest") {
    $("nav").innerHTML = "";
    $("topbar").hidden = true;
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
  document.body.classList.toggle("nav-open", ui.navOpen);
  const backdrop = $("drawerBackdrop");
  if (backdrop) backdrop.hidden = !ui.navOpen || window.innerWidth >= 1024;
  const topbar = $("topbar");
  if (topbar) {
    topbar.hidden = false;
    topbar.innerHTML = topbarHtml();
  }
  $("nav").innerHTML = drawerHtml();
  $("m").innerHTML = takeFlash() +
    (Cloud.syncError
      ? `<section class="card" role="alert"><p>همگام‌سازی داده با سرور ناموفق بود: ${E(Cloud.syncError)}</p><button class="b" onclick="A.retryWorkspace()">تلاش دوباره</button></section>`
      : "") + pages[ui.page === "goals" ? "goals" : ui.page]();
  enhanceMoneyInputs($("m"));
}

document.addEventListener("click", (event) => {
  const node = event.target.closest?.("[data-chart-key]");
  if (!node) return;
  const chart = node.closest("[data-chart-name]");
  const name = chart ? chart.dataset.chartName : "";
  const key = node.dataset.chartKey;
  if (!key) return;
  if (name === "tx-cat") {
    ui.fc = key;
    R();
  } else if (name === "tx-month") {
    ui.off = Number(key) || 0;
    R();
  } else if (name === "report-cat") {
    ui.report = ui.report || {};
    ui.report.cat = key;
    R();
  }
});
window.DARA_RENDER = R;
document.getElementById("drawerBackdrop")?.addEventListener("click", () => A.toggleNav());
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && ui.navOpen && window.innerWidth < 1024) A.toggleNav();
});
if (new URLSearchParams(location.search).get("preview") === "1") {
  Cloud.status = "guest";
  R();
  // مهاجرت state در حافظه انجام شده؛ یک‌بار ذخیره می‌شود تا نسخهٔ ۳ پایدار بماند.
  if (stateUpgraded) persist();
} else {
  R();
  cloudBoot();
}
