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
