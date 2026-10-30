import { describe, expect, it } from "vitest";
import request from "supertest";
import type { SendMailOptions } from "nodemailer";
import type { AuthRepository, NewUser, Session, User } from "../domain/auth.js";
import { createApp } from "../app.js";

// این harness بدون PostgreSQL کار می‌کند و همان contract repository را پیاده می‌کند.
function createHarness(options: { withMailer?: boolean } = {}) {
  const users = new Map<string, User>();
  const sessions = new Map<string, Session>();
  const resets = new Map<string, { userId: string; expiresAt: Date }>();
  const sentMail: SendMailOptions[] = [];
  const withMailer = options.withMailer ?? true;

  const byUsername = (username: string) =>
    [...users.values()].find((user) => user.username === username) ?? null;

  const repository: AuthRepository = {
    createUser: async (input: NewUser) => {
      if (byUsername(input.username))
        throw Object.assign(new Error("Unique constraint failed"), {
          code: "P2002",
          meta: { target: ["username"] },
        });
      const user: User = {
        ...input,
        preferredLanguage: "fa",
        primaryCurrency: "IRR",
        createdAt: new Date(),
      };
      users.set(user.id, user);
      return user;
    },
    findUserByUsername: async (username) => byUsername(username),
    findUserByEmail: async (email) =>
      [...users.values()].find((user) => user.email !== null && user.email === email) ?? null,
    findUserById: async (id) => users.get(id) ?? null,
    updateProfile: async (id, update) => {
      const current = users.get(id);
      if (!current) throw new Error("Missing user");
      const next: User = {
        ...current,
        ...(update.firstName !== undefined ? { firstName: update.firstName } : {}),
        ...(update.lastName !== undefined ? { lastName: update.lastName } : {}),
        ...(update.preferredLanguage !== undefined
          ? { preferredLanguage: update.preferredLanguage }
          : {}),
        ...(update.primaryCurrency !== undefined
          ? { primaryCurrency: update.primaryCurrency }
          : {}),
      };
      users.set(id, next);
      return next;
    },
    createSession: async (input) => {
      sessions.set(input.tokenHash, { ...input, lastSeenAt: input.createdAt });
    },
    findActiveSession: async (tokenHash, now) => {
      const session = sessions.get(tokenHash);
      const user = session ? users.get(session.userId) : undefined;
      return session && user && session.expiresAt > now ? { session, user } : null;
    },
    touchSession: async (tokenHash, lastSeenAt) => {
      const session = sessions.get(tokenHash);
      if (session) session.lastSeenAt = lastSeenAt;
    },
    listSessions: async (userId) =>
      [...sessions.values()]
        .filter((session) => session.userId === userId)
        .map((session) => ({
          tokenHash: session.tokenHash,
          createdAt: session.createdAt,
          lastSeenAt: session.lastSeenAt,
          userAgent: session.userAgent,
        })),
    deleteSession: async (tokenHash) => {
      sessions.delete(tokenHash);
    },
    deleteSessionsForUser: async (userId) => {
      for (const [tokenHash, session] of sessions)
        if (session.userId === userId) sessions.delete(tokenHash);
    },
    deleteOtherSessions: async (userId, currentTokenHash) => {
      for (const [tokenHash, session] of sessions)
        if (session.userId === userId && tokenHash !== currentTokenHash)
          sessions.delete(tokenHash);
    },
    createPasswordReset: async (tokenHash, userId, expiresAt) => {
      resets.set(tokenHash, { userId, expiresAt });
    },
    deletePasswordReset: async (tokenHash) => {
      resets.delete(tokenHash);
    },
    findPasswordReset: async (tokenHash, now) => {
      const reset = resets.get(tokenHash);
      return reset && reset.expiresAt > now ? { userId: reset.userId } : null;
    },
    completePasswordReset: async (userId, credential) => {
      const current = users.get(userId);
      if (current) users.set(userId, { ...current, ...credential });
      for (const [tokenHash, session] of sessions)
        if (session.userId === userId) sessions.delete(tokenHash);
    },
    changePassword: async (userId, credential, currentTokenHash) => {
      const current = users.get(userId);
      if (current) users.set(userId, { ...current, ...credential });
      for (const [tokenHash, session] of sessions)
        if (session.userId === userId && tokenHash !== currentTokenHash)
          sessions.delete(tokenHash);
    },
    deleteUser: async (userId) => {
      users.delete(userId);
    },
    deleteExpired: async () => {},
  };

  const app = createApp({
    config: { nodeEnv: "test", webOrigin: "http://localhost:5173" },
    auth: {
      repository,
      appUrl: "https://dara.example",
      mailer: withMailer ? { sendMail: async (message) => sentMail.push(message) } : null,
      mailFrom: withMailer ? "Dara <no-reply@example.com>" : undefined,
    },
  });
  return { app, users, sessions, resets, sentMail };
}

const sessionCookie = (response: {
  headers: Record<string, string | string[] | undefined>;
}): string => {
  const header = response.headers["set-cookie"];
  const value = Array.isArray(header) ? header[0] : header;
  return value ? value.split(";")[0]! : "";
};

const register = (
  app: ReturnType<typeof createHarness>["app"],
  body: Record<string, unknown>,
) =>
  request(app)
    .post("/api/auth/register")
    .set("X-Requested-With", "dara")
    .send(body);

const login = (app: ReturnType<typeof createHarness>["app"], body: Record<string, unknown>) =>
  request(app)
    .post("/api/auth/login")
    .set("X-Requested-With", "dara")
    .send(body);

const validAccount = {
  first_name: "دارا",
  username: "dara_user",
  password: "securepass123",
  accepted_terms: true,
};

describe("username and password authentication", () => {
  it("creates an account and signs in immediately without any email step", async () => {
    const harness = createHarness();

    const registration = await register(harness.app, validAccount);
    expect(registration.status).toBe(201);
    expect(registration.body.user).toMatchObject({ username: "dara_user", email: null });
    expect(registration.body.user).not.toHaveProperty("password_hash");
    expect(harness.sentMail).toHaveLength(0);

    const cookie = sessionCookie(registration);
    expect(cookie).toContain("dara_session=");
    const profile = await request(harness.app).get("/api/me").set("Cookie", cookie);
    expect(profile.status).toBe(200);
    expect(profile.body.username).toBe("dara_user");
    expect(profile.body.first_name).toBe("دارا");
  });

  it("registers and logs in without SMTP configured", async () => {
    const harness = createHarness({ withMailer: false });

    const registration = await register(harness.app, { ...validAccount, username: "no_mail" });
    expect(registration.status).toBe(201);
    expect(sessionCookie(registration)).toContain("dara_session=");

    const signIn = await login(harness.app, {
      username: "no_mail",
      password: "securepass123",
    });
    expect(signIn.status).toBe(200);
    expect(signIn.body.user.username).toBe("no_mail");
  });

  it("treats usernames case-insensitively and rejects a duplicate", async () => {
    const harness = createHarness();

    const first = await register(harness.app, { ...validAccount, username: "Dara.User" });
    expect(first.status).toBe(201);
    expect(first.body.user.username).toBe("dara.user");

    const duplicate = await register(harness.app, { ...validAccount, username: "DARA.USER" });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe("USERNAME_IN_USE");
    expect(duplicate.headers["set-cookie"]).toBeUndefined();

    const signIn = await login(harness.app, {
      username: "Dara.User",
      password: "securepass123",
    });
    expect(signIn.status).toBe(200);
    expect(sessionCookie(signIn)).toContain("dara_session=");
  });

  it("normalizes Persian/Arabic letters so one account cannot be created twice", async () => {
    const harness = createHarness();

    const first = await register(harness.app, { ...validAccount, username: "کاربر_یک" });
    expect(first.status).toBe(201);
    const duplicate = await register(harness.app, { ...validAccount, username: "كاربر_يك" });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe("USERNAME_IN_USE");
  });

  it("rejects a wrong password and an unknown username with the same error", async () => {
    const harness = createHarness();
    await register(harness.app, validAccount);

    const wrongPassword = await login(harness.app, {
      username: "dara_user",
      password: "wrongpass123",
    });
    expect(wrongPassword.status).toBe(401);
    expect(wrongPassword.body.code).toBe("INVALID_CREDENTIALS");
    expect(wrongPassword.body.message).toBe("نام کاربری یا گذرواژه درست نیست.");

    const unknown = await login(harness.app, {
      username: "missing_user",
      password: "securepass123",
    });
    expect(unknown.status).toBe(401);
    expect(unknown.body.code).toBe("INVALID_CREDENTIALS");
  });

  it("reports validation problems field by field", async () => {
    const harness = createHarness();

    const invalid = await register(harness.app, {
      username: "1bad name",
      password: "short",
      accepted_terms: false,
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe("VALIDATION");
    expect(Object.keys(invalid.body.fields)).toEqual(
      expect.arrayContaining(["username", "password", "accepted_terms"]),
    );
  });

  it("logs out and invalidates the session", async () => {
    const harness = createHarness();
    const registration = await register(harness.app, validAccount);
    const cookie = sessionCookie(registration);

    const logout = await request(harness.app)
      .post("/api/auth/logout")
      .set("X-Requested-With", "dara")
      .set("Cookie", cookie);
    expect(logout.status).toBe(204);

    const profile = await request(harness.app).get("/api/me").set("Cookie", cookie);
    expect(profile.status).toBe(401);
  });

  it("changes the password only with the current one", async () => {
    const harness = createHarness();
    const registration = await register(harness.app, validAccount);
    const cookie = sessionCookie(registration);

    const wrongCurrent = await request(harness.app)
      .post("/api/auth/change-password")
      .set("X-Requested-With", "dara")
      .set("Cookie", cookie)
      .send({ current_password: "nope12345678", new_password: "anotherpass123" });
    expect(wrongCurrent.status).toBe(400);
    expect(wrongCurrent.body.code).toBe("INVALID_PASSWORD");

    const changed = await request(harness.app)
      .post("/api/auth/change-password")
      .set("X-Requested-With", "dara")
      .set("Cookie", cookie)
      .send({ current_password: "securepass123", new_password: "anotherpass123" });
    expect(changed.status).toBe(200);

    const oldPassword = await login(harness.app, {
      username: "dara_user",
      password: "securepass123",
    });
    expect(oldPassword.status).toBe(401);
    const newPassword = await login(harness.app, {
      username: "dara_user",
      password: "anotherpass123",
    });
    expect(newPassword.status).toBe(200);
  });

  it("resets the password through the optional email", async () => {
    const harness = createHarness();
    await register(harness.app, {
      ...validAccount,
      username: "with_mail",
      email: "User@Example.com",
    });

    const forgot = await request(harness.app)
      .post("/api/auth/forgot-password")
      .set("X-Requested-With", "dara")
      .send({ email: "user@example.com" });
    expect(forgot.status).toBe(200);
    expect(harness.sentMail).toHaveLength(1);

    const token = new URL(String(harness.sentMail[0]!.text).split("\n").at(-1)!)
      .searchParams.get("reset");
    expect(token).toBeTruthy();

    const reset = await request(harness.app)
      .post("/api/auth/reset-password")
      .set("X-Requested-With", "dara")
      .send({ token, new_password: "resetpass456" });
    expect(reset.status).toBe(200);

    const signIn = await login(harness.app, {
      username: "with_mail",
      password: "resetpass456",
    });
    expect(signIn.status).toBe(200);
  });

  it("refuses password reset emails when SMTP is not configured", async () => {
    const harness = createHarness({ withMailer: false });

    const forgot = await request(harness.app)
      .post("/api/auth/forgot-password")
      .set("X-Requested-With", "dara")
      .send({ email: "user@example.com" });
    expect(forgot.status).toBe(503);
    expect(forgot.body.code).toBe("EMAIL_NOT_CONFIGURED");
  });
});
