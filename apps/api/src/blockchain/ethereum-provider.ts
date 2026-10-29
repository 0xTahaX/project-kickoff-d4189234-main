const baseUrl = "https://eth.blockscout.com/api/v2";
const timeoutMs = 10_000;
const cacheTtlMs = 60_000;
const retryDelayMs = 60_000;
const maxPageSize = 50;

export type ChainTransactionStatus = "pending" | "confirmed" | "failed" | "unknown";

export interface BlockchainTransaction {
  id: string;
  hash: string;
  kind: "native_transfer" | "token_transfer" | "contract_interaction" | "transaction";
  from: string | null;
  to: string | null;
  amount: string | null;
  asset: string | null;
  fee: string | null;
  status: ChainTransactionStatus;
  timestamp: string | null;
  blockNumber: number | null;
  networkIdentifier?: Record<string, string | number | boolean | null>;
}

export interface TokenHolding {
  contractAddress: string;
  name: string;
  symbol: string;
  balance: string | null;
  decimals: number;
}

export interface EthereumWalletSnapshot {
  network: "ethereum";
  chainId: 1;
  provider: "Blockscout";
  address: string;
  nativeBalance: string | null;
  nativeAsset: "ETH";
  tokens: TokenHolding[];
  transactions: BlockchainTransaction[];
  syncedAt: string;
  partial: boolean;
  warnings: string[];
}

export interface EthereumWalletReader {
  readAddress(address: string): Promise<EthereumWalletSnapshot>;
}

interface CacheEntry {
  expiresAt: number;
  snapshot: EthereumWalletSnapshot;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asObject(value: unknown): Record<string, unknown> {
  return isObject(value) ? value : {};
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function tokenDecimals(value: unknown): number | null {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 255 ? number : null;
}

function decimalAmount(raw: unknown, decimals: number): string | null {
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) return null;
  const value = BigInt(raw);
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const fraction = String(value % base).padStart(decimals, "0").replace(/0+$/, "");
  return `${whole}${fraction ? `.${fraction}` : ""}`;
}

function pageItems(value: unknown): Record<string, unknown>[] {
  if (!isObject(value) || !Array.isArray(value.items)) return [];
  return value.items.filter(isObject).slice(0, maxPageSize);
}

function hasNextPage(value: unknown): boolean {
  return isObject(value) && value.next_page_params != null;
}

function exceedsPageSize(value: unknown): boolean {
  return isObject(value) && Array.isArray(value.items) && value.items.length > maxPageSize;
}

function addressHash(value: unknown): string | null {
  if (!isObject(value)) return null;
  return nonEmptyString(value.hash);
}

function isoTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function transactionStatus(value: unknown, pending: boolean): ChainTransactionStatus {
  if (pending) return "pending";
  if (typeof value !== "string") return "unknown";
  if (/success/i.test(value)) return "confirmed";
  if (/fail|revert|error/i.test(value)) return "failed";
  return "unknown";
}

function mapTransaction(item: Record<string, unknown>): BlockchainTransaction {
  const hash = nonEmptyString(item.hash);
  if (!hash) throw new Error("Blockscout returned a transaction without a hash.");
  const isPending = item.is_pending === true || item.confirmations === 0;
  const status = transactionStatus(item.result, isPending);
  const tokenTransfers = Array.isArray(item.token_transfers) ? item.token_transfers : [];
  const from = addressHash(item.from);
  const to = addressHash(item.to);
  const value = decimalAmount(item.value, 18);
  const gasUsed = nonEmptyString(item.gas_used);
  const gasPrice = nonEmptyString(item.gas_price);
  const fee =
    gasUsed && gasPrice && /^\d+$/.test(gasUsed) && /^\d+$/.test(gasPrice)
      ? decimalAmount((BigInt(gasUsed) * BigInt(gasPrice)).toString(), 18)
      : null;
  const timestamp = isoTimestamp(item.timestamp);
  const blockNumber =
    typeof item.block === "number" && Number.isInteger(item.block) ? item.block : null;
  const common = {
    hash,
    from,
    to,
    fee,
    status,
    timestamp,
    blockNumber,
  };

  if (tokenTransfers.length > 0) {
    return {
      ...common,
      id: `${hash}:tx`,
      kind: "transaction",
      amount: null,
      asset: null,
      networkIdentifier: {
        transactionType: String(item.type ?? ""),
      },
    };
  }

  return {
    ...common,
    id: `${hash}:tx`,
    kind:
      item.to == null ||
      (item.method != null && item.method !== "" && item.method !== "0x") ||
      (typeof item.raw_input === "string" && item.raw_input !== "0x")
        ? "contract_interaction"
        : "native_transfer",
    amount: value,
    asset: "ETH",
    networkIdentifier: {
      transactionType: String(item.type ?? ""),
    },
  };
}

function mapTokenTransfer(item: Record<string, unknown>): BlockchainTransaction | null {
  const hash = nonEmptyString(item.transaction_hash);
  const token = asObject(item.token);
  const tokenAddress = nonEmptyString(token.address_hash);
  const tokenSymbol = nonEmptyString(token.symbol);
  const rawValue = nonEmptyString(item.total);
  const decimals = tokenDecimals(token.decimals);
  if (
    !hash ||
    !tokenAddress ||
    !rawValue ||
    decimals === null ||
    typeof item.log_index !== "number" ||
    !Number.isInteger(item.log_index)
  )
    return null;
  const logIndex = item.log_index;
  const blockNumber =
    typeof item.block_number === "number" && Number.isInteger(item.block_number)
      ? item.block_number
      : null;
  return {
    id: `${hash}:log:${logIndex}`,
    hash,
    kind: "token_transfer",
    from: addressHash(item.from),
    to: addressHash(item.to),
    amount: decimalAmount(rawValue, decimals),
    asset: tokenSymbol || tokenAddress,
    fee: null,
    status: blockNumber === null ? "unknown" : "confirmed",
    timestamp: isoTimestamp(item.timestamp),
    blockNumber,
    networkIdentifier: {
      logIndex,
      tokenAddress,
      tokenDecimals: decimals,
    },
  };
}

export class BlockscoutEthereumProvider implements EthereumWalletReader {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly retryAt = new Map<string, number>();

  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async readAddress(address: string): Promise<EthereumWalletSnapshot> {
    const normalizedAddress = address.toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(normalizedAddress))
      throw new Error("A valid Ethereum mainnet public address is required.");

    const now = this.now().getTime();
    const cached = this.cache.get(normalizedAddress);
    if (cached && cached.expiresAt > now) return cached.snapshot;
    if ((this.retryAt.get(normalizedAddress) || 0) > now)
      throw new Error("Blockscout is temporarily unavailable; retry later.");

    try {
      const snapshot = await this.fetchSnapshot(normalizedAddress);
      this.cache.set(normalizedAddress, {
        expiresAt: this.now().getTime() + cacheTtlMs,
        snapshot,
      });
      this.retryAt.delete(normalizedAddress);
      return snapshot;
    } catch (error) {
      this.retryAt.set(normalizedAddress, now + retryDelayMs);
      throw error;
    }
  }

  private async fetchJson(path: string): Promise<unknown> {
    const response = await this.fetcher(`${baseUrl}${path}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status === 429)
      throw new Error("Blockscout rate limit reached; retry later.");
    if (!response.ok) throw new Error(`Blockscout returned HTTP ${response.status}.`);
    return response.json();
  }

  private async fetchSnapshot(address: string): Promise<EthereumWalletSnapshot> {
    const encodedAddress = encodeURIComponent(address);
    const results = await Promise.allSettled([
      this.fetchJson(`/addresses/${encodedAddress}`),
      this.fetchJson(`/addresses/${encodedAddress}/token-balances`),
      this.fetchJson(`/addresses/${encodedAddress}/transactions`),
      this.fetchJson(`/addresses/${encodedAddress}/token-transfers?type=ERC-20`),
    ]);
    const warnings: string[] = [];
    const [addressResult, tokenResult, transactionResult, transferResult] = results;
    if (addressResult.status === "rejected")
      throw new Error(`Blockscout balance lookup failed: ${String(addressResult.reason)}`);

    const addressData = asObject(addressResult.value);
    const nativeBalance = decimalAmount(addressData.coin_balance, 18);
    if (nativeBalance === null)
      warnings.push("ارائه‌دهنده موجودی ETH معتبر را در پاسخ قرار نداد.");

    const tokenResponse =
      tokenResult.status === "fulfilled" && Array.isArray(tokenResult.value)
        ? tokenResult.value.filter(isObject)
        : null;
    const tokenBalances = (tokenResponse || []).flatMap((item) => {
      const token = asObject(item.token);
      const contractAddress = nonEmptyString(token.address_hash);
      const decimals = tokenDecimals(token.decimals);
      if (!contractAddress || decimals === null) return [];
      return [{
        contractAddress,
        name: nonEmptyString(token.name) || "توکن بدون نام",
        symbol: nonEmptyString(token.symbol) || "—",
        balance: decimalAmount(item.value, decimals),
        decimals,
      }];
    });
    if (tokenResult.status === "rejected")
      warnings.push("دریافت موجودی توکن‌ها ناموفق بود.");
    else if (tokenResponse === null)
      warnings.push("پاسخ موجودی توکن‌ها قالب معتبر نداشت.");
    else if (
      tokenBalances.length < tokenResponse.length ||
      tokenBalances.some((token) => token.balance === null)
    )
      warnings.push("برای بعضی توکن‌ها موجودی معتبر دریافت نشد.");

    let transactions: BlockchainTransaction[] = [];
    if (transactionResult.status === "rejected") {
      warnings.push("تاریخچهٔ تراکنش‌ها کامل دریافت نشد.");
    } else if (!isObject(transactionResult.value) || !Array.isArray(transactionResult.value.items)) {
      warnings.push("پاسخ تاریخچهٔ تراکنش‌ها قالب معتبر نداشت.");
    } else {
      transactions = pageItems(transactionResult.value).flatMap((item) => {
        try {
          const transaction = mapTransaction(item);
          if (transaction.kind === "native_transfer" && transaction.amount === null)
            warnings.push("برای یک تراکنش مقدار ETH معتبر دریافت نشد.");
          return [transaction];
        } catch {
          warnings.push("یک تراکنش نامعتبر از تاریخچه کنار گذاشته شد.");
          return [];
        }
      });
      if (hasNextPage(transactionResult.value) || exceedsPageSize(transactionResult.value))
        warnings.push(`فقط ${maxPageSize} تراکنش آخر دریافت شد؛ تاریخچه صفحه‌بندی می‌شود.`);
    }

    let tokenTransfers: BlockchainTransaction[] = [];
    if (transferResult.status === "rejected") {
      warnings.push("فهرست انتقال توکن‌ها کامل دریافت نشد.");
    } else if (!isObject(transferResult.value) || !Array.isArray(transferResult.value.items)) {
      warnings.push("پاسخ انتقال توکن‌ها قالب معتبر نداشت.");
    } else {
      const items = pageItems(transferResult.value);
      tokenTransfers = items
        .map(mapTokenTransfer)
        .filter((item): item is BlockchainTransaction => item !== null);
      if (tokenTransfers.length < items.length)
        warnings.push("یک انتقال توکن ناقص یا نامعتبر کنار گذاشته شد.");
      if (hasNextPage(transferResult.value) || exceedsPageSize(transferResult.value))
        warnings.push(`فقط ${maxPageSize} انتقال آخر دریافت شد؛ تاریخچه صفحه‌بندی می‌شود.`);
    }

    const deduplicated = new Map<string, BlockchainTransaction>();
    for (const transaction of [...transactions, ...tokenTransfers])
      deduplicated.set(transaction.id, transaction);

    return {
      network: "ethereum",
      chainId: 1,
      provider: "Blockscout",
      address,
      nativeBalance,
      nativeAsset: "ETH",
      tokens: tokenBalances,
      transactions: [...deduplicated.values()].sort((left, right) =>
        (right.timestamp || "").localeCompare(left.timestamp || ""),
      ),
      syncedAt: this.now().toISOString(),
      partial: warnings.length > 0,
      warnings,
    };
  }
}
