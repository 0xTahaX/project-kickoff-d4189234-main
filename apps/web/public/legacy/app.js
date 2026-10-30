/*CORE*/
const P = (s) =>
  String(s)
    .replace(/[۰-۹]/g, (c) => "۰۱۲۳۴۵۶۷۸۹".indexOf(c))
    .replace(/[٠-٩]/g, (c) => "٠١٢٣٤٥٦٧٨٩".indexOf(c))
    .replace(/[,٬،\s]/g, "");
const parseAmt = (s, z) => {
  const t = P(s);
  return /^\d+$/.test(t) && +t >= (z ? 0 : 1) && +t <= 1e13 ? +t : null;
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
const goalNeed = (g, t) => {
  const left = Math.max(0, g.target - g.saved);
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
const nf = new Intl.NumberFormat("fa-IR"),
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
  v: 2,
  cur,
  accounts: [{ id: uid(), name: "نقد", type: "cash", opening: 0 }],
  cats: CATS.map((c) => ({ id: uid(), name: c[1], kind: "expense" })).concat([
    { id: uid(), name: "حقوق", kind: "income" },
    { id: uid(), name: "درآمد جانبی", kind: "income" },
  ]),
  tx: [],
  budgets: {},
  goals: [],
  rec: [],
});
let S;
try {
  S = JSON.parse(localStorage.getItem(K));
} catch {}
if (!S || S.v !== 2) S = newState();
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
  ft: "",
  fc: "",
  fa: "",
};
const cn = (id) => (S.cats.find((c) => c.id === id) || { name: "—" }).name,
  an = (id) => (S.accounts.find((a) => a.id === id) || { name: "—" }).name;
const accO = () => S.accounts.map((a) => [a.id, a.name]),
  catO = () =>
    S.cats.map((c) => [c.id, c.name + (c.kind === "income" ? " (درآمد)" : "")]);
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
  dl.innerHTML = `<form><h3>${t}</h3>${f.map((x) => `<label>${x.l}${x.t === "sel" ? `<select name=${x.k}>${x.o.map((o) => `<option value="${o[0]}"${o[0] == v[x.k] ? " selected" : ""}>${o[1]}</option>`).join("")}</select>` : `<input name=${x.k} type="${x.t === "date" ? "date" : "text"}" inputmode="${x.t === "amt" ? "numeric" : "text"}" value="${E(v[x.k] ?? "")}">`}</label>`).join("")}<p class=err id=er></p><div class=acts><button class=pri>ذخیره</button><button type=button class=b onclick="$('dlg').close()">انصراف</button></div></form>`;
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
const ACC_T = { cash: "CASH", bank: "BANK", savings: "SAVINGS", investment: "INVESTMENT" };
const accDto = (a) => ({
  id: a.id,
  name: a.name,
  type: ACC_T[a.type] || "CASH",
  opening_balance: String(Math.round((a.opening || 0) * factor())),
});
const txDto = (t) => {
  const accs = [t.acc, t.to].filter(Boolean).map((id) => S.accounts.find((a) => a.id === id));
  const c = t.cat ? S.cats.find((x) => x.id === t.cat) : null;
  return {
    transaction: {
      id: t.id,
      kind: t.type.toUpperCase(),
      amount: String(Math.round(t.amount * factor())),
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
const cloudWrite = (prevTx, work) =>
  work().catch((e) => {
    S.tx = prevTx;
    persist();
    R();
    alert("ذخیره در پایگاه داده ناموفق بود: " + e.message);
  });
const cloudSaveTx = (prevTx, t) =>
  cloudWrite(prevTx, () => api("PUT", "/finance/transactions/" + t.id, txDto(t)));
async function cloudLoad() {
  const L = await api("GET", "/finance/ledger");
  K = `dara.v2.${Cloud.user.id}`;
  let local;
  try {
    local = JSON.parse(localStorage.getItem(K));
  } catch {}
  S = local && local.v === 2 ? local : newState();
  const f = factor();
  const sa = L.accounts.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type.toLowerCase(),
    opening: Math.round(+a.opening_balance / f),
  }));
  S.accounts = sa.concat(S.accounts.filter((a) => !sa.some((x) => x.id === a.id)));
  const sc = L.categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind.toLowerCase() }));
  S.cats = sc.concat(S.cats.filter((c) => !sc.some((x) => x.id === c.id)));
  S.tx = L.transactions.map((t) => ({
    id: t.id,
    type: t.kind.toLowerCase(),
    amount: Math.round(+t.amount / f),
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
  tx: (id) => {
    const o = S.tx.find((t) => t.id === id) || {
      type: "expense",
      date: today(),
      acc: S.accounts[0]?.id,
    };
    form(
      id ? "ویرایش تراکنش" : "تراکنش جدید",
      [
        {
          k: "type",
          l: "نوع",
          t: "sel",
          o: [
            ["expense", "هزینه"],
            ["income", "درآمد"],
            ["transfer", "انتقال بین حساب‌ها"],
          ],
        },
        { k: "amount", l: `مبلغ (${S.cur})`, t: "amt" },
        { k: "date", l: "تاریخ (میلادی در ورودی؛ نمایش شمسی)", t: "date" },
        { k: "acc", l: "حساب (مبدأ)", t: "sel", o: accO() },
        { k: "to", l: "حساب مقصد (فقط برای انتقال)", t: "sel", o: accO() },
        { k: "cat", l: "دسته‌بندی", t: "sel", o: catO() },
        { k: "desc", l: "توضیح" },
        { k: "note", l: "یادداشت (اختیاری)" },
      ],
      o,
      (d) => {
        const a = parseAmt(d.amount);
        if (!a) return "مبلغ باید یک عدد مثبت باشد.";
        if (!okDate(d.date)) return "تاریخ معتبر نیست.";
        if (d.type === "transfer") {
          if (d.acc === d.to) return "حساب مبدأ و مقصد باید متفاوت باشند.";
        } else {
          const c = S.cats.find((c) => c.id === d.cat);
          if (!c || c.kind !== d.type)
            return "دسته‌بندی با نوع تراکنش سازگار نیست.";
        }
        const tr = d.type === "transfer";
        const prevTx = S.tx;
        S.tx = S.tx
          .filter((x) => x.id !== o.id)
          .concat({
            id: o.id || uid(),
            type: d.type,
            amount: a,
            date: d.date,
            acc: d.acc,
            to: tr ? d.to : null,
            cat: tr ? null : d.cat,
            desc: d.desc.trim(),
            note: d.note.trim(),
          });
        cloudSaveTx(prevTx, S.tx[S.tx.length - 1]);
      },
    );
  },
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
  goal: () =>
    form(
      "هدف جدید",
      [
        { k: "name", l: "نام هدف" },
        { k: "target", l: "مبلغ هدف", t: "amt" },
        { k: "saved", l: "مبلغ پس‌انداز‌شده تا امروز (۰ مجاز)", t: "amt" },
        { k: "date", l: "تاریخ هدف (اختیاری)", t: "date" },
      ],
      { saved: "0" },
      (d) => {
        const t = parseAmt(d.target),
          s = parseAmt(d.saved, 1);
        if (!d.name.trim()) return "نام هدف را وارد کنید.";
        if (!t) return "مبلغ هدف باید مثبت باشد.";
        if (s === null) return "مبلغ فعلی معتبر نیست.";
        if (d.date && (!okDate(d.date) || d.date <= today()))
          return "تاریخ هدف باید در آینده باشد.";
        S.goals.push({
          id: uid(),
          name: d.name.trim(),
          target: t,
          saved: s,
          date: d.date || "",
        });
      },
    ),
  add: (id) =>
    form(
      "افزودن به پس‌انداز",
      [{ k: "a", l: "مبلغ واریز", t: "amt" }],
      {},
      (d) => {
        const a = parseAmt(d.a);
        if (!a) return "مبلغ معتبر نیست.";
        S.goals.find((g) => g.id === id).saved += a;
      },
    ),
  dg: (id) => {
    if (confirm("هدف حذف شود؟")) {
      S.goals = S.goals.filter((g) => g.id !== id);
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
        const o = parseAmt(d.op, 1);
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
      ],
      {},
      (d) => {
        if (!d.name.trim()) return "نام را وارد کنید.";
        S.cats.push({ id: uid(), name: d.name.trim(), kind: d.kind });
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
    S.cur = v.trim() || "تومان";
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
  return `<li class=row><div><b>${E(t.desc || cn(t.cat))}</b><small>${fd(t.date)} · ${tr ? `از ${E(an(t.acc))} به ${E(an(t.to))}` : E(cn(t.cat)) + " · " + E(an(t.acc))}</small></div><span class="${tr ? "mu" : t.type === "income" ? "pos" : "neg"}">${s}${M(t.amount)}</span><span><button class=b onclick="A.tx('${t.id}')">ویرایش</button> <button class=b onclick="A.dtx('${t.id}')">حذف</button></span></li>`;
};
const budRows = (bc, only) =>
  Object.entries(S.budgets)
    .map(([c, l]) => {
      const s = bc[c] || 0,
        x = budget(s, l);
      return `<div><div class=row style="border:0;padding:2px 0"><span>${E(cn(c))}</span><small>${M(s)} از ${M(l)} (${nf.format(x.pct)}٪)</small></div>${bar(x.pct, x.lvl)}${x.lvl ? `<span class="tag ${x.lvl > 1 ? "r" : ""}">${x.lvl > 1 ? "بیش از سقف: " + M(-x.left) : "نزدیک سقف: " + M(x.left) + " باقی است"}</span>` : ""}</div>`;
    })
    .join("") ||
  none("هنوز بودجه‌ای تعیین نشده است؛ از صفحه بودجه‌ها شروع کنید.");
const goalRow = (g) => {
  const n = goalNeed(g, today()),
    p = Math.min(100, Math.round((g.saved / g.target) * 100));
  return `<div><div class=row style="border:0;padding:2px 0"><b>${E(g.name)}</b><small>${M(g.saved)} از ${M(g.target)} (${nf.format(p)}٪)</small></div>${bar(p)}<small>${n.left ? `باقی‌مانده ${M(n.left)}` + (n.m ? (n.late ? " — مهلت گذشته؛ مبلغ باقی‌مانده یک‌جا لازم است." : ` · حدود ${M(n.m)} در ماه برای ${nf.format(n.months)} ماه شمسی (بدون سود و تورم)`) : "") : "به هدف رسیده‌اید 🎉"}</small></div>`;
};
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
      `<div class=g>${kpi("موجودی کل حساب‌ها", M(sum(bl)))}${kpi("درآمد", M(T.i), "pos")}${kpi("هزینه", M(T.e), "neg")}${kpi("جریان نقدی خالص", M(T.n), T.n >= 0 ? "pos" : "neg")}</div><div class=g>${card("هزینه به تفکیک دسته", cs.map(([c, v]) => `<div class=row style="border:0;padding:2px 0"><span>${E(cn(c))}</span><small>${M(v)}</small></div>${bar((v / mx) * 100)}`).join("") || none("در این ماه هزینه‌ای ثبت نشده است."))}${card("بودجه‌ها", budRows(bc))}${card("اهداف پس‌انداز", S.goals.map(goalRow).join("") || none("هنوز هدفی نساخته‌اید."))}${card("سررسیدهای پیش‌رو", `<ul>${recUp()}</ul>`)}</div>${card("بینش‌ها", ins.length ? `<ul>${ins.map((i) => `<li class=row>${i}</li>`).join("")}</ul>` : none("با ثبت چند تراکنش، بینش‌ها اینجا ظاهر می‌شوند."))}${ui.off === 0 ? fcHtml() : ""}${card(
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
        `<select onchange="ui.${k}=this.value;R()"><option value="">همه</option>${o.map((x) => `<option value="${x[0]}"${ui[k] === x[0] ? " selected" : ""}>${x[1]}</option>`).join("")}</select>`;
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
              `<label>${E(c.name)}<input inputmode=numeric value="${S.budgets[c.id] || ""}" placeholder="سقف به ${S.cur}" onchange="A.bud('${c.id}',this.value)"></label>`,
          )
          .join(""),
      ) +
      card("وضعیت این ماه", budRows(bc))
    );
  },
  goals() {
    return (
      `<div class=top><h2 style="margin:0">اهداف پس‌انداز</h2><button class=pri onclick="A.goal()">+ هدف جدید</button></div>` +
      (S.goals
        .map(
          (g) =>
            `<section class=card>${goalRow(g)}<p><button class=b onclick="A.add('${g.id}')">افزودن مبلغ</button> <button class=b onclick="A.dg('${g.id}')">حذف</button></p></section>`,
        )
        .join("") ||
        none("هنوز هدفی ندارید. یک هدف بسازید تا سهم ماهانه‌اش محاسبه شود.")) +
      `<small>سهم ماهانه = مبلغ باقی‌مانده ÷ تعداد ماه‌های شمسی تا تاریخ هدف (حداقل ۱)، بدون سود و تورم. مبلغ هدف مستقل از موجودی حساب‌هاست.</small>`
    );
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
    return `<h2>تنظیمات</h2>${card("حساب‌ها", `<ul>${S.accounts.map((a) => `<li class=row><div><b>${E(a.name)}</b><small>موجودی اولیه: ${M(a.opening)}</small></div><span>${M(bl[a.id])}</span><button class=b onclick="A.da('${a.id}')">حذف</button></li>`).join("")}</ul><button class=b onclick="A.acct()">+ حساب</button><p><small>موجودی = موجودی اولیه + درآمد − هزینه ± انتقال‌ها. انتقال‌ها درآمد یا هزینه حساب نمی‌شوند.</small></p>`)}${card("دسته‌بندی‌ها", `<p>${S.cats.map((c) => `<span class="tag ${c.kind === "income" ? "g" : ""}">${E(c.name)}</span> `).join("")}</p><button class=b onclick="A.cat()">+ دسته</button>`)}${card("واحد پول", `<label>نام واحد (همه مبالغ یک واحد دارند و تبدیل ارز انجام نمی‌شود)<input value="${E(S.cur)}" onchange="A.cur(this.value)"></label>`)}${card("داده‌ها", `<button class=b onclick="A.reset()">پاک‌سازی داده‌های دفتر اصلی</button>`) }${window.DaraPhase5UI ? window.DaraPhase5UI.renderPrivacy(S) : ""}`;
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
function R() {
  window.DARA_IS_AUTHENTICATED = Cloud.status === "in";
  if (Cloud.status !== "in" && Cloud.status !== "guest") {
    $("nav").innerHTML = "<b>دارا</b>";
    $("m").innerHTML = authPage();
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
  $("m").innerHTML =
    (Cloud.syncError
      ? `<section class="card" role="alert"><p>همگام‌سازی داده با سرور ناموفق بود: ${E(Cloud.syncError)}</p><button class="b" onclick="A.retryWorkspace()">تلاش دوباره</button></section>`
      : "") + pages[ui.page === "goals" ? "goals" : ui.page]();
}
window.DARA_RENDER = R;
if (new URLSearchParams(location.search).get("preview") === "1") {
  Cloud.status = "guest";
  R();
} else {
  R();
  cloudBoot();
}
