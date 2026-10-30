import { describe, expect, it } from "vitest";
import { loginSchema, registerSchema } from "./schemas.js";
import { normalizeUsername } from "./username.js";

describe("username normalization", () => {
  it("lowercases and trims so one account matches every spelling", () => {
    expect(normalizeUsername("  Dara_User  ")).toBe("dara_user");
  });

  it("unifies Arabic/Persian letter shapes and drops zero-width marks", () => {
    expect(normalizeUsername("كاربر\u200cيك")).toBe("کاربریک");
  });
});

describe("registration form", () => {
  const valid = {
    username: "dara_user",
    password: "securepass123",
    accepted_terms: true,
  };

  it("accepts a username, password and terms without an email", () => {
    const result = registerSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.email).toBeUndefined();
    expect(result.data.first_name).toBe("");
    expect(result.data.last_name).toBe("");
  });

  it("stores the email lowercase and treats an empty field as absent", () => {
    const withEmail = registerSchema.safeParse({ ...valid, email: "Dara@Example.COM" });
    expect(withEmail.success && withEmail.data.email).toBe("dara@example.com");
    const emptyEmail = registerSchema.safeParse({ ...valid, email: "" });
    expect(emptyEmail.success && emptyEmail.data.email).toBeUndefined();
    const badEmail = registerSchema.safeParse({ ...valid, email: "not-an-email" });
    expect(badEmail.success).toBe(false);
  });

  it.each([
    ["ab", "too short"],
    ["1dara", "starts with a digit"],
    ["dara user", "contains a space"],
    ["dara!", "contains a symbol"],
    ["a".repeat(33), "too long"],
  ])("rejects username %s (%s)", (username) => {
    expect(registerSchema.safeParse({ ...valid, username }).success).toBe(false);
  });

  it("rejects a username longer than 32 characters after normalization", () => {
    expect(registerSchema.safeParse({ ...valid, username: "ی".repeat(33) }).success).toBe(false);
  });

  it("requires a strong enough password", () => {
    expect(registerSchema.safeParse({ ...valid, password: "short1" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, password: "onlyletters" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, password: "1234567890" }).success).toBe(false);
  });

  it("requires accepting the terms", () => {
    expect(registerSchema.safeParse({ ...valid, accepted_terms: false }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, accepted_terms: undefined }).success).toBe(false);
  });

  it("rejects unknown fields instead of mass-assigning them", () => {
    expect(registerSchema.safeParse({ ...valid, is_admin: true }).success).toBe(false);
  });

  it("explains missing required fields in Persian", () => {
    const missingUsername = registerSchema.safeParse({
      password: "securepass123",
      accepted_terms: true,
    });
    expect(missingUsername.error?.issues[0]?.message).toBe("نام کاربری را وارد کنید.");
    expect(loginSchema.safeParse({ username: "dara_user" }).error?.issues[0]?.message).toBe(
      "گذرواژه را وارد کنید.",
    );
  });
});

describe("login form", () => {
  it("normalizes the username before lookup", () => {
    const result = loginSchema.safeParse({ username: " Dara_User ", password: "x" });
    expect(result.success && result.data.username).toBe("dara_user");
    expect(result.success && result.data.remember).toBe(false);
  });

  it("rejects an empty password", () => {
    expect(loginSchema.safeParse({ username: "dara_user", password: "" }).success).toBe(false);
  });
});
