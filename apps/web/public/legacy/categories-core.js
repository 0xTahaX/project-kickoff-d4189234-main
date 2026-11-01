(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.DaraCategories = api;
})(typeof globalThis === "undefined" ? this : globalThis, function () {
  "use strict";

  const MAX_NAME = 80;
  const KINDS = ["income", "expense"];

  // فاصله‌های تکراری و ابتدا/انتها حذف می‌شوند تا «  سفر  » و «سفر» یک دسته‌بندی باشند.
  function normalizeName(value) {
    return String(value ?? "")
      .replace(/\s+/g, " ")
      .trim();
  }

  // نام و نوع را قبل از افزودن بررسی می‌کند؛ تکرار فقط در همان نوع ممنوع است.
  function validate(name, kind, categories) {
    if (!KINDS.includes(kind)) return "نوع دسته‌بندی معتبر نیست.";
    const normalized = normalizeName(name);
    if (!normalized) return "نام دسته‌بندی را وارد کنید.";
    if (normalized.length > MAX_NAME) return `نام دسته‌بندی حداکثر ${MAX_NAME} نویسه است.`;
    const compare = normalized.toLowerCase();
    const duplicate = (categories || []).some(
      (category) =>
        category &&
        category.kind === kind &&
        normalizeName(category.name).toLowerCase() === compare,
    );
    if (duplicate) return "دسته‌بندی‌ای با این نام در همین نوع وجود دارد.";
    return null;
  }

  function create(name, kind, id) {
    return { id, name: normalizeName(name), kind };
  }

  // فقط دسته‌بندی‌های متناسب با نوع تراکنش؛ ترتیب اصلی حفظ می‌شود.
  function ofKind(categories, kind) {
    return (categories || []).filter((category) => category && category.kind === kind);
  }

  function findById(categories, id) {
    return (categories || []).find((category) => category && category.id === id) || null;
  }

  return { MAX_NAME, KINDS, normalizeName, validate, create, ofKind, findById };
});
