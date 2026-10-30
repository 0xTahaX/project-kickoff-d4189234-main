import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { User, Session } from "../domain/auth.js";
import { errorHandler } from "../http/errors.js";
import type { FinanceStore } from "./finance.repository.js";
import { createFinanceRouter } from "./routes.js";

const user: User = {
  id: "11111111-1111-4111-8111-111111111111",
  username: "dara_user",
  firstName: "Dara",
  lastName: "",
  email: "user@example.com",
  passwordHash: "",
  passwordSalt: "",
  preferredLanguage: "fa",
  primaryCurrency: "IRR",
  acceptedTermsAt: new Date("2026-01-01T00:00:00.000Z"),
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};
const session: Session = {
  tokenHash: "session-hash",
  userId: user.id,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  lastSeenAt: new Date("2026-01-01T00:00:00.000Z"),
  expiresAt: new Date("2027-01-01T00:00:00.000Z"),
  userAgent: "test",
};

function createHarness(authenticated = true) {
  const store: FinanceStore = {
    getLedger: vi.fn(),
    getWorkspace: vi.fn(async () => ({ assets: { version: 1 } })),
    saveWorkspace: vi.fn(async () => {}),
    deleteWorkspace: vi.fn(async () => {}),
    saveTransaction: vi.fn(async () => {}),
    saveTransactions: vi.fn(async () => {}),
    deleteTransaction: vi.fn(async () => true),
    deleteAccount: vi.fn(async () => true),
  };
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use((req, _res, next) => {
    if (authenticated) {
      req.authUser = user;
      req.authSession = session;
    }
    next();
  });
  app.use("/api/finance", createFinanceRouter(store));
  app.use(errorHandler);
  return { app, store };
}

describe("user workspace storage routes", () => {
  it("reads only the authenticated user's workspace", async () => {
    const { app, store } = createHarness();
    const result = await request(app).get("/api/finance/workspace");

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ assets: { version: 1 } });
    expect(store.getWorkspace).toHaveBeenCalledWith(user.id);
  });

  it("imports a transaction batch for the authenticated user", async () => {
    const { app, store } = createHarness();
    const input = {
      accounts: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          name: "نقد",
          type: "CASH",
          opening_balance: "0",
        },
      ],
      categories: [{ id: "33333333-3333-4333-8333-333333333333", name: "خوراک", kind: "EXPENSE" }],
      transactions: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          kind: "EXPENSE",
          amount: "50000",
          occurred_on: "2026-10-29",
          account_id: "11111111-1111-4111-8111-111111111111",
          target_id: null,
          category_id: "33333333-3333-4333-8333-333333333333",
          description: "",
          note: "",
        },
      ],
    };
    const result = await request(app).post("/api/finance/transactions/import").send(input);

    expect(result.status).toBe(204);
    expect(store.saveTransactions).toHaveBeenCalledWith(user.id, input);
  });

  it("requires authentication to import transactions", async () => {
    const { app } = createHarness(false);
    const result = await request(app).post("/api/finance/transactions/import").send({});
    expect(result.status).toBe(401);
  });

  it("saves only approved workspace keys for the authenticated user", async () => {
    const { app, store } = createHarness();
    const data = { assets: [{ id: "asset-1", value: "500" }] };
    const result = await request(app)
      .put("/api/finance/workspace/assets")
      .send({ data });

    expect(result.status).toBe(204);
    expect(store.saveWorkspace).toHaveBeenCalledWith(user.id, "assets", data);

    const invalid = await request(app)
      .put("/api/finance/workspace/arbitrary")
      .send({ data });
    expect(invalid.status).toBe(404);
  });

  it("rejects workspace data larger than 512 KiB", async () => {
    const { app, store } = createHarness();
    const result = await request(app)
      .put("/api/finance/workspace/assets")
      .send({ data: { value: "x".repeat(512 * 1024) } });

    expect(result.status).toBe(413);
    expect(store.saveWorkspace).not.toHaveBeenCalled();
  });

  it("requires an authenticated session", async () => {
    const { app } = createHarness(false);
    const result = await request(app).get("/api/finance/workspace");
    expect(result.status).toBe(401);
  });
});
