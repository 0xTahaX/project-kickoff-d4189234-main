import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import type { EthereumWalletSnapshot } from "./ethereum-provider.js";

const address = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const snapshot: EthereumWalletSnapshot = {
  network: "ethereum",
  chainId: 1,
  provider: "Blockscout",
  address,
  nativeBalance: "1.25",
  nativeAsset: "ETH",
  tokens: [],
  transactions: [],
  syncedAt: "2026-10-25T18:00:00.000Z",
  partial: false,
  warnings: [],
};

function createTestApp(readAddress: (value: string) => Promise<EthereumWalletSnapshot>) {
  return createApp({
    config: { nodeEnv: "test", webOrigin: "http://localhost:5173" },
    ethereumWallets: { readAddress },
  });
}

describe("read-only Ethereum wallet endpoint", () => {
  it("returns a wallet snapshot without authentication and calls the provider once", async () => {
    const readAddress = vi.fn(async () => snapshot);
    const app = createTestApp(readAddress);

    const result = await request(app).get(`/api/blockchain/ethereum/${address}`);

    expect(result.status).toBe(200);
    expect(result.headers["cache-control"]).toBe("no-store");
    expect(result.body).toEqual(snapshot);
    expect(readAddress).toHaveBeenCalledWith(address);
  });

  it("rejects malformed addresses before provider access", async () => {
    const readAddress = vi.fn(async () => snapshot);
    const result = await request(createTestApp(readAddress)).get(
      "/api/blockchain/ethereum/not-an-address",
    );

    expect(result.status).toBe(400);
    expect(result.body.code).toBe("INVALID_ADDRESS");
    expect(readAddress).not.toHaveBeenCalled();
  });

  it("returns an explicit unavailable response when the provider fails", async () => {
    const readAddress = vi.fn(async () => {
      throw new Error("upstream unavailable");
    });
    const result = await request(createTestApp(readAddress)).get(
      `/api/blockchain/ethereum/${address}`,
    );

    expect(result.status).toBe(502);
    expect(result.body.code).toBe("BLOCKCHAIN_UNAVAILABLE");
  });
});
