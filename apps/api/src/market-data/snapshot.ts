import { z } from "zod";

const feedUrl =
  "https://raw.githubusercontent.com/iran-market/iran-market.github.io/main/data/latest-toman.json";
const cacheTtlMs = 5 * 60 * 1000;
const retryDelayMs = cacheTtlMs;
const staleAfterMs = 90 * 60 * 1000;
const maxFeedBytes = 5 * 1024 * 1024;

const supportedMarkets = [
  {
    id: "usd_free",
    symbol: "USD_IRR_FREE",
    name: "دلار آمریکا (بازار آزاد)",
    unit: "هر دلار",
    expectedCurrency: "IRT",
    currencyLabel: "تومان",
    expectedUnit: "unit",
  },
  {
    id: "gold_18k",
    symbol: "GOLD_18K_IRR",
    name: "طلای ۱۸ عیار",
    unit: "هر گرم",
    expectedCurrency: "IRT",
    currencyLabel: "تومان",
    expectedUnit: "gram",
  },
  {
    id: "gold_ounce",
    symbol: "XAU_USD",
    name: "اونس جهانی طلا",
    unit: "هر اونس تروا",
    expectedCurrency: "USD",
    currencyLabel: "دلار آمریکا",
    expectedUnit: "troy_ounce",
  },
  {
    id: "silver_ounce",
    symbol: "SILVER",
    name: "اونس جهانی نقره",
    unit: "هر اونس تروا",
    expectedCurrency: "USD",
    currencyLabel: "دلار آمریکا",
    expectedUnit: "troy_ounce",
  },
  {
    id: "silver_999",
    symbol: "SILVER_999_IRR",
    name: "نقرهٔ ۹۹۹ در بازار ایران",
    unit: "هر گرم",
    expectedCurrency: "IRT",
    currencyLabel: "تومان",
    expectedUnit: "gram",
  },
] as const;

const marketRecordSchema = z
  .object({
    symbol: z.string(),
    price: z.number().finite().positive(),
    currency: z.string(),
    unit: z.string(),
    prev_close: z.number().finite().nullable().optional(),
    timestamp: z.string().refine((value) => Number.isFinite(Date.parse(value))),
    source: z.string().trim().min(1),
    stale: z.boolean().optional(),
  })
  .passthrough();

const feedSchema = z.object({
  data: z.object({
    categories: z.record(z.string(), z.array(z.unknown())),
  }),
});

export type MarketQuoteStatus = "fresh" | "stale" | "unavailable";

export interface MarketPrice {
  id: (typeof supportedMarkets)[number]["id"];
  symbol: string;
  name: string;
  unit: string;
  currency: string;
  currencyLabel: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  updatedAt: string | null;
  source: string | null;
  status: MarketQuoteStatus;
  message: string | null;
}

export interface MarketSnapshot {
  provider: string;
  sourceUrl: string;
  fetchedAt: string | null;
  refreshFailed: boolean;
  message: string | null;
  prices: MarketPrice[];
}

export interface MarketSnapshotReader {
  getSnapshot(): Promise<MarketSnapshot>;
}

interface StoredQuote {
  definition: (typeof supportedMarkets)[number];
  price: number;
  change: number | null;
  changePercent: number | null;
  updatedAt: string;
  source: string;
  sourceMarkedStale: boolean;
}

interface CacheEntry {
  fetchedAt: number;
  quotes: Map<string, StoredQuote>;
}

export class IranMarketSnapshotService implements MarketSnapshotReader {
  private cache: CacheEntry | null = null;
  private refreshPromise: Promise<void> | null = null;
  private retryAt = 0;
  private lastRefreshFailed = false;

  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getSnapshot(): Promise<MarketSnapshot> {
    const now = this.now().getTime();
    if (this.cache && now - this.cache.fetchedAt < cacheTtlMs)
      return this.toSnapshot(now, false);

    if (now < this.retryAt) return this.toSnapshot(now, this.lastRefreshFailed);

    if (!this.refreshPromise) {
      this.refreshPromise = this.refresh().finally(() => {
        this.refreshPromise = null;
      });
    }
    await this.refreshPromise;
    return this.toSnapshot(this.now().getTime(), this.lastRefreshFailed);
  }

  private async refresh(): Promise<void> {
    const attemptedAt = this.now().getTime();
    try {
      const response = await this.fetcher(feedUrl, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`Feed returned HTTP ${response.status}.`);

      const body = await response.text();
      if (new TextEncoder().encode(body).byteLength > maxFeedBytes)
        throw new Error("Feed response exceeded the size limit.");

      let raw: unknown;
      try {
        raw = JSON.parse(body);
      } catch {
        throw new Error("Feed response was not valid JSON.");
      }
      const parsedFeed = feedSchema.safeParse(raw);
      if (!parsedFeed.success) throw new Error("Feed response did not match the expected format.");

      const records = Object.values(parsedFeed.data.data.categories).flat();
      const quotes = new Map<string, StoredQuote>();
      for (const definition of supportedMarkets) {
        const candidate = records.find(
          (record) =>
            typeof record === "object" &&
            record !== null &&
            "symbol" in record &&
            record.symbol === definition.symbol,
        );
        if (!candidate) continue;
        const parsedRecord = marketRecordSchema.safeParse(candidate);
        if (!parsedRecord.success) continue;

        const record = parsedRecord.data;
        if (
          record.currency !== definition.expectedCurrency ||
          record.unit !== definition.expectedUnit ||
          Date.parse(record.timestamp) > attemptedAt + 60_000
        )
          continue;

        const previousClose = record.prev_close;
        const change =
          previousClose != null && previousClose > 0
            ? record.price - previousClose
            : null;
        const changePercent =
          change != null && previousClose != null && previousClose > 0
            ? (change / previousClose) * 100
            : null;
        quotes.set(definition.id, {
          definition,
          price: record.price,
          change: change != null && Number.isFinite(change) ? change : null,
          changePercent:
            changePercent != null && Number.isFinite(changePercent)
              ? changePercent
              : null,
          updatedAt: record.timestamp,
          source: record.source,
          sourceMarkedStale: record.stale === true,
        });
      }
      if (quotes.size === 0) throw new Error("Feed contained no valid supported market prices.");

      this.cache = { fetchedAt: this.now().getTime(), quotes };
      this.lastRefreshFailed = false;
      this.retryAt = this.cache.fetchedAt + cacheTtlMs;
    } catch (error) {
      this.lastRefreshFailed = true;
      this.retryAt = attemptedAt + retryDelayMs;
      console.warn("Iran Market price refresh failed:", {
        name: error instanceof Error ? error.name : "UnknownError",
        message: error instanceof Error ? error.message : "Unknown provider failure.",
      });
    }
  }

  private toSnapshot(now: number, refreshFailed: boolean): MarketSnapshot {
    const quotes = this.cache?.quotes ?? new Map<string, StoredQuote>();
    return {
      provider: "Iran Market Data",
      sourceUrl: feedUrl,
      fetchedAt: this.cache ? new Date(this.cache.fetchedAt).toISOString() : null,
      refreshFailed,
      message: refreshFailed
        ? this.cache
          ? "دریافت قیمت تازه ناموفق بود؛ آخرین دادهٔ معتبر با زمان ثبت‌شده نمایش داده می‌شود."
          : "دریافت قیمت بازار ناموفق بود؛ فعلاً قیمت معتبری در دسترس نیست."
        : null,
      prices: supportedMarkets.map((definition) => {
        const quote = quotes.get(definition.id);
        if (!quote) {
          return {
            id: definition.id,
            symbol: definition.symbol,
            name: definition.name,
            unit: definition.unit,
            currency: definition.expectedCurrency,
            currencyLabel: definition.currencyLabel,
            price: null,
            change: null,
            changePercent: null,
            updatedAt: null,
            source: null,
            status: "unavailable",
            message: "قیمت معتبر از منبع دریافت نشد.",
          };
        }

        const age = now - Date.parse(quote.updatedAt);
        const stale = refreshFailed || quote.sourceMarkedStale || age > staleAfterMs;
        return {
          id: definition.id,
          symbol: definition.symbol,
          name: definition.name,
          unit: definition.unit,
          currency: definition.expectedCurrency,
          currencyLabel: definition.currencyLabel,
          price: quote.price,
          change: quote.change,
          changePercent: quote.changePercent,
          updatedAt: quote.updatedAt,
          source: quote.source,
          status: stale ? "stale" : "fresh",
          message: stale
            ? "تازگی این قیمت تأیید نمی‌شود؛ زمان آخرین ثبت را بررسی کنید."
            : null,
        };
      }),
    };
  }
}
