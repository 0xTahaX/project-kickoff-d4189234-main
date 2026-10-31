(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.DaraMoney = api;
})(typeof globalThis === "undefined" ? this : globalThis, function () {
  "use strict";

  // دقت پول در Dara با Decimal(20,6) دیتابیس هم‌تراز است: حداکثر ۶ رقم اعشار.
  const DECIMALS = 6;
  const SCALE = 10n ** BigInt(DECIMALS);
  const MAX_WHOLE_DIGITS = 14;
  const pattern = new RegExp(`^-?(\\d{1,${MAX_WHOLE_DIGITS}})(?:\\.(\\d{1,${DECIMALS}}))?$`);

  // رشتهٔ اعشاری را بدون هیچ محاسبهٔ اعشاری به عدد صحیح مقیاس‌شده تبدیل می‌کند.
  function toScaled(value) {
    if (value === null || value === undefined) throw new Error("مبلغ تعریف نشده است.");
    const text = String(value).trim().replace(/,/g, "");
    const match = pattern.exec(text);
    if (!match) throw new Error("مبلغ معتبر نیست.");
    const fraction = (match[2] ?? "").padEnd(DECIMALS, "0");
    const scaled = BigInt(match[1]) * SCALE + BigInt(fraction || "0");
    return text.startsWith("-") ? -scaled : scaled;
  }

  // عدد صحیح مقیاس‌شده را به رشتهٔ اعشاری کوتاه (بدون صفر انتهایی) برمی‌گرداند.
  function fromScaled(scaled) {
    if (typeof scaled !== "bigint") throw new Error("مقدار مقیاس‌شده باید BigInt باشد.");
    const negative = scaled < 0n;
    const absolute = negative ? -scaled : scaled;
    const whole = absolute / SCALE;
    const fraction = String(absolute % SCALE)
      .padStart(DECIMALS, "0")
      .replace(/0+$/, "");
    return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
  }

  // ضرب دقیق در یک ضریب صحیح (مثلاً ۱۰ برای تبدیل تومان به ریال).
  function multiply(value, factor) {
    const integer = Math.trunc(Number(factor));
    if (!Number.isFinite(integer)) throw new Error("ضریب معتبر نیست.");
    return fromScaled(toScaled(value) * BigInt(integer));
  }

  // تقسیم دقیق بر یک عدد صحیح با گردکردن نیم‌به‌بالا در ۶ رقم اعشار.
  function divide(value, divisor) {
    const integer = Math.trunc(Number(divisor));
    if (!Number.isFinite(integer) || integer === 0) throw new Error("مقسوم‌علیه معتبر نیست.");
    const scaled = toScaled(value);
    const negative = scaled < 0n !== integer < 0n;
    const absolute = scaled < 0n ? -scaled : scaled;
    const size = BigInt(integer < 0 ? -integer : integer);
    const rounded = (absolute + size / 2n) / size;
    return fromScaled(negative ? -rounded : rounded);
  }

  // جمع دقیق دو یا چند مبلغ اعشاری.
  function add(...values) {
    return fromScaled(values.reduce((total, value) => total + toScaled(value), 0n));
  }

  function isValid(value) {
    try {
      toScaled(value);
      return true;
    } catch {
      return false;
    }
  }

  return { DECIMALS, toScaled, fromScaled, multiply, divide, add, isValid };
});
