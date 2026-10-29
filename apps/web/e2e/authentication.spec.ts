import { expect, test } from "@playwright/test";

test("the removed authentication routes open the guest dashboard", async ({ page }) => {
  for (const route of ["/", "/login", "/register", "/forgot-password", "/reset-password"]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/legacy\/index\.html\?preview=1$/);
    await expect(page.getByRole("button", { name: "تراکنش‌ها" })).toBeVisible();
  }
});

test("the legacy account page opens the guest dashboard", async ({ page }) => {
  await page.goto("/legacy/account.html");
  await expect(page).toHaveURL(/\/legacy\/index\.html$/);
  await expect(page.getByRole("button", { name: "تراکنش‌ها" })).toBeVisible();
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
  await expect(page.getByText("تعداد تراکنش محلی: 1", { exact: false })).toBeVisible();

  await page.locator("[data-phase5-file]").setInputFiles(file);
  await expect(page.getByText("تکراری: 1", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "ورود 0 تراکنش معتبر" })).toBeDisabled();
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
