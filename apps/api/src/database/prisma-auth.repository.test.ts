import { describe, expect, it } from "vitest";
import type { PasswordCredential } from "../domain/auth.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import { PrismaAuthRepository } from "./prisma-auth.repository.js";

type TransactionCall = {
  operationCount: number;
  options: { maxWait?: number; timeout?: number } | undefined;
};

// Prisma's default transaction wait is 5s, which a cold connection to a distant
// Supabase region can exceed; every repository transaction must state a longer wait.
const EXPECTED_MAX_WAIT_MS = 20_000;

const credential = {
  passwordHash: "test-hash",
  passwordSalt: "test-salt",
} as unknown as PasswordCredential;

function repositoryRecordingTransactions() {
  const calls: TransactionCall[] = [];
  const operation = () => ({ __operation: true });
  const prisma = {
    $transaction: (
      operations: unknown,
      options?: { maxWait?: number; timeout?: number },
    ): Promise<unknown> => {
      const isBatch = Array.isArray(operations);
      calls.push({ operationCount: isBatch ? operations.length : 0, options });
      if (isBatch) return Promise.resolve([]);
      // مسیر interactive transaction (مصرف اتمیک توکن بازیابی) با خود کلاینت اجرا می‌شود.
      return Promise.resolve((operations as (db: unknown) => unknown)(prisma));
    },
    user: { update: operation, delete: operation },
    session: { deleteMany: operation },
    passwordReset: {
      deleteMany: () => Promise.resolve({ count: 1 }),
      create: operation,
      findFirst: () =>
        Promise.resolve({ userId: "11111111-1111-1111-1111-111111111111" }),
    },
    account: { count: () => Promise.resolve(1) },
  };

  return {
    calls,
    repository: new PrismaAuthRepository(prisma as unknown as PrismaClient),
  };
}

function expectSingleTransactionWithLongWait(calls: TransactionCall[]) {
  expect(calls).toHaveLength(1);
  expect(calls[0]?.options?.maxWait).toBe(EXPECTED_MAX_WAIT_MS);
}

describe("repository transaction wait limits", () => {
  it("gives the startup cleanup transaction a wait longer than Prisma's default", async () => {
    const { calls, repository } = repositoryRecordingTransactions();

    await repository.deleteExpired(new Date("2026-01-01T00:00:00.000Z"));

    expectSingleTransactionWithLongWait(calls);
    expect(EXPECTED_MAX_WAIT_MS).toBeGreaterThan(5_000);
  });

  it("gives password reset creation a wait longer than Prisma's default", async () => {
    const { calls, repository } = repositoryRecordingTransactions();

    await repository.createPasswordReset(
      "test-token-hash",
      "11111111-1111-1111-1111-111111111111",
      new Date("2026-01-01T00:00:00.000Z"),
    );

    expectSingleTransactionWithLongWait(calls);
  });

  it("consumes a password reset atomically and reports the result", async () => {
    const { calls, repository } = repositoryRecordingTransactions();

    const consumed = await repository.consumePasswordReset(
      "test-token-hash",
      new Date("2026-01-01T00:00:00.000Z"),
      credential,
    );

    expect(consumed).toBe(true);
    expectSingleTransactionWithLongWait(calls);
    expect(calls[0]?.options?.timeout).toBe(EXPECTED_MAX_WAIT_MS);
  });

  it("gives password change a wait longer than Prisma's default", async () => {
    const { calls, repository } = repositoryRecordingTransactions();

    await repository.changePassword(
      "11111111-1111-1111-1111-111111111111",
      credential,
      "current-token-hash",
    );

    expectSingleTransactionWithLongWait(calls);
  });

  it("reports whether the user already has ledger entries", async () => {
    const { repository } = repositoryRecordingTransactions();
    await expect(
      repository.hasLedgerEntries("11111111-1111-1111-1111-111111111111"),
    ).resolves.toBe(true);
  });
});
