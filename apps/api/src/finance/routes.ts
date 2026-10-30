import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import type { Prisma } from "../generated/prisma/client.js";
import { requireUser } from "../auth/middleware.js";
import { ApiError } from "../http/errors.js";
import { validateBody } from "../http/request-validation.js";
import {
  WORKSPACE_KEYS,
  type FinanceStore,
  type SaveTransactionInput,
  type SaveTransactionsInput,
  type WorkspaceKey,
} from "./finance.repository.js";

const uuid = z.string().uuid("شناسه معتبر نیست.");
const money = z
  .string()
  .regex(/^\d{1,14}(\.\d{1,6})?$/, "مبلغ معتبر نیست.");
const date = z
  .string()
  .regex(/^\d{4}-\d\d-\d\d$/, "تاریخ معتبر نیست.")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "تاریخ معتبر نیست.");
const workspaceData = z
  .json()
  .refine((value) => typeof value === "object" && value !== null, "ساختار داده معتبر نیست.");
const workspaceEntry = z.object({ data: workspaceData }).strict();
const workspaceLimit = 512 * 1024;
const workspaceRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});
const transactionImportRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

const accountSchema = z
  .object({
    id: uuid,
    name: z.string().trim().min(1).max(100),
    type: z.enum(["CASH", "BANK", "SAVINGS", "INVESTMENT"]),
    opening_balance: money,
  })
  .strict();

const categorySchema = z
  .object({
    id: uuid,
    name: z.string().trim().min(1).max(80),
    kind: z.enum(["INCOME", "EXPENSE"]),
  })
  .strict();

const transactionSchema = z
  .object({
    id: uuid,
    kind: z.enum(["INCOME", "EXPENSE", "TRANSFER"]),
    amount: money.refine((value) => Number(value) > 0, "مبلغ باید بیشتر از صفر باشد."),
    occurred_on: date,
    account_id: uuid,
    target_id: uuid.nullable(),
    category_id: uuid.nullable(),
    description: z.string().trim().max(200).default(""),
    note: z.string().trim().max(1000).default(""),
  })
  .strict();

export const saveTransactionSchema = z
  .object({
    transaction: transactionSchema,
    accounts: z.array(accountSchema).min(1).max(2),
    category: categorySchema.nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    const t = value.transaction;
    const fail = (message: string) =>
      context.addIssue({ code: "custom", path: ["transaction"], message });
    if (t.kind === "TRANSFER") {
      if (!t.target_id || t.target_id === t.account_id || t.category_id || value.category)
        fail("انتقال باید دو حساب متفاوت و بدون دسته‌بندی داشته باشد.");
    } else if (t.target_id || !t.category_id || value.category?.id !== t.category_id) {
      fail("درآمد و هزینه باید دسته‌بندی داشته باشند.");
    } else if (value.category.kind !== t.kind) {
      fail("دسته‌بندی با نوع تراکنش سازگار نیست.");
    }
    const ids = new Set(value.accounts.map((account) => account.id));
    if (!ids.has(t.account_id) || (t.target_id && !ids.has(t.target_id)))
      fail("اطلاعات حساب تراکنش ارسال نشده است.");
  });

export const importTransactionsSchema = z
  .object({
    accounts: z.array(accountSchema).min(1).max(500),
    categories: z.array(categorySchema).max(500),
    transactions: z.array(transactionSchema).min(1).max(5_000),
  })
  .strict()
  .superRefine((value, context) => {
    const accounts = new Map(value.accounts.map((account) => [account.id, account]));
    const categories = new Map(value.categories.map((category) => [category.id, category]));
    for (const [index, transaction] of value.transactions.entries()) {
      const relatedAccounts = [
        accounts.get(transaction.account_id),
        transaction.target_id ? accounts.get(transaction.target_id) : undefined,
      ].filter((account) => account !== undefined);
      const category = transaction.category_id
        ? categories.get(transaction.category_id) ?? null
        : null;
      const parsed = saveTransactionSchema.safeParse({
        transaction,
        accounts: relatedAccounts,
        category,
      });
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          context.addIssue({
            ...issue,
            path: ["transactions", index, ...issue.path],
          });
        }
      }
    }
  });

// همهٔ مسیرهای دفتر مالی فقط برای کاربر واردشده و فقط روی دادهٔ خود او کار می‌کنند.
export function createFinanceRouter(store: FinanceStore): Router {
  const router = Router();
  router.use(requireUser);

  router.get("/ledger", async (request, response) => {
    response.set("Cache-Control", "no-store");
    response.json(await store.getLedger(request.authUser!.id));
  });

  router.get("/workspace", async (request, response) => {
    response.set("Cache-Control", "no-store");
    response.json(await store.getWorkspace(request.authUser!.id));
  });

  router.put(
    "/workspace/:key",
    workspaceRateLimit,
    validateBody(workspaceEntry),
    async (request, response) => {
      if (!WORKSPACE_KEYS.includes(request.params.key as WorkspaceKey))
        throw new ApiError(404, "NOT_FOUND", "بخش ذخیره‌سازی پیدا نشد.");
      const { data } = request.body as z.infer<typeof workspaceEntry>;
      if (Buffer.byteLength(JSON.stringify(data), "utf8") > workspaceLimit)
        throw new ApiError(413, "WORKSPACE_TOO_LARGE", "حجم داده از حد مجاز بیشتر است.");
      await store.saveWorkspace(
        request.authUser!.id,
        request.params.key as WorkspaceKey,
        data as Prisma.InputJsonValue,
      );
      response.status(204).end();
    },
  );

  router.delete("/workspace/:key", workspaceRateLimit, async (request, response) => {
    if (!WORKSPACE_KEYS.includes(request.params.key as WorkspaceKey))
      throw new ApiError(404, "NOT_FOUND", "بخش ذخیره‌سازی پیدا نشد.");
    await store.deleteWorkspace(request.authUser!.id, request.params.key as WorkspaceKey);
    response.status(204).end();
  });

  router.post(
    "/transactions/import",
    transactionImportRateLimit,
    validateBody(importTransactionsSchema),
    async (request, response) => {
      const body = request.body as SaveTransactionsInput;
      await store.saveTransactions(request.authUser!.id, body);
      response.status(204).end();
    },
  );

  router.put(
    "/transactions/:id",
    validateBody(saveTransactionSchema),
    async (request, response) => {
      const body = request.body as SaveTransactionInput;
      if (body.transaction.id !== request.params.id)
        throw new ApiError(400, "VALIDATION", "شناسهٔ تراکنش با نشانی درخواست یکی نیست.");
      await store.saveTransaction(request.authUser!.id, body);
      response.status(204).end();
    },
  );

  router.delete("/transactions/:id", async (request, response) => {
    if (!uuid.safeParse(request.params.id).success)
      throw new ApiError(400, "VALIDATION", "شناسه معتبر نیست.");
    await store.deleteTransaction(request.authUser!.id, request.params.id);
    response.status(204).end();
  });

  router.delete("/accounts/:id", async (request, response) => {
    if (!uuid.safeParse(request.params.id).success)
      throw new ApiError(400, "VALIDATION", "شناسه معتبر نیست.");
    await store.deleteAccount(request.authUser!.id, request.params.id);
    response.status(204).end();
  });

  return router;
}
