import { expect, test } from "@playwright/test";

test("account routes open authentication and still allow an explicit guest session", async ({ page }) => {
  for (const route of ["/", "/login", "/register", "/forgot-password", "/reset-password"]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/legacy\/index\.html(?:\?.*)?$/);
    await expect(page.getByRole("button", { name: "ادامه به عنوان مهمان" })).toBeVisible();
    await page.getByRole("button", { name: "ادامه به عنوان مهمان" }).click();
    await expect(page).toHaveURL(/\/legacy\/index\.html\?preview=1$/);
    await expect(page.getByRole("button", { name: "تراکنش‌ها" })).toBeVisible();
  }
});

test("the legacy account page opens auth and exposes the guest dashboard", async ({ page }) => {
  await page.goto("/legacy/account.html");
  await expect(page).toHaveURL(/\/legacy\/index\.html$/);
  await expect(page.getByRole("button", { name: "ادامه به عنوان مهمان" })).toBeVisible();
  await page.getByRole("button", { name: "ادامه به عنوان مهمان" }).click();
  await expect(page.getByRole("button", { name: "تراکنش‌ها" })).toBeVisible();
});

test("registration and username login are connected to the authentication API", async ({ page }) => {
  let registration: { username?: string; email?: string; first_name?: string } | null = null;
  await page.route("**/api/me", (route) =>
    route.fulfill({ status: 401, json: { code: "UNAUTHORIZED", message: "وارد نشده‌اید." } }),
  );
  await page.route("**/api/auth/register", (route) => {
    registration = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: { message: "حساب ساخته شد و وارد شدید." } });
  });
  await page.route("**/api/auth/login", (route) =>
    route.fulfill({
      status: 401,
      json: { code: "INVALID_CREDENTIALS", message: "نام کاربری یا گذرواژه درست نیست." },
    }),
  );

  await page.goto("/");
  await page.getByRole("button", { name: "ثبت‌نام" }).click();

  const panel = page.locator(".auth-panel");
  await panel.getByLabel("نام نمایشی (اختیاری)").fill("آزمایشی");
  await panel.getByLabel("نام کاربری", { exact: true }).fill("Dara_User");
  await panel.getByLabel("گذرواژه (حداقل ۱۰ کاراکتر، شامل حرف و عدد)").fill("securepass123");
  await panel.getByLabel("تکرار گذرواژه").fill("securepass123");
  await panel.getByLabel("ایمیل برای بازیابی گذرواژه (اختیاری)").fill("test@example.com");
  await panel.getByRole("checkbox").check();

  const registrationRequest = page.waitForRequest("**/api/auth/register");
  await panel.getByRole("button", { name: "ساخت حساب" }).click();
  registration = (await registrationRequest).postDataJSON();
  expect(registration).toMatchObject({
    username: "Dara_User",
    email: "test@example.com",
    first_name: "آزمایشی",
  });

  // پاسخ ثبت‌نام نشست می‌سازد و صفحه دوباره بارگذاری می‌شود؛ اینجا /api/me همچنان 401 است.
  await expect(page.getByRole("heading", { name: "ورود به دارا" })).toBeVisible();

  const loginForm = page.locator("form");
  await loginForm.getByLabel("نام کاربری", { exact: true }).fill("dara_user");
  await loginForm.getByLabel("گذرواژه", { exact: true }).fill("wrongpass123");
  await loginForm.getByRole("button", { name: "ورود" }).click();
  await expect(page.getByText("نام کاربری یا گذرواژه درست نیست.")).toBeVisible();
});

test("the registration form refuses a mismatched password confirmation", async ({ page }) => {
  await page.route("**/api/me", (route) =>
    route.fulfill({ status: 401, json: { code: "UNAUTHORIZED", message: "وارد نشده‌اید." } }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "ثبت‌نام" }).click();

  const panel = page.locator(".auth-panel");
  await panel.getByLabel("نام کاربری", { exact: true }).fill("dara_user");
  await panel.getByLabel("گذرواژه (حداقل ۱۰ کاراکتر، شامل حرف و عدد)").fill("securepass123");
  await panel.getByLabel("تکرار گذرواژه").fill("securepass124");
  await panel.getByRole("checkbox").check();
  await panel.getByRole("button", { name: "ساخت حساب" }).click();

  await expect(page.getByText("گذرواژهٔ دوم با گذرواژهٔ اول یکسان نیست.")).toBeVisible();
});

test("guest users can record an asset and track an investment holding", async ({ page }) => {
  await page.goto("/legacy/index.html?preview=1");
  await page.getByRole("button", { name: "دارایی‌ها" }).click();
  await page.getByRole("button", { name: "+ دارایی" }).click();

  await page.getByLabel("نام", { exact: true }).fill("ملک آزمایشی");
  await page.getByRole("dialog").getByLabel("نوع دارایی").selectOption("real_estate");
  await page.getByLabel("مقدار", { exact: true }).fill("1");
  await page.getByLabel("واحد", { exact: true }).fill("ملک");
  await page.getByLabel("ارز ارزش‌گذاری").fill("تومان");
  await page.getByLabel("بهای تمام‌شدهٔ کل (خالی = نامشخص؛ صفر = رایگان)").fill("400000");
  await page.getByLabel("ارزش فعلی کل (اختیاری)").fill("500000");
  await page.getByLabel("درصد مالکیت").fill("50");
  await page.getByLabel("بدهی مرتبط با این دارایی (اختیاری)").fill("100000");
  await page.getByRole("button", { name: "ذخیره" }).click();
  await expect(page.getByRole("button", { name: "ملک آزمایشی" })).toBeVisible();

  await page.getByRole("button", { name: "+ دارایی" }).click();
  await page.getByLabel("نام", { exact: true }).fill("سهم آزمایشی");
  await page.getByRole("dialog").getByLabel("نوع دارایی").selectOption("stock");
  await page.getByLabel("مقدار", { exact: true }).fill("0");
  await page.getByLabel("واحد", { exact: true }).fill("سهم");
  await page.getByLabel("ارز ارزش‌گذاری").fill("تومان");
  await page.getByLabel("قیمت واحد فعلی (برای سبد سرمایه‌گذاری)").fill("10");
  await page.getByRole("button", { name: "ذخیره" }).click();

  await page.getByRole("button", { name: "سرمایه‌گذاری" }).click();
  await expect(page.getByRole("heading", { name: "سبد سرمایه‌گذاری" })).toBeVisible();
  await page.getByRole("button", { name: "+ رویداد سرمایه‌گذاری" }).click();
  await page.getByLabel("نوع رویداد").selectOption("buy");
  await page.getByRole("dialog").locator('select[name="assetId"]').selectOption({ label: "سهم آزمایشی (تومان)" });
  await page.getByLabel("مقدار سهم/واحد").fill("1");
  await page.getByLabel("قیمت خرید/فروش هر واحد").fill("1");
  await page.getByLabel("ارز معامله/مبلغ").fill("تومان");
  await page.getByLabel("تاریخ معامله").fill(new Date().toISOString().slice(0, 10));
  await page.getByRole("button", { name: "ذخیره" }).click();
  await expect(page.getByText("1 سهم", { exact: true })).toHaveCount(2);

  await page.getByRole("button", { name: "ارزش خالص" }).click();
  await expect(page.getByRole("heading", { name: "داشبورد ارزش خالص" })).toBeVisible();
  await expect(page.getByText("این یک برآورد شخصی است", { exact: false })).toBeVisible();
});

test("the markets page labels quote units and hides unavailable changes", async ({ page }) => {
  await page.route("**/api/markets", async (route) => {
    await route.fulfill({
      json: {
        provider: "Iran Market Data",
        sourceUrl: "https://iran-market.github.io/",
        fetchedAt: "2026-10-25T19:00:00.000Z",
        refreshFailed: false,
        message: null,
        prices: [
          {
            id: "usd_free",
            name: "دلار آمریکا (بازار آزاد)",
            unit: "هر دلار",
            currencyLabel: "تومان",
            price: 269500,
            change: 1000,
            changePercent: 0.37,
            updatedAt: "2026-10-25T18:50:00.000Z",
            source: "tgju",
            status: "fresh",
          },
          {
            id: "gold_ounce",
            name: "اونس جهانی طلا",
            unit: "هر اونس تروا",
            currencyLabel: "دلار آمریکا",
            price: 3993.96,
            change: null,
            changePercent: null,
            updatedAt: "2026-10-25T17:00:00.000Z",
            source: "tgju",
            status: "stale",
          },
          {
            id: "silver_ounce",
            name: "اونس جهانی نقره",
            unit: "هر اونس تروا",
            currencyLabel: "دلار آمریکا",
            price: null,
            change: null,
            changePercent: null,
            updatedAt: null,
            source: null,
            status: "unavailable",
          },
        ],
      },
    });
  });

  await page.goto("/legacy/index.html?preview=1");
  await page.getByRole("button", { name: "بازارها" }).click();

  await expect(page.getByRole("heading", { name: "بازارها" })).toBeVisible();
  await expect(page.getByText("دلار آمریکا (بازار آزاد)")).toBeVisible();
  await expect(page.getByText("هر اونس تروا").first()).toBeVisible();
  await expect(page.getByText("قدیمی", { exact: true })).toBeVisible();
  await expect(page.locator(".market-status-unavailable")).toBeVisible();
  await expect(page.getByText("تغییر معتبر در دسترس نیست").first()).toBeVisible();
});

test("the markets page shows unavailable prices if the API cannot be reached", async ({ page }) => {
  await page.route("**/api/markets", (route) => route.abort("failed"));
  await page.goto("/legacy/index.html?preview=1");
  await page.getByRole("button", { name: "بازارها" }).click();

  await expect(
    page.getByText("ارتباط با سرویس بازار برقرار نشد", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".market-status-unavailable")).toHaveCount(5);
});

test("guest users can register a public wallet and journal a partially closed trade", async ({ page }) => {
  await page.goto("/legacy/index.html?preview=1");
  await page.getByRole("button", { name: "بلاک‌چین" }).click();
  await page.getByRole("button", { name: "+ افزودن کیف پول" }).click();
  await page.getByLabel("نام نمایشی").fill("کیف عمومی");
  await page.getByLabel("نشانی عمومی 0x…").fill("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045");
  await page.getByRole("dialog").getByLabel("طبقه‌بندی مالکیت").selectOption("unknown");
  await page.getByRole("button", { name: "ذخیره" }).click();
  await expect(page.getByRole("heading", { name: "کیف عمومی" })).toBeVisible();
  await expect(page.getByText("نشانی عمومی اثبات مالکیت نیست", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "ژورنال معاملات" }).click();
  await page.getByRole("button", { name: "+ ثبت معامله" }).click();
  await page.getByLabel("حساب / کارگزار").fill("کارگزار آزمایشی");
  await page.getByLabel("نماد / جفت‌ارز").fill("ETHUSD");
  await page.getByLabel("ارز مظنه").fill("USD");
  await page.getByLabel("قیمت ورود").fill("100");
  await page.getByLabel("حجم / تعداد قرارداد").fill("1");
  await page.getByRole("button", { name: "ذخیره" }).click();
  await expect(page.getByText("ETHUSD", { exact: false }).first()).toBeVisible();

  await page.getByRole("button", { name: "ثبت خروج جزئی" }).click();
  await page.getByLabel(/حجم بسته‌شده/).fill("0.4");
  await page.getByLabel("قیمت خروج").fill("110");
  await page.getByRole("button", { name: "ذخیره" }).click();
  const tradeRow = page.getByRole("row").filter({ hasText: "ETHUSD" });
  await expect(tradeRow).toContainText("بخشی بسته");
  await expect(tradeRow).toContainText("۰٫۶ / ۱");
});

test("the assistant clearly separates local calculations from an unconfigured model", async ({ page }) => {
  await page.goto("/legacy/index.html?preview=1");
  await page.getByRole("button", { name: "دستیار" }).click();
  await expect(page.getByRole("heading", { name: "خلاصهٔ محلی محاسبه‌شده · بدون هوش مصنوعی" })).toBeVisible();
  await expect(page.getByText("هیچ مدل زبانی یا پاسخ ساختگی فعال نیست", { exact: false })).toBeVisible();
  await page.getByLabel("اهداف مالی اولیه (هر خط یک مورد)").fill("پس‌انداز اضطراری\nکاهش بدهی");
  await page.getByRole("button", { name: "ذخیرهٔ ترجیحات" }).click();
  await expect(page.getByText("ترجیحات ذخیره شد", { exact: false })).toBeVisible();
});

test("invalid saved assistant preferences remain visible and are not overwritten", async ({ page }) => {
  const invalidPreferences = JSON.stringify({ timeZone: "Not/AZone" });
  await page.addInitScript((value) => {
    localStorage.setItem("dara.phase5.preview.v1", value);
  }, invalidPreferences);
  await page.goto("/legacy/index.html?preview=1");
  await page.getByRole("button", { name: "دستیار" }).click();
  await expect(page.getByText("تنظیمات فقط‌خواندنی است", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "ذخیرهٔ ترجیحات" }).click();
  await expect(page.getByText("ذخیرهٔ تنظیمات متوقف شد", { exact: false })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("dara.phase5.preview.v1")))
    .toBe(invalidPreferences);
});

test("CSV transaction import validates, maps, deduplicates, and previews before saving", async ({ page }) => {
  await page.goto("/legacy/index.html?preview=1");
  await page.getByRole("button", { name: "تنظیمات" }).click();
  const contents = [
    "date,type,amount,account,category,description,note,targetAccount",
    "2026-10-01,expense,250,نقد,خوراک,خرید آزمایشی,یادداشت,",
  ].join("\r\n");
  const file = {
    name: "transactions.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(contents, "utf8"),
  };
  await page.locator("[data-phase5-file]").setInputFiles(file);
  await expect(page.getByText("آمادهٔ ورود: 1", { exact: false })).toBeVisible();
  await expect(page.getByText("2026-10-01", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "ورود 1 تراکنش معتبر" }).click();
  await expect(page.getByText("تعداد تراکنش: 1", { exact: false })).toBeVisible();

  await page.locator("[data-phase5-file]").setInputFiles(file);
  await expect(page.getByText("تکراری: 1", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "ورود 0 تراکنش معتبر" })).toBeDisabled();
});

test("authenticated CSV imports are sent to the server ledger", async ({ page }) => {
  let importBody: {
    accounts: { id: string }[];
    categories: { id: string; kind: string }[];
    transactions: { id: string; account_id: string; category_id: string }[];
  } | null = null;
  await page.route("**/api/me", (route) =>
    route.fulfill({ json: { id: "11111111-1111-4111-8111-111111111111", primary_currency: "IRR" } }),
  );
  await page.route("**/api/finance/workspace", (route) =>
    route.fulfill({ json: {} }),
  );
  await page.route("**/api/finance/workspace/**", (route) => route.fulfill({ status: 204 }));
  await page.route("**/api/finance/ledger", (route) =>
    route.fulfill({ json: { currency: "IRR", accounts: [], categories: [], transactions: [] } }),
  );
  await page.route("**/api/finance/transactions/import", async (route) => {
    importBody = route.request().postDataJSON();
    await route.fulfill({ status: 204 });
  });

  await page.goto("/legacy/index.html");
  await page.getByRole("button", { name: "تنظیمات" }).click();
  const contents = [
    "date,type,amount,account,category,description,note,targetAccount",
    "2026-10-01,expense,250,نقد,خوراک,خرید آزمایشی,یادداشت,",
  ].join("\r\n");
  await page.locator("[data-phase5-file]").setInputFiles({
    name: "transactions.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(contents, "utf8"),
  });
  await page.getByRole("button", { name: "ورود 1 تراکنش معتبر" }).click();
  await expect(page.getByText("تعداد تراکنش: 1", { exact: false })).toBeVisible();
  expect(importBody).not.toBeNull();
  expect(importBody?.transactions).toHaveLength(1);
  expect(importBody?.transactions[0].id).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  expect(importBody?.accounts.map((account) => account.id)).toContain(
    importBody?.transactions[0].account_id,
  );
  expect(importBody?.categories.map((category) => category.id)).toContain(
    importBody?.transactions[0].category_id,
  );
});

test("local notifications are deduplicated and preference-controlled", async ({ page }) => {
  await page.addInitScript(() => {
    const date = new Date().toISOString().slice(0, 10);
    const state = {
      v: 2,
      cur: "تومان",
      accounts: [{ id: "a1", name: "نقد", type: "cash", opening: 0 }],
      cats: [{ id: "food", name: "خوراک", kind: "expense" }, { id: "sal", name: "حقوق", kind: "income" }],
      tx: [{ id: "tx1", type: "expense", amount: 850, date, acc: "a1", to: null, cat: "food", desc: "خرید", note: "" }],
      budgets: { food: 1000 },
      goals: [{ id: "goal1", name: "ذخیره", target: 1000, saved: 500, date: "" }],
      rec: [{ id: "rec1", name: "قبض", type: "expense", amount: 200, cat: "food", acc: "a1", freq: "monthly", next: date }],
    };
    localStorage.setItem("dara.v2.preview", JSON.stringify(state));
  });
  await page.goto("/legacy/index.html?preview=1");
  await page.getByRole("button", { name: "یادآورها" }).click();
  await expect(page.getByText("بودجه به آستانه نزدیک است")).toBeVisible();
  await expect(page.getByText("سررسید پرداخت تکرارشونده")).toBeVisible();
  await expect(page.getByText("هدف پس‌انداز به 50٪ رسید")).toBeVisible();
  await page.getByRole("button", { name: "خواندم" }).first().click();
  await expect(page.getByText("خوانده‌شده", { exact: true })).toBeVisible();
});
