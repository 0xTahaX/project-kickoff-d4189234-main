export type MarketAssetType =
  | "stock"
  | "fund"
  | "precious_metal"
  | "crypto"
  | "foreign_currency"
  | "other";

export interface MarketQuote {
  identifier: string;
  assetType: MarketAssetType;
  unitPrice: string;
  currency: string;
  source: string;
  retrievedAt: Date;
}

export interface MarketDataProvider {
  readonly name: string;
  supports(assetType: MarketAssetType): boolean;
  getQuote(
    identifier: string,
    assetType: MarketAssetType,
    options?: { signal?: AbortSignal },
  ): Promise<MarketQuote | null>;
}

export interface QuoteCache {
  get(key: string): MarketQuote | null;
  set(key: string, quote: MarketQuote, expiresAt: Date): void;
}

const cacheTtlMs = 5 * 60 * 1000;

export class MarketDataService {
  constructor(
    private readonly providers: readonly MarketDataProvider[],
    private readonly cache: QuoteCache,
  ) {
    const providerNames = providers.map((provider) => provider.name);
    if (new Set(providerNames).size !== providerNames.length)
      throw new Error("Market data provider names must be unique.");
  }

  async getQuote(
    identifier: string,
    assetType: MarketAssetType,
    options: { now?: Date; signal?: AbortSignal } = {},
  ): Promise<MarketQuote | null> {
    const normalizedIdentifier = identifier.trim();
    if (!normalizedIdentifier) throw new Error("A market asset identifier is required.");
    const now = options.now ?? new Date();
    const key = `${assetType}:${normalizedIdentifier.toUpperCase()}`;
    const cached = this.cache.get(key);
    const cacheAge = cached ? now.getTime() - cached.retrievedAt.getTime() : -1;
    if (cached && cacheAge >= 0 && cacheAge < cacheTtlMs)
      return cached;

    const provider = this.providers.find((candidate) => candidate.supports(assetType));
    if (!provider) return null;

    const quote = await provider.getQuote(
      normalizedIdentifier,
      assetType,
      options.signal ? { signal: options.signal } : undefined,
    );
    if (!quote) return null;
    if (
      quote.identifier.trim().toUpperCase() !== normalizedIdentifier.toUpperCase() ||
      quote.assetType !== assetType ||
      !/^\d+(?:\.\d{1,8})?$/.test(quote.unitPrice) ||
      Number(quote.unitPrice) < 0 ||
      !/^[A-Z]{3}$/.test(quote.currency) ||
      !quote.source.trim() ||
      !Number.isFinite(quote.retrievedAt.getTime()) ||
      quote.retrievedAt > now
    )
      throw new Error(`Market data provider "${provider.name}" returned an invalid quote.`);

    this.cache.set(key, quote, new Date(now.getTime() + cacheTtlMs));
    return quote;
  }
}
