import { describe, expect, it } from "vitest";
import request from "supertest";
import type { SendMailOptions } from "nodemailer";
import type { AuthRepository, NewUser, Session, User } from "../domain/auth.js";
import { createApp } from "../app.js";
import { hashToken } from "./tokens.js";

function createHarness() {
  let user: User | null = null;
  const verifications = new Map<string, { userId: string; expiresAt: Date }>();
  const sessions = new Map<string, { session: Session; user: User }>();
  const sentMail: SendMailOptions[] = [];
  const repository: AuthRepository = {
    createUser: async (newUser: NewUser) => {
      user = {
        ...newUser,
        emailVerifiedAt: null,
        preferredLanguage: "fa",
        primaryCurrency: "IRR",
        createdAt: new Date(),
      };
      return user;
    },
    createEmailVerification: async (tokenHash, userId, expiresAt) => {
      verifications.set(tokenHash, { userId, expiresAt });
    },
    deleteEmailVerification: async (tokenHash) => {
      verifications.delete(tokenHash);
    },
    consumeEmailVerification: async (tokenHash, now) => {
      const verification = verifications.get(tokenHash);
      if (!verification || verification.expiresAt <= now || !user) return null;
      verifications.delete(tokenHash);
      user = { ...user, emailVerifiedAt: now };
      return user;
    },
    findUserByEmail: async (email) => (user?.email === email ? user : null),
    findUserById: async (id) => (user?.id === id ? user : null),
    updateProfile: async (id, update) => {
      if (!user || user.id !== id) throw new Error("Missing user");
      user = {
        ...user,
        ...(update.firstName !== undefined ? { firstName: update.firstName } : {}),
        ...(update.lastName !== undefined ? { lastName: update.lastName } : {}),
        ...(update.preferredLanguage !== undefined
          ? { preferredLanguage: update.preferredLanguage }
          : {}),
        ...(update.primaryCurrency !== undefined
          ? { primaryCurrency: update.primaryCurrency }
          : {}),
      };
      return user;
    },
    createSession: async (input) => {
      if (!user) throw new Error("Missing user");
      const session: Session = { ...input, lastSeenAt: input.createdAt };
      sessions.set(input.tokenHash, { session, user });
    },
    findActiveSession: async (tokenHash, now) => {
      const active = sessions.get(tokenHash);
      return active && active.session.expiresAt > now ? active : null;
    },
    touchSession: async (tokenHash, lastSeenAt) => {
      const active = sessions.get(tokenHash);
      if (active) active.session.lastSeenAt = lastSeenAt;
    },
    listSessions: async (userId) =>
      [...sessions.values()]
        .filter((entry) => entry.session.userId === userId)
        .map(({ session }) => ({
          tokenHash: session.tokenHash,
          createdAt: session.createdAt,
          lastSeenAt: session.lastSeenAt,
          userAgent: session.userAgent,
        })),
    deleteSession: async (tokenHash) => {
      sessions.delete(tokenHash);
    },
    deleteSessionsForUser: async (userId) => {
      for (const [tokenHash, value] of sessions)
        if (value.session.userId === userId) sessions.delete(tokenHash);
    },
    deleteOtherSessions: async (userId, currentTokenHash) => {
      for (const [tokenHash, value] of sessions)
        if (value.session.userId === userId && tokenHash !== currentTokenHash)
          sessions.delete(tokenHash);
    },
    createPasswordReset: async () => {},
    deletePasswordReset: async () => {},
    findPasswordReset: async () => null,
    completePasswordReset: async () => {},
    changePassword: async () => {},
    deleteUser: async () => {
      user = null;
    },
    deleteExpired: async () => {},
  };
  const app = createApp({
    config: { nodeEnv: "test", webOrigin: "http://localhost:5173" },
    auth: {
      repository,
      appUrl: "https://dara.example",
      mailer: { sendMail: async (message) => sentMail.push(message) },
      mailFrom: "Dara <no-reply@example.com>",
    },
  });
  return { app, repository, verifications, sentMail };
}

describe("email-verified authentication", () => {
  it("requires email verification before issuing a session", async () => {
    const harness = createHarness();
    const registration = await request(harness.app)
      .post("/api/auth/register")
      .set("X-Requested-With", "dara")
      .send({
        first_name: "دارا",
        email: "user@example.com",
        password: "securepass123",
        accepted_terms: true,
      });

    expect(registration.status).toBe(201);
    expect(registration.body.message).toContain("ایمیل");
    expect(registration.headers["set-cookie"]).toBeUndefined();
    expect(harness.sentMail).toHaveLength(1);

    const loginBeforeVerification = await request(harness.app)
      .post("/api/auth/login")
      .set("X-Requested-With", "dara")
      .send({ email: "user@example.com", password: "securepass123" });
    expect(loginBeforeVerification.status).toBe(403);
    expect(loginBeforeVerification.body.code).toBe("EMAIL_NOT_VERIFIED");

    const token = new URL(String(harness.sentMail[0]!.text).split("\n").at(-1)!).searchParams.get("verify");
    expect(token).toBeTruthy();
    expect(harness.verifications.has(hashToken(token!))).toBe(true);

    const verification = await request(harness.app)
      .post("/api/auth/verify-email")
      .set("X-Requested-With", "dara")
      .send({ token });
    expect(verification.status).toBe(200);
    expect(harness.verifications.has(hashToken(token!))).toBe(false);

    const login = await request(harness.app)
      .post("/api/auth/login")
      .set("X-Requested-With", "dara")
      .send({ email: "user@example.com", password: "securepass123", remember: true });
    expect(login.status).toBe(200);
    const cookieHeader = login.headers["set-cookie"];
    const cookie = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;
    expect(cookie).toBeDefined();
    const profile = await request(harness.app)
      .get("/api/me")
      .set("Cookie", cookie!.split(";")[0]!);
    expect(profile.status).toBe(200);
    expect(profile.body.email_verified).toBe(true);
  });

  it("does not create accounts when SMTP is unavailable", async () => {
    const app = createApp({
      config: { nodeEnv: "test", webOrigin: "http://localhost:5173" },
      auth: {
        repository: createHarness().repository,
        appUrl: "https://dara.example",
        mailer: null,
        mailFrom: undefined,
      },
    });
    const result = await request(app)
      .post("/api/auth/register")
      .set("X-Requested-With", "dara")
      .send({
        first_name: "دارا",
        email: "user@example.com",
        password: "securepass123",
        accepted_terms: true,
      });
    expect(result.status).toBe(503);
    expect(result.body.code).toBe("EMAIL_NOT_CONFIGURED");
  });
});
