import { describe, expect, it } from "vitest";
import { resolveTransactionCurrency } from "./currency.js";

describe("transaction currency resolution", () => {
  it("uses the account currency, not the user's current default currency", () => {
    expect(
      resolveTransactionCurrency({ kind: "EXPENSE", accountCurrency: "IRR" }),
    ).toBe("IRR");
    expect(
      resolveTransactionCurrency({ kind: "INCOME", accountCurrency: "USD" }),
    ).toBe("USD");
  });

  it("keeps a same-currency transfer in that currency", () => {
    expect(
      resolveTransactionCurrency({
        kind: "TRANSFER",
        accountCurrency: "IRR",
        targetCurrency: "IRR",
      }),
    ).toBe("IRR");
  });

  it("rejects a transfer between accounts with different currencies", () => {
    expect(() =>
      resolveTransactionCurrency({
        kind: "TRANSFER",
        accountCurrency: "IRR",
        targetCurrency: "USD",
      }),
    ).toThrowError(/ارز متفاوت/);
  });

  it("rejects a transfer whose target account is missing", () => {
    expect(() =>
      resolveTransactionCurrency({ kind: "TRANSFER", accountCurrency: "IRR" }),
    ).toThrowError(/حساب مقصد/);
  });
});
