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

  // درصد از یک مبلغ با محاسبات عدد صحیح (مثلاً کارمزد ۰٫۰۶٪).
  function percentOf(value, rate) {
    return ratio(value, rate, 100n * SCALE);
  }

  function feeFromRate(price, quantity, rate) {
    return percentOf(multiply(price, quantity), rate);
  }

  const ACCOUNT_EVENT_TYPES = ["deposit", "withdrawal", "margin_in", "margin_out"];

  function createAccount(state, input) {
    const name = String(input.name || "").trim();
    const broker = String(input.broker || "").trim();
    const currency = String(input.currency || "").trim().toUpperCase();
    if (!name) throw new Error("نام حساب معاملاتی را وارد کنید.");
    if (!currency) throw new Error("ارز حساب را وارد کنید.");
    if (state.accounts.some((account) => account.name === name && account.currency === currency))
      throw new Error("حسابی با این نام و ارز از قبل وجود دارد.");
    const account = {
      id: id(),
      name,
      broker,
      currency,
      initialBalance: amount(decimal(input.initialBalance, "موجودی اولیه", true)),
      createdAt: new Date().toISOString(),
    };
    state.accounts.push(account);
    return account;
  }

  function recordAccountEvent(state, input) {
    const account = state.accounts.find((entry) => entry.id === input.accountId);
    if (!account) throw new Error("حساب معاملاتی پیدا نشد.");
    const type = String(input.type || "");
    if (!ACCOUNT_EVENT_TYPES.includes(type)) throw new Error("نوع رویداد حساب معتبر نیست.");
    const value = decimal(input.amount, "مبلغ رویداد");
    if (type === "withdrawal") {
      const available = decimal(accountBalance(state, account.id).available, "موجودی قابل استفاده", true);
      if (value > available) throw new Error("برداشت از موجودی قابل استفاده بیشتر است.");
    }
    const event = {
      id: id(),
      accountId: account.id,
      type,
      amount: amount(value),
      at: dateTime(input.at, "تاریخ رویداد"),
      note: String(input.note || "").trim(),
    };
    state.events.push(event);
    return event;
  }

  // موجودی = اولیه + واریز − برداشت + سود/زیان خالص تحقق‌یافته؛ واریز/برداشت هرگز PnL نیست.
  function accountBalance(state, accountId) {
    const account = state.accounts.find((entry) => entry.id === accountId);
    if (!account) return null;
    const initial = decimal(account.initialBalance, "موجودی اولیه", true);
    const events = state.events.filter((event) => event.accountId === accountId);
    const deposits = events
      .filter((event) => event.type === "deposit")
      .reduce((total, event) => total + decimal(event.amount), 0n);
    const withdrawals = events
      .filter((event) => event.type === "withdrawal")
      .reduce((total, event) => total + decimal(event.amount), 0n);
    const marginIn = events
      .filter((event) => event.type === "margin_in")
      .reduce((total, event) => total + decimal(event.amount), 0n);
    const marginOut = events
      .filter((event) => event.type === "margin_out")
      .reduce((total, event) => total + decimal(event.amount), 0n);
    const trades = state.trades.filter(
      (trade) => trade.accountId === accountId || (!trade.accountId && trade.account === account.name),
    );
    const closes = trades.flatMap((trade) => trade.closes || []);
    const realized = closes.reduce((total, close) => total + signedDecimal(close.netPnl), 0n);
    const fees = closes.reduce(
      (total, close) =>
        total +
        decimal(close.entryFeeAllocated, "کارمزد", true) +
        decimal(close.exitFee, "کارمزد خروج", true) +
        decimal(close.fundingCost, "هزینهٔ تأمین مالی", true),
      0n,
    );
    const unrealized = trades.reduce((total, trade) => {
      const value = tradeResult(trade).unrealized;
      return value == null ? total : total + signedDecimal(value);
    }, 0n);
    const usedMargin = trades
      .filter((trade) => trade.status !== "closed")
      .reduce((total, trade) => {
        if (!trade.leverage) return total;
        const orderValue = multiply(decimal(trade.entryPrice), decimal(trade.quantity));
        return total + ratio(orderValue, SCALE, decimal(trade.leverage));
      }, 0n);
    const reserved = marginIn - marginOut;
    const current = initial + deposits - withdrawals + realized;
    return {
      initial: amount(initial),
      deposits: amount(deposits),
      withdrawals: amount(withdrawals),
      realized: amount(realized),
      unrealized: amount(unrealized),
      fees: amount(fees),
      usedMargin: amount(usedMargin),
      reservedMargin: amount(reserved),
      current: amount(current),
      equity: amount(current + unrealized),
      available: amount(current - usedMargin - reserved),
    };
  }

  function journalSummary(state, filters = {}) {
    const accountId = filters.accountId || "";
    const account = accountId ? state.accounts.find((entry) => entry.id === accountId) : null;
    const trades = state.trades.filter(
      (trade) =>
        !accountId ||
        trade.accountId === accountId ||
        (!trade.accountId && account && trade.account === account.name),
    );
    const balance = accountId ? accountBalance(state, accountId) : null;
    const closed = trades.filter((trade) => trade.status === "closed");
    const realizedTrades = trades.filter((trade) => (trade.closes || []).length > 0);
    const outcome = (trade) => {
      const result = tradeResult(trade);
      return {
        trade,
        net: signedDecimal(result.netRealized),
        gross: signedDecimal(result.grossRealized),
      };
    };
    const results = realizedTrades.map(outcome);
    const closedResults = closed.map(outcome);
    const wins = closedResults.filter((item) => item.net > 0n);
    const losses = closedResults.filter((item) => item.net < 0n);
    const breakeven = closedResults.filter((item) => item.net === 0n);
    const grossProfit = closedResults.reduce(
      (total, item) => total + (item.gross > 0n ? item.gross : 0n),
      0n,
    );
    const grossLoss = closedResults.reduce(
      (total, item) => total + (item.gross < 0n ? -item.gross : 0n),
      0n,
    );
    const netProfit = closedResults.reduce(
      (total, item) => total + (item.net > 0n ? item.net : 0n),
      0n,
    );
    const netLoss = closedResults.reduce(
      (total, item) => total + (item.net < 0n ? -item.net : 0n),
      0n,
    );
    const fees = trades
      .flatMap((trade) => trade.closes || [])
      .reduce(
        (total, close) =>
          total +
          decimal(close.entryFeeAllocated, "کارمزد", true) +
          decimal(close.exitFee, "کارمزد خروج", true) +
          decimal(close.fundingCost, "هزینه", true),
        0n,
      );
    const closedNet = results.reduce((total, item) => total + item.net, 0n);
    const durations = closed
      .map((trade) => {
        const last = trade.closes.reduce(
          (latest, close) => (latest == null || close.closedAt > latest ? close.closedAt : latest),
          null,
        );
        return last ? Date.parse(last) - Date.parse(trade.entryDate) : null;
      })
      .filter((value) => value != null && value >= 0);
    const sorted = closedResults.sort((left, right) => (left.net < right.net ? -1 : 1));
    const openTrades = trades.filter((trade) => trade.status !== "closed");
    const totalRisk = openTrades.reduce((total, trade) => {
      if (!trade.stopLoss) return total;
      const distance = trade.direction === "short"
        ? decimal(trade.stopLoss) - decimal(trade.entryPrice)
        : decimal(trade.entryPrice) - decimal(trade.stopLoss);
      if (distance <= 0n) return total;
      return total + multiply(distance, decimal(trade.quantity));
    }, 0n);
    return {
      total: trades.length,
      closed: closed.length,
      open: openTrades.length,
      wins: wins.length,
      losses: losses.length,
      breakeven: breakeven.length,
      winRatePercent: closed.length
        ? amount(ratio(BigInt(wins.length) * 100n * SCALE, 1n, BigInt(closed.length)))
        : null,
      grossProfit: amount(grossProfit),
      grossLoss: amount(grossLoss),
      grossNet: amount(grossProfit - grossLoss),
      netProfit: amount(netProfit),
      netLoss: amount(netLoss),
      netTotal: amount(closedNet),
      fees: amount(fees),
      profitFactor: netLoss > 0n ? amount(ratio(netProfit, SCALE, netLoss)) : null,
      averageWin: wins.length ? amount(ratio(netProfit, 1n, BigInt(wins.length))) : null,
      averageLoss: losses.length ? amount(-ratio(netLoss, 1n, BigInt(losses.length))) : null,
      best: sorted.length ? amount(sorted[sorted.length - 1].net) : null,
      worst: sorted.length ? amount(sorted[0].net) : null,
      averageDurationHours: durations.length
        ? amount(ratio(BigInt(durations.reduce((sum, value) => sum + value, 0)) * SCALE, 1n, BigInt(durations.length)))
        : null,
      totalRisk: amount(totalRisk),
      balance,
    };
  }

  function equityCurve(state, accountId) {
    const account = state.accounts.find((entry) => entry.id === accountId);
    if (!account) return [];
    const initial = decimal(account.initialBalance, "موجودی اولیه", true);
    const events = state.events
      .filter((event) => event.accountId === accountId)
      .map((event) => ({
        at: event.at,
        delta:
          event.type === "deposit"
            ? decimal(event.amount)
            : event.type === "withdrawal"
              ? -decimal(event.amount)
              : 0n,
        label: event.type,
      }));
    const closes = state.trades
      .filter((trade) => trade.accountId === accountId || (!trade.accountId && trade.account === account.name))
      .flatMap((trade) => trade.closes || [])
      .map((close) => ({ at: close.closedAt, delta: signedDecimal(close.netPnl), label: "trade" }));
    let balance = initial;
    return [...events, ...closes]
      .sort((left, right) => String(left.at).localeCompare(String(right.at)))
      .map((entry) => {
        balance += entry.delta;
        return { at: entry.at, balance: amount(balance), label: entry.label };
      });
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
    return { version: 1, wallets: [], trades: [], startingEquity: null, accounts: [], events: [] };
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
    // میدان‌های جدید ژورنال برای داده‌های قدیمی به‌صورت سازگار اضافه می‌شوند.
    if (!Array.isArray(state.accounts)) state.accounts = [];
    if (!Array.isArray(state.events)) state.events = [];
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
    // clientId (اختیاری) از ثبت تکراری در دابل‌کلیک/تلاش مجدد جلوگیری می‌کند.
    const clientId = String(input.clientId || "").trim();
    if (clientId) {
      const duplicate = state.trades.find((trade) => trade.clientId === clientId);
      if (duplicate) return duplicate;
    }
    const trade = normalizeTrade(input);
    if (trade.accountId && !state.accounts.some((account) => account.id === trade.accountId))
      throw new Error("حساب معاملاتی انتخاب‌شده پیدا نشد.");
    trade.clientId = clientId || null;
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
    const accountId = input.accountId ? String(input.accountId) : existing.accountId || null;
    const symbol = String(input.symbol || "").trim().toUpperCase();
    const currency = String(input.currency || "").trim().toUpperCase();
    const strategy = String(input.strategy || "").trim();
    if ((!account && !accountId) || !symbol || !currency)
      throw new Error("حساب، نماد و ارز مظنه را وارد کنید.");
    const entryDate = dateTime(input.entryDate, "تاریخ ورود");
    const entryPrice = amount(decimal(input.entryPrice, "قیمت ورود"));
    const quantity = amount(decimal(input.quantity, "حجم"));
    const entryFeeRate = input.entryFeeRate
      ? amount(decimal(input.entryFeeRate, "نرخ کارمزد ورود", true))
      : null;
    const entryFeeText = String(input.entryFee ?? "").trim();
    const entryFee =
      entryFeeText && entryFeeText !== "0"
        ? amount(decimal(entryFeeText, "کارمزد ورود", true))
        : entryFeeRate && decimal(entryFeeRate) > 0n
          ? amount(feeFromRate(decimal(entryPrice), decimal(quantity), decimal(entryFeeRate)))
          : "0";
    if (entryFeeRate && decimal(entryFeeRate) > 100n * SCALE)
      throw new Error("نرخ کارمزد ورود نمی‌تواند بیش از ۱۰۰٪ باشد.");
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
      accountId,
      entryFeeRate,
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
    const exitFeeRate = input.exitFeeRate
      ? amount(decimal(input.exitFeeRate, "نرخ کارمزد خروج", true))
      : null;
    if (exitFeeRate && decimal(exitFeeRate) > 100n * SCALE)
      throw new Error("نرخ کارمزد خروج نمی‌تواند بیش از ۱۰۰٪ باشد.");
    const computedExitFee =
      exitFeeRate && decimal(exitFeeRate) > 0n
        ? amount(feeFromRate(decimal(exitPrice), quantity, decimal(exitFeeRate)))
        : null;
    const exitFeeText = String(input.exitFee ?? "").trim();
    const exitFee =
      exitFeeText && exitFeeText !== "0"
        ? amount(decimal(exitFeeText, "کارمزد خروج", true))
        : computedExitFee || "0";
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
      exitFeeRate,
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
      if (filters.accountId && trade.accountId !== filters.accountId) return false;
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


  // ─── مدیریت سرمایه و خروج پله‌ای (فاز ۲) ───────────────────────────────────
  // مدل پشتیبانی‌شده: Spot (بدون لیکوییدیشن) و Linear Perpetual با مارجین ایزوله.
  // Inverse، Funding، Slippage و Tick/Lot خارج از محدوده‌اند.
  const MM_INSTRUMENTS = ["spot", "linear"];

  function moneyManagement(input = {}) {
    const errors = [];
    const warnings = [];
    const read = (value, label, allowZero = false) => {
      try {
        return decimal(value, label, allowZero);
      } catch (error) {
        errors.push(error.message);
        return null;
      }
    };
    const side = input.side === "short" ? "short" : "long";
    const instrument = MM_INSTRUMENTS.includes(input.instrument) ? input.instrument : "spot";
    if (input.instrument && !MM_INSTRUMENTS.includes(input.instrument))
      errors.push("این نوع قرارداد پشتیبانی نمی‌شود؛ فقط Spot و Linear Perpetual.");

    const balance = read(input.balance, "موجودی حساب");
    const riskPercent = read(input.riskPercent, "درصد ریسک");
    const entry = read(input.entry, "قیمت ورود");
    const stop = read(input.stop, "حد ضرر");
    const leverageInput =
      input.leverage == null || String(input.leverage).trim() === ""
        ? null
        : read(input.leverage, "اهرم");
    const leverage = instrument === "spot" ? SCALE : leverageInput;
    const entryFeeRate = read(input.entryFeeRate ?? "0", "نرخ کارمزد ورود", true);
    const exitFeeRate = read(input.exitFeeRate ?? "0", "نرخ کارمزد خروج", true);

    if (balance != null && balance <= 0n) errors.push("موجودی حساب باید بیشتر از صفر باشد.");
    if (riskPercent != null && (riskPercent <= 0n || riskPercent > 100n * SCALE))
      errors.push("درصد ریسک باید بین ۰ و ۱۰۰ باشد.");
    if (entry != null && entry <= 0n) errors.push("قیمت ورود باید بیشتر از صفر باشد.");
    if (stop != null && stop <= 0n) errors.push("حد ضرر باید بیشتر از صفر باشد.");
    if (entry != null && stop != null) {
      if (entry === stop) errors.push("حد ضرر نباید برابر با قیمت ورود باشد.");
      else if (side === "long" && stop > entry)
        errors.push("در معاملهٔ Long حد ضرر باید کمتر از قیمت ورود باشد.");
      else if (side === "short" && stop < entry)
        errors.push("در معاملهٔ Short حد ضرر باید بیشتر از قیمت ورود باشد.");
    }
    if (instrument === "linear") {
      if (leverage == null) errors.push("برای قرارداد خطی، اهرم را وارد کنید.");
      else if (leverage <= 0n) errors.push("اهرم باید بیشتر از صفر باشد.");
    }
    if (entryFeeRate != null && entryFeeRate > 100n * SCALE)
      errors.push("نرخ کارمزد ورود نمی‌تواند بیش از ۱۰۰٪ باشد.");
    if (exitFeeRate != null && exitFeeRate > 100n * SCALE)
      errors.push("نرخ کارمزد خروج نمی‌تواند بیش از ۱۰۰٪ باشد.");

    if (errors.length) return { ok: false, errors, warnings, side, instrument, targets: [], summary: null };

    const riskDistance = entry > stop ? entry - stop : stop - entry;
    const stopPercent = ratio(riskDistance, 100n * SCALE, entry);
    const riskAmount = ratio(balance, riskPercent, 100n * SCALE);
    const entryFeePerUnit = ratio(entry, entryFeeRate, 100n * SCALE);
    const exitFeePerUnitStop = ratio(stop, exitFeeRate, 100n * SCALE);
    const riskPerUnit = riskDistance + entryFeePerUnit + exitFeePerUnitStop;
    if (riskPerUnit <= 0n) errors.push("فاصلهٔ حد ضرر و کارمزدها باید بیشتر از صفر باشد.");
    const quantity = riskPerUnit > 0n ? ratio(riskAmount, SCALE, riskPerUnit) : 0n;
    if (quantity <= 0n) errors.push("حجم پوزیشن محاسبه‌شده باید بیشتر از صفر باشد.");
    const positionValue = multiply(quantity, entry);
    const leverageFactor = instrument === "linear" ? leverage : SCALE;
    const requiredMargin = leverageFactor > 0n ? ratio(positionValue, SCALE, leverageFactor) : 0n;
    const entryFee = ratio(multiply(quantity, entry), entryFeeRate, 100n * SCALE);
    const exitFeeAtStop = ratio(multiply(quantity, stop), exitFeeRate, 100n * SCALE);
    const maxLoss = multiply(quantity, riskDistance) + entryFee + exitFeeAtStop;
    if (requiredMargin > balance)
      warnings.push("مارجین موردنیاز از موجودی حساب بیشتر است؛ این معامله با این اهرم قابل اجرا نیست.");

    // هشدار لیکوییدیشن: آستانهٔ از دست رفتن کل مارجین (تقریبی و بدون فرمول Pine).
    let liquidation = null;
    if (instrument === "linear") {
      const threshold = ratio(100n * SCALE, SCALE, leverage);
      if (stopPercent >= threshold)
        warnings.push(
          "فاصلهٔ درصدی حد ضرر بزرگ‌تر از حرکت لازم برای از دست رفتن کل مارجین است؛ خطر لیکویید قبل از استاپ وجود دارد.",
        );
      const mmr =
        input.maintenanceMarginRate == null || String(input.maintenanceMarginRate).trim() === ""
          ? null
          : read(input.maintenanceMarginRate, "نرخ مارجین نگهداری", true);
      if (mmr == null) {
        warnings.push("امکان محاسبهٔ دقیق قیمت لیکوییدیشن وجود ندارد؛ نرخ مارجین نگهداری را وارد کنید.");
      } else if (mmr > 0n) {
        const oneOverLeverage = ratio(SCALE, SCALE, leverage);
        const mmrFraction = ratio(mmr, SCALE, 100n * SCALE);
        const factor =
          side === "long"
            ? SCALE - oneOverLeverage + mmrFraction
            : SCALE + oneOverLeverage - mmrFraction;
        const price = multiply(entry, factor);
        liquidation = { price: amount(price), approximate: true };
        const beforeStop = side === "long" ? stop < price : stop > price;
        if (beforeStop)
          warnings.push("حد ضرر بعد از قیمت تقریبی لیکوییدیشن قرار دارد؛ ریسک لیکویید قبل از استاپ وجود دارد.");
      }
    }

    const targets = [];
    let remainingQty = quantity;
    let closedQty = 0n;
    const rawTargets = Array.isArray(input.targets) ? input.targets.slice(0, 5) : [];
    for (let index = 0; index < 5; index += 1) {
      const item = rawTargets[index] || {};
      const enabled = item.enabled === true || item.enabled === "true" || item.enabled === "on";
      const result = {
        index,
        enabled,
        valid: false,
        price: null,
        actualRR: null,
        closePercent: null,
        closeQty: null,
        closeValue: null,
        estimatedProfit: null,
        remainingPercent: index === 0 ? "100" : null,
        mode: item.mode === "rr" ? "rr" : "percent",
        basis: item.basis === "remaining" ? "remaining" : "initial",
        reason: enabled ? "" : "غیرفعال",
      };
      if (!enabled) {
        targets.push(result);
        continue;
      }
      const price = read(item.price, `قیمت تارگت ${index + 1}`);
      if (price == null) {
        result.reason = "قیمت تارگت معتبر نیست.";
        targets.push(result);
        continue;
      }
      const reward = side === "long" ? price - entry : entry - price;
      if (price <= 0n || reward <= 0n) {
        result.reason = "تارگت در جهت معامله نیست.";
        targets.push(result);
        continue;
      }
      if (remainingQty <= 0n) {
        result.reason = "حجمی برای خروج باقی نمانده است.";
        targets.push(result);
        continue;
      }
      const actualRR = ratio(reward, SCALE, riskDistance);
      let percent = null;
      if (result.mode === "percent") {
        percent = read(item.percent, `درصد خروج تارگت ${index + 1}`);
      } else {
        const rrGoal = read(item.rr, `RR تارگت ${index + 1}`);
        if (rrGoal != null && rrGoal > 0n) {
          if (result.basis === "remaining") {
            const goalProfit = multiply(rrGoal, riskAmount);
            const denominator = multiply(remainingQty, reward);
            percent = denominator > 0n ? ratio(goalProfit, 100n * SCALE, denominator) : null;
          } else {
            percent = ratio(rrGoal, 100n * SCALE, actualRR);
          }
        }
      }
      if (percent == null || percent <= 0n || percent > 100n * SCALE) {
        result.reason = "درصد خروج محاسبه‌شده باید بین ۰ و ۱۰۰ باشد.";
        targets.push(result);
        continue;
      }
      const closeQty =
        result.basis === "initial"
          ? ratio(quantity, percent, 100n * SCALE)
          : ratio(remainingQty, percent, 100n * SCALE);
      if (closeQty <= 0n || closeQty > remainingQty) {
        result.reason = "مقدار خروج از حجم باقی‌مانده بیشتر است.";
        targets.push(result);
        continue;
      }
      const percentOfInitial = ratio(closeQty, 100n * SCALE, quantity);
      const nextClosed = closedQty + closeQty;
      if (nextClosed > quantity) {
        result.reason = "مجموع خروج‌ها از ۱۰۰٪ حجم اولیه بیشتر می‌شود.";
        targets.push(result);
        continue;
      }
      closedQty = nextClosed;
      remainingQty -= closeQty;
      const exitFee = ratio(multiply(closeQty, price), exitFeeRate, 100n * SCALE);
      const entryFeeAllocated = ratio(multiply(closeQty, entry), entryFeeRate, 100n * SCALE);
      result.valid = true;
      result.reason = "";
      result.price = amount(price);
      result.actualRR = amount(actualRR);
      result.closePercent = amount(percentOfInitial);
      result.closeQty = amount(closeQty);
      result.closeValue = amount(multiply(closeQty, price));
      result.estimatedProfit = amount(multiply(closeQty, reward) - exitFee - entryFeeAllocated);
      result.remainingPercent = amount(ratio(remainingQty, 100n * SCALE, quantity));
      targets.push(result);
    }

    const closedPercent = ratio(quantity - remainingQty, 100n * SCALE, quantity);
    const remainingPercent = ratio(remainingQty, 100n * SCALE, quantity);
    const estimatedProfit = targets.reduce(
      (total, target) => (target.valid ? total + signedDecimal(target.estimatedProfit) : total),
      0n,
    );
    const enabledTargets = targets.filter((target) => target.enabled);
    const invalidTargets = enabledTargets.filter((target) => !target.valid);
    if (invalidTargets.length)
      warnings.push(`${invalidTargets.length} تارگت نامعتبر است و در جمع خروج لحاظ نشد.`);
    return {
      ok: true,
      errors,
      warnings,
      side,
      instrument,
      balance: amount(balance),
      riskPercent: amount(riskPercent),
      riskAmount: amount(riskAmount),
      stopDistance: amount(riskDistance),
      stopPercent: amount(stopPercent),
      quantity: amount(quantity),
      positionValue: amount(positionValue),
      requiredMargin: amount(requiredMargin),
      leverage: instrument === "linear" ? amount(leverage) : "1",
      entryFee: amount(entryFee),
      exitFeeAtStop: amount(exitFeeAtStop),
      maxLoss: amount(maxLoss),
      liquidation,
      targets,
      summary: {
        closedPercent: amount(closedPercent),
        remainingPercent: amount(remainingPercent),
        estimatedProfit: amount(estimatedProfit),
        validPlan: invalidTargets.length === 0 && closedPercent <= 100n * SCALE,
        enabledTargets: enabledTargets.length,
        invalidTargets: invalidTargets.length,
      },
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
    percentOf,
    feeFromRate,
    ACCOUNT_EVENT_TYPES,
    MM_INSTRUMENTS,
    moneyManagement,
    createAccount,
    recordAccountEvent,
    accountBalance,
    journalSummary,
    equityCurve,
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
