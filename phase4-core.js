(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.DaraPhase4Core = api;
})(typeof globalThis === "undefined" ? this : globalThis, function () {
  "use strict";

  const SCALE = 100_000_000n;
  const NETWORKS = ["ethereum"];
  const CLASSIFICATIONS = [
    "unclassified",
    "external_deposit",
    "external_withdrawal",
    "internal_transfer",
    "swap",
    "network_fee",
    "contract_interaction",
    "reward",
  ];
  const MARKETS = ["crypto", "stocks", "forex", "commodities", "other"];
  const INSTRUMENTS = ["spot", "derivative"];
  const DIRECTIONS = ["long", "short"];
  const STATUSES = ["open", "partially_closed", "closed"];
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const id = () =>
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  function decimal(value, label = "مقدار", allowZero = false) {
    const normalized = String(value ?? "")
      .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
      .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
      .replace(/[٬,،\s]/g, "");
    if (!/^\d+(?:\.\d{1,8})?$/.test(normalized))
      throw new Error(`${label} باید عددی مثبت با حداکثر ۸ رقم اعشار باشد.`);
    const [whole, fraction = ""] = normalized.split(".");
    const result = BigInt(whole) * SCALE + BigInt(fraction.padEnd(8, "0") || "0");
    if (result < 0n || (!allowZero && result === 0n))
      throw new Error(`${label} باید ${allowZero ? "صفر یا بیشتر" : "بیشتر از صفر"} باشد.`);
    return result;
  }

  function signedDecimal(value) {
    const normalized = String(value ?? "")
      .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
      .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
      .replace(/[٬,،\s]/g, "");
    if (!/^-?\d+(?:\.\d{1,8})?$/.test(normalized))
      throw new Error("مقدار محاسبه‌شده معتبر نیست.");
    const negative = normalized.startsWith("-");
    const unsigned = negative ? normalized.slice(1) : normalized;
    const [whole, fraction = ""] = unsigned.split(".");
    const result = BigInt(whole) * SCALE + BigInt(fraction.padEnd(8, "0") || "0");
    return negative ? -result : result;
  }

  function remainingEntryFee(trade) {
    return decimal(trade.entryFee, "کارمزد ورود", true) - trade.closes.reduce(
      (total, close) => total + decimal(close.entryFeeAllocated, "کارمزد تخصیص‌یافته", true),
      0n,
    );
  }

  function amount(value) {
    const negative = value < 0n;
    const absolute = negative ? -value : value;
    const whole = absolute / SCALE;
    const fraction = String(absolute % SCALE).padStart(8, "0").replace(/0+$/, "");
    return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
  }

  function multiply(left, right) {
    const product = left * right;
    const rounded = (product < 0n ? -product : product) + SCALE / 2n;
    return (product < 0n ? -rounded : rounded) / SCALE;
  }

  function ratio(value, numerator, denominator) {
    if (denominator <= 0n) throw new Error("مخرج نسبت باید مثبت باشد.");
    return (value * numerator + denominator / 2n) / denominator;
  }

  function dateTime(value, label) {
    if (typeof value !== "string" || !Number.isFinite(Date.parse(value)))
      throw new Error(`${label} معتبر نیست.`);
    return new Date(value).toISOString();
  }

  function initialState() {
    return { version: 1, wallets: [], trades: [], startingEquity: null };
  }

  function validateState(state) {
    if (
      !state ||
      state.version !== 1 ||
      !Array.isArray(state.wallets) ||
      !Array.isArray(state.trades) ||
      (state.startingEquity != null && typeof state.startingEquity !== "string")
    )
      throw new Error("داده‌های بلاک‌چین و ژورنال معتبر نیستند.");
    return state;
  }

  function addWallet(state, input) {
    const name = String(input.name || "").trim();
    const address = String(input.address || "").trim();
    const network = String(input.network || "ethereum").toLowerCase();
    if (!name) throw new Error("نام نمایشی کیف پول را وارد کنید.");
    if (!NETWORKS.includes(network)) throw new Error("شبکهٔ انتخاب‌شده پشتیبانی نمی‌شود.");
    if (!/^0x[a-fA-F0-9]{40}$/.test(address))
      throw new Error("نشانی عمومی Ethereum باید ۴۲ نویسهٔ hex باشد.");
    if (state.wallets.some((wallet) => wallet.address.toLowerCase() === address.toLowerCase()))
      throw new Error("این نشانی از قبل در فهرست کیف پول‌ها وجود دارد.");
    const wallet = {
      id: id(),
      name,
      network,
      address,
      type: String(input.type || "").trim(),
      ownership: ["owned", "watched", "unknown"].includes(input.ownership)
        ? input.ownership
        : "unknown",
      notes: String(input.notes || "").trim(),
      createdAt: new Date().toISOString(),
      lastSyncedAt: null,
      syncStatus: "never",
      snapshot: null,
      transactions: [],
    };
    state.wallets.push(wallet);
    return wallet;
  }

  function mergeWalletSync(state, walletId, snapshot) {
    const wallet = state.wallets.find((item) => item.id === walletId);
    if (!wallet) throw new Error("کیف پول پیدا نشد.");
    if (
      snapshot?.network !== wallet.network ||
      snapshot?.address?.toLowerCase() !== wallet.address.toLowerCase() ||
      !Array.isArray(snapshot.transactions) ||
      !Array.isArray(snapshot.tokens) ||
      !Array.isArray(snapshot.warnings) ||
      typeof snapshot.partial !== "boolean"
    )
      throw new Error("پاسخ همگام‌سازی با کیف پول ثبت‌شده مطابقت ندارد.");
    const syncedAt = dateTime(snapshot.syncedAt, "زمان همگام‌سازی");
    if (
      snapshot.transactions.some(
        (transaction) => !transaction || typeof transaction.id !== "string" || !transaction.id,
      )
    )
      throw new Error("پاسخ همگام‌سازی دارای شناسهٔ تراکنش نامعتبر است.");

    const imported = new Map(wallet.transactions.map((transaction) => [transaction.id, transaction]));
    snapshot.transactions.forEach((transaction) => {
      const existing = imported.get(transaction.id);
      imported.set(transaction.id, {
        ...existing,
        ...transaction,
        classification: existing?.classification || inferInternalTransfer(
          state.wallets,
          wallet,
          transaction,
        ),
      });
    });
    wallet.transactions = [...imported.values()].sort((left, right) =>
      String(right.timestamp || "").localeCompare(String(left.timestamp || "")),
    );
    wallet.snapshot = {
      network: snapshot.network,
      chainId: snapshot.chainId,
      provider: snapshot.provider,
      nativeBalance: snapshot.nativeBalance,
      nativeAsset: snapshot.nativeAsset,
      tokens: clone(snapshot.tokens),
      partial: Boolean(snapshot.partial),
      warnings: clone(snapshot.warnings || []),
    };
    wallet.lastSyncedAt = syncedAt;
    wallet.syncStatus = snapshot.partial ? "partial" : "success";
    return wallet;
  }

  function inferInternalTransfer(wallets, wallet, transaction) {
    if (!["native_transfer", "token_transfer"].includes(transaction.kind))
      return "unclassified";
    const addresses = new Set(wallets.map((item) => item.address.toLowerCase()));
    const from = String(transaction.from || "").toLowerCase();
    const to = String(transaction.to || "").toLowerCase();
    return from !== to && addresses.has(from) && addresses.has(to)
      ? "internal_transfer"
      : "unclassified";
  }

  function classifyTransaction(state, walletId, transactionId, classification) {
    if (!CLASSIFICATIONS.includes(classification))
      throw new Error("دسته‌بندی تراکنش معتبر نیست.");
    const wallet = state.wallets.find((item) => item.id === walletId);
    const transaction = wallet?.transactions.find((item) => item.id === transactionId);
    if (!transaction) throw new Error("تراکنش کیف پول پیدا نشد.");
    transaction.classification = classification;
    return transaction;
  }

  function createTrade(state, input) {
    const trade = normalizeTrade(input);
    state.trades.push(trade);
    return trade;
  }

  function normalizeTrade(input, existing = {}) {
    const market = String(input.market || "other");
    const instrument = String(input.instrument || "spot");
    const direction = String(input.direction || "long");
    if (!MARKETS.includes(market)) throw new Error("بازار انتخاب‌شده معتبر نیست.");
    if (!INSTRUMENTS.includes(instrument)) throw new Error("نوع ابزار معتبر نیست.");
    if (!DIRECTIONS.includes(direction)) throw new Error("جهت معامله معتبر نیست.");
    const account = String(input.account || "").trim();
    const symbol = String(input.symbol || "").trim().toUpperCase();
    const currency = String(input.currency || "").trim().toUpperCase();
    const strategy = String(input.strategy || "").trim();
    if (!account || !symbol || !currency)
      throw new Error("حساب، نماد و ارز مظنه را وارد کنید.");
    const entryDate = dateTime(input.entryDate, "تاریخ ورود");
    const entryPrice = amount(decimal(input.entryPrice, "قیمت ورود"));
    const quantity = amount(decimal(input.quantity, "حجم"));
    const entryFee = input.entryFee ? amount(decimal(input.entryFee, "کارمزد ورود", true)) : "0";
    const leverage = input.leverage ? amount(decimal(input.leverage, "اهرم")) : null;
    const stopLoss = input.stopLoss ? amount(decimal(input.stopLoss, "حد ضرر")) : null;
    const takeProfit = input.takeProfit
      ? amount(decimal(input.takeProfit, "حد سود"))
      : null;
    const idValue = existing.id || id();
    return {
      ...existing,
      id: idValue,
      account,
      market,
      symbol,
      instrument,
      direction,
      currency,
      entryDate,
      entryPrice,
      quantity,
      leverage,
      stopLoss,
      takeProfit,
      entryFee,
      strategy,
      entryRationale: String(input.entryRationale || "").trim(),
      exitRationale: existing.exitRationale || "",
      psychologicalNotes: String(input.psychologicalNotes || "").trim(),
      ruleFollowing: ["yes", "no", "partial"].includes(input.ruleFollowing)
        ? input.ruleFollowing
        : "unrated",
      tags: String(input.tags || "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 20),
      notes: String(input.notes || "").trim(),
      markPrice: existing.markPrice || null,
      markAt: existing.markAt || null,
      closes: existing.closes || [],
      status: existing.status || "open",
      createdAt: existing.createdAt || new Date().toISOString(),
    };
  }

  function editTrade(state, tradeId, input) {
    const index = state.trades.findIndex((trade) => trade.id === tradeId);
    if (index < 0) throw new Error("معامله پیدا نشد.");
    const current = state.trades[index];
    if (current.closes.length) throw new Error("پس از بستن بخشی از معامله، اطلاعات ورود قابل ویرایش نیست.");
    const replacement = normalizeTrade(input, current);
    if (decimal(replacement.quantity) < current.closes.reduce(
      (closed, item) => closed + decimal(item.quantity),
      0n,
    ))
      throw new Error("حجم جدید از حجم بسته‌شده کمتر است.");
    state.trades[index] = replacement;
    return replacement;
  }

  function closeTrade(state, tradeId, input) {
    const trade = state.trades.find((item) => item.id === tradeId);
    if (!trade || trade.status === "closed") throw new Error("این معامله باز نیست.");
    const quantity = decimal(input.quantity, "حجم بستن");
    if (quantity > remainingQuantity(trade))
      throw new Error("حجم بستن از حجم باقی‌مانده بیشتر است.");
    const exitPrice = amount(decimal(input.exitPrice, "قیمت خروج"));
    const exitFee = input.exitFee ? amount(decimal(input.exitFee, "کارمزد خروج", true)) : "0";
    const fundingCost = input.fundingCost
      ? amount(decimal(input.fundingCost, "هزینهٔ تأمین مالی", true))
      : "0";
    const closedAt = dateTime(input.closedAt, "تاریخ خروج");
    const entryFeeAllocated = quantity === remainingQuantity(trade)
      ? remainingEntryFee(trade)
      : ratio(remainingEntryFee(trade), quantity, remainingQuantity(trade));
    const gross = directionalDifference(
      trade.direction,
      decimal(trade.entryPrice),
      decimal(exitPrice),
    );
    const grossAmount = multiply(gross, quantity);
    const close = {
      id: id(),
      quantity: amount(quantity),
      exitPrice,
      closedAt,
      exitFee,
      fundingCost,
      entryFeeAllocated: amount(entryFeeAllocated),
      grossPnl: amount(grossAmount),
      netPnl: amount(
        grossAmount -
          entryFeeAllocated -
          decimal(exitFee, "کارمزد خروج", true) -
          decimal(fundingCost, "هزینهٔ تأمین مالی", true),
      ),
      rationale: String(input.rationale || "").trim(),
    };
    trade.closes.push(close);
    trade.status = remainingQuantity(trade) === 0n ? "closed" : "partially_closed";
    if (trade.status === "closed") trade.exitRationale = close.rationale;
    return close;
  }

  function setMarkPrice(state, tradeId, input) {
    const trade = state.trades.find((item) => item.id === tradeId);
    if (!trade || trade.status === "closed") throw new Error("فقط معاملهٔ باز قیمت‌گذاری می‌شود.");
    trade.markPrice = amount(decimal(input.price, "قیمت مرجع"));
    trade.markAt = dateTime(input.at, "زمان ثبت قیمت");
    trade.markSource = String(input.source || "").trim();
    if (!trade.markSource) throw new Error("منبع قیمت را مشخص کنید.");
    return trade;
  }

  function setStartingEquity(state, value) {
    state.startingEquity = value == null || String(value).trim() === ""
      ? null
      : amount(decimal(value, "سرمایهٔ آغازین"));
    return state.startingEquity;
  }

  function remainingQuantity(trade) {
    return decimal(trade.quantity) - trade.closes.reduce(
      (total, close) => total + decimal(close.quantity),
      0n,
    );
  }

  function directionalDifference(direction, entryPrice, exitPrice) {
    return direction === "short" ? entryPrice - exitPrice : exitPrice - entryPrice;
  }

  function tradeResult(trade) {
    const gross = trade.closes.reduce((total, close) => total + signedDecimal(close.grossPnl), 0n);
    const net = trade.closes.reduce((total, close) => total + signedDecimal(close.netPnl), 0n);
    let unrealized = null;
    if (trade.status !== "closed" && trade.markPrice) {
      const difference = directionalDifference(
        trade.direction,
        decimal(trade.entryPrice),
        decimal(trade.markPrice),
      );
      unrealized = multiply(difference, remainingQuantity(trade));
      unrealized -= remainingEntryFee(trade);
    }
    const closedAt = trade.closes.reduce(
      (latest, close) => (latest == null || close.closedAt > latest ? close.closedAt : latest),
      null,
    );
    return {
      grossRealized: amount(gross),
      netRealized: amount(net),
      unrealized: unrealized == null ? null : amount(unrealized),
      remainingQuantity: amount(remainingQuantity(trade)),
      closedAt,
      isFullyClosed: trade.status === "closed",
    };
  }

  function analytics(state, filters = {}, now = new Date()) {
    const matching = state.trades.filter((trade) => {
      if (filters.market && trade.market !== filters.market) return false;
      if (filters.status && trade.status !== filters.status) return false;
      if (filters.strategy && trade.strategy !== filters.strategy) return false;
      if (filters.currency && trade.currency !== filters.currency) return false;
      const date = trade.entryDate.slice(0, 10);
      if (filters.from && date < filters.from) return false;
      if (filters.to && date > filters.to) return false;
      return true;
    });
    const currencies = [...new Set(matching.map((trade) => trade.currency))];
    if (!filters.currency && currencies.length > 1)
      throw new Error("برای جلوگیری از جمع‌زدن ارزهای متفاوت، یک ارز را فیلتر کنید.");
    const trades = matching;
    const closed = trades
      .filter((trade) => trade.status === "closed")
      .map((trade) => ({ trade, result: tradeResult(trade) }))
      .sort((left, right) =>
        String(left.result.closedAt).localeCompare(String(right.result.closedAt)),
      );
    const realized = trades
      .filter((trade) => trade.closes.length > 0)
      .map((trade) => ({ trade, result: tradeResult(trade) }));
    const winners = closed.filter((item) => signedDecimal(item.result.netRealized) > 0n);
    const losers = closed.filter((item) => signedDecimal(item.result.netRealized) < 0n);
    const totalNet = realized.reduce(
      (total, item) => total + signedDecimal(item.result.netRealized),
      0n,
    );
    const totalGross = realized.reduce(
      (total, item) => total + signedDecimal(item.result.grossRealized),
      0n,
    );
    const closedNet = closed.reduce(
      (total, item) => total + signedDecimal(item.result.netRealized),
      0n,
    );
    const netWins = winners.reduce(
      (total, item) => total + signedDecimal(item.result.netRealized),
      0n,
    );
    const netLosses = losers.reduce(
      (total, item) => total - signedDecimal(item.result.netRealized),
      0n,
    );
    const open = trades.filter((trade) => trade.status !== "closed");
    const unrealized = open.reduce((total, trade) => {
      const value = tradeResult(trade).unrealized;
      return value == null ? total : total + signedDecimal(value);
    }, 0n);
    const markedCount = open.filter((trade) => tradeResult(trade).unrealized != null).length;
    const byDimension = (dimension) => {
      const result = Object.create(null);
      realized.forEach(({ trade, result: outcome }) => {
        const key = trade[dimension] || "بدون برچسب";
        result[key] = amount((result[key] ? signedDecimal(result[key]) : 0n) + signedDecimal(outcome.netRealized));
      });
      return result;
    };
    const startingEquity =
      state.startingEquity == null ? null : decimal(state.startingEquity);
    let maxDrawdown = null;
    const closeEvents = trades
      .flatMap((trade) => trade.closes)
      .sort((left, right) => String(left.closedAt).localeCompare(String(right.closedAt)));
    if (startingEquity != null && startingEquity > 0n && closeEvents.length) {
      let equity = startingEquity;
      let peak = startingEquity;
      let max = 0n;
      let maxPercent = 0n;
      closeEvents.forEach((close) => {
        equity += signedDecimal(close.netPnl);
        if (equity > peak) peak = equity;
        const drawdown = peak - equity;
        if (drawdown > max) max = drawdown;
        const percent = peak > 0n ? ratio(drawdown * 100n, SCALE, peak) : 0n;
        if (percent > maxPercent) maxPercent = percent;
      });
      maxDrawdown = {
        amount: amount(max),
        percent: amount(maxPercent),
      };
    }
    const staleMarks = open.filter(
      (trade) =>
        trade.markAt &&
        now.getTime() - Date.parse(trade.markAt) > 24 * 60 * 60 * 1000,
    ).length;
    return {
      total: trades.length,
      closed: closed.length,
      realizedTrades: realized.length,
      open: open.length,
      realizedGross: amount(totalGross),
      realizedNet: amount(totalNet),
      unrealized: amount(unrealized),
      markedOpen: markedCount,
      missingMark: open.length - markedCount,
      staleMarks,
      winRatePercent:
        closed.length
          ? amount(ratio(BigInt(winners.length) * 100n * SCALE, 1n, BigInt(closed.length)))
          : null,
      averageWin:
        winners.length ? amount(ratio(netWins, 1n, BigInt(winners.length))) : null,
      averageLoss:
        losers.length ? amount(-ratio(netLosses, 1n, BigInt(losers.length))) : null,
      profitFactor:
        netLosses > 0n ? amount(ratio(netWins, SCALE, netLosses)) : null,
      expectancy:
        closed.length ? amount(ratio(closedNet, 1n, BigInt(closed.length))) : null,
      maxDrawdown,
      byStrategy: byDimension("strategy"),
      byMarket: byDimension("market"),
      bySymbol: byDimension("symbol"),
      trades: trades.map((trade) => ({ ...trade, result: tradeResult(trade) })),
    };
  }

  function riskReward(trade) {
    if (!trade.stopLoss || !trade.takeProfit) return null;
    const entry = decimal(trade.entryPrice);
    const stop = decimal(trade.stopLoss);
    const target = decimal(trade.takeProfit);
    const risk = trade.direction === "short" ? stop - entry : entry - stop;
    const reward = trade.direction === "short" ? entry - target : target - entry;
    if (risk <= 0n || reward <= 0n) return null;
    return amount(ratio(reward, SCALE, risk));
  }

  return {
    NETWORKS,
    CLASSIFICATIONS,
    MARKETS,
    INSTRUMENTS,
    DIRECTIONS,
    STATUSES,
    initialState,
    validateState,
    decimal,
    amount,
    addWallet,
    mergeWalletSync,
    classifyTransaction,
    createTrade,
    editTrade,
    closeTrade,
    setMarkPrice,
    setStartingEquity,
    remainingQuantity,
    tradeResult,
    analytics,
    riskReward,
  };
});
