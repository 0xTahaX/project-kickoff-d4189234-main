import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { ApiError } from "../http/errors.js";
import { TRANSACTION_MAX_WAIT_MS } from "../database/prisma-auth.repository.js";

export type AccountKind = "CASH" | "BANK" | "SAVINGS" | "INVESTMENT";
export type CategoryKindValue = "INCOME" | "EXPENSE";
export type TransactionKindValue = "INCOME" | "EXPENSE" | "TRANSFER";

export interface AccountInput {
  id: string;
  name: string;
  type: AccountKind;
  opening_balance: string;
}
export interface CategoryInput {
  id: string;
  name: string;
  kind: CategoryKindValue;
}
export interface TransactionInput {
  id: string;
  kind: TransactionKindValue;
  amount: string;
  occurred_on: string;
  account_id: string;
  target_id: string | null;
  category_id: string | null;
  description: string;
  note: string;
}
export interface SaveTransactionInput {
  transaction: TransactionInput;
  accounts: AccountInput[];
  category: CategoryInput | null;
}
export interface SaveTransactionsInput {
  transactions: TransactionInput[];
  accounts: AccountInput[];
  categories: CategoryInput[];
}

export interface Ledger {
  currency: string;
  accounts: (AccountInput & { currency: string })[];
  categories: CategoryInput[];
  transactions: (TransactionInput & { currency: string })[];
}

export const WORKSPACE_KEYS = [
  "dashboard",
  "assets",
  "blockchain",
  "preferences",
  "reminders",
] as const;
export type WorkspaceKey = (typeof WORKSPACE_KEYS)[number];
export type WorkspaceData = Partial<Record<WorkspaceKey, Prisma.JsonValue>>;

// ذخیره‌سازی دفتر مالی؛ هر پرس‌وجو با userId محدود می‌شود تا دادهٔ کاربران از هم جدا بماند.
export interface FinanceStore {
  getLedger(userId: string): Promise<Ledger>;
  getWorkspace(userId: string): Promise<WorkspaceData>;
  saveWorkspace(userId: string, key: WorkspaceKey, data: Prisma.InputJsonValue): Promise<void>;
  deleteWorkspace(userId: string, key: WorkspaceKey): Promise<void>;
  saveTransaction(userId: string, input: SaveTransactionInput): Promise<void>;
  saveTransactions(userId: string, input: SaveTransactionsInput): Promise<void>;
  deleteTransaction(userId: string, id: string): Promise<boolean>;
  deleteAccount(userId: string, id: string): Promise<boolean>;
}

const options = { maxWait: TRANSACTION_MAX_WAIT_MS, timeout: TRANSACTION_MAX_WAIT_MS };

export class PrismaFinanceRepository implements FinanceStore {
  constructor(private readonly prisma: PrismaClient) {}

  private async currencyOf(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { primaryCurrency: true },
    });
    if (!user) throw new ApiError(401, "UNAUTHORIZED", "ابتدا وارد حساب خود شوید.");
    return user.primaryCurrency;
  }

  async getLedger(userId: string): Promise<Ledger> {
    const [currency, accounts, categories, transactions] = await Promise.all([
      this.currencyOf(userId),
      this.prisma.account.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
      this.prisma.category.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
      this.prisma.transaction.findMany({ where: { userId }, orderBy: { occurredAt: "desc" } }),
    ]);
    return {
      currency,
      accounts: accounts.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        opening_balance: a.openingBalance.toString(),
        currency: a.currency,
      })),
      categories: categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind })),
      transactions: transactions.map((t) => ({
        id: t.id,
        kind: t.kind,
        amount: t.amount.toString(),
        currency: t.currency,
        occurred_on: t.occurredAt.toISOString().slice(0, 10),
        account_id: t.accountId,
        target_id: t.targetId,
        category_id: t.categoryId,
        description: t.description,
        note: t.note,
      })),
    };
  }

  async getWorkspace(userId: string): Promise<WorkspaceData> {
    const records = await this.prisma.userWorkspace.findMany({
      where: { userId },
      select: { key: true, data: true },
    });
    const workspace: WorkspaceData = {};
    for (const record of records) {
      if ((WORKSPACE_KEYS as readonly string[]).includes(record.key))
        workspace[record.key as WorkspaceKey] = record.data;
    }
    return workspace;
  }

  async saveWorkspace(
    userId: string,
    key: WorkspaceKey,
    data: Prisma.InputJsonValue,
  ): Promise<void> {
    await this.prisma.userWorkspace.upsert({
      where: { userId_key: { userId, key } },
      create: { userId, key, data },
      update: { data },
    });
  }

  async deleteWorkspace(userId: string, key: WorkspaceKey): Promise<void> {
    await this.prisma.userWorkspace.deleteMany({ where: { userId, key } });
  }

  async saveTransaction(userId: string, input: SaveTransactionInput): Promise<void> {
    const currency = await this.currencyOf(userId);
    try {
      await this.prisma.$transaction(
        (db) => this.write(db, userId, currency, input),
        options,
      );
    } catch (error) {
      this.throwLedgerConflict(error);
    }
  }

  async saveTransactions(userId: string, input: SaveTransactionsInput): Promise<void> {
    const currency = await this.currencyOf(userId);
    try {
      await this.prisma.$transaction(async (db) => {
        await this.writeAccountsAndCategories(
          db,
          userId,
          currency,
          input.accounts,
          input.categories,
        );
        await db.transaction.deleteMany({
          where: { userId, id: { in: input.transactions.map((transaction) => transaction.id) } },
        });
        await db.transaction.createMany({
          data: input.transactions.map((transaction) => ({
            ...this.transactionData(currency, transaction),
            id: transaction.id,
            userId,
          })),
        });
      }, options);
    } catch (error) {
      this.throwLedgerConflict(error);
    }
  }

  private throwLedgerConflict(error: unknown): never {
    const code = typeof error === "object" && error && "code" in error ? error.code : undefined;
    if (code === "P2002" || code === "P2003")
      throw new ApiError(409, "LEDGER_CONFLICT", "این تراکنش با حساب یا دسته‌بندی شما سازگار نیست.");
    throw error;
  }

  private async write(
    db: Prisma.TransactionClient,
    userId: string,
    currency: string,
    input: SaveTransactionInput,
  ): Promise<void> {
    await this.writeAccountsAndCategories(
      db,
      userId,
      currency,
      input.accounts,
      input.category ? [input.category] : [],
    );
    await this.writeTransaction(db, userId, currency, input.transaction);
  }

  private async writeAccountsAndCategories(
    db: Prisma.TransactionClient,
    userId: string,
    currency: string,
    accounts: AccountInput[],
    categories: CategoryInput[],
  ): Promise<void> {
    for (const account of accounts) {
      const data = {
        name: account.name,
        type: account.type,
        openingBalance: account.opening_balance,
      };
      const updated = await db.account.updateMany({ where: { id: account.id, userId }, data });
      if (!updated.count)
        await db.account.create({ data: { ...data, id: account.id, userId, currency } });
    }
    for (const category of categories) {
      const updated = await db.category.updateMany({
        where: { id: category.id, userId },
        data: { name: category.name, kind: category.kind },
      });
      if (!updated.count)
        await db.category.create({
          data: { id: category.id, userId, name: category.name, kind: category.kind },
        });
    }
  }

  private async writeTransaction(
    db: Prisma.TransactionClient,
    userId: string,
    currency: string,
    transaction: TransactionInput,
  ): Promise<void> {
    const data = this.transactionData(currency, transaction);
    const updated = await db.transaction.updateMany({
      where: { id: transaction.id, userId },
      data,
    });
    if (!updated.count)
      await db.transaction.create({ data: { ...data, id: transaction.id, userId } });
  }

  private transactionData(currency: string, transaction: TransactionInput) {
    return {
      kind: transaction.kind,
      amount: transaction.amount,
      currency,
      occurredAt: new Date(`${transaction.occurred_on}T00:00:00Z`),
      accountId: transaction.account_id,
      targetId: transaction.target_id,
      categoryId: transaction.category_id,
      description: transaction.description,
      note: transaction.note,
    };
  }

  async deleteTransaction(userId: string, id: string): Promise<boolean> {
    const result = await this.prisma.transaction.deleteMany({ where: { id, userId } });
    return result.count > 0;
  }

  async deleteAccount(userId: string, id: string): Promise<boolean> {
    const used = await this.prisma.transaction.count({
      where: { userId, OR: [{ accountId: id }, { targetId: id }] },
    });
    if (used) throw new ApiError(409, "ACCOUNT_IN_USE", "این حساب تراکنش دارد و قابل حذف نیست.");
    const result = await this.prisma.account.deleteMany({ where: { id, userId } });
    return result.count > 0;
  }
}
