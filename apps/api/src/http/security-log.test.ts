import { afterEach, describe, expect, it, vi } from "vitest";
import { actorHash, logSecurityEvent } from "./security-log.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("security event logging", () => {
  it("emits a single JSON line with a hashed actor and no raw username", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});

    logSecurityEvent("login_failure", {
      ip: "1.2.3.4",
      username: "Dara_User",
      route: "/api/auth/login",
      reason: "invalid_credentials",
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const line = String(spy.mock.calls[0]![0]);
    const record = JSON.parse(line) as Record<string, unknown>;
    expect(record).toMatchObject({
      level: "security",
      event: "login_failure",
      ip: "1.2.3.4",
      route: "/api/auth/login",
      reason: "invalid_credentials",
    });
    expect(record.actor).toBe(actorHash("dara_user"));
    expect(line).not.toContain("Dara_User");
    expect(line).not.toContain("password");
  });

  it("keeps the actor stable across casing and trims whitespace", () => {
    expect(actorHash("  Dara_User ")).toBe(actorHash("dara_user"));
  });
});
