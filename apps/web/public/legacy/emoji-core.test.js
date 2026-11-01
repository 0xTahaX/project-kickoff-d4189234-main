import assert from "node:assert/strict";
import { test } from "node:test";
import "./emoji-core.js";

const E = globalThis.DaraEmoji;

test("emoji catalog is broad, categorized and unique", () => {
  assert.ok(E.CATEGORIES.length >= 11);
  assert.ok(E.all().length >= 100);
  assert.ok(new Set(E.all()).size >= 100);
  assert.ok(E.all().includes("🎯"));
  assert.ok(E.byCategory("home").includes("🏠"));
  assert.deepEqual(E.byCategory("missing"), []);
});

test("search finds emojis by Persian and English keywords", () => {
  assert.ok(E.search("لپ").includes("💻"));
  assert.ok(E.search("سفر").includes("✈️"));
  assert.ok(E.search("دارو").includes("💊"));
  assert.ok(E.search("غذا").includes("🍔"));
  assert.deepEqual(E.search("چیزی که وجود ندارد"), []);
});

test("goal and category defaults are sensible", () => {
  assert.equal(E.defaultForGoal("خرید لپ‌تاپ"), "💻");
  assert.equal(E.defaultForGoal("سفر تابستان"), "✈️");
  assert.equal(E.defaultForGoal("خرید خودرو"), "🚗");
  assert.equal(E.defaultForGoal("چیز نامشخص"), "🎯");
  assert.equal(E.defaultForCategory("خوراک"), "🍔");
  assert.equal(E.defaultForCategory("حقوق"), "💰");
  assert.equal(E.defaultForCategory("دستهٔ ناشناس"), "🏷️");
});

test("emoji values are normalized and unsafe strings are rejected", () => {
  assert.equal(E.normalize(""), "");
  assert.equal(E.normalize("✈️"), "✈️");
  assert.equal(E.normalize("<script>"), "");
  assert.equal(E.normalize("🎯🎯🎯🎯🎯🎯🎯🎯🎯"), "");
});
