const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const sandboxModule = { exports: {} };
const source = fs.readFileSync(
  path.join(__dirname, "apps", "web", "public", "legacy", "assets-core.js"),
  "utf8",
);
vm.runInNewContext(source, { module: sandboxModule, crypto: require("node:crypto") });
const Core = sandboxModule.exports;

const at = (day) => `2026-10-${String(day).padStart(2, "0")}T12:00:00.000Z`;

function investment(state, input = {}) {
  return Core.addAsset(state, {
    name: "نماد آزمایشی",
    type: "stock",
    quantity: "0",
    unit: "سهم",
    currency: "USD",
    acquisitionCurrency: "USD",
    ownershipPercent: "100",
    ...input,
  });
}

function trade(state, input) {
  return Core.addInvestmentTransaction(state, {
    currency: "USD",
    at: at(1),
    ...input,
  });
}

test("fixed-point arithmetic preserves quantity precision and rounds products", () => {
  assert.equal(Core.amount(Core.multiply(Core.decimal("1.23456789"), Core.decimal("0.33333333"))), "0.41152263");
  assert.equal(Core.amount(Core.ratio(Core.decimal("100"), 25n, 100n)), "25");
  assert.throws(() => Core.decimal("1.123456789"), /حداکثر ۸ رقم اعشار/);
});

test("FIFO lots calculate partial-sale basis, fees, and price return", () => {
  const state = Core.initialState();
  const share = investment(state);
  trade(state, {
    kind: "buy",
    assetId: share.id,
    quantity: "10",
    unitPrice: "100",
    fee: "5",
    at: at(1),
    linkedAccountId: "bank",
  });
  trade(state, {
    kind: "buy",
    assetId: share.id,
    quantity: "10",
    unitPrice: "200",
    fee: "10",
    at: at(2),
    linkedAccountId: "bank",
  });
  trade(state, {
    kind: "sell",
    assetId: share.id,
    quantity: "12",
    unitPrice: "180",
    fee: "12",
    at: at(3),
    linkedAccountId: "bank",
  });
  Core.addValuation(state, {
    assetId: share.id,
    quantity: "8",
    unitPrice: "180",
    currency: "USD",
    source: "ورودی دستی",
    at: at(4),
  });

  const result = Core.analytics(state, at(4));
  assert.equal(result.holdings[0].quantityText, "8");
  assert.equal(result.holdings[0].costBasisText, "1608");
  assert.equal(result.marketValueByCurrency.USD, "1440");
  assert.equal(result.realizedByCurrency.USD, "741");
  assert.equal(result.unrealizedByCurrency.USD, "-168");
  assert.equal(result.feesByCurrency.USD, "27");
  assert.equal(result.completeness, 1);
});

test("dividends are counted once, while price return stays separate", () => {
  const state = Core.initialState();
  const share = investment(state);
  trade(state, {
    kind: "buy",
    assetId: share.id,
    quantity: "2",
    unitPrice: "50",
    at: at(1),
    linkedAccountId: "bank",
    linkedAccountId: "bank",
  });
  trade(state, {
    kind: "dividend",
    amount: "5",
    currency: "USD",
    at: at(2),
    linkedAccountId: "bank",
  });
  Core.addValuation(state, {
    assetId: share.id,
    quantity: "2",
    unitPrice: "55",
    currency: "USD",
    at: at(3),
  });

  const summary = Core.analytics(state, at(3));
  assert.equal(summary.incomeByCurrency.USD, "5");
  assert.deepEqual(Object.keys(summary.incomeByCurrency), ["USD"]);
  assert.equal(summary.unrealizedByCurrency.USD, "10");
  assert.equal(summary.priceReturnByCurrency.USD, "10");
  assert.equal(summary.totalReturnByCurrency.USD, "15");
  assert.equal(summary.totalReturnPercentByCurrency.USD, "15");
  assert.equal(Core.portfolio(state, at(3)).cash.size, 0);
  assert.equal(
    Core.portfolio(state, at(3)).accountEffects.get("bank\u0000USD"),
    Core.decimal("-95"),
  );
});

test("net worth requires explicit, fresh currency conversion and avoids account duplicates", () => {
  const state = Core.initialState();
  state.baseCurrency = "IRR";
  const bankBalance = {
    id: "bank",
    name: "بانک",
    balance: "100000",
    currency: "IRR",
  };
  const duplicate = Core.addAsset(state, {
    name: "حساب بانکی",
    type: "cash",
    currency: "IRR",
    quantity: "1",
    ownershipPercent: "100",
    valueAlreadyInAccount: true,
  });
  Core.addValuation(state, { assetId: duplicate.id, totalValue: "100000", currency: "IRR" });
  const dollars = Core.addAsset(state, {
    name: "صندوق",
    type: "fund",
    currency: "USD",
    quantity: "1",
    ownershipPercent: "100",
  });
  Core.addInvestmentTransaction(state, {
    kind: "buy",
    assetId: dollars.id,
    quantity: "1",
    unitPrice: "10",
    currency: "USD",
    at: at(1),
    linkedAccountId: "bankUSD",
  });
  Core.addValuation(state, {
    assetId: dollars.id,
    unitPrice: "10",
    quantity: "1",
    currency: "USD",
    at: at(2),
  });

  const withoutRate = Core.netWorth(
    state,
    [bankBalance, { id: "bankUSD", name: "ارز", balance: "10", currency: "USD" }],
    at(2),
  );
  assert.equal(withoutRate.convertedNetWorth, "100000");
  assert.equal(withoutRate.assetsByCurrency.IRR, "100000");
  assert.equal(
    JSON.stringify(withoutRate.unconverted),
    JSON.stringify([{ currency: "USD", kind: "asset", value: "10" }]),
  );
  assert.equal(withoutRate.complete, false);

  Core.addExchangeRate(state, {
    from: "USD",
    to: "IRR",
    rate: "50000",
    source: "نرخ دستی ثبت‌شده",
    at: at(2),
  });
  const converted = Core.netWorth(
    state,
    [bankBalance, { id: "bankUSD", name: "ارز", balance: "10", currency: "USD" }],
    at(2),
  );
  assert.equal(converted.convertedNetWorth, "600000");
  assert.equal(converted.unconverted.length, 0);
  assert.equal(converted.complete, true);
});

test("zero balances do not require a currency conversion", () => {
  const state = Core.initialState();
  state.baseCurrency = "IRR";
  const report = Core.netWorth(state, [
    { id: "cash", name: "نقد", balance: "0", currency: "TOMAN" },
  ], at(2));

  assert.equal(report.convertedNetWorth, "0");
  assert.equal(report.unconverted.length, 0);
  assert.equal(report.complete, true);
});

test("missing cost basis remains distinct from a zero cost and old quotes are stale", () => {
  const state = Core.initialState();
  const noCost = investment(state, { name: "بدون بهای خرید" });
  const zeroCost = investment(state, {
    name: "هدیه",
    acquisitionCost: "0",
    quantity: "2",
  });
  Core.addValuation(state, {
    assetId: noCost.id,
    unitPrice: "2",
    at: at(1),
    currency: "USD",
  });
  Core.addValuation(state, {
    assetId: zeroCost.id,
    unitPrice: "2",
    at: at(1),
    currency: "USD",
  });

  const summary = Core.analytics(state, "2026-11-02T12:00:00.000Z");
  assert.equal(summary.holdings[0].costBasisText, "0");
  assert.equal(noCost.acquisitionCost, null);
  assert.equal(zeroCost.acquisitionCost, "0");
  assert.ok(summary.warnings.some((warning) => warning.includes("قدیمی است")));
  assert.ok(summary.warnings.some((warning) => warning.includes("ثبت نشده")));
});

test("sales above available lots and invalid transfers are rejected", () => {
  const state = Core.initialState();
  const share = investment(state);
  assert.throws(
    () =>
      trade(state, {
        kind: "sell",
        assetId: share.id,
        quantity: "1",
        unitPrice: "2",
      }),
    /از موجودی بیشتر است/,
  );
  assert.equal(state.investmentTransactions.length, 0);
});

test("ownership shares and associated liabilities are both included in net worth", () => {
  const state = Core.initialState();
  state.baseCurrency = "USD";
  const property = Core.addAsset(state, {
    name: "ملک مشترک",
    type: "real_estate",
    quantity: "1",
    currency: "EUR",
    ownershipPercent: "50",
    liabilityAmount: "200",
    liabilityCurrency: "EUR",
  });
  Core.addValuation(state, {
    assetId: property.id,
    totalValue: "1000",
    currency: "EUR",
    at: at(2),
  });
  Core.addLiability(state, { name: "قرض", amount: "100", currency: "USD" });
  Core.addExchangeRate(state, {
    from: "EUR",
    to: "USD",
    rate: "2",
    source: "دفتر دستی",
    at: at(2),
  });

  const report = Core.netWorth(
    state,
    [{ id: "cash", name: "نقد", balance: "1000", currency: "USD" }],
    at(2),
  );
  assert.equal(report.assetsByCurrency.EUR, "500");
  assert.equal(report.liabilitiesByCurrency.EUR, "100");
  assert.equal(report.liabilitiesByCurrency.USD, "100");
  assert.equal(report.convertedNetWorth, "1700");
  assert.equal(report.complete, true);
});

test("transfers preserve lot basis and splits preserve total cost basis", () => {
  const state = Core.initialState();
  const source = investment(state, { name: "مبدأ" });
  const target = investment(state, { name: "مقصد" });
  trade(state, {
    kind: "buy",
    assetId: source.id,
    quantity: "4",
    unitPrice: "10",
    at: at(1),
    linkedAccountId: "bank",
  });
  trade(state, {
    kind: "transfer",
    assetId: source.id,
    targetAssetId: target.id,
    quantity: "2",
    at: at(2),
  });
  trade(state, {
    kind: "split",
    assetId: target.id,
    numerator: "2",
    denominator: "1",
    at: at(3),
  });
  Core.addValuation(state, {
    assetId: source.id,
    quantity: "2",
    unitPrice: "10",
    currency: "USD",
    at: at(4),
  });
  Core.addValuation(state, {
    assetId: target.id,
    quantity: "4",
    unitPrice: "5",
    currency: "USD",
    at: at(4),
  });

  const report = Core.analytics(state, at(4));
  const byName = Object.fromEntries(
    report.holdings.map((holding) => [holding.asset.name, holding]),
  );
  assert.equal(byName["مبدأ"].quantityText, "2");
  assert.equal(byName["مقصد"].quantityText, "4");
  assert.equal(byName["مبدأ"].costBasisText, "20");
  assert.equal(byName["مقصد"].costBasisText, "20");
  assert.equal(report.realizedByCurrency.USD, "0");
  assert.equal(report.warnings.length, 0);
});
