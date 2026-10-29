import { describe, expect, it, vi } from "vitest";
import { BlockscoutEthereumProvider } from "./ethereum-provider.js";

const address = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Blockscout Ethereum read-only provider", () => {
  it("normalizes native balance, token balances, and stable transaction identifiers", async () => {
    const fetcher: typeof fetch = async (input) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("/token-balances"))
        return response([
          {
            value: "1234567",
            token: {
              address_hash: "0x1111111111111111111111111111111111111111",
              name: "Example Token",
              symbol: "EXT",
              decimals: "6",
            },
          },
        ]);
      if (path.endsWith("/token-transfers"))
        return response({
          items: [
            {
              transaction_hash: `0x${"a".repeat(64)}`,
              log_index: 7,
              from: { hash: address },
              to: { hash: "0x2222222222222222222222222222222222222222" },
              total: "2500000",
              timestamp: "2026-10-25T18:00:00.000000Z",
              block_number: 10,
              token: {
                address_hash: "0x1111111111111111111111111111111111111111",
                symbol: "EXT",
                decimals: "6",
              },
            },
          ],
        });
      if (path.endsWith("/transactions"))
        return response({
          items: [
            {
              hash: `0x${"a".repeat(64)}`,
              from: { hash: address },
              to: { hash: "0x3333333333333333333333333333333333333333" },
              value: "1000000000000000000",
              gas_used: "21000",
              gas_price: "20000000000",
              result: "success",
              confirmations: 12,
              timestamp: "2026-10-25T18:00:00.000000Z",
              block: 10,
              method: "0x",
              type: 2,
            },
          ],
        });
      return response({ coin_balance: "1234567890000000000" });
    };
    const provider = new BlockscoutEthereumProvider(fetcher);

    const snapshot = await provider.readAddress(address);

    expect(snapshot.nativeBalance).toBe("1.23456789");
    expect(snapshot.tokens[0]).toMatchObject({
      symbol: "EXT",
      balance: "1.234567",
    });
    expect(snapshot.transactions).toHaveLength(2);
    expect(snapshot.transactions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: `0x${"a".repeat(64)}:tx`,
          kind: "native_transfer",
          status: "confirmed",
          amount: "1",
          fee: "0.00042",
        }),
        expect.objectContaining({
          id: `0x${"a".repeat(64)}:log:7`,
          kind: "token_transfer",
          amount: "2.5",
          status: "confirmed",
        }),
      ]),
    );
  });

  it("preserves partial provider failures without losing a valid balance", async () => {
    const fetcher: typeof fetch = async (input) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("/token-balances") || path.endsWith("/token-transfers"))
        throw new Error("provider unavailable");
      if (path.endsWith("/transactions")) return response({ items: [] });
      return response({ coin_balance: "0" });
    };

    const snapshot = await new BlockscoutEthereumProvider(fetcher).readAddress(address);

    expect(snapshot.nativeBalance).toBe("0");
    expect(snapshot.partial).toBe(true);
    expect(snapshot.warnings).toHaveLength(2);
  });

  it("does not invent token balances when provider values or decimals are missing", async () => {
    const fetcher: typeof fetch = async (input) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("/token-balances"))
        return response([
          {
            value: "invalid",
            token: {
              address_hash: "0x1111111111111111111111111111111111111111",
              name: "Unknown Token",
              symbol: "UNK",
              decimals: "6",
            },
          },
          {
            value: "10",
            token: {
              address_hash: "0x2222222222222222222222222222222222222222",
              symbol: "NOD",
            },
          },
        ]);
      if (path.endsWith("/token-transfers"))
        return response({
          items: [
            {
              transaction_hash: `0x${"b".repeat(64)}`,
              from: { hash: address },
              to: { hash: "0x2222222222222222222222222222222222222222" },
              total: "1",
              block_number: 10,
              token: {
                address_hash: "0x3333333333333333333333333333333333333333",
                symbol: "UNK",
                decimals: "18",
              },
            },
          ],
          next_page_params: { block_number: 1 },
        });
      if (path.endsWith("/transactions")) return response({ items: [] });
      return response({ coin_balance: "not-a-number" });
    };

    const snapshot = await new BlockscoutEthereumProvider(fetcher).readAddress(address);

    expect(snapshot.nativeBalance).toBeNull();
    expect(snapshot.tokens).toEqual([
      expect.objectContaining({ symbol: "UNK", balance: null }),
    ]);
    expect(snapshot.partial).toBe(true);
    expect(snapshot.warnings).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/ETH معتبر/),
        expect.stringMatching(/موجودی معتبر/),
        expect.stringMatching(/انتقال توکن ناقص/),
        expect.stringMatching(/صفحه‌بندی/),
      ]),
    );
  });

  it("keeps pending, failed, and unknown provider transaction states distinct", async () => {
    const fetcher: typeof fetch = async (input) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("/token-balances")) return response([]);
      if (path.endsWith("/token-transfers")) return response({ items: [] });
      if (path.endsWith("/transactions"))
        return response({
          items: [
            {
              hash: `0x${"c".repeat(64)}`,
              from: { hash: address },
              to: { hash: "0x2222222222222222222222222222222222222222" },
              result: "error",
              confirmations: 1,
              value: "0",
            },
            {
              hash: `0x${"d".repeat(64)}`,
              from: { hash: address },
              to: { hash: "0x2222222222222222222222222222222222222222" },
              is_pending: true,
              value: "0",
            },
            {
              hash: `0x${"e".repeat(64)}`,
              from: { hash: address },
              to: { hash: "0x2222222222222222222222222222222222222222" },
              result: "indexing",
              value: "0",
            },
          ],
        });
      return response({ coin_balance: "0" });
    };

    const snapshot = await new BlockscoutEthereumProvider(fetcher).readAddress(address);

    expect(snapshot.transactions.map((transaction) => transaction.status)).toEqual([
      "failed",
      "pending",
      "unknown",
    ]);
  });

  it("validates addresses before network access and caches snapshots", async () => {
    const fetcher = vi.fn(async () => response({ coin_balance: "1", items: [] }));
    const provider = new BlockscoutEthereumProvider(fetcher);

    await expect(provider.readAddress("not-an-address")).rejects.toThrow(/valid Ethereum/i);
    expect(fetcher).not.toHaveBeenCalled();

    await provider.readAddress(address);
    await provider.readAddress(address.toLowerCase());
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("surfaces provider rate limits and does not retry the snapshot immediately", async () => {
    const fetcher = vi.fn(async () => response({}, 429));
    const provider = new BlockscoutEthereumProvider(fetcher);

    await expect(provider.readAddress(address)).rejects.toThrow(/rate limit/i);
    await expect(provider.readAddress(address)).rejects.toThrow(/retry later/i);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
});
