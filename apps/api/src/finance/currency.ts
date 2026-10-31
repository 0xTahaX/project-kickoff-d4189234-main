import { ApiError } from "../http/errors.js";

// فقط همین سه نوع در دفتر وجود دارد؛ تکرار type اینجا از وابستگی حلقه‌ای به repository جلوگیری می‌کند.
export type TransactionKind = "INCOME" | "EXPENSE" | "TRANSFER";

export interface CurrencyContext {
  kind: TransactionKind;
  accountCurrency: string;
  targetCurrency?: string | null;
}

// ارز هر تراکنش از حساب مبدأ گرفته می‌شود، نه از ارز پیش‌فرض فعلی کاربر؛ بنابراین تغییر ارز اصلی
// تاریخچه را بازنویسی نمی‌کند. تبدیل ضمنی هرگز انجام نمی‌شود و انتقال بین دو ارز صریحاً رد می‌شود.
export function resolveTransactionCurrency(context: CurrencyContext): string {
  if (context.kind !== "TRANSFER") return context.accountCurrency;
  if (!context.targetCurrency)
    throw new ApiError(409, "LEDGER_CONFLICT", "حساب مقصد انتقال پیدا نشد.");
  if (context.targetCurrency !== context.accountCurrency)
    throw new ApiError(
      409,
      "CURRENCY_MISMATCH",
      "انتقال بین حساب‌های با ارز متفاوت پشتیبانی نمی‌شود؛ برای هر ارز حساب جدا بسازید.",
    );
  return context.accountCurrency;
}
