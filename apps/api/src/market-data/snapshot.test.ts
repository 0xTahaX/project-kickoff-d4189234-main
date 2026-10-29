import { describe, expect, it, vi } from "vitest";
import { IranMarketSnapshotService } from "./snapshot.js";

const symbols = [
  ["USD_IRR_FREE", 269_500, 268_500, "IRT", "unit"],
  ["GOLD_18K_IRR", 25_993_300, 26_063_300, "IRT", "gram"],
  ["XAU_USD", 3_993.96, 3_997, "USD", "troy_ounce"],
  ["SILVER", 53.88, 53.92, "USD", "troy_ounce"],
  ["SILVER_999_IRR", 493_220, 485_640, "IRT", "gram"],
] as const;

interface TestRecord {
  symbol: string;
  price: number;
  prev_close: number | null;
  currency: string;
  unit: string;
  timestamp: string;
  source: string;
}

interface TestFeed {
  data: { categories: Record<string, TestRecord[]> };
}

function feed(timestamp: string): TestFeed {
  return {
    data: {
      categories: {
        currency: [
          {
            symbol: symbols[0][0],
            price: symbols[0][1],
            prev_close: symbols[0][2],
            currency: symbols[0][3],
            unit: symbols[0][4],
            timestamp,
            source: "tgju",
          },
        ],
        gold: [
          ...symbols.slice(1).map(([symbol, price, previous, currency, unit]) => ({
            symbol,
            price,
            prev_close: previous,
            currency,
            unit,
            timestamp,
            source: "tgju",
          })),
        ],
      },
    },
  };
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function quoteAt(snapshot: Awaited<ReturnType<IranMarketSnapshotService["getSnapshot"]>>, index: number) {
  const quote = snapshot.prices[index];
  if (!quote) throw new Error(`Market quote at index ${index} is missing.`);
  return quote;
}

describe("Iran Market snapshot service", () => {
  it("maps real market symbols to explicit currencies and units", async () => {
    const now = new Date("2026-10-25T19:00:00.000Z");
    const fetcher: typeof fetch = async () =>
      response(feed("2026-10-25T18:50:00.000Z"));
    const service = new IranMarketSnapshotService(fetcher, () => now);

    const snapshot = await service.getSnapshot();

    expect(snapshot.prices).toHaveLength(5);
    expect(snapshot.prices.map((price) => price.symbol)).toEqual(
      symbols.map(([symbol]) => symbol),
    );
    expect(snapshot.prices.map((price) => price.currency)).toEqual([
      "IRT",
      "IRT",
      "USD",
      "USD",
      "IRT",
    ]);
    expect(snapshot.prices.map((price) => price.unit)).toEqual([
      "هر دلار",
      "هر گرم",
      "هر اونس تروا",
      "هر اونس تروا",
      "هر گرم",
    ]);
    expect(quoteAt(snapshot, 0)).toMatchObject({
      price: 269_500,
      change: 1_000,
      status: "fresh",
    });
    expect(quoteAt(snapshot, 3)).toMatchObject({
      price: 53.88,
      change: expect.closeTo(-0.04),
    });
  });

  it.each([null, 0])(
    "does not calculate changes without a valid previous close (%s)",
    async (previousClose) => {
      const now = new Date("2026-10-25T19:00:00.000Z");
      const body = feed("2026-10-25T18:50:00.000Z");
      const gold = body.data.categories.gold?.[0];
      if (!gold) throw new Error("Gold test quote is missing.");
      gold.prev_close = previousClose;
      const fetcher: typeof fetch = async () => response(body);

      const quote = (await new IranMarketSnapshotService(fetcher, () => now).getSnapshot())
        .prices[1];
      if (!quote) throw new Error("Gold quote is missing.");
      expect(quote.change).toBeNull();
      expect(quote.changePercent).toBeNull();
    },
  );

  it("caches successful responses and returns the last valid quotes as stale after failure", async () => {
    let now = new Date("2026-10-25T19:00:00.000Z");
    let calls = 0;
    const fetcher: typeof fetch = async () => {
      calls += 1;
      if (calls === 1) return response(feed("2026-10-25T18:50:00.000Z"));
      throw new Error("upstream offline");
    };
    const service = new IranMarketSnapshotService(fetcher, () => now);

    const initial = await service.getSnapshot();
    const cached = await service.getSnapshot();
    expect(calls).toBe(1);
    expect(quoteAt(cached, 0).status).toBe("fresh");

    now = new Date(now.getTime() + 6 * 60 * 1000);
    const stale = await service.getSnapshot();
    expect(calls).toBe(2);
    expect(stale.refreshFailed).toBe(true);
    expect(stale.message).toContain("آخرین دادهٔ معتبر");
    expect(quoteAt(stale, 0)).toMatchObject({
      price: quoteAt(initial, 0).price,
      status: "stale",
    });
    now = new Date(now.getTime() + 60 * 1000);
    await service.getSnapshot();
    expect(calls).toBe(2);
  });

  it("marks old quotes stale and leaves all prices unavailable after an initial failure", async () => {
    const now = new Date("2026-10-25T19:00:00.000Z");
    const oldFetcher: typeof fetch = async () =>
      response(feed("2026-10-25T17:00:00.000Z"));
    const oldSnapshot = await new IranMarketSnapshotService(oldFetcher, () => now).getSnapshot();
    expect(quoteAt(oldSnapshot, 0).status).toBe("stale");

    const failedFetcher: typeof fetch = async () => response({}, 503);
    const failed = await new IranMarketSnapshotService(failedFetcher, () => now).getSnapshot();
    expect(failed.refreshFailed).toBe(true);
    expect(failed.prices.every((price) => price.status === "unavailable")).toBe(true);
    expect(failed.prices.every((price) => price.price === null)).toBe(true);
  });
});
