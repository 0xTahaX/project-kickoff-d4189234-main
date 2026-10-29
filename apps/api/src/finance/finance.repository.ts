import type { PrismaClient } from "../generated/prisma/client.js";
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

export interface Ledger {
  currency: string;
  accounts: (AccountInput & { currency: string })[];
  categories: CategoryInput[];
  transactions: (TransactionInput & { currency: string })[];
}

// ذخیره‌سازی دفتر مالی؛ هر پرس‌وجو با userId محدود می‌شود تا دادهٔ کاربران از هم جدا بماند.
export interface FinanceStore {
  getLedger(userId: string): Promise<Ledger>;
  saveTransaction(userId: string, input: SaveTransactionInput): Promise<void>;
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

  async saveTransaction(userId: string, input: SaveTransactionInput): Promise<void> {
    const currency = await this.currencyOf(userId);
    const { transaction: t } = input;
    try {
      await this.write(userId, currency, input, t);
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? error.code : undefined;
      if (code === "P2002" || code === "P2003")
        throw new ApiError(409, "LEDGER_CONFLICT", "این تراکنش با حساب یا دسته‌بندی شما سازگار نیست.");
      throw error;
    }
  }

  private async write(
    userId: string,
    currency: string,
    input: SaveTransactionInput,
    t: TransactionInput,
  ): Promise<void> {
    await this.prisma.$transaction(async (db) => {
      for (const account of input.accounts) {
        const data = {
          name: account.name,
          type: account.type,
          openingBalance: account.opening_balance,
        };
        const updated = await db.account.updateMany({ where: { id: account.id, userId }, data });
        if (!updated.count)
          await db.account.create({ data: { ...data, id: account.id, userId, currency } });
      }
      if (input.category) {
        const c = input.category;
        const updated = await db.category.updateMany({
          where: { id: c.id, userId },
          data: { name: c.name, kind: c.kind },
        });
        if (!updated.count)
          await db.category.create({ data: { id: c.id, userId, name: c.name, kind: c.kind } });
      }
      const data = {
        kind: t.kind,
        amount: t.amount,
        currency,
        occurredAt: new Date(`${t.occurred_on}T00:00:00Z`),
        accountId: t.account_id,
        targetId: t.target_id,
        categoryId: t.category_id,
        description: t.description,
        note: t.note,
      };
      const updated = await db.transaction.updateMany({ where: { id: t.id, userId }, data });
      if (!updated.count) await db.transaction.create({ data: { ...data, id: t.id, userId } });
    }, options);
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
