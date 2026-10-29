import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";

const app = createApp({
  config: {
    nodeEnv: "test",
    webOrigin: "http://localhost:5173",
  },
});

describe("removed authentication endpoints", () => {
  it.each([
    ["post", "/auth/register"],
    ["post", "/auth/login"],
    ["post", "/auth/forgot-password"],
    ["post", "/auth/reset-password"],
    ["post", "/auth/logout"],
    ["get", "/me"],
    ["patch", "/me"],
    ["delete", "/me"],
  ])("returns not found for %s %s", async (method, path) => {
    const agent = request(app);
    const result = await (method === "get"
      ? agent.get(path)
      : method === "patch"
        ? agent.patch(path)
        : method === "delete"
          ? agent.delete(path)
          : agent.post(path))
      .set("X-Requested-With", "dara");

    expect(result.status).toBe(404);
    expect(result.body.code).toBe("NOT_FOUND");
  });

  it("keeps the health endpoint available", async () => {
    const health = await request(app).get("/api/health");
    expect(health.status).toBe(200);
    expect(health.body).toEqual({ status: "ok" });
  });

  it("reports database health when an injected database probe succeeds", async () => {
    const healthApp = createApp({
      config: { nodeEnv: "test", webOrigin: "http://localhost:5173" },
      databaseHealth: async () => {},
    });

    const health = await request(healthApp).get("/api/health");
    expect(health.status).toBe(200);
    expect(health.body).toEqual({ status: "ok", database: "ok" });
  });

  it("returns an unavailable health response when the database probe fails", async () => {
    const healthApp = createApp({
      config: { nodeEnv: "test", webOrigin: "http://localhost:5173" },
      databaseHealth: async () => {
        throw new Error("database credentials must not be returned");
      },
    });

    const health = await request(healthApp).get("/api/health");
    expect(health.status).toBe(503);
    expect(health.body).toEqual({ status: "unavailable", database: "unavailable" });
    expect(JSON.stringify(health.body)).not.toContain("credentials");
  });
});
