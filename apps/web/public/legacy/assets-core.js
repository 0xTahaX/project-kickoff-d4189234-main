(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.DaraAssetsCore = api;
})(typeof globalThis === "undefined" ? this : globalThis, function () {
  "use strict";

  const SCALE = 100_000_000n;
  const STALE_DAYS = 30;
  const DAY_MS = 86_400_000;
  const ASSET_TYPES = [
    "cash",
    "precious_metal",
    "stock",
    "fund",
    "crypto",
    "real_estate",
    "vehicle",
    "foreign_currency",
    "other",
  ];
  const INVESTMENT_TYPES = new Set([
    "stock",
    "fund",
    "precious_metal",
    "crypto",
    "foreign_currency",
    "other",
  ]);
  const LIQUIDITY_TYPES = ["liquid", "semi_liquid", "illiquid"];
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const id = () =>
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  function decimal(value, label = "مقدار") {
    const normalized = String(value ?? "")
      .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
      .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
      .replace(/[٬,،\s]/g, "");
    if (!/^-?\d+(?:\.\d{1,8})?$/.test(normalized))
      throw new Error(`${label} باید عددی با حداکثر ۸ رقم اعشار باشد.`);
    const negative = normalized.startsWith("-");
    const [whole, fraction = ""] = normalized.replace("-", "").split(".");
    const result =
      BigInt(whole) * SCALE + BigInt(fraction.padEnd(8, "0") || "0");
    return negative ? -result : result;
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
    const negative = product < 0n;
    const absolute = negative ? -product : product;
    const rounded = (absolute + SCALE / 2n) / SCALE;
    return negative ? -rounded : rounded;
  }

  function ratio(value, numerator, denominator) {
    if (denominator === 0n) throw new Error("مخرج نسبت نمی‌تواند صفر باشد.");
    const product = value * numerator;
    const negative = product < 0n !== denominator < 0n;
    const absolute = (product < 0n ? -product : product);
    const divisor = denominator < 0n ? -denominator : denominator;
    const rounded = (absolute + divisor / 2n) / divisor;
    return negative ? -rounded : rounded;
  }

  function initialState() {
    return {
      version: 1,
      baseCurrency: "IRR",
      assets: [],
      valuations: [],
      liabilities: [],
      exchangeRates: [],
      investmentTransactions: [],
    };
  }

  function validateState(state) {
    if (
      !state ||
      state.version !== 1 ||
      !Array.isArray(state.assets) ||
      !Array.isArray(state.valuations) ||
      !Array.isArray(state.liabilities) ||
      !Array.isArray(state.exchangeRates) ||
      !Array.isArray(state.investmentTransactions)
    )
      throw new Error("داده‌های دارایی و سرمایه‌گذاری معتبر نیستند.");
    return state;
  }

  function valuationFor(state, assetId, at = new Date().toISOString()) {
    return state.valuations
      .filter((valuation) => valuation.assetId === assetId && valuation.at <= at)
      .sort((left, right) => right.at.localeCompare(left.at))[0] || null;
  }

  function exchangeRate(state, from, to, at = new Date().toISOString()) {
    if (from === to) return { rate: SCALE, source: "واحد یکسان", at, stale: false };
    const candidates = state.exchangeRates
      .filter((rate) => rate.from === from && rate.to === to && rate.at <= at)
      .sort((left, right) => right.at.localeCompare(left.at));
    const direct = candidates[0];
    if (direct) {
      const stale = Date.parse(at) - Date.parse(direct.at) > STALE_DAYS * DAY_MS;
      return { rate: decimal(direct.rate), source: direct.source, at: direct.at, stale };
    }
    const reverse = state.exchangeRates
      .filter((rate) => rate.from === to && rate.to === from && rate.at <= at)
      .sort((left, right) => right.at.localeCompare(left.at))[0];
    if (!reverse) return null;
    const stale = Date.parse(at) - Date.parse(reverse.at) > STALE_DAYS * DAY_MS;
    return {
      rate: ratio(SCALE, SCALE, decimal(reverse.rate)),
      source: reverse.source,
      at: reverse.at,
      stale,
    };
  }

  function convert(state, value, from, to, at = new Date().toISOString()) {
    const quote = exchangeRate(state, from, to, at);
    if (!quote || quote.stale) return null;
    return { value: multiply(value, quote.rate), quote };
  }

  function addAsset(state, input) {
    if (!input.name?.trim()) throw new Error("نام دارایی را وارد کنید.");
    if (!ASSET_TYPES.includes(input.type)) throw new Error("نوع دارایی معتبر نیست.");
    if (!input.currency?.trim()) throw new Error("واحد ارزش‌گذاری را وارد کنید.");
    const asset = {
      id: id(),
      name: input.name.trim(),
      identifier: String(input.identifier || "").trim(),
      type: input.type,
      quantity: amount(decimal(input.quantity || "1", "مقدار")),
      unit: String(input.unit || "واحد").trim(),
      currency: input.currency.trim().toUpperCase(),
      acquiredAt: input.acquiredAt || "",
      acquisitionCost:
        input.acquisitionCost === "" || input.acquisitionCost == null
          ? null
          : amount(decimal(input.acquisitionCost, "بهای تمام‌شده")),
      acquisitionCurrency: String(input.acquisitionCurrency || input.currency)
        .trim()
        .toUpperCase(),
      valuationMethod: String(input.valuationMethod || "manual"),
      priceSource: String(input.priceSource || "دستی"),
      ownershipPercent: amount(decimal(input.ownershipPercent || "100", "درصد مالکیت")),
      liquidity: input.liquidity || "semi_liquid",
      linkedAccountId: input.linkedAccountId || "",
      valueAlreadyInAccount: Boolean(input.valueAlreadyInAccount),
      liabilityAmount:
        input.liabilityAmount === "" || input.liabilityAmount == null
          ? null
          : amount(decimal(input.liabilityAmount, "بدهی مرتبط")),
      liabilityCurrency: String(input.liabilityCurrency || input.currency)
        .trim()
        .toUpperCase(),
      notes: String(input.notes || "").trim(),
      status: "active",
      createdAt: new Date().toISOString(),
    };
    if (!Number.isFinite(Number(asset.ownershipPercent)) ||
        Number(asset.ownershipPercent) <= 0 ||
        Number(asset.ownershipPercent) > 100)
      throw new Error("سهم مالکیت باید بیشتر از صفر و حداکثر ۱۰۰ درصد باشد.");
    if (!LIQUIDITY_TYPES.includes(asset.liquidity))
      throw new Error("طبقه‌بندی نقدشوندگی معتبر نیست.");
    if (INVESTMENT_TYPES.has(asset.type) &&
        asset.acquisitionCost != null &&
        asset.acquisitionCurrency !== asset.currency)
      throw new Error("برای ثبت بهای اولیه، ارز آن باید با ارز دارایی یکسان باشد.");
    if (INVESTMENT_TYPES.has(asset.type) && asset.acquisitionCost == null) {
      asset.acquisitionCost = null;
    }
    state.assets.push(asset);
    return asset;
  }

  function addValuation(state, input) {
    const asset = state.assets.find((item) => item.id === input.assetId);
    if (!asset) throw new Error("دارایی پیدا نشد.");
    const at = input.at || new Date().toISOString();
    if (!Number.isFinite(Date.parse(at))) throw new Error("زمان ارزش‌گذاری معتبر نیست.");
    const quantity = decimal(input.quantity || asset.quantity, "مقدار");
    const unitPrice =
      input.unitPrice === "" || input.unitPrice == null
        ? null
        : decimal(input.unitPrice, "قیمت واحد");
    const total =
      input.totalValue === "" || input.totalValue == null
        ? unitPrice == null
          ? null
          : multiply(quantity, unitPrice)
        : decimal(input.totalValue, "ارزش کل");
    if (total == null || total < 0n) throw new Error("ارزش فعلی را وارد کنید.");
    if (unitPrice != null && unitPrice < 0n) throw new Error("قیمت واحد نمی‌تواند منفی باشد.");
    const valuation = {
      id: id(),
      assetId: asset.id,
      at: new Date(at).toISOString(),
      quantity: amount(quantity),
      unitPrice: unitPrice == null ? null : amount(unitPrice),
      totalValue: amount(total),
      currency: String(input.currency || asset.currency).trim().toUpperCase(),
      source: String(input.source || "دستی").trim(),
      method: input.method || "manual",
      externallySourced: false,
    };
    state.valuations.push(valuation);
    asset.valuationMethod = valuation.method;
    asset.priceSource = valuation.source;
    return valuation;
  }

  function addLiability(state, input) {
    if (!input.name?.trim()) throw new Error("عنوان بدهی را وارد کنید.");
    const value = decimal(input.amount, "مبلغ بدهی");
    if (value <= 0n) throw new Error("مبلغ بدهی باید بیشتر از صفر باشد.");
    const liability = {
      id: id(),
      name: input.name.trim(),
      amount: amount(value),
      currency: String(input.currency || state.baseCurrency).trim().toUpperCase(),
      dueAt: input.dueAt || "",
      linkedAssetId: input.linkedAssetId || "",
      createdAt: new Date().toISOString(),
    };
    state.liabilities.push(liability);
    return liability;
  }

  function addExchangeRate(state, input) {
    const from = String(input.from || "").trim().toUpperCase();
    const to = String(input.to || "").trim().toUpperCase();
    const rate = decimal(input.rate, "نرخ تبدیل");
    if (!from || !to || from === to) throw new Error("دو واحد پول متفاوت انتخاب کنید.");
    if (rate <= 0n) throw new Error("نرخ تبدیل باید بیشتر از صفر باشد.");
    if (!input.source?.trim()) throw new Error("منبع نرخ تبدیل را مشخص کنید.");
    const record = {
      id: id(),
      from,
      to,
      rate: amount(rate),
      source: input.source.trim(),
      at: new Date(input.at || Date.now()).toISOString(),
    };
    state.exchangeRates.push(record);
    return record;
  }

  function orderedTransactions(state, at = "9999") {
    return state.investmentTransactions
      .filter((transaction) => transaction.at <= at)
      .slice()
      .sort((left, right) =>
        left.at.localeCompare(right.at) || left.id.localeCompare(right.id),
      );
  }

  function portfolio(state, at = new Date().toISOString()) {
    const positions = new Map();
    const cash = new Map();
    const realized = new Map();
    const realizedBasis = new Map();
    const realizedByAsset = new Map();
    const realizedBasisByAsset = new Map();
    const income = new Map();
    const fees = new Map();
    const accountEffects = new Map();
    const warnings = [];
    const getLots = (assetId) => {
      if (!positions.has(assetId)) positions.set(assetId, []);
      return positions.get(assetId);
    };
    const addMoney = (map, currency, value) =>
      map.set(currency, (map.get(currency) || 0n) + value);
    const accountEffect = (accountId, currency, value) => {
      if (!accountId || !value) return;
      const key = `${accountId}\u0000${currency}`;
      accountEffects.set(key, (accountEffects.get(key) || 0n) + value);
    };

    for (const asset of state.assets) {
      if (
        asset.status === "active" &&
        INVESTMENT_TYPES.has(asset.type) &&
        asset.acquisitionCost != null &&
        decimal(asset.quantity) > 0n
      ) {
        getLots(asset.id).push({
          id: `opening-${asset.id}`,
          acquiredAt: asset.acquiredAt || asset.createdAt,
          originalQuantity: decimal(asset.quantity),
          remainingQuantity: decimal(asset.quantity),
          remainingCost: decimal(asset.acquisitionCost),
          currency: asset.acquisitionCurrency || asset.currency,
        });
      }
    }

    for (const transaction of orderedTransactions(state, at)) {
      const asset = state.assets.find((item) => item.id === transaction.assetId);
      if (transaction.kind === "deposit" || transaction.kind === "withdrawal") {
        const value = decimal(transaction.amount);
        const sign = transaction.kind === "deposit" ? 1n : -1n;
        addMoney(cash, transaction.currency, sign * value);
        accountEffect(
          transaction.linkedAccountId,
          transaction.cashCurrency || transaction.currency,
          -sign * decimal(transaction.cashAmount || transaction.amount),
        );
        continue;
      }
      if (transaction.kind === "fee") {
        const fee = decimal(transaction.fee || transaction.amount);
        addMoney(realized, transaction.currency, -fee);
        addMoney(fees, transaction.currency, fee);
        if (transaction.assetId)
          addMoney(realizedByAsset, transaction.assetId, -fee);
        if (!transaction.linkedAccountId)
          addMoney(cash, transaction.currency, -fee);
        accountEffect(
          transaction.linkedAccountId,
          transaction.cashCurrency || transaction.currency,
          -decimal(transaction.cashAmount || transaction.fee || transaction.amount),
        );
        continue;
      }
      if (transaction.kind === "dividend") {
        const value = decimal(transaction.amount);
        addMoney(income, transaction.currency, value);
        if (!transaction.linkedAccountId)
          addMoney(cash, transaction.currency, value);
        accountEffect(
          transaction.linkedAccountId,
          transaction.cashCurrency || transaction.currency,
          decimal(transaction.cashAmount || transaction.amount),
        );
        continue;
      }
      if (!asset || !INVESTMENT_TYPES.has(asset.type)) {
        warnings.push(`تراکنش ${transaction.id} به دارایی سرمایه‌گذاری معتبر متصل نیست.`);
        continue;
      }
      if (asset.currency !== transaction.currency) {
        warnings.push(`ارز معاملهٔ «${asset.name}» با ارز دارایی تطبیق ندارد.`);
        continue;
      }
      const lots = getLots(asset.id);
      if (transaction.kind === "buy") {
        const quantity = decimal(transaction.quantity, "تعداد");
        const price = decimal(transaction.unitPrice, "قیمت خرید");
        const fee = decimal(transaction.fee || "0", "کارمزد");
        if (quantity <= 0n || price < 0n || fee < 0n) {
          warnings.push(`مقادیر خرید «${asset.name}» معتبر نیستند.`);
          continue;
        }
        const cost = multiply(quantity, price) + fee;
        lots.push({
          id: transaction.id,
          acquiredAt: transaction.at,
          originalQuantity: quantity,
          remainingQuantity: quantity,
          remainingCost: cost,
          currency: transaction.currency,
        });
        addMoney(fees, transaction.currency, fee);
        if (!transaction.linkedAccountId)
          addMoney(cash, transaction.currency, -cost);
        accountEffect(
          transaction.linkedAccountId,
          transaction.cashCurrency || transaction.currency,
          -decimal(transaction.cashAmount || amount(cost)),
        );
      } else if (transaction.kind === "sell" || transaction.kind === "transfer") {
        const quantity = decimal(transaction.quantity, "تعداد");
        if (quantity <= 0n || lots.reduce((sum, lot) => sum + lot.remainingQuantity, 0n) < quantity) {
          warnings.push(`مقدار فروش/انتقال «${asset.name}» از موجودی بیشتر است.`);
          continue;
        }
        let remaining = quantity;
        let basis = 0n;
        const movedLots = [];
        for (const lot of lots) {
          if (!remaining) break;
          if (lot.remainingQuantity <= 0n) continue;
          const take = lot.remainingQuantity < remaining ? lot.remainingQuantity : remaining;
          const allocatedCost =
            take === lot.remainingQuantity
              ? lot.remainingCost
              : ratio(lot.remainingCost, take, lot.remainingQuantity);
          lot.remainingQuantity -= take;
          lot.remainingCost -= allocatedCost;
          remaining -= take;
          basis += allocatedCost;
          movedLots.push({ quantity: take, cost: allocatedCost, acquiredAt: lot.acquiredAt });
        }
        if (transaction.kind === "transfer") {
          const target = state.assets.find((item) => item.id === transaction.targetAssetId);
          if (!target || target.currency !== asset.currency) {
            warnings.push(`دارایی مقصد انتقال «${asset.name}» معتبر نیست یا ارز متفاوت دارد.`);
            continue;
          }
          const targetLots = getLots(target.id);
          movedLots.forEach((lot) =>
            targetLots.push({
              id: id(),
              acquiredAt: lot.acquiredAt,
              originalQuantity: lot.quantity,
              remainingQuantity: lot.quantity,
              remainingCost: lot.cost,
              currency: target.currency,
            }),
          );
        } else {
          const gross = multiply(quantity, decimal(transaction.unitPrice, "قیمت فروش"));
          const fee = decimal(transaction.fee || "0", "کارمزد");
          addMoney(realized, transaction.currency, gross - fee - basis);
          addMoney(realizedBasis, transaction.currency, basis);
          addMoney(realizedByAsset, asset.id, gross - fee - basis);
          addMoney(realizedBasisByAsset, asset.id, basis);
          addMoney(fees, transaction.currency, fee);
          accountEffect(
            transaction.linkedAccountId,
            transaction.cashCurrency || transaction.currency,
            decimal(transaction.cashAmount || amount(gross - fee)),
          );
          if (!transaction.linkedAccountId)
            addMoney(cash, transaction.currency, gross - fee);
        }
      } else if (transaction.kind === "split") {
        const numerator = BigInt(transaction.numerator);
        const denominator = BigInt(transaction.denominator);
        if (numerator <= 0n || denominator <= 0n) {
          warnings.push(`نسبت تعدیل «${asset.name}» معتبر نیست.`);
          continue;
        }
        for (const lot of lots) {
          lot.remainingQuantity = ratio(lot.remainingQuantity, numerator, denominator);
          lot.originalQuantity = ratio(lot.originalQuantity, numerator, denominator);
        }
      }
    }

    const holdings = state.assets
      .filter((asset) => asset.status === "active" && INVESTMENT_TYPES.has(asset.type))
      .map((asset) => {
        const lots = positions.get(asset.id) || [];
        const quantity = lots.reduce((sum, lot) => sum + lot.remainingQuantity, 0n);
        const costBasis = lots.reduce((sum, lot) => sum + lot.remainingCost, 0n);
        const valuation = valuationFor(state, asset.id, at);
        const marketValue =
          valuation?.unitPrice != null && quantity > 0n
            ? multiply(quantity, decimal(valuation.unitPrice))
            : null;
        const quoteAge = valuation ? Date.parse(at) - Date.parse(valuation.at) : Infinity;
        return {
          asset,
          quantity,
          quantityText: amount(quantity),
          costBasis,
          costBasisText: amount(costBasis),
          marketValue,
          marketValueText: marketValue == null ? null : amount(marketValue),
          currency: valuation?.currency || asset.currency,
          valuation,
          stale: !valuation || quoteAge > STALE_DAYS * DAY_MS,
          realized: realized.get(asset.currency) || 0n,
        };
      });
    return {
      holdings,
      cash,
      realized,
      realizedBasis,
      realizedByAsset,
      realizedBasisByAsset,
      income,
      fees,
      accountEffects,
      warnings,
      transactions: orderedTransactions(state, at).reverse(),
    };
  }

  function addInvestmentTransaction(state, input) {
    const kind = input.kind;
    const supportedKinds = [
      "buy",
      "sell",
      "deposit",
      "withdrawal",
      "transfer",
      "fee",
      "dividend",
      "split",
    ];
    if (!supportedKinds.includes(kind)) throw new Error("نوع تراکنش سرمایه‌گذاری معتبر نیست.");
    const at = input.at || new Date().toISOString();
    if (!Number.isFinite(Date.parse(at))) throw new Error("تاریخ تراکنش معتبر نیست.");
    const transaction = {
      id: id(),
      kind,
      assetId: input.assetId || "",
      targetAssetId: input.targetAssetId || "",
      quantity: input.quantity ? amount(decimal(input.quantity, "تعداد")) : "0",
      unitPrice: input.unitPrice ? amount(decimal(input.unitPrice, "قیمت واحد")) : "0",
      amount: input.amount ? amount(decimal(input.amount, "مبلغ")) : "0",
      fee: input.fee ? amount(decimal(input.fee, "کارمزد")) : "0",
      currency: String(input.currency || "").trim().toUpperCase(),
      cashAmount: input.cashAmount ? amount(decimal(input.cashAmount, "مبلغ حساب")) : "",
      cashCurrency: String(input.cashCurrency || "").trim().toUpperCase(),
      cashConversionSource: String(input.cashConversionSource || "").trim(),
      cashConversionAt: input.cashConversionAt || "",
      linkedAccountId: input.linkedAccountId || "",
      broker: String(input.broker || "").trim(),
      notes: String(input.notes || "").trim(),
      numerator: String(input.numerator || "1"),
      denominator: String(input.denominator || "1"),
      at: new Date(at).toISOString(),
    };
    if (!transaction.currency) throw new Error("واحد پول تراکنش را وارد کنید.");
    if (["buy", "sell", "transfer", "split"].includes(kind)) {
      const asset = state.assets.find((item) => item.id === transaction.assetId);
      if (!asset || !INVESTMENT_TYPES.has(asset.type))
        throw new Error("یک دارایی سرمایه‌گذاری معتبر انتخاب کنید.");
      if (asset.status !== "active") throw new Error("دارایی واگذارشده قابل معامله نیست.");
      if (asset.currency !== transaction.currency)
        throw new Error("واحد پول معامله باید با ارز دارایی یکسان باشد.");
      if (["buy", "sell", "transfer"].includes(kind) &&
          decimal(transaction.quantity) <= 0n)
        throw new Error("تعداد باید بیشتر از صفر باشد.");
      if (["buy", "sell"].includes(kind) && decimal(transaction.fee) < 0n)
        throw new Error("کارمزد نمی‌تواند منفی باشد.");
      if (kind === "sell" && decimal(transaction.unitPrice) < 0n)
        throw new Error("قیمت فروش نمی‌تواند منفی باشد.");
      if (
        kind === "sell" &&
        multiply(decimal(transaction.quantity), decimal(transaction.unitPrice)) <
          decimal(transaction.fee)
      )
        throw new Error("کارمزد فروش نمی‌تواند از عایدی معامله بیشتر باشد.");
      if (kind === "transfer" && transaction.targetAssetId === asset.id)
        throw new Error("مبدأ و مقصد انتقال باید متفاوت باشند.");
      if (kind === "split" &&
          (BigInt(transaction.numerator) <= 0n || BigInt(transaction.denominator) <= 0n))
        throw new Error("نسبت تعدیل معتبر نیست.");
    }
    if (["deposit", "withdrawal", "dividend", "fee"].includes(kind) &&
        decimal(transaction.amount || transaction.fee) <= 0n)
      throw new Error("مبلغ تراکنش باید بیشتر از صفر باشد.");
    if (["deposit", "withdrawal"].includes(kind) && !transaction.linkedAccountId)
      throw new Error("برای واریز یا برداشت، حساب مالی مرتبط را انتخاب کنید.");
    if (
      transaction.linkedAccountId &&
      ["buy", "sell", "deposit", "withdrawal", "dividend", "fee"].includes(kind)
    ) {
      transaction.cashCurrency ||= transaction.currency;
      if (!transaction.cashAmount) {
        if (kind === "buy")
          transaction.cashAmount = amount(
            multiply(decimal(transaction.quantity), decimal(transaction.unitPrice)) +
              decimal(transaction.fee),
          );
        else if (kind === "sell")
          transaction.cashAmount = amount(
            multiply(decimal(transaction.quantity), decimal(transaction.unitPrice)) -
              decimal(transaction.fee),
          );
        else transaction.cashAmount = transaction.amount || transaction.fee;
      }
    }
    if (transaction.cashAmount && !transaction.linkedAccountId)
      throw new Error("برای ثبت مبلغ نقدی، حساب مرتبط را انتخاب کنید.");
    if (transaction.cashAmount && !transaction.cashCurrency)
      throw new Error("ارز حساب مرتبط مشخص نشده است.");
    if (
      transaction.cashAmount &&
      transaction.cashCurrency !== transaction.currency &&
      (!transaction.cashConversionSource ||
        !transaction.cashConversionAt ||
        !Number.isFinite(Date.parse(transaction.cashConversionAt)))
    )
      throw new Error("برای اثر نقدی با ارز متفاوت، منبع و زمان تبدیل را ثبت کنید.");
    if (["buy", "sell"].includes(kind) && transaction.linkedAccountId) {
      const cash = decimal(transaction.cashAmount);
      if (cash <= 0n) throw new Error("اثر نقدی معامله باید بیشتر از صفر باشد.");
    }
    const candidate = clone(state);
    candidate.investmentTransactions.push(transaction);
    const result = portfolio(candidate);
    const invalid = result.warnings.find((warning) =>
      warning.startsWith("مقدار فروش/انتقال") ||
      warning.startsWith("ارز معامله") ||
      warning.startsWith("دارایی مقصد انتقال"),
    );
    if (invalid) throw new Error(invalid);
    state.investmentTransactions.push(transaction);
    return transaction;
  }

  function netWorth(state, accounts = [], at = new Date().toISOString()) {
    const baseCurrency = String(state.baseCurrency || "IRR").toUpperCase();
    const assetsByCurrency = new Map();
    const liabilitiesByCurrency = new Map();
    const add = (map, currency, value) =>
      map.set(currency, (map.get(currency) || 0n) + value);
    const valuationStatus = [];
    const positions = portfolio(state, at);
    const accountEffects = positions.accountEffects;

    for (const account of accounts) {
      const currency = String(account.currency || "").trim().toUpperCase();
      if (!currency) {
        valuationStatus.push(`واحد پول حساب «${account.name}» مشخص نیست.`);
        continue;
      }
      const effect = accountEffects.get(`${account.id}\u0000${currency}`) || 0n;
      add(assetsByCurrency, currency, decimal(account.balance) + effect);
    }

    for (const asset of state.assets.filter((item) => item.status === "active")) {
      const isInvestment = INVESTMENT_TYPES.has(asset.type);
      if (asset.valueAlreadyInAccount) continue;
      const valuation = valuationFor(state, asset.id, at);
      const position = positions.holdings.find((item) => item.asset.id === asset.id);
      let value = null;
      let currency = valuation?.currency || asset.currency;
      if (isInvestment) {
        if (position && position.quantity > 0n && valuation?.unitPrice != null) {
          value = multiply(position.quantity, decimal(valuation.unitPrice));
          currency = valuation.currency;
        }
      } else if (valuation) {
        value = decimal(valuation.totalValue);
      }
      if (value == null) {
        valuationStatus.push(`ارزش «${asset.name}» ثبت نشده است.`);
      } else {
        const ownership = decimal(asset.ownershipPercent);
        add(assetsByCurrency, currency, ratio(value, ownership, 100n * SCALE));
        if (Date.parse(at) - Date.parse(valuation.at) > STALE_DAYS * DAY_MS)
          valuationStatus.push(`ارزش «${asset.name}» قدیمی است.`);
      }
      if (asset.liabilityAmount != null)
        add(
          liabilitiesByCurrency,
          asset.liabilityCurrency,
          ratio(
            decimal(asset.liabilityAmount),
            decimal(asset.ownershipPercent),
            100n * SCALE,
          ),
        );
    }

    for (const liability of state.liabilities) {
      if (!liability.linkedAssetId)
        add(liabilitiesByCurrency, liability.currency, decimal(liability.amount));
    }
    for (const [currency, balance] of positions.cash)
      add(assetsByCurrency, currency, balance);

    const converted = new Map();
    const unconverted = [];
    let complete = valuationStatus.length === 0;
    for (const [currency, value] of assetsByCurrency) {
      if (value === 0n) {
        add(converted, baseCurrency, 0n);
        continue;
      }
      if (exchangeRate(state, currency, baseCurrency, at)?.stale)
        valuationStatus.push(`نرخ تبدیل ${currency} به ${baseCurrency} قدیمی است.`);
      const result = convert(state, value, currency, baseCurrency, at);
      if (result) {
        add(converted, baseCurrency, result.value);
        if (result.quote.stale) complete = false;
      } else {
        unconverted.push({ currency, kind: "asset", value: amount(value) });
        complete = false;
      }
    }
    for (const [currency, value] of liabilitiesByCurrency) {
      if (value === 0n) {
        add(converted, baseCurrency, 0n);
        continue;
      }
      if (exchangeRate(state, currency, baseCurrency, at)?.stale)
        valuationStatus.push(`نرخ تبدیل ${currency} به ${baseCurrency} قدیمی است.`);
      const result = convert(state, value, currency, baseCurrency, at);
      if (result) add(converted, baseCurrency, -result.value);
      else {
        unconverted.push({ currency, kind: "liability", value: amount(value) });
        complete = false;
      }
    }
    const convertedNetWorth = converted.has(baseCurrency)
      ? amount(converted.get(baseCurrency))
      : null;
    return {
      at,
      baseCurrency,
      assetsByCurrency: Object.fromEntries(
        [...assetsByCurrency].map(([currency, value]) => [currency, amount(value)]),
      ),
      liabilitiesByCurrency: Object.fromEntries(
        [...liabilitiesByCurrency].map(([currency, value]) => [currency, amount(value)]),
      ),
      convertedNetWorth,
      unconverted,
      complete,
      warnings: valuationStatus,
      estimated: true,
    };
  }

  function analytics(state, at = new Date().toISOString()) {
    const summary = portfolio(state, at);
    const marketByCurrency = new Map();
    const costByCurrency = new Map();
    const realizedByCurrency = new Map();
    const realizedBasisByCurrency = new Map();
    const unrealizedByCurrency = new Map();
    const allocationByType = new Map();
    const allocationByCurrency = new Map();
    const add = (map, key, value) => map.set(key, (map.get(key) || 0n) + value);
    let pricedCount = 0;
    let totalCount = summary.holdings.length;
    for (const holding of summary.holdings) {
      const ownership = decimal(holding.asset.ownershipPercent);
      const ownedCostBasis = ratio(holding.costBasis, ownership, 100n * SCALE);
      add(costByCurrency, holding.asset.currency, ownedCostBasis);
      const ownedRealized = ratio(
        summary.realizedByAsset.get(holding.asset.id) || 0n,
        ownership,
        100n * SCALE,
      );
      const ownedRealizedBasis = ratio(
        summary.realizedBasisByAsset.get(holding.asset.id) || 0n,
        ownership,
        100n * SCALE,
      );
      add(realizedByCurrency, holding.asset.currency, ownedRealized);
      add(realizedBasisByCurrency, holding.asset.currency, ownedRealizedBasis);
      if (holding.marketValue == null) continue;
      pricedCount += 1;
      const ownershipValue = ratio(
        holding.marketValue,
        ownership,
        100n * SCALE,
      );
      add(marketByCurrency, holding.currency, ownershipValue);
      add(allocationByType, holding.asset.type, ownershipValue);
      add(allocationByCurrency, holding.currency, ownershipValue);
      if (holding.currency === holding.asset.currency)
        add(unrealizedByCurrency, holding.currency, ownershipValue - ownedCostBasis);
    }
    for (const transaction of summary.transactions) {
      if (transaction.kind !== "fee" || transaction.assetId) continue;
      add(realizedByCurrency, transaction.currency, -decimal(transaction.fee || transaction.amount));
    }
    summary.cash.forEach((value, currency) => {
      add(marketByCurrency, currency, value);
      add(allocationByCurrency, currency, value);
    });
    const priceReturnByCurrency = new Map();
    const totalReturnByCurrency = new Map();
    const priceReturnPercentByCurrency = new Map();
    const totalReturnPercentByCurrency = new Map();
    const returnCurrencies = new Set([
      ...costByCurrency.keys(),
      ...realizedByCurrency.keys(),
      ...unrealizedByCurrency.keys(),
      ...summary.income.keys(),
    ]);
    for (const currency of returnCurrencies) {
      const priceReturn =
        (realizedByCurrency.get(currency) || 0n) +
        (unrealizedByCurrency.get(currency) || 0n);
      const totalReturn = priceReturn + (summary.income.get(currency) || 0n);
      const basis =
        (costByCurrency.get(currency) || 0n) +
        (realizedBasisByCurrency.get(currency) || 0n);
      priceReturnByCurrency.set(currency, priceReturn);
      totalReturnByCurrency.set(currency, totalReturn);
      if (basis > 0n) {
        priceReturnPercentByCurrency.set(
          currency,
          ratio(priceReturn, 100n * SCALE, basis),
        );
        totalReturnPercentByCurrency.set(
          currency,
          ratio(totalReturn, 100n * SCALE, basis),
        );
      }
    }
    return {
      holdings: summary.holdings,
      transactions: summary.transactions,
      warnings: summary.warnings.concat(
        summary.holdings
          .filter((holding) => holding.stale)
          .map((holding) => `قیمت «${holding.asset.name}» ثبت نشده یا بیش از ${STALE_DAYS} روز قدیمی است.`),
      ),
      marketValueByCurrency: Object.fromEntries(
        [...marketByCurrency].map(([key, value]) => [key, amount(value)]),
      ),
      costBasisByCurrency: Object.fromEntries(
        [...costByCurrency].map(([key, value]) => [key, amount(value)]),
      ),
      realizedByCurrency: Object.fromEntries(
        [...realizedByCurrency].map(([key, value]) => [key, amount(value)]),
      ),
      priceReturnByCurrency: Object.fromEntries(
        [...priceReturnByCurrency].map(([key, value]) => [key, amount(value)]),
      ),
      priceReturnPercentByCurrency: Object.fromEntries(
        [...priceReturnPercentByCurrency].map(([key, value]) => [key, amount(value)]),
      ),
      totalReturnByCurrency: Object.fromEntries(
        [...totalReturnByCurrency].map(([key, value]) => [key, amount(value)]),
      ),
      totalReturnPercentByCurrency: Object.fromEntries(
        [...totalReturnPercentByCurrency].map(([key, value]) => [key, amount(value)]),
      ),
      unrealizedByCurrency: Object.fromEntries(
        [...unrealizedByCurrency].map(([key, value]) => [key, amount(value)]),
      ),
      incomeByCurrency: Object.fromEntries(
        [...summary.income].map(([key, value]) => [key, amount(value)]),
      ),
      feesByCurrency: Object.fromEntries(
        [...summary.fees].map(([key, value]) => [key, amount(value)]),
      ),
      allocationByType: Object.fromEntries(
        [...allocationByType].map(([key, value]) => [key, amount(value)]),
      ),
      allocationByCurrency: Object.fromEntries(
        [...allocationByCurrency].map(([key, value]) => [key, amount(value)]),
      ),
      priceReturnMethod: "realized + unrealized; dividend income shown separately",
      totalReturnMethod: "realized + unrealized + dividends; purchase/sale fees included in basis/proceeds",
      completeness: totalCount === 0 ? 1 : pricedCount / totalCount,
      lastPriceAt:
        summary.holdings
          .map((holding) => holding.valuation?.at)
          .filter(Boolean)
          .sort()
          .at(-1) || null,
      historical: portfolioHistory(state),
    };
  }

  function portfolioHistory(state) {
    const instants = new Set([
      ...state.valuations.map((valuation) => valuation.at),
      ...state.investmentTransactions.map((transaction) => transaction.at),
    ]);
    return [...instants]
      .sort()
      .map((at) => {
        const report = portfolio(state, at);
        const values = new Map();
        let priced = 0;
        for (const holding of report.holdings) {
          if (holding.marketValue == null) continue;
          const value = ratio(
            holding.marketValue,
            decimal(holding.asset.ownershipPercent),
            100n * SCALE,
          );
          values.set(
            holding.currency,
            (values.get(holding.currency) || 0n) + value,
          );
          priced += 1;
        }
        return {
          at,
          valuesByCurrency: Object.fromEntries(
            [...values].map(([currency, value]) => [currency, amount(value)]),
          ),
          complete: report.holdings.every((holding) => holding.marketValue != null),
          pricedHoldings: priced,
        };
      });
  }

  function disposeAsset(state, assetId) {
    const asset = state.assets.find((item) => item.id === assetId);
    if (!asset) throw new Error("دارایی پیدا نشد.");
    asset.status = "disposed";
    asset.disposedAt = new Date().toISOString();
  }

  return {
    ASSET_TYPES,
    INVESTMENT_TYPES: [...INVESTMENT_TYPES],
    LIQUIDITY_TYPES,
    STALE_DAYS,
    decimal,
    amount,
    multiply,
    ratio,
    initialState,
    validateState,
    valuationFor,
    exchangeRate,
    convert,
    addAsset,
    addValuation,
    addLiability,
    addExchangeRate,
    portfolio,
    addInvestmentTransaction,
    netWorth,
    analytics,
    portfolioHistory,
    disposeAsset,
  };
});
