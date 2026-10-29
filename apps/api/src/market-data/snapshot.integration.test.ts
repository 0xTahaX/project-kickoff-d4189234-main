import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import type { MarketSnapshot } from "./snapshot.js";

const snapshot: MarketSnapshot = {
  provider: "Iran Market Data",
  sourceUrl: "https://example.test/markets.json",
  fetchedAt: "2026-10-25T19:00:00.000Z",
  refreshFailed: false,
  message: null,
  prices: [],
};

describe("public market snapshot endpoint", () => {
  it("returns the provider snapshot without requiring a user session", async () => {
    const app = createApp({
      config: {
        nodeEnv: "test",
        webOrigin: "http://localhost:5173",
      },
      marketData: {
        getSnapshot: async () => snapshot,
      },
    });

    const result = await request(app).get("/api/markets");

    expect(result.status).toBe(200);
    expect(result.headers["cache-control"]).toBe("no-store");
    expect(result.body).toEqual(snapshot);
  });
});
