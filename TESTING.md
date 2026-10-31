# تست و کیفیت (TESTING)

## دستورهای اجرا

| دستور | چه چیزی را اجرا می‌کند | نیازمندی |
|---|---|---|
| `npm test` | تست‌های API (Vitest)، وب (Vitest) و legacy (node:test) | بدون دیتابیس |
| `npm run test:e2e` | Playwright (Chromium) برای جریان‌های رابط | Chromium نصب‌شده |
| `npm run typecheck` | tsc برای API و وب | — |
| `npm run build:all` | Prisma generate + build وب + build API | — |
| `npm run security:smoke` | ۱۳ بررسی BOLA/IDOR و درستی ارز روی API در حال اجرا | API + دیتابیس + `BASE_URL` |

مثال اجرای آزمون امنیتی روی نسخهٔ محلی:

```powershell
$env:BASE_URL = "http://127.0.0.1:3001"
npm run security:smoke
```

## آنچه پوشش داده می‌شود

### API (Vitest — ۹۶ تست)

- `auth/auth.integration.test.ts`: ثبت‌نام/ورود با نام کاربری، یکسان‌سازی نام، پیام‌های عمومی ایمیل،
  HSTS و کوکی امن، تغییر/بازیابی گذرواژه، **استفادهٔ دوباره و انقضای توکن**، قفل ارز.
- `auth/schemas.test.ts`: اعتبارسنجی نام کاربری/گذرواژه/فرم.
- `database/prisma-auth.repository.test.ts`: `maxWait` همهٔ تراکنش‌ها، مصرف اتمیک reset، `hasLedgerEntries`.
- `finance/currency.test.ts`: ارز تراکنش از حساب، رد انتقال بین دو ارز.
- `finance/routes.test.ts` و `workspace.routes.test.ts`: اعتبارسنجی تراکنش/import، کلیدهای مجاز workspace،
  اندازهٔ ۵۱۲ KiB، نیاز به احراز هویت.
- `http/security-log.test.ts`: خروجی JSON امنیتی، hash شدن actor و نبود نام خام.
- `mail/brevo.test.ts`: ساخت درخواست HTTPS، عدم نشت بدنهٔ خطا، انتخاب ترابری.
- بازارها/بلاک‌چین/دستیار: cache، timeout، پاسخ ناقص و نبود provider.

### وب (Vitest — ۶ تست)

- ریدایرکت مسیرها به داشبورد و صفحهٔ terms/privacy.

### Legacy (node:test — ۲۸ تست)

- `money-core.test.js`: نمایش اعشاری، ضرب/تقسیم دقیق، گردکردن نیم‌به‌بالا، رد ورودی نامعتبر.
- `phase4-core`, `phase5-core`, `assets-core`, `validators`, `server.test.js`: منطق کیف پول/ژورنال،
  ترجیحات و یادآورها، CSV، دارایی‌ها و مسیرهای قدیمی.

### End-to-End (Playwright — ۱۴ تست)

- ثبت‌نام/ورود با نام کاربری، اعتبارسنجی فرم، **escape نام‌های کاربری در فرم تراکنش**،
  مهمان، دارایی/سرمایه‌گذاری، بازارها (موفق/خطا)، کیف پول و ژورنال، دستیار، CSV، یادآورها.
- آزمون‌های مربوط به حالت «سرور در دسترس نیست» با `page.route("**/api/**", abort)` مستقل از محیط‌اند؛
  دیگر به خاموش‌بودن API وابسته نیستند.

### آزمون امنیتی BOLA/IDOR (`scripts/security-smoke.mjs`)

با دو کاربر واقعی و دیتابیس واقعی بررسی می‌کند:

1. کاربر A تراکنش/حساب می‌سازد و می‌بیند.
2. کاربر B نمی‌تواند تراکنش یا حساب A را بخواند.
3. درخواست بدون نشست ۴۰۱ می‌گیرد.
4. حذف رکورد A توسط B آن را حذف نمی‌کند.
5. نوشتن با شناسهٔ حساب A توسط B رد می‌شود.
6. workspace دو کاربر جداست.
7. ارز تراکنش با ارز حساب یکسان می‌ماند.
8. تغییر ارز اصلی پس از ثبت حساب ۴۰۹ می‌گیرد.

> این اسکریپت دادهٔ آزمایشی می‌سازد (نام‌های `sec_*`) و هیچ داده‌ای را حذف نمی‌کند.

## نکات

- تست‌های API با repository در حافظه اجرا می‌شوند و به PostgreSQL نیاز ندارند؛ رفتار واقعی DB
  (FK مرکب، Decimal، مصرف اتمیک) با `security:smoke` روی دیتابیس محلی بررسی می‌شود.
- ویرایشگر تست legacy در `apps/web` به‌صورت ESM اجرا می‌شود؛ فایل‌های `*-core.js` با الگوی UMD
  روی `globalThis` قرار می‌گیرند (`import "./money-core.js"` سپس `globalThis.DaraMoney`).
- هر تغییر در منطق مالی باید حداقل یک تست `money-core` یا `currency` داشته باشد.
