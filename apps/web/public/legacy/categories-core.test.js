import assert from "node:assert/strict";
import { test } from "node:test";
import "./categories-core.js";

const C = globalThis.DaraCategories;

const categories = [
  { id: "c1", name: "خوراک", kind: "expense" },
  { id: "c2", name: "حقوق", kind: "income" },
];

test("normalizes whitespace and rejects empty names", () => {
  assert.equal(C.normalizeName("  سفر   نوروزی "), "سفر نوروزی");
  assert.equal(C.validate("", "expense", categories), "نام دسته‌بندی را وارد کنید.");
  assert.equal(C.validate("   ", "expense", categories), "نام دسته‌بندی را وارد کنید.");
});

test("rejects duplicates only within the same kind", () => {
  assert.equal(
    C.validate("  خوراک ", "expense", categories),
    "دسته‌بندی‌ای با این نام در همین نوع وجود دارد.",
  );
  assert.equal(C.validate("خوراک", "income", categories), null);
  assert.equal(C.validate("سفر", "expense", categories), null);
});

test("rejects invalid kinds and overly long names", () => {
  assert.equal(C.validate("سفر", "transfer", categories), "نوع دسته‌بندی معتبر نیست.");
  assert.ok(C.validate("x".repeat(C.MAX_NAME + 1), "expense", categories));
  assert.equal(C.validate("x".repeat(C.MAX_NAME), "expense", categories), null);
});

test("creates trimmed categories and filters by kind", () => {
  const created = C.create("  حمل‌ونقل  ", "expense", "c3");
  assert.deepEqual(created, { id: "c3", name: "حمل‌ونقل", kind: "expense" });
  assert.deepEqual(
    C.ofKind(categories, "income").map((category) => category.id),
    ["c2"],
  );
  assert.deepEqual(
    C.ofKind(categories, "expense").map((category) => category.id),
    ["c1"],
  );
  assert.equal(C.findById(categories, "c2")?.name, "حقوق");
  assert.equal(C.findById(categories, "missing"), null);
});
