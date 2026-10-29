import { describe, expect, it, vi } from "vitest";
import { MarketDataService, type MarketDataProvider, type MarketQuote, type QuoteCache } from "./provider.js";

function createCache(): QuoteCache {
  const values = new Map<string, MarketQuote>();
  return {
    get: (key) => values.get(key) || null,
    set: (key, quote) => {
      values.set(key, quote);
    },
  };
}

const quote: MarketQuote = {
  identifier: "ABC",
  assetType: "stock",
  unitPrice: "12.50",
  currency: "USD",
  source: "test-provider",
  retrievedAt: new Date("2026-10-25T10:00:00.000Z"),
};

describe("provider-independent market data service", () => {
  it("caches valid quotes and does not make an unnecessary second request", async () => {
    const provider: MarketDataProvider = {
      name: "test-provider",
      supports: () => true,
      getQuote: vi.fn(async () => quote),
    };
    const service = new MarketDataService([provider], createCache());

    expect(await service.getQuote("abc", "stock", { now: quote.retrievedAt })).toEqual(quote);
    expect(await service.getQuote("ABC", "stock", {
      now: new Date(quote.retrievedAt.getTime() + 60_000),
    })).toEqual(quote);
    expect(provider.getQuote).toHaveBeenCalledOnce();
  });

  it("returns no quote for unsupported asset classes without fabricating a value", async () => {
    const provider: MarketDataProvider = {
      name: "test-provider",
      supports: () => false,
      getQuote: vi.fn(),
    };
    const service = new MarketDataService([provider], createCache());

    expect(await service.getQuote("XYZ", "stock")).toBeNull();
    expect(provider.getQuote).not.toHaveBeenCalled();
  });

  it("surfaces provider errors and rejects malformed quote data", async () => {
    const failing: MarketDataProvider = {
      name: "failing-provider",
      supports: () => true,
      getQuote: async () => {
        throw new Error("rate limit exceeded");
      },
    };
    await expect(
      new MarketDataService([failing], createCache()).getQuote("ABC", "stock"),
    ).rejects.toThrow("rate limit exceeded");

    const invalid: MarketDataProvider = {
      name: "invalid-provider",
      supports: () => true,
      getQuote: async () => ({ ...quote, source: "" }),
    };
    await expect(
      new MarketDataService([invalid], createCache()).getQuote("ABC", "stock"),
    ).rejects.toThrow(/invalid quote/i);
  });
});
