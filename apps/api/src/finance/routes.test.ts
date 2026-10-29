import { describe, expect, it } from "vitest";
import { saveTransactionSchema } from "./routes.js";

const acc = "11111111-1111-4111-8111-111111111111";
const acc2 = "22222222-2222-4222-8222-222222222222";
const cat = "33333333-3333-4333-8333-333333333333";
const account = (id: string) => ({ id, name: "نقد", type: "CASH", opening_balance: "0" });
const base = {
  id: "44444444-4444-4444-8444-444444444444",
  kind: "EXPENSE",
  amount: "50000",
  occurred_on: "2026-10-29",
  account_id: acc,
  target_id: null,
  category_id: cat,
  description: "",
  note: "",
};

describe("saving a transaction", () => {
  it("accepts an expense with a matching expense category", () => {
    const result = saveTransactionSchema.safeParse({
      transaction: base,
      accounts: [account(acc)],
      category: { id: cat, name: "خوراک", kind: "EXPENSE" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an expense filed under an income category", () => {
    const result = saveTransactionSchema.safeParse({
      transaction: base,
      accounts: [account(acc)],
      category: { id: cat, name: "حقوق", kind: "INCOME" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a zero amount", () => {
    const result = saveTransactionSchema.safeParse({
      transaction: { ...base, amount: "0" },
      accounts: [account(acc)],
      category: { id: cat, name: "خوراک", kind: "EXPENSE" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a transfer into the same account", () => {
    const result = saveTransactionSchema.safeParse({
      transaction: { ...base, kind: "TRANSFER", category_id: null, target_id: acc },
      accounts: [account(acc)],
      category: null,
    });
    expect(result.success).toBe(false);
  });

  it("accepts a transfer between two different accounts", () => {
    const result = saveTransactionSchema.safeParse({
      transaction: { ...base, kind: "TRANSFER", category_id: null, target_id: acc2 },
      accounts: [account(acc), account(acc2)],
      category: null,
    });
    expect(result.success).toBe(true);
  });
});
