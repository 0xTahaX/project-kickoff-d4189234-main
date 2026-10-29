import assert from "node:assert/strict";
import { test } from "node:test";
import "./phase5-core.js";

const Core = globalThis.DaraPhase5Core;
const state = () => ({
  accounts: [
    { id: "cash-1", name: "نقد" },
    { id: "bank-1", name: "بانک" },
  ],
  cats: [
    { id: "food", name: "خوراک", kind: "expense" },
    { id: "salary", name: "حقوق", kind: "income" },
  ],
  tx: [],
  budgets: { food: 1000 },
  goals: [{ id: "g1", name: "ذخیره", target: 1000, saved: 500 }],
  rec: [{ id: "r1", name: "قبض", amount: 200, next: "2026-10-30" }],
});

const csv = (rows) =>
  [Core.CSV_HEADERS.join(","), ...rows].join("\r\n");

test("keeps assistant preferences separate and validates allowed values", () => {
  const prefs = Core.preferences({
    objectives: ["کاهش بدهی", "", "افزایش پس‌انداز"],
    literacy: "advanced",
    topics: ["debt", "unknown", "debt"],
    explanation: "detailed",
    reportFrequency: "weekly",
    notifications: { recurringDue: false },
    timeZone: "Asia/Tehran",
    consentToExternalAi: true,
    primaryCurrency: "BAD",
  });
  assert.deepEqual(prefs.objectives, ["کاهش بدهی", "افزایش پس‌انداز"]);
  assert.deepEqual(prefs.topics, ["debt"]);
  assert.equal(prefs.literacy, "advanced");
  assert.equal(prefs.notifications.recurringDue, false);
  assert.equal(prefs.timeZone, "Asia/Tehran");
  assert.equal(prefs.primaryCurrency, undefined);
  assert.throws(() => Core.preferences({ timeZone: "not/a-zone" }), /منطقهٔ زمانی/);
});

test("parses quoted CSV and previews supported transactions without writing them", () => {
  const data = state();
  const source = csv([
    '2026-10-01,expense,250,نقد,خوراک,"خرید, نان","گفت ""سلام""",',
    "2026-10-02,transfer,100,نقد,,انتقال,,بانک",
  ]);
  const preview = Core.previewCsv(source, data);
  assert.equal(preview.importable, 2);
  assert.equal(preview.invalid, 0);
  assert.equal(preview.items[0].transaction.desc, "خرید, نان");
  assert.equal(preview.items[0].transaction.note, 'گفت "سلام"');
  assert.equal(preview.items[1].transaction.to, "bank-1");
  assert.equal(data.tx.length, 0);
});

test("requires category/account mappings, rejects malformed values, and blocks duplicates", () => {
  const data = state();
  const source = csv([
    "2026-10-01,expense,250,Wallet,Food,Market,,",
    "2026-10-02,expense,-4,نقد,خوراک,Invalid,,",
    "2026-02-30,expense,4,نقد,خوراک,Invalid date,,",
    "2026-10-03,transfer,5,نقد,,Same account,,نقد",
  ]);
  const beforeMap = Core.previewCsv(source, data);
  assert.equal(beforeMap.mappingRequired, 1);
  assert.equal(beforeMap.invalid, 3);
  const mapped = Core.previewCsv(source, data, {
    accounts: { Wallet: "نقد" },
    categories: { Food: "خوراک" },
  });
  assert.equal(mapped.importable, 1);
  assert.equal(mapped.items[0].transaction.cat, "food");
  data.tx.push({ ...mapped.items[0].transaction });
  const duplicated = Core.previewCsv(source, data, {
    accounts: { Wallet: "نقد" },
    categories: { Food: "خوراک" },
  });
  assert.equal(duplicated.duplicates, 1);
  assert.throws(() => Core.previewCsv("date,type", data), /ستون‌های لازم/);
  assert.throws(() => Core.csvParse('"unterminated'), /کوتیشن بسته نشده/);
});

test("exports CSV with correct escaping and round-trips mapped records", () => {
  const data = state();
  const records = [{
    id: "t1",
    date: "2026-10-01",
    type: "expense",
    amount: 50,
    acc: "cash-1",
    to: null,
    cat: "food",
    desc: 'خرید "ویژه", امروز',
    note: "line one\nline two",
  }];
  const exported = Core.exportTransactions(records, data.accounts, data.cats);
  const preview = Core.previewCsv(exported, data);
  assert.equal(preview.importable, 1);
  assert.equal(preview.items[0].transaction.desc, records[0].desc);
  assert.equal(preview.items[0].transaction.note, records[0].note);
});

test("prefixes spreadsheet formulas in exported user-controlled cells", () => {
  const records = [{
    id: "t2",
    date: "2026-10-01",
    type: "expense",
    amount: 50,
    acc: "cash-1",
    to: null,
    cat: "food",
    desc: "=HYPERLINK(\"https://example.invalid\")",
    note: "",
  }];
  const exported = Core.exportTransactions(records, state().accounts, state().cats);
  assert.match(exported, /'=HYPERLINK/);
});

test("deduplicates local notifications and respects category preferences", () => {
  const data = state();
  data.tx.push({ type: "expense", amount: 850, cat: "food", date: "2026-10-20" });
  const period = { start: "2026-10-01", end: "2026-10-31" };
  const options = { timeZone: "Asia/Tehran" };
  const first = Core.notifications(data, period, options, new Date("2026-10-26T10:00:00Z"));
  const second = Core.notifications(data, period, options, new Date("2026-10-26T10:05:00Z"));
  assert.deepEqual(first.map((item) => item.id), second.map((item) => item.id));
  assert.equal(first.length, 3);
  assert.ok(first.some((item) => item.type === "budget_threshold"));
  assert.ok(first.some((item) => item.type === "recurring_due"));
  assert.ok(first.some((item) => item.type === "goal_milestone"));
  const disabled = Core.notifications(data, period, {
    notifications: { budgetThreshold: false, recurringDue: false, goalMilestone: false },
  });
  assert.equal(disabled.length, 0);
});
