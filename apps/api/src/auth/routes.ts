import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import type { SendMailOptions } from "nodemailer";
import type { AuthRepository, ProfileUpdate, User } from "../domain/auth.js";
import { ApiError } from "../http/errors.js";
import { validateBody } from "../http/request-validation.js";
import {
  changePasswordSchema,
  deleteAccountSchema,
  forgotPasswordSchema,
  loginSchema,
  profileSchema,
  registerSchema,
  resetPasswordSchema,
} from "./schemas.js";
import { hashPassword, verifyPassword } from "./password.js";
import { hashToken, createOpaqueToken } from "./tokens.js";
import { requireUser, SESSION_COOKIE } from "./middleware.js";

export interface AuthConfig {
  nodeEnv: "development" | "test" | "production";
  appUrl: string;
}

export interface Mailer {
  sendMail(message: SendMailOptions): Promise<unknown>;
}

export interface AuthRouteOptions {
  repository: AuthRepository;
  config: AuthConfig;
  mailer: Mailer | null;
  mailFrom: string | undefined;
}

const SHORT_SESSION_MS = 12 * 60 * 60 * 1000;
const REMEMBER_SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const RESET_TOKEN_MS = 60 * 60 * 1000;

// محدودیت‌ها برای یک سرور تک‌نمونه‌ای هستند؛ تولید چندنمونه‌ای به store مشترک نیاز دارد.
function authRateLimit(limit: number, windowMs: number) {
  return rateLimit({
    limit,
    windowMs,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_request, response) => {
      response.status(429).json({
        code: "RATE_LIMIT",
        message: "تعداد درخواست‌ها زیاد است. کمی بعد دوباره تلاش کنید.",
      });
    },
  });
}

function publicUser(user: User) {
  return {
    id: user.id,
    username: user.username,
    first_name: user.firstName,
    last_name: user.lastName,
    email: user.email,
    preferred_language: user.preferredLanguage,
    primary_currency: user.primaryCurrency,
    created_at: user.createdAt.toISOString(),
  };
}

function setSessionCookie(
  response: Response,
  token: string,
  maxAge: number,
  secure: boolean,
) {
  // پیش‌نمایش داخل iframe اجرا می‌شود؛ کوکی پارتیشن‌شده با SameSite=None در آن هم ارسال می‌شود.
  // محافظت CSRF با بررسی Origin و سرآیند X-Requested-With انجام می‌شود.
  void secure;
  const flags = [
    "Path=/",
    "HttpOnly",
    "SameSite=None",
    "Secure",
    "Partitioned",
    `Max-Age=${Math.floor(maxAge / 1000)}`,
  ];
  response.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; ${flags.join("; ")}`,
  );
}

function clearSessionCookie(response: Response, secure: boolean) {
  void secure;
  const flags = ["Path=/", "HttpOnly", "SameSite=None", "Secure", "Partitioned", "Max-Age=0"];
  response.setHeader("Set-Cookie", `${SESSION_COOKIE}=; ${flags.join("; ")}`);
}

// نشست تازه می‌سازد و کوکی HttpOnly آن را تنظیم می‌کند؛ هم ثبت‌نام و هم ورود از آن استفاده می‌کنند.
async function startSession(
  repository: AuthRepository,
  request: Request,
  response: Response,
  user: User,
  remember: boolean,
  secureCookie: boolean,
): Promise<void> {
  // نشست قبلی همین مرورگر دور ریخته می‌شود تا توکن قدیمی معتبر نماند.
  if (request.authSession) await repository.deleteSession(request.authSession.tokenHash);
  const token = createOpaqueToken();
  const now = new Date();
  const duration = remember ? REMEMBER_SESSION_MS : SHORT_SESSION_MS;
  await repository.createSession({
    tokenHash: hashToken(token),
    userId: user.id,
    createdAt: now,
    expiresAt: new Date(now.getTime() + duration),
    userAgent: String(request.get("User-Agent") || "").slice(0, 300),
  });
  setSessionCookie(response, token, duration, secureCookie);
}

// مسیرهای احراز هویت فقط دادهٔ اعتبارسنجی‌شده را وارد سرویس ذخیره‌سازی می‌کنند.
export function createAuthRouter(options: AuthRouteOptions): Router {
  const { repository, config, mailer, mailFrom } = options;
  const router = Router();
  const secureCookie = config.nodeEnv === "production";

  router.post(
    "/register",
    authRateLimit(10, 60 * 60 * 1000),
    validateBody(registerSchema),
    async (request, response) => {
      const body = request.body as ReturnType<typeof registerSchema.parse>;
      // بررسی پیش از درج، پیام روشن می‌دهد؛ یکتایی واقعی را index دیتابیس تضمین می‌کند.
      if (await repository.findUserByUsername(body.username))
        throw new ApiError(
          409,
          "USERNAME_IN_USE",
          "این نام کاربری قبلاً گرفته شده است.",
          { username: "این نام کاربری قبلاً گرفته شده است." },
        );
      const credential = await hashPassword(body.password);
      const user = await repository.createUser({
        id: randomUUID(),
        username: body.username,
        firstName: body.first_name || body.username,
        lastName: body.last_name,
        email: body.email ?? null,
        ...credential,
        acceptedTermsAt: new Date(),
      });
      // تأیید ایمیل بخشی از ثبت‌نام نیست؛ حساب بلافاصله فعال و وارد می‌شود.
      await startSession(repository, request, response, user, false, secureCookie);
      response.status(201).json({
        message: "حساب ساخته شد و وارد شدید.",
        user: publicUser(user),
      });
    },
  );

  router.post(
    "/login",
    authRateLimit(12, 15 * 60 * 1000),
    validateBody(loginSchema),
    async (request, response) => {
      const body = request.body as ReturnType<typeof loginSchema.parse>;
      const user = await repository.findUserByUsername(body.username);
      if (!user || !(await verifyPassword(body.password, user)))
        throw new ApiError(401, "INVALID_CREDENTIALS", "نام کاربری یا گذرواژه درست نیست.");

      await startSession(repository, request, response, user, body.remember, secureCookie);
      response.json({ user: publicUser(user) });
    },
  );

  router.post(
    "/forgot-password",
    authRateLimit(5, 60 * 60 * 1000),
    validateBody(forgotPasswordSchema),
    async (request, response) => {
      if (!mailer || !mailFrom)
        throw new ApiError(
          503,
          "EMAIL_NOT_CONFIGURED",
          "ارسال ایمیل بازیابی در تنظیمات سرور فعال نشده است.",
        );
      const body = request.body as ReturnType<typeof forgotPasswordSchema.parse>;
      const user = await repository.findUserByEmail(body.email);
      if (user && user.email) {
        const token = createOpaqueToken();
        await repository.createPasswordReset(
          hashToken(token),
          user.id,
          new Date(Date.now() + RESET_TOKEN_MS),
        );
        const link = `${config.appUrl}/legacy/index.html?reset=${encodeURIComponent(token)}`;
        try {
          await mailer.sendMail({
            from: mailFrom,
            to: user.email,
            subject: "بازیابی گذرواژهٔ دارا",
            text: `برای تعیین گذرواژهٔ جدید، این لینک را تا یک ساعت آینده باز کنید:\n${link}`,
            html: `<p>برای تعیین گذرواژهٔ جدید، لینک زیر را تا یک ساعت آینده باز کنید:</p><p><a href="${link}">بازیابی گذرواژه</a></p>`,
          });
        } catch {
          await repository.deletePasswordReset(hashToken(token));
          throw new ApiError(
            502,
            "EMAIL_DELIVERY_FAILED",
            "ارسال ایمیل بازیابی انجام نشد. کمی بعد دوباره تلاش کنید.",
          );
        }
      }
      response.json({
        message: "اگر برای این ایمیل حسابی وجود داشته باشد، لینک بازیابی ارسال می‌شود.",
      });
    },
  );

  router.post(
    "/reset-password",
    authRateLimit(10, 60 * 60 * 1000),
    validateBody(resetPasswordSchema),
    async (request, response) => {
      const body = request.body as ReturnType<typeof resetPasswordSchema.parse>;
      const reset = await repository.findPasswordReset(hashToken(body.token), new Date());
      if (!reset)
        throw new ApiError(
          400,
          "INVALID_RESET_TOKEN",
          "لینک بازیابی معتبر نیست یا زمان آن گذشته است.",
        );
      const credential = await hashPassword(body.new_password);
      await repository.completePasswordReset(reset.userId, credential);
      clearSessionCookie(response, secureCookie);
      response.json({ message: "گذرواژه تغییر کرد." });
    },
  );

  router.post("/logout", async (request, response) => {
    if (request.authSession) await repository.deleteSession(request.authSession.tokenHash);
    clearSessionCookie(response, secureCookie);
    response.status(204).end();
  });

  router.post(
    "/change-password",
    authRateLimit(10, 15 * 60 * 1000),
    requireUser,
    validateBody(changePasswordSchema),
    async (request, response) => {
      const body = request.body as ReturnType<typeof changePasswordSchema.parse>;
      if (!(await verifyPassword(body.current_password, request.authUser)))
        throw new ApiError(400, "INVALID_PASSWORD", "گذرواژه‌ی فعلی درست نیست.");
      const credential = await hashPassword(body.new_password);
      await repository.changePassword(
        request.authUser!.id,
        credential,
        request.authSession!.tokenHash,
      );
      response.json({ message: "گذرواژه تغییر کرد." });
    },
  );

  router.get("/sessions", requireUser, async (request, response) => {
    const sessions = await repository.listSessions(request.authUser!.id, new Date());
    response.json(
      sessions.map((session) => ({
        current: session.tokenHash === request.authSession!.tokenHash,
        device: session.userAgent || "دستگاه نامشخص",
        last_seen: session.lastSeenAt.toISOString(),
      })),
    );
  });

  router.get("/health", (_request, response) => response.json({ status: "ok" }));
  return router;
}

export function createProfileRouter(
  repository: AuthRepository,
  secureCookie: boolean,
): Router {
  const router = Router();

  router.get("/", requireUser, (request, response) => {
    response.json(publicUser(request.authUser!));
  });

  router.patch(
    "/",
    authRateLimit(30, 15 * 60 * 1000),
    requireUser,
    validateBody(profileSchema),
    async (request, response) => {
      const body = request.body as ReturnType<typeof profileSchema.parse>;
      const update: ProfileUpdate = {};
      if (body.first_name !== undefined) update.firstName = body.first_name;
      if (body.last_name !== undefined) update.lastName = body.last_name;
      if (body.preferred_language !== undefined)
        update.preferredLanguage = body.preferred_language;
      if (body.primary_currency !== undefined) update.primaryCurrency = body.primary_currency;
      const user = await repository.updateProfile(request.authUser!.id, update);
      response.json(publicUser(user));
    },
  );

  router.delete(
    "/",
    authRateLimit(5, 60 * 60 * 1000),
    requireUser,
    validateBody(deleteAccountSchema),
    async (request, response) => {
      const body = request.body as ReturnType<typeof deleteAccountSchema.parse>;
      if (!(await verifyPassword(body.password, request.authUser)))
        throw new ApiError(400, "INVALID_PASSWORD", "گذرواژه درست نیست.");
      await repository.deleteUser(request.authUser!.id);
      clearSessionCookie(response, secureCookie);
      response.status(204).end();
    },
  );

  return router;
}
