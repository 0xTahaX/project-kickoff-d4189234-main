// آزمون امنیتی BOLA/IDOR روی یک API در حال اجرا (پیش‌فرض: نسخهٔ محلی).
// فقط دادهٔ آزمایشی می‌سازد و چیزی از داده‌های واقعی را حذف نمی‌کند.
// اجرا: BASE_URL=http://127.0.0.1:3001 node scripts/security-smoke.mjs
const base = (process.env.BASE_URL ?? "http://127.0.0.1:3001").replace(/\/+$/, "");
const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const results = [];

function check(name, condition, detail = "") {
  results.push({ name, ok: Boolean(condition), detail });
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${condition || !detail ? "" : ` — ${detail}`}`);
}

async function call(method, path, body, cookie) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      "X-Requested-With": "dara",
      Origin: base,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const cookies = response.headers.getSetCookie();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
    cookie: (cookies.find((value) => value.startsWith("dara_session=")) ?? "").split(";")[0],
  };
}

async function register(username) {
  const result = await call("POST", "/api/auth/register", {
    username,
    password: "securitypass123",
    first_name: username,
    accepted_terms: true,
  });
  if (result.status !== 201) throw new Error(`register ${username}: ${result.status} ${result.body?.message}`);
  return result.cookie;
}

function ledgerShape(ledger) {
  return {
    accounts: new Set(ledger.accounts.map((account) => account.id)),
    transactions: new Set(ledger.transactions.map((transaction) => transaction.id)),
  };
}

const cookieA = await register(`sec_a_${suffix}`);
const cookieB = await register(`sec_b_${suffix}`);

const accountA = crypto.randomUUID();
const categoryA = crypto.randomUUID();
const txA = crypto.randomUUID();
const saved = await call(
  "PUT",
  `/api/finance/transactions/${txA}`,
  {
    transaction: {
      id: txA,
      kind: "EXPENSE",
      amount: "15000",
      occurred_on: new Date().toISOString().slice(0, 10),
      account_id: accountA,
      target_id: null,
      category_id: categoryA,
      description: "رکورد آزمایشی مالک A",
      note: "",
    },
    accounts: [{ id: accountA, name: "حساب A", type: "CASH", opening_balance: "0" }],
    category: { id: categoryA, name: "دستهٔ A", kind: "EXPENSE" },
  },
  cookieA,
);
check("owner can create a transaction", saved.status === 204, `status=${saved.status}`);

const ledgerA = await call("GET", "/api/finance/ledger", undefined, cookieA);
const a = ledgerShape(ledgerA.body);
check("owner sees own transaction", a.transactions.has(txA) && a.accounts.has(accountA));

const ledgerB = await call("GET", "/api/finance/ledger", undefined, cookieB);
const b = ledgerShape(ledgerB.body);
check("other user cannot read the owner's transaction", !b.transactions.has(txA));
check("other user cannot read the owner's account", !b.accounts.has(accountA));

const anonymous = await call("GET", "/api/finance/ledger");
check("unauthenticated ledger request is rejected", anonymous.status === 401, `status=${anonymous.status}`);

const deleteForeignTx = await call("DELETE", `/api/finance/transactions/${txA}`, undefined, cookieB);
const ledgerAAfter = await call("GET", "/api/finance/ledger", undefined, cookieA);
check(
  "delete of a foreign transaction does not remove it",
  ledgerShape(ledgerAAfter.body).transactions.has(txA),
  `status=${deleteForeignTx.status}`,
);

const deleteForeignAccount = await call("DELETE", `/api/finance/accounts/${accountA}`, undefined, cookieB);
const ledgerAAfter2 = await call("GET", "/api/finance/ledger", undefined, cookieA);
check(
  "delete of a foreign account does not remove it",
  ledgerShape(ledgerAAfter2.body).accounts.has(accountA),
  `status=${deleteForeignAccount.status}`,
);

const referenceForeignAccount = await call(
  "PUT",
  `/api/finance/transactions/${crypto.randomUUID()}`,
  {
    transaction: {
      id: crypto.randomUUID(),
      kind: "EXPENSE",
      amount: "5000",
      occurred_on: new Date().toISOString().slice(0, 10),
      account_id: accountA,
      target_id: null,
      category_id: null,
      description: "تلاش برای نوشتن روی حساب دیگران",
      note: "",
    },
    accounts: [{ id: accountA, name: "حساب A", type: "CASH", opening_balance: "0" }],
    category: null,
  },
  cookieB,
);
check(
  "writing with another user's account id is rejected",
  referenceForeignAccount.status >= 400 && referenceForeignAccount.status < 500,
  `status=${referenceForeignAccount.status}`,
);

const dashboardA = { note: `owner-${suffix}` };
const workspaceWrite = await call("PUT", "/api/finance/workspace/dashboard", { data: dashboardA }, cookieA);
check("owner can write own workspace", workspaceWrite.status === 204);

const workspaceB = await call("GET", "/api/finance/workspace", undefined, cookieB);
check(
  "other user's workspace is separate",
  !JSON.stringify(workspaceB.body ?? {}).includes(`owner-${suffix}`),
);

const unauthorized = await call("GET", "/api/me", undefined, cookieB);
check("session is valid for its owner", unauthorized.status === 200, `status=${unauthorized.status}`);

// درستی ارز: تراکنش باید ارز حساب را نگه دارد و تغییر ارز اصلی پس از ثبت حساب ممنوع باشد.
const cookieC = await register(`sec_c_${suffix}`);
const accountC = crypto.randomUUID();
const categoryC = crypto.randomUUID();
const txC = crypto.randomUUID();
await call(
  "PUT",
  `/api/finance/transactions/${txC}`,
  {
    transaction: {
      id: txC,
      kind: "EXPENSE",
      amount: "2500",
      occurred_on: new Date().toISOString().slice(0, 10),
      account_id: accountC,
      target_id: null,
      category_id: categoryC,
      description: "بررسی ارز",
      note: "",
    },
    accounts: [{ id: accountC, name: "حساب C", type: "CASH", opening_balance: "0" }],
    category: { id: categoryC, name: "دستهٔ C", kind: "EXPENSE" },
  },
  cookieC,
);
const ledgerC = await call("GET", "/api/finance/ledger", undefined, cookieC);
const txRecord = ledgerC.body?.transactions?.find((transaction) => transaction.id === txC);
check(
  "transaction keeps the currency of its account",
  txRecord?.currency === "IRR" && ledgerC.body?.currency === "IRR",
  `currency=${txRecord?.currency}`,
);
const currencyChange = await call("PATCH", "/api/me", { primary_currency: "USD" }, cookieC);
check(
  "primary currency is locked once ledger entries exist",
  currencyChange.status === 409 && currencyChange.body?.code === "CURRENCY_LOCKED",
  `status=${currencyChange.status}`,
);

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} security checks passed`);
if (failed.length) process.exitCode = 1;
