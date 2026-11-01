import { expect, test } from "@playwright/test";

test("account routes open authentication and still allow an explicit guest session", async ({ page }) => {
  // این آزمون باید مستقل از محیط باشد؛ API عمداً قطع می‌شود تا حالت «سرور در دسترس نیست» بررسی شود.
  await page.route("**/api/**", (route) => route.abort("failed"));
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
  await page.route("**/api/**", (route) => route.abort("failed"));
  await page.goto("/legacy/account.html");
  await expect(page).toHaveURL(/\/legacy\/index\.html$/);
  await expect(page.getByRole("button", { name: "ادامه به عنوان مهمان" })).toBeVisible();
  await page.getByRole("button", { name: "ادامه به عنوان مهمان" }).click();
  await expect(page.getByRole("button", { name: "تراکنش‌ها" })).toBeVisible();
});

test("user-controlled account and category names are escaped in the transaction form", async ({ page }) => {
  const malicious = '<img src=x onerror="window.__xss=1">';
  await page.route("**/api/**", (route) => route.abort("failed"));
  await page.addInitScript((name) => {
    localStorage.setItem(
      "dara.v2.preview",
      JSON.stringify({
        v: 2,
        cur: "تومان",
        accounts: [{ id: "a1", name, type: "cash", opening: 0 }],
        cats: [{ id: "c1", name, kind: "expense" }],
        tx: [],
        budgets: {},
        goals: [],
        rec: [],
      }),
    );
  }, malicious);

  await page.goto("/legacy/index.html?preview=1");
  await page.getByRole("button", { name: "تراکنش‌ها" }).click();
  await page.getByRole("button", { name: "+ تراکنش جدید" }).click();

  const dialog = page.getByRole("dialog");
  // نام در <option> باید به‌صورت متن دیده شود، نه HTML اجراشده.
  await expect(dialog.locator("option", { hasText: malicious }).first()).toHaveText(malicious);
  await expect(dialog.locator("img")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
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
  const tradeDialog = page.getByRole("dialog");
  await tradeDialog.getByLabel("حساب / کارگزار").fill("کارگزار آزمایشی");
  await tradeDialog.getByLabel("نماد / جفت‌ارز").fill("ETHUSD");
  await tradeDialog.getByLabel("ارز مظنه").fill("USD");
  await tradeDialog.getByLabel("قیمت ورود").fill("100");
  await tradeDialog.getByLabel("حجم / تعداد قرارداد").fill("1");
  await tradeDialog.getByRole("button", { name: "ذخیره" }).click();
  await expect(page.getByText("ETHUSD", { exact: false }).first()).toBeVisible();

  await page.getByRole("button", { name: "ثبت خروج جزئی" }).click();
  const exitDialog = page.getByRole("dialog");
  await exitDialog.getByLabel(/حجم بسته‌شده/).fill("0.4");
  await exitDialog.getByLabel("قیمت خروج").fill("110");
  await exitDialog.getByRole("button", { name: "ذخیره" }).click();
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

test("savings goals: create from a template, then add, edit and delete contributions", async ({ page }) => {
  await page.route("**/api/**", (route) => route.abort("failed"));
  await page.goto("/legacy/index.html?preview=1");
  await page.getByRole("button", { name: "اهداف" }).click();
  await expect(page.getByRole("heading", { name: "اهداف پس‌انداز" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "اولین هدف پس‌اندازتان را بسازید" })).toBeVisible();

  await page.getByRole("button", { name: "سفر", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("نام هدف")).toHaveValue("سفر");
  await dialog.getByLabel("مبلغ هدف").fill("60000000");
  await expect(dialog.getByText("شصت میلیون تومان")).toBeVisible();
  await dialog.getByRole("button", { name: "ذخیره" }).click();

  const goalCard = page.locator(".goal-card");
  await expect(goalCard).toContainText("۶۰٬۰۰۰٬۰۰۰ تومان");
  await expect(goalCard).toContainText("۰٪");

  await goalCard.getByRole("button", { name: "+ ثبت پس‌انداز" }).click();
  await dialog.getByLabel("مبلغ پس‌انداز").fill("10000000");
  await dialog.getByLabel("یادداشت (اختیاری)").fill("پاداش");
  await dialog.getByRole("button", { name: "ذخیره" }).click();
  await expect(goalCard).toContainText("۱۶٪");
  await expect(goalCard).toContainText("پاداش");
  await expect(goalCard.locator(".contrib-row")).toHaveCount(1);
  // هدف تازه‌ساخته پیشرفت ۱۶٪ با انتظار ۰٪ دارد ⇒ جلوتر از برنامه؛ تاریخچه کافی برای تخمین نیست.
  await expect(goalCard.getByText("جلوتر از برنامه")).toBeVisible();
  await expect(goalCard).toContainText("اطلاعات کافی از پس‌اندازهای اخیر وجود ندارد");

  await goalCard.getByRole("button", { name: "ویرایش هدف" }).click();
  await dialog.getByLabel("نام هدف").fill("سفر نوروز");
  await dialog.getByRole("button", { name: "ذخیره" }).click();
  await expect(page.locator(".goal-card").filter({ hasText: "سفر نوروز" })).toHaveCount(1);

  await page.locator(".contrib-row").first().getByRole("button", { name: "ویرایش" }).click();
  await dialog.getByLabel("مبلغ پس‌انداز").fill("20000000");
  await dialog.getByRole("button", { name: "ذخیره" }).click();
  await expect(goalCard).toContainText("۳۳٪");

  page.once("dialog", (confirmation) => confirmation.accept());
  await page.locator(".contrib-row").first().getByRole("button", { name: "حذف" }).click();
  await expect(goalCard).toContainText("هنوز پس‌اندازی ثبت نشده است.");
  await expect(goalCard).toContainText("۰٪");
});

test("legacy saved goals migrate to contributions without data loss", async ({ page }) => {
  await page.route("**/api/**", (route) => route.abort("failed"));
  await page.addInitScript(() => {
    localStorage.setItem(
      "dara.v2.preview",
      JSON.stringify({
        v: 2,
        cur: "تومان",
        accounts: [{ id: "a1", name: "نقد", type: "cash", opening: 0 }],
        cats: [],
        tx: [],
        budgets: {},
        rec: [],
        goals: [{ id: "legacy-goal", name: "هدف قدیمی", target: 5000000, saved: 2000000, date: "" }],
      }),
    );
  });
  await page.goto("/legacy/index.html?preview=1");
  // داشبورد نیز باید هدف مهاجرت‌شده را با موجودی مشتق‌شده نشان دهد.
  const dashboardGoals = page.locator(".card").filter({ hasText: "اهداف پس‌انداز" });
  await expect(dashboardGoals).toContainText("هدف قدیمی");
  await expect(dashboardGoals).toContainText("۲٬۰۰۰٬۰۰۰ تومان");

  await page.getByRole("button", { name: "اهداف" }).click();
  await expect(page.getByRole("heading", { name: /هدف قدیمی/ })).toBeVisible();
  await expect(page.locator(".goal-card")).toContainText("۲٬۰۰۰٬۰۰۰ تومان");
  await expect(page.locator(".goal-card")).toContainText("وضعیت نامشخص");
  await expect(page.locator(".goal-card")).toContainText("اطلاعات کافی از پس‌اندازهای اخیر وجود ندارد");
  await expect(page.locator(".contrib-row")).toHaveCount(1);
  await expect(page.locator(".contrib-row")).toContainText("موجودی اولیه");

  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("dara.v2.preview") ?? "null"),
  );
  expect(stored.v).toBe(3);
  expect(stored.goals[0].saved).toBeUndefined();
  expect(stored.goals[0].contributions).toHaveLength(1);
});

test("transaction form filters categories by type, accepts a custom category and formats money", async ({ page }) => {
  await page.route("**/api/**", (route) => route.abort("failed"));
  await page.goto("/legacy/index.html?preview=1");
  await page.getByRole("button", { name: "تراکنش‌ها" }).click();
  await page.getByRole("button", { name: "+ تراکنش جدید" }).click();

  const dialog = page.getByRole("dialog");
  const category = dialog.getByLabel("دسته‌بندی");
  // هزینه: فقط دسته‌های هزینه و بدون فیلد حساب مقصد
  await expect(category.locator("option", { hasText: "خوراک" })).toHaveCount(1);
  await expect(category.locator("option", { hasText: "حقوق" })).toHaveCount(0);
  await expect(dialog.locator("[data-target-wrap]")).toBeHidden();

  // درآمد: فقط دسته‌های درآمد
  await dialog.getByLabel("نوع").selectOption("income");
  await expect(category.locator("option", { hasText: "حقوق" })).toHaveCount(1);
  await expect(category.locator("option", { hasText: "خوراک" })).toHaveCount(0);
  await expect(dialog.locator("[data-target-wrap]")).toBeHidden();

  // انتقال: بدون دسته‌بندی و با حساب مقصد
  await dialog.getByLabel("نوع").selectOption("transfer");
  await expect(dialog.locator("[data-category-wrap]")).toBeHidden();
  await expect(dialog.locator("[data-target-wrap]")).toBeVisible();

  // بازگشت به هزینه + فرمت زندهٔ پول
  await dialog.getByLabel("نوع").selectOption("expense");
  const amount = dialog.getByLabel(/^مبلغ/);
  await amount.fill("1000000");
  // جداکنندهٔ هزارگان فارسی (هم‌سو با Intl fa-IR در بقیهٔ برنامه) و پیش‌نمایش متنی.
  await expect(amount).toHaveValue("1٬000٬000");
  await expect(dialog.getByText("یک میلیون تومان")).toBeVisible();

  // افزودن دستهٔ جدید و انتخاب فوری
  await dialog.getByRole("button", { name: "+ افزودن دسته‌بندی جدید" }).click();
  const box = dialog.locator("[data-new-category-box]");
  const newName = box.getByLabel("نام دسته‌بندی جدید");
  await newName.fill("  هدیه  ");
  await box.getByRole("button", { name: "افزودن", exact: true }).click();
  await expect(category.locator("option:checked")).toHaveText(/هدیه/);

  // تکرار همان نام در همان نوع رد می‌شود
  await dialog.getByRole("button", { name: "+ افزودن دسته‌بندی جدید" }).click();
  await newName.fill("هدیه");
  await box.getByRole("button", { name: "افزودن", exact: true }).click();
  await expect(box.getByText("دسته‌بندی‌ای با این نام در همین نوع وجود دارد.")).toBeVisible();
  await box.getByRole("button", { name: "انصراف" }).click();

  await dialog.getByRole("button", { name: "ذخیره" }).click();
  // ردیف تراکنش‌ها (نه گزینهٔ پنهان دیالوگ بسته‌شده)
  const transactionRow = page.locator("main li.row").filter({ hasText: "هدیه" });
  await expect(transactionRow).toHaveCount(1);
  await expect(transactionRow).toContainText("۱٬۰۰۰٬۰۰۰ تومان");

  const state = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("dara.v2.preview") ?? "null"),
  );
  expect(state.tx).toHaveLength(1);
  expect(state.tx[0].amount).toBe(1000000);
  expect(state.tx[0].cat).toBeTruthy();
  expect(state.cats.some((entry) => entry.name === "هدیه" && entry.kind === "expense")).toBe(true);

  // دستهٔ ساخته‌شده در فرم بعدی هم هست و به نوع خودش محدود است
  await page.getByRole("button", { name: "+ تراکنش جدید" }).click();
  await expect(category.locator("option", { hasText: "هدیه" })).toHaveCount(1);
  await dialog.getByLabel("نوع").selectOption("income");
  await expect(category.locator("option", { hasText: "هدیه" })).toHaveCount(0);
});

test("goals support priority levels with a backward-compatible default", async ({ page }) => {
  await page.route("**/api/**", (route) => route.abort("failed"));
  await page.goto("/legacy/index.html?preview=1");
  await page.getByRole("button", { name: "اهداف" }).click();

  await page.getByRole("button", { name: "+ هدف جدید" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("اولویت هدف")).toHaveValue("2");
  await dialog.getByLabel("نام هدف").fill("خرید لپ‌تاپ");
  await dialog.getByLabel("مبلغ هدف").fill("50000000");
  await dialog.getByLabel("اولویت هدف").selectOption("4");
  await dialog.getByRole("button", { name: "ذخیره" }).click();

  const card = page.locator(".goal-card");
  await expect(card).toContainText("اولویت خیلی بالا");
  await expect(card.locator(".goal-priority-4")).toBeVisible();

  await card.getByRole("button", { name: "ویرایش هدف" }).click();
  await expect(dialog.getByLabel("اولویت هدف")).toHaveValue("4");
  await dialog.getByLabel("اولویت هدف").selectOption("1");
  await dialog.getByRole("button", { name: "ذخیره" }).click();
  await expect(card).toContainText("اولویت پایین");

  await page.goto("/legacy/index.html?preview=1");
  await page.getByRole("button", { name: "اهداف" }).click();
  await expect(page.locator(".goal-card")).toContainText("اولویت پایین");
});

test("a new user starts with an empty savings goals section", async ({ page }) => {
  await page.route("**/api/**", (route) => route.abort("failed"));
  await page.goto("/legacy/index.html?preview=1");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/legacy/index.html?preview=1");
  await page.getByRole("button", { name: "اهداف" }).click();
  await expect(page.getByRole("heading", { name: "اولین هدف پس‌اندازتان را بسازید" })).toBeVisible();
  await expect(page.locator(".goal-card")).toHaveCount(0);

  const state = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("dara.v2.preview") ?? "null"),
  );
  expect(state.goals).toEqual([]);
});

test("goals support description, start date, emoji and a savings plan", async ({ page }) => {
  await page.route("**/api/**", (route) => route.abort("failed"));
  await page.goto("/legacy/index.html?preview=1");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/legacy/index.html?preview=1");
  await page.getByRole("button", { name: "اهداف" }).click();

  await page.getByRole("button", { name: "+ هدف جدید" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("نام هدف").fill("خرید لپ‌تاپ");
  await dialog.getByLabel("توضیحات (اختیاری)").fill("برای کار و دانشگاه");
  await dialog.getByLabel("مبلغ هدف").fill("60000000");
  await dialog.getByRole("button", { name: /انتخاب ایموجی/ }).click();
  await dialog.locator("[data-emoji-tab='tech']").click();
  await dialog.locator("[data-emoji='💻']").click();
  await dialog.getByRole("button", { name: "ذخیره" }).click();

  const card = page.locator(".goal-card");
  await expect(card).toContainText("💻 خرید لپ‌تاپ");
  await expect(card).toContainText("برای کار و دانشگاه");
  await expect(card).toContainText("شروع");

  await card.getByRole("button", { name: "تنظیم برنامهٔ پس‌انداز" }).click();
  const planDialog = page.getByRole("dialog");
  await planDialog.getByLabel(/^مبلغ هر دوره/).fill("500000");
  await planDialog.locator('[name="period"]').selectOption("daily");
  await planDialog.getByRole("button", { name: "ذخیره" }).click();
  await expect(card).toContainText("برنامهٔ روزانه");

  await card.getByRole("button", { name: "ثبت پرداخت" }).first().click();
  const payDialog = page.getByRole("dialog");
  await payDialog.getByLabel(/^مبلغ واقعی/).fill("300000");
  await payDialog.getByRole("button", { name: "ثبت پس‌انداز" }).click();
  await expect(card).toContainText("انجام‌شده ۱");
  await expect(page.getByText("پس‌انداز این دوره ثبت شد. آفرین!")).toBeVisible();

  await card.getByRole("button", { name: "توقف موقت" }).click();
  await expect(card).toContainText("وضعیت متوقف");

  await page.goto("/legacy/index.html?preview=1");
  await page.getByRole("button", { name: "اهداف" }).click();
  await expect(page.locator(".goal-card")).toContainText("وضعیت متوقف");
  await expect(page.locator(".goal-card")).toContainText("💻");
});

test("overdue periods are flagged as late while future periods stay pending", async ({ page }) => {
  await page.route("**/api/**", (route) => route.abort("failed"));
  await page.addInitScript(() => {
    const start = new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10);
    localStorage.setItem(
      "dara.v2.preview",
      JSON.stringify({
        v: 3,
        cur: "تومان",
        accounts: [{ id: "a1", name: "نقد", type: "cash", opening: 0 }],
        cats: [],
        tx: [],
        budgets: {},
        rec: [],
        goals: [
          {
            id: "late-goal",
            name: "خرید خودرو",
            description: "",
            emoji: "🚗",
            target: 10_000_000,
            date: "",
            start_date: start,
            priority: 3,
            created_at: start,
            contributions: [],
            plan: {
              id: "plan-late",
              amount: 500_000,
              period: "daily",
              start_date: start,
              status: "active",
              created_at: start,
            },
            installments: [],
          },
        ],
      }),
    );
  });
  await page.goto("/legacy/index.html?preview=1");
  await page.getByRole("button", { name: "اهداف" }).click();
  const card = page.locator(".goal-card");
  await expect(card).toContainText("معوق");
  await expect(card.locator(".inst-late").first()).toBeVisible();
  await expect(card.locator(".inst-pending")).toHaveCount(1);

  // ثبت یکی از دوره‌های تأخیردار
  await card.getByRole("button", { name: "ثبت پرداخت" }).first().click();
  const payDialog = page.getByRole("dialog");
  await payDialog.getByLabel(/^مبلغ واقعی/).fill("500000");
  await payDialog.getByRole("button", { name: "ثبت پس‌انداز" }).click();
  await expect(card.locator(".inst-done")).toHaveCount(1);
});

test("trading journal: account, deposit, trade and partial exits update the balance", async ({ page }) => {
  await page.route("**/api/**", (route) => route.abort("failed"));
  await page.goto("/legacy/index.html?preview=1");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/legacy/index.html?preview=1");
  await page.getByRole("button", { name: "ژورنال معاملات" }).click();

  await page.getByRole("button", { name: "+ حساب معاملاتی جدید" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("نام حساب").fill("Bitunix");
  await dialog.getByLabel("کارگزار / صرافی").fill("Bitunix");
  await dialog.getByLabel("ارز حساب (مثلاً USD یا IRT)").fill("USD");
  await dialog.getByLabel("موجودی اولیه").fill("10000");
  await dialog.getByRole("button", { name: "ذخیره" }).click();

  await page.getByRole("button", { name: "واریز" }).first().click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel(/^مبلغ/).fill("2000");
  await dialog.getByRole("button", { name: "ذخیره" }).click();
  const accountCard = page.locator("section.card").filter({ hasText: "حساب‌های معاملاتی" });
  await expect(accountCard).toContainText("12000");

  await page.getByRole("button", { name: "+ ثبت معامله" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("نماد / جفت‌ارز").fill("BTC");
  await dialog.getByLabel("ارز مظنه").fill("USD");
  await dialog.getByLabel("قیمت ورود").fill("100");
  await dialog.getByLabel("حجم / تعداد قرارداد").fill("2");
  await dialog.getByLabel("نرخ کارمزد ورود (٪، جایگزین مبلغ)").fill("0.06");
  await dialog.getByLabel("حد ضرر (اختیاری)").fill("95");
  await dialog.getByLabel("حد سود (اختیاری)").fill("110");
  await dialog.getByRole("button", { name: "ذخیره" }).click();
  await expect(page.locator("table.phase4-table:not(.mm-table) tbody tr")).toHaveCount(1);

  await page.getByRole("button", { name: "ثبت خروج جزئی" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel(/^حجم بسته‌شده/).fill("1");
  await dialog.getByLabel("قیمت خروج").fill("110");
  await dialog.getByLabel("نرخ کارمزد خروج (٪، جایگزین مبلغ)").fill("0.06");
  await dialog.getByRole("button", { name: "ذخیره" }).click();
  // نیمهٔ بسته‌شده: سود ۱۰ − کارمزد ۰٫۱۲۶ = ۹٫۸۷۴
  await expect(accountCard).toContainText("12009.874");

  await page.getByRole("button", { name: "ثبت خروج جزئی" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel(/^حجم بسته‌شده/).fill("1");
  await dialog.getByLabel("قیمت خروج").fill("110");
  await dialog.getByLabel("نرخ کارمزد خروج (٪، جایگزین مبلغ)").fill("0.06");
  await dialog.getByRole("button", { name: "ذخیره" }).click();
  await expect(accountCard).toContainText("12019.748");
  await expect(page.locator("table.phase4-table:not(.mm-table) tbody tr")).toContainText("بسته");
});

test("money management calculator computes risk, staged targets and transfers to the trade form", async ({ page }) => {
  await page.route("**/api/**", (route) => route.abort("failed"));
  await page.goto("/legacy/index.html?preview=1");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/legacy/index.html?preview=1");
  await page.getByRole("button", { name: "ژورنال معاملات" }).click();

  const mm = page.locator("details.mm");
  await mm.getByLabel("موجودی حساب").fill("1000");
  await mm.getByLabel("ریسک هر معامله (٪)").fill("1");
  await mm.getByLabel("قیمت ورود").fill("100");
  await mm.getByLabel("حد ضرر").fill("98");
  await mm.getByLabel("کارمزد ورود (٪)").fill("0");
  await mm.getByLabel("کارمزد خروج (٪)").fill("0");
  await mm.getByLabel("قیمت تارگت 1").fill("104");
  await mm.getByLabel("درصد خروج تارگت 1").fill("50");
  await mm.getByLabel("فعال بودن تارگت 2").check();
  await mm.getByLabel("قیمت تارگت 2").fill("110");
  await mm.getByLabel("روش تارگت 2").selectOption("rr");
  await mm.getByLabel("RR تارگت 2").fill("2");
  await page.waitForTimeout(150);

  const result = page.locator("[data-mm-results]");
  await expect(result.locator(".kpi").filter({ hasText: "Risk Amount" })).toContainText("10");
  await expect(result.locator(".kpi").filter({ hasText: "Position Size" })).toContainText("5");
  await expect(result.locator(".kpi").filter({ hasText: "حداکثر زیان" })).toContainText("10");
  await expect(page.locator('[data-mm-out="0"]')).toContainText("۵۰");
  await expect(page.locator('[data-mm-out="1"]')).toContainText("۴۰");
  await expect(page.locator(".mm-summary")).toContainText("۹۰");
  await expect(page.locator(".mm-summary")).toContainText("معتبر");

  await page.getByRole("button", { name: "انتقال ورودی‌ها به فرم ثبت معامله" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("قیمت ورود")).toHaveValue("100");
  await expect(dialog.getByLabel("حجم / تعداد قرارداد")).toHaveValue("5");
  await expect(dialog.getByLabel("حد ضرر (اختیاری)")).toHaveValue("98");
  await dialog.getByRole("button", { name: "انصراف" }).click();

  await mm.getByLabel("حد ضرر").fill("100");
  await expect(result).toContainText("حد ضرر نباید برابر");
  await mm.getByLabel("حد ضرر").fill("98");
  await expect(page.locator(".mm-summary")).toContainText("معتبر");
});
