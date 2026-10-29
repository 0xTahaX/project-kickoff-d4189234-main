import { Router } from "express";
import { z } from "zod";
import { requireUser } from "../auth/middleware.js";
import { ApiError } from "../http/errors.js";
import { validateBody } from "../http/request-validation.js";
import type { FinanceStore, SaveTransactionInput } from "./finance.repository.js";

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

const accountSchema = z
  .object({
    id: uuid,
    name: z.string().trim().min(1).max(100),
    type: z.enum(["CASH", "BANK", "SAVINGS", "INVESTMENT"]),
    opening_balance: money,
  })
  .strict();

export const saveTransactionSchema = z
  .object({
    transaction: z
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
      .strict(),
    accounts: z.array(accountSchema).min(1).max(2),
    category: z
      .object({
        id: uuid,
        name: z.string().trim().min(1).max(80),
        kind: z.enum(["INCOME", "EXPENSE"]),
      })
      .strict()
      .nullable(),
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

// همهٔ مسیرهای دفتر مالی فقط برای کاربر واردشده و فقط روی دادهٔ خود او کار می‌کنند.
export function createFinanceRouter(store: FinanceStore): Router {
  const router = Router();
  router.use(requireUser);

  router.get("/ledger", async (request, response) => {
    response.set("Cache-Control", "no-store");
    response.json(await store.getLedger(request.authUser!.id));
  });

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
