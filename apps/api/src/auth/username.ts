// نام کاربری پیش از ذخیره و پیش از جست‌وجو یکسان‌سازی می‌شود؛ در غیر این صورت «Ali» و «ali»
// یا «کاربر» با «ی/ك» عربی دو حساب جدا می‌ساختند و پیدا کردن حساب در ورود شکست می‌خورد.
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 32;
// حرف اول باید حرف باشد تا نام کاربری با عدد یا نشانه شروع نشود.
export const USERNAME_PATTERN = /^\p{L}[\p{L}\p{N}_.-]*$/u;

export function normalizeUsername(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\u064A/g, "\u06CC") // ي عربی → ی فارسی
    .replace(/\u0643/g, "\u06A9") // ك عربی → ک فارسی
    .replace(/[\u200B-\u200F\uFEFF]/g, "") // نویسه‌های بی‌عرض و جهت‌دهنده
    .toLowerCase()
    .trim();
}
