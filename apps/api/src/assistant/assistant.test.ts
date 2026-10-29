import { describe, expect, it, vi } from "vitest";
import {
  AssistantService,
  AuthorizationError,
  ConfigurationRequiredError,
  ConsentRequiredError,
  ConfigurationRequiredProvider,
  type AuthorizedFinancialContext,
  type FinancialContextSource,
  type ModelProvider,
} from "./assistant.js";
import request from "supertest";
import { createApp } from "../app.js";

const period = { from: "2026-10-01", to: "2026-10-26", currency: "IRT" };
const context: AuthorizedFinancialContext = {
  userId: "user-1",
  period,
  asOf: "2026-10-26T12:00:00.000Z",
  completeness: "complete",
  calculationMethod: "Sum of recorded transactions",
  facts: [
    {
      label: "Recorded expenses",
      value: 1250,
      unit: "IRT",
      source: "transactions",
      asOf: "2026-10-26T12:00:00.000Z",
    },
  ],
};

function configuredService(
  overrides: Partial<AuthorizedFinancialContext> = {},
) {
  const loadAuthorizedContext = vi.fn<FinancialContextSource["loadAuthorizedContext"]>(
    async (_userId, _period) => ({ ...context, ...overrides }),
  );
  const generate = vi.fn<ModelProvider["generate"]>(
    async (_input) => ({ answer: "Only a limited explanation." }),
  );
  const provider: ModelProvider = {
    id: "test-provider",
    configured: true,
    generate,
  };
  return {
    service: new AssistantService(provider, { loadAuthorizedContext }),
    loadAuthorizedContext,
    generate,
  };
}

describe("server-side assistant safeguards", () => {
  it("reports provider configuration required without claiming AI is available", async () => {
    const service = new AssistantService();

    expect(service.status()).toMatchObject({
      configured: false,
      state: "configuration_required",
      personalDataTransmission: false,
      authenticationAvailable: false,
    });
    await expect(
      service.answer({ userId: "user-1" }, { question: "Analyze", period }, true),
    ).rejects.toBeInstanceOf(ConfigurationRequiredError);
  });

  it("exposes only the non-sensitive AI configuration state over HTTP", async () => {
    const result = await request(
      createApp({ config: { nodeEnv: "test", webOrigin: "http://localhost:5173" } }),
    ).get("/api/assistant/status");

    expect(result.status).toBe(200);
    expect(result.headers["cache-control"]).toBe("no-store");
    expect(result.body).toMatchObject({
      configured: false,
      state: "configuration_required",
      personalDataTransmission: false,
      authenticationAvailable: false,
    });
    expect(result.body).not.toHaveProperty("apiKey");
  });

  it("does not load financial data without an authenticated principal", async () => {
    const { service, loadAuthorizedContext } = configuredService();

    await expect(
      service.answer(null, { question: "Analyze", period }, true),
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(loadAuthorizedContext).not.toHaveBeenCalled();
  });

  it("requires explicit consent before calling an external provider", async () => {
    const { service, loadAuthorizedContext, generate } = configuredService();

    await expect(
      service.answer({ userId: "user-1" }, { question: "Analyze", period }, false),
    ).rejects.toBeInstanceOf(ConsentRequiredError);
    expect(loadAuthorizedContext).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  it("rejects mismatched context ownership before provider access", async () => {
    const { service, generate } = configuredService({ userId: "user-2" });

    await expect(
      service.answer({ userId: "user-1" }, { question: "Analyze", period }, true),
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(generate).not.toHaveBeenCalled();
  });

  it("passes only scoped, authorized facts and excludes user identifiers", async () => {
    const { service, generate } = configuredService();

    const result = await service.answer(
      { userId: "user-1" },
      { question: "Review spending", period },
      true,
    );

    expect(result).toMatchObject({
      answer: "Only a limited explanation.",
      context: { period, completeness: "complete" },
    });
    expect(result.context).not.toHaveProperty("userId");
    expect(result.context.facts).toEqual(context.facts);
    const input = generate.mock.calls[0]?.[0];
    expect(input?.context).not.toHaveProperty("userId");
    expect(input?.context.facts).toEqual(context.facts);
    expect(input?.instructions).toContain("untrusted data");
  });

  it("validates periods and rejects malformed model output", async () => {
    const { service, generate } = configuredService();
    await expect(
      service.answer(
        { userId: "user-1" },
        { question: "Analyze", period: { ...period, from: "2026-11-01" } },
        true,
      ),
    ).rejects.toThrow(/بازهٔ زمانی/);
    await expect(
      service.answer(
        { userId: "user-1" },
        { question: "Analyze", period: { ...period, from: "2026-02-30" } },
        true,
      ),
    ).rejects.toThrow(/بازهٔ زمانی/);
    await expect(
      service.answer({ userId: "user-1" }, { question: " ", period }, true),
    ).rejects.toThrow(/پرسش دستیار/);

    generate.mockResolvedValue({ answer: "x".repeat(8_001) });
    await expect(
      service.answer({ userId: "user-1" }, { question: "Analyze", period }, true),
    ).rejects.toThrow(/قالب یا طول/);
  });
});
