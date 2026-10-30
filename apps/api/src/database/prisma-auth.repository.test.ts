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
      operations: unknown[],
      options?: { maxWait?: number },
    ): Promise<unknown> => {
      calls.push({ operationCount: operations.length, options });
      return Promise.resolve([]);
    },
    user: { update: operation, delete: operation },
    session: { deleteMany: operation },
    passwordReset: { deleteMany: operation, create: operation },
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

  it("gives password reset completion a wait longer than Prisma's default", async () => {
    const { calls, repository } = repositoryRecordingTransactions();

    await repository.completePasswordReset(
      "11111111-1111-1111-1111-111111111111",
      credential,
    );

    expectSingleTransactionWithLongWait(calls);
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
});
