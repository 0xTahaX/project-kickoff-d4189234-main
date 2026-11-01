import assert from "node:assert/strict";
import { test } from "node:test";
import "./phase4-core.js";

const Core = globalThis.DaraPhase4Core;

const addr1 = `0x${"1".repeat(40)}`;
const addr2 = `0x${"2".repeat(40)}`;

function createTrade(state, overrides = {}) {
  return Core.createTrade(state, {
    account: "Demo",
    market: "crypto",
    symbol: "ETHUSD",
    instrument: "spot",
    direction: "long",
    currency: "USD",
    entryDate: "2026-01-01T10:00:00.000Z",
    entryPrice: "100",
    quantity: "1",
    entryFee: "0",
    ...overrides,
  });
}

function closeTrade(state, trade, input) {
  return Core.closeTrade(state, trade.id, {
    quantity: trade.quantity,
    closedAt: "2026-01-02T10:00:00.000Z",
    exitFee: "0",
    fundingCost: "0",
    ...input,
  });
}

test("validates public wallet addresses and deduplicates repeat imports", () => {
  const state = Core.initialState();
  assert.throws(
    () => Core.addWallet(state, { name: "Bad", address: "not-an-address" }),
    /نشانی عمومی/,
  );
  const first = Core.addWallet(state, { name: "First", address: addr1 });
  const second = Core.addWallet(state, { name: "Second", address: addr2 });
  assert.throws(() => Core.addWallet(state, { name: "Duplicate", address: addr1 }), /از قبل/);

  const transaction = {
    id: "0xtx:tx",
    hash: "0xtx",
    kind: "native_transfer",
    from: addr1,
    to: addr2,
    amount: "1",
    asset: "ETH",
    fee: "0.01",
    status: "confirmed",
    timestamp: "2026-01-01T00:00:00.000Z",
    blockNumber: 1,
  };
  const snapshot = {
    network: "ethereum",
    address: addr1,
    provider: "Blockscout",
    nativeBalance: "2",
    nativeAsset: "ETH",
    tokens: [],
    transactions: [transaction],
    syncedAt: "2026-01-02T00:00:00.000Z",
    partial: false,
    warnings: [],
  };
  Core.mergeWalletSync(state, first.id, snapshot);
  assert.equal(first.transactions[0].classification, "internal_transfer");

  Core.classifyTransaction(state, first.id, transaction.id, "external_withdrawal");
  Core.mergeWalletSync(state, first.id, { ...snapshot, syncedAt: "2026-01-03T00:00:00.000Z" });
  assert.equal(first.transactions.length, 1);
  assert.equal(first.transactions[0].classification, "external_withdrawal");
  assert.equal(second.transactions.length, 0);
});

test("allocates entry fees across partial closes and includes exit fees and funding costs", () => {
  const state = Core.initialState();
  const trade = createTrade(state, {
    quantity: "10",
    entryPrice: "100",
    entryFee: "10",
  });

  const partial = closeTrade(state, trade, {
    quantity: "4",
    exitPrice: "110",
    exitFee: "2",
    fundingCost: "3",
  });
  assert.deepEqual(
    {
      gross: partial.grossPnl,
      entryFee: partial.entryFeeAllocated,
      net: partial.netPnl,
    },
    { gross: "40", entryFee: "4", net: "31" },
  );
  assert.equal(trade.status, "partially_closed");
  const partialReport = Core.analytics(state, { currency: "USD" });
  assert.equal(partialReport.realizedNet, "31");
  assert.equal(partialReport.expectancy, null);

  const remainder = closeTrade(state, trade, { quantity: "6", exitPrice: "95" });
  assert.deepEqual(
    {
      gross: remainder.grossPnl,
      entryFee: remainder.entryFeeAllocated,
      net: remainder.netPnl,
    },
    { gross: "-30", entryFee: "6", net: "-36" },
  );
  assert.equal(trade.status, "closed");
  assert.equal(Core.tradeResult(trade).grossRealized, "10");
  assert.equal(Core.tradeResult(trade).netRealized, "-5");
});

test("rounds fixed-point trade products to eight decimals", () => {
  const state = Core.initialState();
  const trade = createTrade(state, {
    entryPrice: "1",
    quantity: "0.12345678",
    entryFee: "0.00000001",
  });
  const close = closeTrade(state, trade, {
    quantity: "0.12345678",
    exitPrice: "1.12345678",
  });

  assert.equal(close.grossPnl, "0.01524158");
  assert.equal(close.entryFeeAllocated, "0.00000001");
  assert.equal(close.netPnl, "0.01524157");
});

test("calculates long/short PnL, break-even, win rate, profit factor, expectancy and drawdown", () => {
  const state = Core.initialState();
  Core.setStartingEquity(state, "100");
  const win = createTrade(state, { strategy: "A" });
  closeTrade(state, win, { exitPrice: "102" });

  const loss = createTrade(state, {
    strategy: "B",
    entryDate: "2026-01-01T11:00:00.000Z",
  });
  closeTrade(state, loss, { exitPrice: "98" });

  const breakeven = createTrade(state, {
    entryDate: "2026-01-01T12:00:00.000Z",
  });
  closeTrade(state, breakeven, { exitPrice: "100" });

  const short = createTrade(state, {
    direction: "short",
    quantity: "2",
    entryPrice: "100",
    entryFee: "4",
    stopLoss: "110",
    takeProfit: "80",
    entryDate: "2026-01-01T13:00:00.000Z",
  });
  Core.setMarkPrice(state, short.id, {
    price: "90",
    at: "2026-01-01T14:00:00.000Z",
    source: "manual",
  });
  assert.equal(Core.tradeResult(short).unrealized, "16");
  assert.equal(Core.riskReward(short), "2");
  closeTrade(state, short, { quantity: "2", exitPrice: "90" });
  assert.equal(Core.tradeResult(short).netRealized, "16");

  const report = Core.analytics(state, { currency: "USD" });
  assert.equal(report.winRatePercent, "50");
  assert.equal(report.averageWin, "9");
  assert.equal(report.averageLoss, "-2");
  assert.equal(report.profitFactor, "9");
  assert.equal(report.expectancy, "4");
  assert.equal(report.maxDrawdown.amount, "2");
  assert.equal(report.byStrategy.A, "2");
  assert.equal(report.byMarket.crypto, "16");
});

test("rejects cross-currency aggregation and omits missing/stale market marks", () => {
  const state = Core.initialState();
  const usd = createTrade(state);
  const eur = createTrade(state, { currency: "EUR", symbol: "ETHEUR" });
  assert.throws(() => Core.analytics(state), /یک ارز را فیلتر کنید/);
  assert.equal(Core.analytics(state, { currency: "USD" }).unrealized, "0");

  Core.setMarkPrice(state, usd.id, {
    price: "90",
    at: "2025-12-30T10:00:00.000Z",
    source: "manual source",
  });
  const report = Core.analytics(state, { currency: "USD" }, new Date("2026-01-02T10:00:00.000Z"));
  assert.equal(report.unrealized, "-10");
  assert.equal(report.staleMarks, 1);
  assert.equal(report.missingMark, 0);
  assert.equal(Core.analytics(state, { currency: "EUR" }).missingMark, 1);
  assert.throws(
    () => Core.classifyTransaction(state, usd.id, "unknown", "external_deposit"),
    /تراکنش کیف پول/,
  );
  assert.equal(eur.currency, "EUR");
});

// ─── حساب معاملاتی، کارمزد درصدی و موجودی ───────────────────────────────────
test("trading account balance includes deposits and withdrawals but not as PnL", () => {
  const state = Core.initialState();
  const account = Core.createAccount(state, {
    name: "Bitunix",
    broker: "Bitunix",
    currency: "USD",
    initialBalance: "1000",
  });
  Core.recordAccountEvent(state, { accountId: account.id, type: "deposit", amount: "500", at: "2026-01-01T00:00:00Z" });
  Core.recordAccountEvent(state, { accountId: account.id, type: "withdrawal", amount: "200", at: "2026-01-02T00:00:00Z" });
  const balance = Core.accountBalance(state, account.id);
  assert.equal(balance.current, "1300");
  assert.equal(balance.deposits, "500");
  assert.equal(balance.withdrawals, "200");
  assert.equal(balance.realized, "0");
  assert.throws(
    () => Core.recordAccountEvent(state, { accountId: account.id, type: "withdrawal", amount: "5000", at: "2026-01-03T00:00:00Z" }),
    /بیشتر/,
  );
  assert.throws(
    () => Core.createAccount(state, { name: "Bitunix", currency: "USD", initialBalance: "0" }),
    /از قبل/,
  );
});

test("fee rates compute entry and exit fees in net PnL", () => {
  const state = Core.initialState();
  const account = Core.createAccount(state, { name: "A", currency: "USD", initialBalance: "1000" });
  const trade = Core.createTrade(state, {
    account: "A",
    accountId: account.id,
    symbol: "BTC",
    currency: "USD",
    direction: "long",
    entryDate: "2026-01-01T00:00:00Z",
    entryPrice: "100",
    quantity: "2",
    entryFeeRate: "0.06",
  });
  assert.equal(trade.entryFee, "0.12");
  Core.closeTrade(state, trade.id, {
    quantity: "2",
    exitPrice: "110",
    closedAt: "2026-01-02T00:00:00Z",
    exitFeeRate: "0.06",
  });
  const balance = Core.accountBalance(state, account.id);
  assert.equal(balance.fees, "0.252");
  assert.equal(balance.realized, "19.748");
  assert.equal(balance.current, "1019.748");
});

test("partial exits are summed once and update the account balance", () => {
  const state = Core.initialState();
  const account = Core.createAccount(state, { name: "B", currency: "USD", initialBalance: "1000" });
  const trade = Core.createTrade(state, {
    account: "B",
    accountId: account.id,
    symbol: "ETH",
    currency: "USD",
    direction: "long",
    entryDate: "2026-01-01T00:00:00Z",
    entryPrice: "100",
    quantity: "10",
  });
  Core.closeTrade(state, trade.id, { quantity: "4", exitPrice: "110", closedAt: "2026-01-02T00:00:00Z" });
  Core.closeTrade(state, trade.id, { quantity: "6", exitPrice: "90", closedAt: "2026-01-03T00:00:00Z" });
  assert.equal(trade.status, "closed");
  const balance = Core.accountBalance(state, account.id);
  assert.equal(balance.realized, "-20");
  assert.equal(balance.current, "980");
  const summary = Core.journalSummary(state, { accountId: account.id });
  assert.equal(summary.closed, 1);
  assert.equal(summary.netTotal, "-20");
  assert.equal(summary.balance.current, "980");
});

test("clientId makes trade creation idempotent", () => {
  const state = Core.initialState();
  const input = {
    clientId: "client-1",
    account: "A",
    symbol: "BTC",
    currency: "USD",
    direction: "long",
    entryDate: "2026-01-01T00:00:00Z",
    entryPrice: "100",
    quantity: "1",
  };
  const first = Core.createTrade(state, input);
  const second = Core.createTrade(state, input);
  assert.equal(first.id, second.id);
  assert.equal(state.trades.length, 1);
});

test("journal summary reports wins, losses, breakeven, profit factor and risk", () => {
  const state = Core.initialState();
  const account = Core.createAccount(state, { name: "C", currency: "USD", initialBalance: "1000" });
  const base = {
    account: "C",
    accountId: account.id,
    currency: "USD",
    direction: "long",
    entryDate: "2026-01-01T00:00:00Z",
    entryPrice: "100",
    quantity: "1",
    stopLoss: "95",
    takeProfit: "110",
  };
  const win = Core.createTrade(state, { ...base, symbol: "WIN" });
  Core.closeTrade(state, win.id, { quantity: "1", exitPrice: "110", closedAt: "2026-01-02T00:00:00Z" });
  const loss = Core.createTrade(state, { ...base, symbol: "LOSS" });
  Core.closeTrade(state, loss.id, { quantity: "1", exitPrice: "90", closedAt: "2026-01-03T00:00:00Z" });
  const even = Core.createTrade(state, { ...base, symbol: "EVEN" });
  Core.closeTrade(state, even.id, { quantity: "1", exitPrice: "100", closedAt: "2026-01-04T00:00:00Z" });
  const open = Core.createTrade(state, { ...base, symbol: "OPEN" });
  const summary = Core.journalSummary(state, { accountId: account.id });
  assert.equal(summary.total, 4);
  assert.equal(summary.closed, 3);
  assert.equal(summary.open, 1);
  assert.equal(summary.wins, 1);
  assert.equal(summary.losses, 1);
  assert.equal(summary.breakeven, 1);
  assert.equal(summary.grossProfit, "10");
  assert.equal(summary.grossLoss, "10");
  assert.equal(summary.netTotal, "0");
  assert.equal(summary.winRatePercent, "33.33333333");
  assert.equal(summary.profitFactor, "1");
  assert.equal(summary.totalRisk, "5");
  assert.equal(summary.balance.current, "1000");
  assert.equal(open.status, "open");
});

test("equity curve applies deposits and realized PnL once", () => {
  const state = Core.initialState();
  const account = Core.createAccount(state, { name: "D", currency: "USD", initialBalance: "100" });
  Core.recordAccountEvent(state, { accountId: account.id, type: "deposit", amount: "50", at: "2026-01-01T00:00:00Z" });
  const trade = Core.createTrade(state, {
    account: "D",
    accountId: account.id,
    symbol: "SOL",
    currency: "USD",
    direction: "short",
    entryDate: "2026-01-02T00:00:00Z",
    entryPrice: "100",
    quantity: "1",
  });
  Core.closeTrade(state, trade.id, { quantity: "1", exitPrice: "90", closedAt: "2026-01-03T00:00:00Z" });
  const curve = Core.equityCurve(state, account.id);
  assert.deepEqual(curve.map((point) => point.balance), ["150", "160"]);
});

// ─── مدیریت سرمایه و خروج پله‌ای ────────────────────────────────────────────
test("money management: long spot risk, margin and fixed-percent targets", () => {
  const result = Core.moneyManagement({
    balance: "1000",
    riskPercent: "1",
    side: "long",
    instrument: "spot",
    entry: "100",
    stop: "98",
    entryFeeRate: "0",
    exitFeeRate: "0",
    targets: [
      { enabled: true, price: "104", mode: "percent", basis: "initial", percent: "50" },
      { enabled: true, price: "110", mode: "rr", basis: "initial", rr: "2" },
    ],
  });
  assert.equal(result.ok, true, result.errors.join(" | "));
  assert.equal(result.riskAmount, "10");
  assert.equal(result.stopDistance, "2");
  assert.equal(result.quantity, "5");
  assert.equal(result.positionValue, "500");
  assert.equal(result.requiredMargin, "500");
  assert.equal(result.maxLoss, "10");
  assert.equal(result.targets[0].closeQty, "2.5");
  assert.equal(result.targets[0].closePercent, "50");
  assert.equal(result.targets[0].estimatedProfit, "10");
  assert.equal(result.targets[0].remainingPercent, "50");
  assert.equal(result.targets[1].actualRR, "5");
  assert.equal(result.targets[1].closePercent, "40");
  assert.equal(result.targets[1].closeQty, "2");
  assert.equal(result.targets[1].estimatedProfit, "20");
  assert.equal(result.summary.closedPercent, "90");
  assert.equal(result.summary.remainingPercent, "10");
  assert.equal(result.summary.estimatedProfit, "30");
  assert.equal(result.summary.validPlan, true);
});

test("money management: short linear contract fees reduce size and are included in max loss", () => {
  const result = Core.moneyManagement({
    balance: "1000",
    riskPercent: "2",
    side: "short",
    instrument: "linear",
    entry: "100",
    stop: "102",
    leverage: "5",
    entryFeeRate: "0.1",
    exitFeeRate: "0.1",
    targets: [],
  });
  assert.equal(result.ok, true, result.errors.join(" | "));
  assert.equal(result.riskAmount, "20");
  assert.equal(result.quantity, "9.08265213");
  assert.equal(result.positionValue, "908.265213");
  assert.equal(result.requiredMargin, "181.6530426");
  assert.ok(Math.abs(Number(result.maxLoss) - 20) < 1e-5, result.maxLoss);
  assert.ok(Math.abs(Number(result.entryFee) - 0.90826521) < 1e-7, result.entryFee);
  assert.ok(Math.abs(Number(result.exitFeeAtStop) - 0.92643052) < 1e-7, result.exitFeeAtStop);
});

test("money management: RR-based exit on remaining position is coherent", () => {
  const result = Core.moneyManagement({
    balance: "1000",
    riskPercent: "1",
    side: "long",
    instrument: "spot",
    entry: "100",
    stop: "98",
    targets: [
      { enabled: true, price: "110", mode: "rr", basis: "remaining", rr: "1" },
    ],
  });
  assert.equal(result.ok, true, result.errors.join(" | "));
  // سود هدف = ۱R = ۱۰؛ سود هر واحد در تارگت = ۱۰ ⇒ ۱ واحد از ۵ ⇒ ۲۰٪ حجم باقی‌مانده
  assert.equal(result.targets[0].closeQty, "1");
  assert.equal(result.targets[0].closePercent, "20");
  assert.equal(result.targets[0].estimatedProfit, "10");
  assert.equal(result.targets[0].remainingPercent, "80");
});

test("money management: cannot close more than the initial position", () => {
  const result = Core.moneyManagement({
    balance: "1000",
    riskPercent: "1",
    side: "long",
    instrument: "spot",
    entry: "100",
    stop: "98",
    targets: [
      { enabled: true, price: "104", mode: "percent", basis: "initial", percent: "60" },
      { enabled: true, price: "106", mode: "percent", basis: "initial", percent: "60" },
    ],
  });
  assert.equal(result.targets[0].valid, true);
  assert.equal(result.targets[1].valid, false);
  assert.match(result.targets[1].reason, /بیشتر/);
  assert.equal(result.summary.invalidTargets, 1);
  assert.equal(result.summary.validPlan, false);
});

test("money management: validates capital, risk, stop, leverage and targets", () => {
  const zero = Core.moneyManagement({ balance: "0", riskPercent: "1", entry: "100", stop: "98" });
  assert.equal(zero.ok, false);
  assert.ok(zero.errors.some((message) => /موجودی/.test(message)));
  const badRisk = Core.moneyManagement({ balance: "1000", riskPercent: "0", entry: "100", stop: "98" });
  assert.equal(badRisk.ok, false);
  const sameStop = Core.moneyManagement({ balance: "1000", riskPercent: "1", entry: "100", stop: "100" });
  assert.equal(sameStop.ok, false);
  const wrongSide = Core.moneyManagement({ balance: "1000", riskPercent: "1", side: "long", entry: "100", stop: "102" });
  assert.equal(wrongSide.ok, false);
  const noLeverage = Core.moneyManagement({ balance: "1000", riskPercent: "1", instrument: "linear", entry: "100", stop: "98" });
  assert.equal(noLeverage.ok, false);
  const inverse = Core.moneyManagement({ balance: "1000", riskPercent: "1", instrument: "inverse", entry: "100", stop: "98" });
  assert.equal(inverse.ok, false);
  const badTarget = Core.moneyManagement({
    balance: "1000", riskPercent: "1", entry: "100", stop: "98",
    targets: [{ enabled: true, price: "96", mode: "percent", basis: "initial", percent: "50" }],
  });
  assert.equal(badTarget.targets[0].valid, false);
  assert.equal(badTarget.summary.validPlan, false);
  const zeroPercent = Core.moneyManagement({
    balance: "1000", riskPercent: "1", entry: "100", stop: "98",
    targets: [{ enabled: true, price: "104", mode: "percent", basis: "initial", percent: "0" }],
  });
  assert.equal(zeroPercent.targets[0].valid, false);
});

test("money management: margin and liquidation warnings are conservative", () => {
  const margin = Core.moneyManagement({
    balance: "100", riskPercent: "1", instrument: "linear", entry: "100", stop: "98", leverage: "2",
  });
  assert.ok(margin.warnings.some((message) => /مارجین/.test(message)));
  const noInfo = Core.moneyManagement({
    balance: "1000", riskPercent: "1", instrument: "linear", entry: "100", stop: "98", leverage: "10",
  });
  assert.equal(noInfo.liquidation, null);
  assert.ok(noInfo.warnings.some((message) => /لیکویید/.test(message)));
  const liq = Core.moneyManagement({
    balance: "1000", riskPercent: "1", instrument: "linear", entry: "100", stop: "85", leverage: "10",
    maintenanceMarginRate: "0.5",
  });
  assert.equal(liq.liquidation.price, "90.5");
  assert.ok(liq.warnings.some((message) => /بعد از قیمت تقریبی/.test(message)));
  const spot = Core.moneyManagement({
    balance: "1000", riskPercent: "1", instrument: "spot", entry: "100", stop: "98",
  });
  assert.equal(spot.liquidation, null);
  assert.equal(spot.leverage, "1");
});
