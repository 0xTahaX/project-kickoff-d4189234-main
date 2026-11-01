import assert from "node:assert/strict";
import { test } from "node:test";
import "./goals-core.js";

const G = globalThis.DaraGoals;
const TODAY = "2026-11-01";

// ─── تاریخ شمسی ──────────────────────────────────────────────────────────────
test("converts well-known Jalali dates to ISO", () => {
  assert.equal(G.jalaliToIso(1403, 1, 1), "2024-03-20");
  assert.equal(G.jalaliToIso(1403, 12, 30), "2025-03-20");
  assert.equal(G.jalaliToIso(1404, 1, 1), "2025-03-21");
  assert.equal(G.jalaliToIso(1404, 12, 29), "2026-03-20");
  assert.equal(G.jalaliToIso(1402, 12, 29), "2024-03-19");
  assert.equal(G.jalaliToIso(1357, 11, 22), "1979-02-11");
  assert.equal(G.jalaliToIso(1399, 12, 30), "2021-03-20");
  assert.equal(G.jalaliToIso(1400, 1, 1), "2021-03-21");
  assert.equal(G.jalaliToIso(1404, 7, 9), "2025-10-01");
});

test("round-trips ISO dates through Jalali", () => {
  for (const iso of ["2024-03-20", "2024-03-19", "2025-03-20", "2025-03-21", "1979-02-11", "2026-11-01"]) {
    const jalali = G.isoToJalali(iso);
    assert.ok(jalali, `expected a Jalali date for ${iso}`);
    assert.equal(G.jalaliToIso(jalali.jy, jalali.jm, jalali.jd), iso);
  }
});

test("knows leap years and month lengths", () => {
  assert.equal(G.isJalaliLeap(1399), true);
  assert.equal(G.isJalaliLeap(1403), true);
  assert.equal(G.isJalaliLeap(1402), false);
  assert.equal(G.isJalaliLeap(1404), false);

  assert.equal(G.jalaliMonthLength(1403, 1), 31);
  assert.equal(G.jalaliMonthLength(1403, 6), 31);
  assert.equal(G.jalaliMonthLength(1403, 7), 30);
  assert.equal(G.jalaliMonthLength(1403, 11), 30);
  assert.equal(G.jalaliMonthLength(1403, 12), 30); // کبیسه
  assert.equal(G.jalaliMonthLength(1404, 12), 29); // غیرکبیسه
});

test("rejects invalid Jalali dates", () => {
  assert.equal(G.jalaliToIso(1402, 12, 30), null); // اسفند غیرکبیسه
  assert.equal(G.jalaliToIso(1403, 12, 31), null);
  assert.equal(G.jalaliToIso(1404, 0, 1), null);
  assert.equal(G.jalaliToIso(1404, 13, 1), null);
  assert.equal(G.jalaliToIso(1404, 1, 32), null);
  assert.equal(G.jalaliToIso(1404.5, 1, 1), null);
  assert.equal(G.jalaliToIso("1404", 1, 1), null);
});

test("rejects invalid ISO dates", () => {
  for (const iso of ["2025-02-30", "2025-13-01", "05-01-01", "2025/01/01", "", null]) {
    assert.equal(G.isoToJalali(iso), null, `expected invalid: ${String(iso)}`);
  }
});

test("day options follow the selected month and leap year", () => {
  const esfand1403 = Array.from({ length: G.jalaliMonthLength(1403, 12) }, (_, index) => index + 1);
  const esfand1404 = Array.from({ length: G.jalaliMonthLength(1404, 12) }, (_, index) => index + 1);
  assert.equal(esfand1403.length, 30);
  assert.equal(esfand1404.length, 29);
  assert.equal(esfand1404.at(-1), 29);
});

// ─── پول ─────────────────────────────────────────────────────────────────────
test("parses Persian, Arabic and Latin digits with separators", () => {
  assert.equal(G.parseMoney("۶۰٬۰۰۰٬۰۰۰"), 60_000_000);
  assert.equal(G.parseMoney("٦٠٠٠٠٠٠٠"), 60_000_000);
  assert.equal(G.parseMoney("60,000,000"), 60_000_000);
  assert.equal(G.parseMoney(" 60 000 000 "), 60_000_000);
  assert.equal(G.parseMoney("۶۰,۰۰۰,۰۰۰"), 60_000_000);
  assert.equal(G.parseMoney("۱۵۰۰"), 1500);
});

test("rejects zero, negative, decimal, empty and unsafe money input", () => {
  for (const value of ["", "۰", "0", "-5", "-۵", "۵-", "abc", "۱۲٫۵", "12.5", "1e9", "٬٬"]) {
    assert.equal(G.parseMoney(value), null, `expected invalid: ${value}`);
  }
  assert.equal(G.parseMoney("9007199254740992"), null); // بالاتر از MAX_SAFE_INTEGER
  assert.equal(G.parseMoney("9007199254740991"), 9007199254740991);
});

test("formats money with thousands separators", () => {
  assert.equal(G.formatMoney(60_000_000), "60٬000٬000");
  assert.equal(G.formatMoney(1500), "1٬500");
  assert.equal(G.formatMoney(0), "0");
});

test("writes amounts in Persian words", () => {
  assert.equal(G.moneyToWords(0), "صفر");
  assert.equal(G.moneyToWords(1), "یک");
  assert.equal(G.moneyToWords(19), "نوزده");
  assert.equal(G.moneyToWords(21), "بیست و یک");
  assert.equal(G.moneyToWords(100), "صد");
  assert.equal(G.moneyToWords(115), "صد و پانزده");
  assert.equal(G.moneyToWords(1500), "یک هزار و پانصد");
  assert.equal(G.moneyToWords(60_000_000), "شصت میلیون");
  assert.equal(G.moneyToWords(1_234_567), "یک میلیون و دویست و سی و چهار هزار و پانصد و شصت و هفت");
  assert.equal(G.moneyPreview(60_000_000, "تومان"), "شصت میلیون تومان");
  assert.equal(G.moneyToWords(-1), "");
  assert.equal(G.moneyToWords(1.5), "");
});

// ─── مدل و اعتبارسنجی ───────────────────────────────────────────────────────
const goal = (overrides = {}) => ({
  id: "g1",
  name: "سفر",
  target: 10_000_000,
  date: "2027-01-01",
  created_at: "2026-01-01",
  contributions: [
    { id: "c1", amount: 2_000_000, date: "2026-02-01", note: "" },
    { id: "c2", amount: 3_000_000, date: "2026-03-01", note: "پاداش" },
  ],
  ...overrides,
});

test("saved amount is derived only from contributions", () => {
  assert.equal(G.savedOf(goal()), 5_000_000);
  assert.equal(G.savedOf(goal({ contributions: [] })), 0);
  assert.equal(G.savedOf({}), 0);
  assert.equal(
    G.savedOf(
      goal({
        contributions: [
          { id: "a", amount: 1_000, date: "2026-01-01" },
          { id: "b", amount: -5, date: "2026-01-01" },
          { id: "c", amount: 2.5, date: "2026-01-01" },
          { id: "d", amount: 500, date: "not-a-date", invalid: true },
        ],
      }),
    ),
    1_000,
  );
});

test("validates goal input", () => {
  assert.equal(G.validateGoal({ name: "", target: 1000, date: "" }, TODAY), "نام هدف را وارد کنید.");
  assert.ok(G.validateGoal({ name: "x", target: 0, date: "" }, TODAY));
  assert.ok(G.validateGoal({ name: "x", target: -1, date: "" }, TODAY));
  assert.ok(G.validateGoal({ name: "x", target: 1.5, date: "" }, TODAY));
  assert.equal(
    G.validateGoal({ name: "x", target: 1000, date: "" }, TODAY, 2000),
    "مبلغ هدف نمی‌تواند کمتر از مبلغ پس‌اندازشده باشد.",
  );
  assert.equal(G.validateGoal({ name: "x", target: 5000, date: TODAY }, TODAY), "تاریخ هدف باید در آینده باشد.");
  assert.equal(G.validateGoal({ name: "x", target: 5000, date: "2020-01-01" }, TODAY), "تاریخ هدف باید در آینده باشد.");
  assert.equal(G.validateGoal({ name: "x", target: 5000, date: "2027-01-01" }, TODAY), null);
  assert.equal(G.validateGoal({ name: "x", target: 5000, date: "" }, TODAY), null);
});

test("validates contribution input", () => {
  assert.ok(G.validateContribution({ amount: 0, date: TODAY }, TODAY));
  assert.ok(G.validateContribution({ amount: 1000, date: "" }, TODAY));
  assert.equal(
    G.validateContribution({ amount: 1000, date: "2027-01-01" }, TODAY),
    "تاریخ پس‌انداز نمی‌تواند در آینده باشد.",
  );
  assert.equal(G.validateContribution({ amount: 1000, date: TODAY }, TODAY), null);
});

test("creates and edits goals without touching contributions", () => {
  const created = G.createGoal({ name: " خودرو ", target: 5000, date: "" }, { id: "g2", todayIso: TODAY });
  assert.deepEqual(created, {
    id: "g2",
    name: "خودرو",
    description: "",
    emoji: "",
    target: 5000,
    date: "",
    start_date: TODAY,
    priority: 2,
    created_at: TODAY,
    contributions: [],
    plan: null,
    installments: [],
  });

  const edited = G.updateGoal(goal(), { name: " سفر نوروز ", target: 20_000_000 });
  assert.equal(edited.name, "سفر نوروز");
  assert.equal(edited.target, 20_000_000);
  assert.equal(edited.id, "g1");
  assert.equal(edited.created_at, "2026-01-01");
  assert.equal(edited.contributions.length, 2);
  assert.equal(edited.priority, 2, "اولویت قدیمی پیش‌فرض متوسط می‌گیرد");
  assert.equal(G.savedOf(edited), 5_000_000);
});

test("goal priority defaults to medium and is editable", () => {
  assert.equal(G.createGoal({ name: "x", target: 1000 }, { id: "g3", todayIso: TODAY }).priority, 2);
  assert.equal(
    G.createGoal({ name: "x", target: 1000, priority: 4 }, { id: "g4", todayIso: TODAY }).priority,
    4,
  );
  assert.equal(
    G.createGoal({ name: "x", target: 1000, priority: 9 }, { id: "g5", todayIso: TODAY }).priority,
    2,
  );
  const changed = G.updateGoal({ ...goal(), priority: 1 }, { priority: 3 });
  assert.equal(changed.priority, 3);
  const untouched = G.updateGoal({ ...goal(), priority: 4 }, { name: "جدید" });
  assert.equal(untouched.priority, 4);
  assert.equal(G.updateGoal(goal(), {}).priority, 2);
});

test("migration adds the default priority without losing an existing one", () => {
  const legacy = G.migrateGoal({ id: "p1", name: "قدیمی", target: 1000, saved: 0, date: "" }, TODAY);
  assert.equal(legacy.goal.priority, 2);
  const again = G.migrateGoal(legacy.goal, TODAY);
  assert.equal(again.changed, false);
  assert.equal(again.goal.priority, 2);

  const kept = G.migrateGoal(
    {
      id: "p2",
      name: "بالا",
      target: 1000,
      date: "",
      priority: 4,
      description: "",
      emoji: "",
      start_date: TODAY,
      created_at: TODAY,
      contributions: [],
    },
    TODAY,
  );
  assert.equal(kept.goal.priority, 4);
  assert.equal(kept.changed, false);

  const invalid = G.migrateGoal(
    { id: "p3", name: "نامعتبر", target: 1000, date: "", priority: 7, contributions: [] },
    TODAY,
  );
  assert.equal(invalid.goal.priority, 2);
  assert.equal(invalid.changed, true);
});

test("adds, edits and deletes one contribution without affecting other goals", () => {
  const first = goal();
  const second = goal({ id: "g2", contributions: [{ id: "x", amount: 7_000, date: "2026-01-01" }] });
  const added = G.addContribution(first, { id: "c3", amount: 1_000_000, date: "2026-04-01", note: "" });
  assert.equal(G.savedOf(added), 6_000_000);
  assert.equal(G.savedOf(first), 5_000_000, "original goal must not be mutated");
  assert.equal(second.contributions.length, 1);

  const edited = G.updateContribution(added, "c3", { amount: 2_000_000 });
  assert.equal(G.savedOf(edited), 7_000_000);

  const removed = G.deleteContribution(edited, "c3");
  assert.equal(G.savedOf(removed), 5_000_000);
  assert.equal(G.savedOf(second), 7_000);
});

test("sorts contributions newest first and computes progress", () => {
  const sorted = G.sortContributions(goal().contributions);
  assert.deepEqual(
    sorted.map((item) => item.id),
    ["c2", "c1"],
  );
  assert.deepEqual(G.progressOf(goal()), {
    saved: 5_000_000,
    remaining: 5_000_000,
    percent: 50,
    completed: false,
  });
  assert.equal(G.progressOf(goal({ target: 5_000_000 })).completed, true);
  assert.equal(G.progressOf({ target: null }), null);
});

// ─── مهاجرت ─────────────────────────────────────────────────────────────────
test("migrates legacy saved amounts into a single initial contribution", () => {
  const { goal: migrated, changed } = G.migrateGoal(
    { id: "old1", name: "قدیمی", target: 9_000, saved: 3_500, date: "" },
    TODAY,
  );
  assert.equal(changed, true);
  assert.equal(migrated.id, "old1");
  assert.equal(migrated.target, 9_000);
  assert.equal(migrated.created_at, TODAY);
  assert.equal(migrated.contributions.length, 1);
  assert.equal(migrated.contributions[0].amount, 3_500);
  assert.equal(migrated.contributions[0].note, "موجودی اولیه");
  assert.equal(migrated.contributions[0].date, TODAY);
  assert.equal(migrated.saved, undefined);
  assert.equal(G.savedOf(migrated), 3_500);
});

test("keeps zero-saved legacy goals empty and idempotent", () => {
  const raw = { id: "old2", name: "خالی", target: 1_000, saved: 0, date: "" };
  const first = G.migrateGoal(raw, TODAY).goal;
  assert.deepEqual(first.contributions, []);
  const again = G.migrateGoal(first, TODAY);
  assert.equal(again.changed, false);
  assert.deepEqual(again.goal.contributions, []);
  assert.equal(G.savedOf(again.goal), 0);
});

test("migration is idempotent and does not duplicate the initial contribution", () => {
  const raw = { id: "old3", name: "تکرار", target: 5_000, saved: 1_000, date: "" };
  const once = G.migrateGoal(raw, TODAY).goal;
  const twice = G.migrateGoal(once, TODAY);
  assert.equal(twice.changed, false);
  assert.equal(twice.goal.contributions.length, 1);
  assert.equal(G.savedOf(twice.goal), 1_000);
});

test("preserves invalid legacy amounts instead of turning them into zero", () => {
  const { goal: migrated } = G.migrateGoal(
    { id: "old4", name: "نامعتبر", target: 5_000, saved: -200, date: "" },
    TODAY,
  );
  assert.equal(G.savedOf(migrated), 0);
  assert.equal(migrated.legacy_saved, -200);
  assert.equal(migrated.invalid, true);
});

test("preserves invalid targets and dates instead of silently dropping them", () => {
  const { goal: migrated } = G.migrateGoal(
    { id: "old5", name: "عجیب", target: "abc", saved: 0, date: "not-a-date" },
    TODAY,
  );
  assert.equal(migrated.target, null);
  assert.equal(migrated.legacy_target, "abc");
  assert.equal(migrated.date, "");
  assert.equal(migrated.legacy_date, "not-a-date");
  assert.equal(migrated.invalid, true);
});

test("migrates the whole state, preserves unrelated data and sets version 3", () => {
  const raw = {
    v: 2,
    cur: "تومان",
    accounts: [{ id: "a", name: "نقد", type: "cash", opening: 0 }],
    cats: [{ id: "c", name: "خوراک", kind: "expense" }],
    tx: [{ id: "t", type: "expense", amount: 100, date: "2026-01-01", acc: "a" }],
    budgets: { c: 500 },
    rec: [],
    goals: [{ id: "old6", name: "هدف", target: 2_000, saved: 500, date: "2027-01-01" }],
  };
  const { state, changed } = G.migrateState(raw, TODAY);
  assert.equal(changed, true);
  assert.equal(state.v, 3);
  assert.equal(state.cur, "تومان");
  assert.deepEqual(state.accounts, raw.accounts);
  assert.deepEqual(state.cats, raw.cats);
  assert.deepEqual(state.tx, raw.tx);
  assert.deepEqual(state.budgets, raw.budgets);
  assert.equal(state.goals.length, 1);
  assert.equal(G.savedOf(state.goals[0]), 500);
  assert.equal(state.goals[0].id, "old6");

  const again = G.migrateState(state, TODAY);
  assert.equal(again.changed, false);
  assert.equal(G.savedOf(again.state.goals[0]), 500);
});

test("handles malformed or missing state safely", () => {
  assert.deepEqual(G.migrateState(null, TODAY), { state: null, changed: true });
  assert.deepEqual(G.migrateState("x", TODAY), { state: null, changed: true });
  const { state } = G.migrateState({ v: 2 }, TODAY);
  assert.deepEqual(state.goals, []);
  assert.equal(state.v, 3);
  const withBadGoal = G.migrateState({ v: 2, goals: [null, 5, { id: "ok", name: "x", target: 1, saved: 0 }] }, TODAY);
  assert.equal(withBadGoal.state.goals.length, 1);
  assert.equal(withBadGoal.state.goals[0].id, "ok");
});

// ─── وضعیت پیشرفت ───────────────────────────────────────────────────────────
const statusGoal = (overrides = {}) => ({
  id: "s1",
  name: "هدف",
  target: 1_000_000,
  date: "2026-03-01",
  created_at: "2026-01-01",
  contributions: [],
  ...overrides,
});
const withSaved = (amount, overrides = {}) =>
  statusGoal({
    contributions: amount ? [{ id: "c1", amount, date: "2026-01-15", note: "" }] : [],
    ...overrides,
  });

test("goal status: completed wins even without valid dates", () => {
  const status = G.goalStatus(withSaved(1_000_000, { date: "", created_at: "" }), "2026-02-01");
  assert.equal(status.status, "completed");
  assert.equal(status.actualPercent, 100);
});

test("goal status: ahead, on track and behind around the expected progress", () => {
  // ۳۰ روز از ۵۹ روز گذشته ⇒ انتظار ۵۰٪
  const today = "2026-01-31";
  assert.equal(G.goalStatus(withSaved(650_000), today).status, "ahead"); // ۶۵٪
  assert.equal(G.goalStatus(withSaved(450_000), today).status, "on_track"); // ۴۵٪
  assert.equal(G.goalStatus(withSaved(300_000), today).status, "behind"); // ۳۰٪
  assert.equal(G.goalStatus(withSaved(600_000), today).status, "on_track"); // مرز ۶۰٪
  assert.equal(G.goalStatus(withSaved(610_000), today).status, "ahead"); // ۶۱٪
});

test("goal status: no contributions early in the goal stays behind", () => {
  assert.equal(G.goalStatus(withSaved(0), "2026-01-31").status, "behind");
  // در ابتدای هدف انتظار ۰٪ است و ۰٪ پیشرفت «طبق برنامه» است.
  assert.equal(G.goalStatus(withSaved(0), "2026-01-01").status, "on_track");
});

test("goal status: expired deadline is behind unless completed", () => {
  const expired = withSaved(500_000, { date: "2026-02-01" });
  const status = G.goalStatus(expired, "2026-03-01");
  assert.equal(status.status, "behind");
  assert.equal(status.late, true);
  assert.equal(G.goalStatus(withSaved(1_000_000, { date: "2026-02-01" }), "2026-03-01").status, "completed");
});

test("goal status: invalid or insufficient dates return unknown", () => {
  assert.equal(G.goalStatus(withSaved(100_000, { date: "" }), "2026-02-01").status, "unknown");
  assert.equal(G.goalStatus(withSaved(100_000, { created_at: "" }), "2026-02-01").status, "unknown");
  assert.equal(G.goalStatus(withSaved(100_000, { created_at: "2026-03-02" }), "2026-02-01").status, "unknown");
  assert.equal(G.goalStatus(withSaved(100_000, { created_at: "2026-03-01" }), "2026-02-01").status, "unknown");
  assert.equal(G.goalStatus(withSaved(100_000, { created_at: "2026-03-01", date: "2026-02-01" }), "2026-02-01").status, "unknown");
  assert.equal(G.goalStatus(withSaved(100_000, { created_at: "not-a-date" }), "2026-02-01").status, "unknown");
});

test("goal status: zero or invalid target returns unknown", () => {
  assert.equal(G.goalStatus({ target: 0, date: "2026-03-01", created_at: "2026-01-01", contributions: [] }, "2026-02-01").status, "unknown");
  assert.equal(G.goalStatus({ target: null, date: "2026-03-01", created_at: "2026-01-01", contributions: [] }, "2026-02-01").status, "unknown");
  assert.equal(G.goalStatus({}, "2026-02-01").status, "unknown");
});

// ─── تخمین تاریخ تکمیل ──────────────────────────────────────────────────────
const estimateGoal = (overrides = {}) => ({
  id: "e1",
  name: "تخمین",
  target: 10_000_000,
  date: "",
  created_at: "2026-04-01",
  contributions: [],
  ...overrides,
});
const contributionIn = (jy, jm, jd, amount, id = `${jy}-${jm}`) => ({
  id,
  amount,
  date: G.jalaliToIso(jy, jm, jd),
  note: "",
});

test("estimated completion uses the average of the last three complete Jalali months", () => {
  const goal = estimateGoal({
    contributions: [
      contributionIn(1405, 5, 15, 1_000_000, "a"),
      contributionIn(1405, 6, 10, 1_000_000, "b"),
      contributionIn(1405, 7, 20, 1_000_000, "c"),
    ],
  });
  const estimate = G.estimateCompletion(goal, "2026-11-01");
  assert.equal(estimate.reason, "ok");
  assert.equal(estimate.monthlyAverage, 1_000_000);
  assert.equal(estimate.months, 7); // مانده ۷ میلیون ÷ میانگین ۱ میلیون
  assert.equal(estimate.date, "2027-05-31"); // ۱۰ خرداد ۱۴۰۶
});

test("estimated completion counts zero-contribution months in the average", () => {
  const goal = estimateGoal({
    contributions: [
      contributionIn(1405, 5, 10, 2_000_000, "a"),
      contributionIn(1405, 7, 10, 4_000_000, "b"),
    ],
  });
  const estimate = G.estimateCompletion(goal, "2026-11-01");
  assert.equal(estimate.reason, "ok");
  assert.equal(estimate.monthlyAverage, 2_000_000); // (۲+۰+۴) ÷ ۳
  assert.equal(estimate.months, 2); // مانده ۴ میلیون
  assert.equal(estimate.date, "2026-12-31"); // ۱۰ دی ۱۴۰۵
});

test("estimated completion ignores contributions from the current incomplete month", () => {
  const goal = estimateGoal({
    target: 20_000_000,
    contributions: [
      contributionIn(1405, 5, 10, 2_000_000, "a"),
      contributionIn(1405, 7, 10, 4_000_000, "b"),
      contributionIn(1405, 8, 5, 6_000_000, "current"),
    ],
  });
  const estimate = G.estimateCompletion(goal, "2026-11-01");
  assert.equal(estimate.reason, "ok");
  // میانگین درست (۲+۰+۴)/۳ = ۲ میلیون است؛ مانده ۸ میلیون ⇒ ۴ ماه.
  // اگر مشارکت ماه جاری در میانگین شمرده می‌شد، ۲ ماه تخمین زده می‌شد.
  assert.equal(estimate.monthlyAverage, 2_000_000);
  assert.equal(estimate.months, 4);
});

test("estimated completion needs three months of history", () => {
  const goal = estimateGoal({
    created_at: "2026-10-01",
    contributions: [contributionIn(1405, 8, 5, 5_000_000, "x")],
  });
  const estimate = G.estimateCompletion(goal, "2026-11-01");
  assert.equal(estimate.date, null);
  assert.equal(estimate.reason, "insufficient_history");
});

test("estimated completion returns no date without recent contributions", () => {
  const goal = estimateGoal({
    contributions: [contributionIn(1405, 8, 5, 5_000_000, "x")],
  });
  const estimate = G.estimateCompletion(goal, "2026-11-01");
  assert.equal(estimate.date, null);
  assert.equal(estimate.reason, "no_contributions");
  assert.equal(estimate.monthlyAverage, 0);
});

test("estimated completion reports completed goals without a future date", () => {
  const goal = estimateGoal({
    target: 3_000_000,
    contributions: [contributionIn(1405, 7, 10, 3_000_000, "a")],
  });
  const estimate = G.estimateCompletion(goal, "2026-11-01");
  assert.equal(estimate.reason, "completed");
  assert.equal(estimate.completed, true);
  assert.equal(estimate.date, null);
});

test("estimated completion rejects invalid targets", () => {
  const estimate = G.estimateCompletion({ target: 0, contributions: [] }, "2026-11-01");
  assert.equal(estimate.reason, "invalid_target");
  assert.equal(estimate.date, null);
});

test("adding Jalali months clamps the day to the target month length", () => {
  assert.deepEqual(G.addJalaliMonths({ jy: 1403, jm: 12, jd: 30 }, 12), { jy: 1404, jm: 12, jd: 29 });
  assert.deepEqual(G.addJalaliMonths({ jy: 1405, jm: 8, jd: 10 }, 2), { jy: 1405, jm: 10, jd: 10 });
  assert.deepEqual(G.addJalaliMonths({ jy: 1405, jm: 11, jd: 10 }, 3), { jy: 1406, jm: 2, jd: 10 });
});

// ─── توضیحات، تاریخ شروع و ایموجی ───────────────────────────────────────────
test("goal description, emoji and start date are stored with sensible defaults", () => {
  const created = G.createGoal(
    { name: "سفر", target: 9000, date: "", description: "  سفر تابستانی با خانواده  ", emoji: "✈️" },
    { id: "d1", todayIso: "2026-11-01" },
  );
  assert.equal(created.description, "سفر تابستانی با خانواده");
  assert.equal(created.emoji, "✈️");
  assert.equal(created.start_date, "2026-11-01");

  const explicit = G.createGoal(
    { name: "x", target: 1000, date: "", start_date: "2026-12-01" },
    { id: "d2", todayIso: "2026-11-01" },
  );
  assert.equal(explicit.start_date, "2026-12-01");
  assert.equal(explicit.emoji, "");

  const long = "x".repeat(G.DESCRIPTION_MAX + 50);
  assert.equal(G.createGoal({ name: "x", target: 1, description: long }, { id: "d3", todayIso: "2026-11-01" }).description.length, G.DESCRIPTION_MAX);
  assert.equal(G.createGoal({ name: "x", target: 1, start_date: "bad" }, { id: "d4", todayIso: "2026-11-01" }).start_date, "2026-11-01");
});

test("goal dates must not contradict each other", () => {
  assert.equal(G.validateGoalDates("2026-11-01", "2026-12-01"), null);
  assert.equal(G.validateGoalDates("2026-11-01", ""), null);
  assert.ok(G.validateGoalDates("2026-12-01", "2026-11-01"));
  assert.ok(G.validateGoalDates("", "2026-11-01"));
});

test("a goal with a future start date is not_started", () => {
  const goal = { id: "n", name: "x", target: 1000, date: "2026-12-01", start_date: "2026-11-10", created_at: "2026-10-01", contributions: [{ id: "s", amount: 500, date: "2026-11-12" }] };
  assert.equal(G.goalStatus(goal, "2026-11-01").status, "not_started");
  assert.equal(G.goalStatus(goal, "2026-11-20").status, "on_track");
});

// ─── برنامهٔ پس‌انداز ───────────────────────────────────────────────────────
const planGoal = (overrides = {}) => ({
  id: "pg",
  name: "لپ‌تاپ",
  description: "",
  emoji: "",
  target: 10_000_000,
  date: "",
  start_date: "2026-10-01",
  priority: 2,
  created_at: "2026-10-01",
  contributions: [],
  plan: null,
  installments: [],
  ...overrides,
});
const withPlan = (plan, overrides = {}) => {
  const goal = planGoal({ plan, ...overrides });
  return G.ensurePlanInstallments(goal, "2026-11-01").goal;
};

test("daily, weekly and monthly plans generate due dates once", () => {
  const daily = withPlan({ id: "p1", amount: 500_000, period: "daily", start_date: "2026-10-01", status: "active" });
  assert.equal(daily.installments.length, 32); // ۳۱ روز مهر + امروز
  assert.equal(daily.installments[0].due, "2026-10-01");
  assert.equal(daily.installments.at(-1).due, "2026-11-01");

  const weekly = withPlan({ id: "p2", amount: 500_000, period: "weekly", start_date: "2026-10-01", status: "active" });
  assert.deepEqual(weekly.installments.map((i) => i.due), ["2026-10-01", "2026-10-08", "2026-10-15", "2026-10-22", "2026-10-29"]);

  const monthly = withPlan({ id: "p3", amount: 500_000, period: "monthly", start_date: "2026-09-23", status: "active" }, { start_date: "2026-09-23" });
  assert.deepEqual(monthly.installments.map((i) => i.due), ["2026-09-23", "2026-10-23"]);

  const again = G.ensurePlanInstallments(daily, "2026-11-01");
  assert.equal(again.changed, false);
  assert.equal(again.goal.installments.length, 32);
});

test("late is derived for past dues only and differs from today's due", () => {
  const goal = withPlan({ id: "p4", amount: 100_000, period: "daily", start_date: "2026-10-30", status: "active" }, { start_date: "2026-10-30" });
  const yesterday = goal.installments.find((i) => i.due === "2026-10-31");
  const today = goal.installments.find((i) => i.due === "2026-11-01");
  assert.equal(G.installmentStatus(yesterday, goal.plan, "2026-11-01"), "late");
  assert.equal(G.installmentStatus(today, goal.plan, "2026-11-01"), "pending");
  assert.equal(G.nextPlanDue(goal, "2026-11-01"), "2026-11-02");

  const summary = G.planSummary(goal, "2026-11-01");
  assert.equal(summary.counts.late, 2);
  assert.equal(summary.nextDue, "2026-11-02");
});

test("paying an installment records the actual amount and cannot duplicate", () => {
  const goal = withPlan({ id: "p5", amount: 500_000, period: "daily", start_date: "2026-10-31", status: "active" }, { start_date: "2026-10-31" });
  const due = goal.installments[0];
  const paid = G.payInstallment(goal, due.id, { id: "c-pay", amount: 300_000, date: "2026-11-01" }, "2026-11-01");
  assert.equal(paid.changed, true);
  assert.equal(paid.goal.contributions[0].amount, 300_000);
  assert.equal(G.savedOf(paid.goal), 300_000);
  const installment = paid.goal.installments.find((i) => i.id === due.id);
  assert.equal(installment.status, "done");
  assert.equal(installment.paidAmount, 300_000);
  assert.equal(installment.contributionId, "c-pay");

  const again = G.payInstallment(paid.goal, due.id, { amount: 1_000 }, "2026-11-01");
  assert.equal(again.changed, false);
  assert.equal(again.reason, "already_done");
  assert.equal(again.goal.contributions.length, 1);

  const cancelled = G.cancelInstallment(paid.goal, due.id);
  assert.equal(cancelled.installments.find((i) => i.id === due.id).status, "cancelled");
});

test("deleting a linked contribution reopens its installment", () => {
  const goal = withPlan({ id: "p6", amount: 500_000, period: "daily", start_date: "2026-10-31", status: "active" }, { start_date: "2026-10-31" });
  const paid = G.payInstallment(goal, goal.installments[0].id, { id: "c-del", amount: 500_000, date: "2026-11-01" }, "2026-11-01");
  const reopened = G.deleteContribution(paid.goal, "c-del");
  assert.equal(reopened.contributions.length, 0);
  assert.equal(reopened.installments[0].status, "pending");
  assert.equal(reopened.installments[0].contributionId, undefined);
});

test("paused plans do not count as late and resume keeps the pause window", () => {
  const goal = withPlan({ id: "p7", amount: 100_000, period: "daily", start_date: "2026-10-20", status: "active" }, { start_date: "2026-10-20" });
  const paused = G.pausePlan(goal, "2026-10-25");
  const due = paused.installments.find((i) => i.due === "2026-10-27");
  assert.equal(G.installmentStatus(due, paused.plan, "2026-10-28"), "paused");
  const resumed = G.resumePlan(paused, "2026-11-01");
  assert.equal(G.installmentStatus(due, resumed.plan, "2026-11-01"), "paused");
  const resumedSummary = G.planSummary(resumed, "2026-11-01");
  assert.equal(resumedSummary.counts.late, 5); // فقط روزهای قبل از توقف\n  assert.equal(resumedSummary.counts.paused, 5); // ۲۵ مهر تا ۱ آبان
});

test("editing a plan keeps history and regenerates future dues", () => {
  const goal = withPlan({ id: "p8", amount: 100_000, period: "daily", start_date: "2026-10-01", status: "active" });
  const paid = G.payInstallment(goal, goal.installments[0].id, { id: "c-keep", amount: 100_000, date: "2026-10-01" }, "2026-10-01");
  const edited = G.applyPlan(paid.goal, { id: "p8", amount: 700_000, period: "weekly", start_date: "2026-10-01", status: "active" }, "2026-10-05");
  const done = edited.installments.find((i) => i.id === paid.goal.installments[0].id);
  assert.equal(done.status, "done");
  assert.equal(done.paidAmount, 100_000);
  assert.equal(edited.plan.amount, 700_000);
  assert.equal(edited.plan.period, "weekly");
  assert.equal(edited.installments.some((i) => i.due === "2026-10-02" || i.due === "2026-10-03"), true, "دوره‌های گذشته حفظ می‌شوند");
  assert.equal(edited.installments.filter((i) => i.due > "2026-10-05").length, 0);
  assert.equal(edited.contributions.length, 1);
});

test("removing a plan keeps contributions", () => {
  const goal = withPlan({ id: "p9", amount: 100_000, period: "daily", start_date: "2026-10-31", status: "active" }, { start_date: "2026-10-31" });
  const paid = G.payInstallment(goal, goal.installments[0].id, { id: "c-rm", amount: 100_000, date: "2026-10-31" }, "2026-11-01");
  const removed = G.removePlan(paid.goal);
  assert.equal(removed.plan, null);
  assert.deepEqual(removed.installments, []);
  assert.equal(removed.contributions.length, 1);
  assert.equal(G.savedOf(removed), 100_000);
});

test("plan forecast projects completion from the next due", () => {
  const goal = withPlan(
    { id: "p10", amount: 1_000_000, period: "daily", start_date: "2026-10-01", status: "active" },
    { target: 10_000_000, contributions: [{ id: "s", amount: 3_000_000, date: "2026-10-20" }] },
  );
  const summary = G.planSummary(goal, "2026-11-01");
  assert.equal(summary.forecast.periods, 7);
  assert.equal(summary.forecast.date, "2026-11-08");
});
