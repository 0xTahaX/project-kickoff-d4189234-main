const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");
const express = require("express");
const nodemailer = require("nodemailer");
const Database = require("better-sqlite3");

const scrypt = promisify(crypto.scrypt);
const ROOT = __dirname;
const DUMMY_PASSWORD_SALT = crypto.randomBytes(16);
const PASSWORD_OPTIONS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const SESSION_COOKIE = "dara_session";
const SESSION_SHORT_MS = 12 * 60 * 60 * 1000;
const SESSION_LONG_MS = 30 * 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;
const PUBLIC_FILES = new Set([
  "index.html",
  "account.html",
  "terms.html",
  "privacy.html",
  "style.css",
  "app.js",
  "validators.js",
  "assets-core.js",
  "assets-ui.js",
  "markets-ui.js",
  "phase4-core.js",
  "phase4-ui.js",
  "phase5-core.js",
  "phase5-ui.js",
]);

function createApp(options = {}) {
  const dbPath =
    options.dbPath || process.env.DB_PATH || path.join(os.homedir(), ".dara", "dara.sqlite");
  if (dbPath !== ":memory:") fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  function runTransaction(callback) {
    db.exec("BEGIN");
    try {
      const result = callback();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      preferred_language TEXT NOT NULL DEFAULT 'fa',
      primary_currency TEXT NOT NULL DEFAULT 'IRT',
      accepted_terms_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      user_agent TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS sessions_user_id ON sessions(user_id);
    CREATE TABLE IF NOT EXISTS password_resets (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL
    );
  `);
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(new Date().toISOString());
  db.prepare("DELETE FROM password_resets WHERE expires_at <= ?").run(new Date().toISOString());

  const app = express();
  const appUrl = (options.appUrl || process.env.APP_URL || "http://localhost:3000").replace(
    /\/+$/,
    "",
  );
  const mailTransport =
    options.mailTransport ||
    (process.env.SMTP_HOST
      ? nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT || 587),
          secure: process.env.SMTP_SECURE === "true",
          auth:
            process.env.SMTP_USER || process.env.SMTP_PASS
              ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
              : undefined,
        })
      : null);
  const mailFrom = options.mailFrom || process.env.SMTP_FROM || process.env.SMTP_USER;

  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Frame-Options": "DENY",
    });
    next();
  });
  app.use(express.json({ limit: "20kb", strict: true }));
  app.use((req, res, next) => {
    const raw = req.headers.cookie || "";
    const value = raw
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
      ?.slice(SESSION_COOKIE.length + 1);
    try {
      req.sessionToken = value ? decodeURIComponent(value) : "";
    } catch {
      req.sessionToken = "";
    }
    req.authSession = null;
    req.authUser = null;
    if (!req.sessionToken) return next();

    const tokenHash = hashToken(req.sessionToken);
    const session = db
      .prepare(
        `SELECT sessions.token_hash, sessions.user_id, sessions.expires_at, users.*
         FROM sessions JOIN users ON users.id = sessions.user_id
         WHERE sessions.token_hash = ? AND sessions.expires_at > ?`,
      )
      .get(tokenHash, new Date().toISOString());
    if (!session) return next();

    req.authSession = { tokenHash: session.token_hash, userId: session.user_id };
    req.authUser = session;
    db.prepare("UPDATE sessions SET last_seen = ? WHERE token_hash = ?").run(
      new Date().toISOString(),
      tokenHash,
    );
    next();
  });

  const requireJsonMutation = (req, res, next) => {
    if (!["POST", "PATCH", "DELETE"].includes(req.method)) return next();
    if (req.get("X-Requested-With") !== "dara")
      return res.status(403).json({ code: "CSRF", message: "درخواست معتبر نیست." });
    next();
  };
  app.use("/auth", requireJsonMutation);
  app.use("/me", requireJsonMutation);

  const limits = new Map();
  function rateLimit(limit, windowMs) {
    return (req, res, next) => {
      const now = Date.now();
      const key = `${req.ip}:${req.path}`;
      let entry = limits.get(key);
      if (!entry || entry.until <= now) {
        entry = { count: 0, until: now + windowMs };
        limits.set(key, entry);
      }
      entry.count += 1;
      if (limits.size > 1000) {
        for (const [oldKey, oldEntry] of limits) {
          if (oldEntry.until <= now) limits.delete(oldKey);
        }
      }
      if (entry.count > limit) {
        res.set("Retry-After", String(Math.ceil((entry.until - now) / 1000)));
        return res.status(429).json({ code: "RATE_LIMIT", message: "تعداد درخواست‌ها زیاد است." });
      }
      next();
    };
  }

  function sendError(res, status, code, message, fields) {
    return res.status(status).json({ code, message, ...(fields ? { fields } : {}) });
  }
  function validEmail(value) {
    return typeof value === "string" && value.length <= 254 &&
      /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(value.trim());
  }
  function passwordError(value) {
    if (typeof value !== "string" || value.length < 10)
      return "گذرواژه باید حداقل ۱۰ کاراکتر باشد.";
    if (value.length > 128) return "گذرواژه نمی‌تواند بیشتر از ۱۲۸ کاراکتر باشد.";
    if (!/\p{L}/u.test(value)) return "گذرواژه باید شامل حرف باشد.";
    if (!/\p{N}/u.test(value)) return "گذرواژه باید شامل عدد باشد.";
    return "";
  }
  function cleanName(value, required, label) {
    if (typeof value !== "string") return required ? `${label} را وارد کنید.` : "";
    const name = value.trim();
    if (!name && required) return `${label} را وارد کنید.`;
    if (name.length > 50) return "حداکثر ۵۰ کاراکتر مجاز است.";
    return "";
  }
  function hashToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
  }
  function isDuplicateEmail(error) {
    return (
      error.code?.startsWith("SQLITE_CONSTRAINT") &&
      /UNIQUE constraint failed: users\.email/.test(error.message)
    );
  }
  function publicUser(user) {
    return {
      id: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      preferred_language: user.preferred_language,
      primary_currency: user.primary_currency,
      created_at: user.created_at,
    };
  }
  async function hashPassword(password) {
    const salt = crypto.randomBytes(16);
    const key = await scrypt(password, salt, 64, PASSWORD_OPTIONS);
    return { salt: salt.toString("hex"), hash: key.toString("hex") };
  }
  async function verifyPassword(password, user) {
    const actual = await scrypt(
      password,
      Buffer.from(user.password_salt, "hex"),
      64,
      PASSWORD_OPTIONS,
    );
    const expected = Buffer.from(user.password_hash, "hex");
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  }
  function setSessionCookie(res, token, maxAge) {
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    res.setHeader(
      "Set-Cookie",
      `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAge / 1000)}${secure}`,
    );
  }
  function clearSessionCookie(res) {
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    res.setHeader(
      "Set-Cookie",
      `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`,
    );
  }
  function createSession(req, res, user, remember) {
    const token = crypto.randomBytes(32).toString("base64url");
    const now = new Date();
    const maxAge = remember ? SESSION_LONG_MS : SESSION_SHORT_MS;
    const expiresAt = new Date(now.getTime() + maxAge).toISOString();
    db.prepare(
      `INSERT INTO sessions (token_hash, user_id, created_at, last_seen, expires_at, user_agent)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      hashToken(token),
      user.id,
      now.toISOString(),
      now.toISOString(),
      expiresAt,
      String(req.get("User-Agent") || "").slice(0, 300),
    );
    setSessionCookie(res, token, maxAge);
  }

  app.use((req, res, next) => {
    const requestPath = req.path.toLowerCase();
    if (
      requestPath === "/auth" ||
      requestPath.startsWith("/auth/") ||
      requestPath === "/me" ||
      requestPath.startsWith("/me/")
    )
      return sendError(res, 404, "NOT_FOUND", "قابلیت حساب کاربری در دسترس نیست.");
    next();
  });

  app.post(
    "/auth/register",
    rateLimit(10, 60 * 60 * 1000),
    async (req, res) => {
      const body = req.body || {};
      const fields = {};
      const firstNameError = cleanName(body.first_name, true, "نام");
      const lastNameError = cleanName(body.last_name || "", false, "نام خانوادگی");
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const passError = passwordError(body.password);
      if (firstNameError) fields.first_name = firstNameError;
      if (lastNameError) fields.last_name = lastNameError;
      if (!validEmail(email)) fields.email = "قالب ایمیل درست نیست.";
      if (passError) fields.password = passError;
      if (body.accepted_terms !== true) fields.terms = "برای ادامه باید شرایط را بپذیرید.";
      if (Object.keys(fields).length)
        return sendError(res, 400, "VALIDATION", "اطلاعات فرم معتبر نیست.", fields);

      const { salt, hash } = await hashPassword(body.password);
      const user = {
        id: crypto.randomUUID(),
        first_name: body.first_name.trim(),
        last_name: (body.last_name || "").trim(),
        email,
        password_hash: hash,
        password_salt: salt,
        created_at: new Date().toISOString(),
      };
      try {
        db.prepare(
          `INSERT INTO users (id, first_name, last_name, email, password_hash, password_salt,
            accepted_terms_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          user.id,
          user.first_name,
          user.last_name,
          user.email,
          user.password_hash,
          user.password_salt,
          user.created_at,
          user.created_at,
        );
      } catch (error) {
        if (isDuplicateEmail(error))
          return sendError(res, 409, "EMAIL_IN_USE", "این ایمیل قبلاً ثبت شده است.", {
            email: "این ایمیل قبلاً ثبت شده است.",
          });
        throw error;
      }
      res.status(201).json({ user: publicUser(user) });
    },
  );

  app.post("/auth/login", rateLimit(12, 15 * 60 * 1000), async (req, res) => {
    const body = req.body || {};
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!validEmail(email) || typeof body.password !== "string" || body.password.length > 128)
      return sendError(res, 400, "VALIDATION", "ایمیل یا گذرواژه درست نیست.");
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    if (!user) {
      await scrypt(body.password, DUMMY_PASSWORD_SALT, 64, PASSWORD_OPTIONS);
      return sendError(res, 401, "INVALID_CREDENTIALS", "ایمیل یا گذرواژه درست نیست.");
    }
    if (!(await verifyPassword(body.password, user)))
      return sendError(res, 401, "INVALID_CREDENTIALS", "ایمیل یا گذرواژه درست نیست.");

    if (req.authSession) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(req.authSession.tokenHash);
    createSession(req, res, user, body.remember === true);
    res.json({ user: publicUser(user) });
  });

  app.post("/auth/forgot-password", rateLimit(5, 60 * 60 * 1000), async (req, res) => {
    if (!mailTransport || !mailFrom)
      return sendError(
        res,
        503,
        "EMAIL_NOT_CONFIGURED",
        "ارسال ایمیل بازیابی در سرور پیکربندی نشده است.",
      );
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    if (!validEmail(email))
      return sendError(res, 400, "VALIDATION", "قالب ایمیل درست نیست.", {
        email: "قالب ایمیل درست نیست.",
      });
    const user = db.prepare("SELECT id, email FROM users WHERE email = ?").get(email);
    if (user) {
      const token = crypto.randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + RESET_TTL_MS).toISOString();
      db.prepare("DELETE FROM password_resets WHERE user_id = ?").run(user.id);
      db.prepare("INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(
        hashToken(token),
        user.id,
        expiresAt,
      );
      const link = `${appUrl}/account.html?token=${encodeURIComponent(token)}#reset`;
      try {
        await mailTransport.sendMail({
          from: mailFrom,
          to: user.email,
          subject: "بازیابی گذرواژهٔ دارا",
          text: `برای تعیین گذرواژهٔ جدید، این لینک را تا یک ساعت آینده باز کنید:\n${link}`,
          html: `<p>برای تعیین گذرواژهٔ جدید، لینک زیر را تا یک ساعت آینده باز کنید:</p><p><a href="${link}">بازیابی گذرواژه</a></p>`,
        });
      } catch (error) {
        db.prepare("DELETE FROM password_resets WHERE token_hash = ?").run(hashToken(token));
        throw error;
      }
    }
    res.json({ message: "اگر برای این ایمیل حسابی وجود داشته باشد، لینک بازیابی ارسال می‌شود." });
  });

  app.post("/auth/reset-password", rateLimit(10, 60 * 60 * 1000), async (req, res) => {
    const { token, new_password: password } = req.body || {};
    const passwordMessage = passwordError(password);
    if (typeof token !== "string" || token.length < 32 || passwordMessage)
      return sendError(res, 400, "VALIDATION", "اطلاعات بازیابی معتبر نیست.", {
        ...(passwordMessage ? { password: passwordMessage } : {}),
        ...(typeof token !== "string" || token.length < 32
          ? { form: "لینک بازیابی معتبر نیست یا زمان آن گذشته است." }
          : {}),
      });
    const reset = db
      .prepare("SELECT user_id FROM password_resets WHERE token_hash = ? AND expires_at > ?")
      .get(hashToken(token), new Date().toISOString());
    if (!reset)
      return sendError(res, 400, "INVALID_RESET_TOKEN", "لینک بازیابی معتبر نیست یا زمان آن گذشته است.");
    const { salt, hash } = await hashPassword(password);
    runTransaction(() => {
      db.prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?").run(
        hash,
        salt,
        reset.user_id,
      );
      db.prepare("DELETE FROM sessions WHERE user_id = ?").run(reset.user_id      );
      db.prepare("DELETE FROM password_resets WHERE user_id = ?").run(reset.user_id);
    });
    clearSessionCookie(res);
    res.json({ message: "گذرواژه تغییر کرد." });
  });

  app.post("/auth/logout", (req, res) => {
    if (req.authSession)
      db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(req.authSession.tokenHash);
    clearSessionCookie(res);
    res.status(204).end();
  });

  app.get("/me", (req, res) => {
    if (!req.authUser) return sendError(res, 401, "UNAUTHORIZED", "ابتدا وارد حساب خود شوید.");
    res.json(publicUser(req.authUser));
  });

  app.patch("/me", rateLimit(30, 15 * 60 * 1000), (req, res) => {
    if (!req.authUser) return sendError(res, 401, "UNAUTHORIZED", "ابتدا وارد حساب خود شوید.");
    const body = req.body || {};
    const allowed = ["first_name", "last_name", "email", "preferred_language", "primary_currency"];
    if (Object.keys(body).some((key) => !allowed.includes(key)))
      return sendError(res, 400, "VALIDATION", "فیلدهای ارسالی معتبر نیستند.");

    const fields = {};
    if (body.first_name !== undefined) {
      const message = cleanName(body.first_name, true, "نام");
      if (message) fields.first_name = message;
    }
    if (body.last_name !== undefined) {
      const message = cleanName(body.last_name, false, "نام خانوادگی");
      if (message) fields.last_name = message;
    }
    if (body.email !== undefined && !validEmail(body.email))
      fields.email = "قالب ایمیل درست نیست.";
    if (body.preferred_language !== undefined && !["fa", "en"].includes(body.preferred_language))
      fields.preferred_language = "زبان انتخاب‌شده معتبر نیست.";
    if (body.primary_currency !== undefined && !["IRT", "IRR", "USD"].includes(body.primary_currency))
      fields.primary_currency = "واحد پول انتخاب‌شده معتبر نیست.";
    if (Object.keys(fields).length)
      return sendError(res, 400, "VALIDATION", "اطلاعات فرم معتبر نیست.", fields);

    const values = {};
    for (const key of allowed) {
      if (body[key] !== undefined) values[key] = key === "email" ? body[key].trim().toLowerCase() :
        typeof body[key] === "string" ? body[key].trim() : body[key];
    }
    try {
      const keys = Object.keys(values);
      if (keys.length) {
        db.prepare(
          `UPDATE users SET ${keys.map((key) => `${key} = ?`).join(", ")} WHERE id = ?`,
        ).run(...keys.map((key) => values[key]), req.authUser.id);
        if (values.email !== undefined && values.email !== req.authUser.email)
          db.prepare("DELETE FROM password_resets WHERE user_id = ?").run(req.authUser.id);
      }
    } catch (error) {
      if (isDuplicateEmail(error))
        return sendError(res, 409, "EMAIL_IN_USE", "این ایمیل قبلاً ثبت شده است.", {
          email: "این ایمیل قبلاً ثبت شده است.",
        });
      throw error;
    }
    res.json(publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(req.authUser.id)));
  });

  app.post("/auth/change-password", rateLimit(10, 15 * 60 * 1000), async (req, res) => {
    if (!req.authUser) return sendError(res, 401, "UNAUTHORIZED", "ابتدا وارد حساب خود شوید.");
    const { current_password: currentPassword, new_password: newPassword } = req.body || {};
    const passwordMessage = passwordError(newPassword);
    if (typeof currentPassword !== "string" || !currentPassword || passwordMessage)
      return sendError(res, 400, "VALIDATION", "اطلاعات فرم معتبر نیست.", {
        ...(!currentPassword ? { current_password: "گذرواژه‌ی فعلی را وارد کنید." } : {}),
        ...(passwordMessage ? { new_password: passwordMessage } : {}),
      });
    if (!(await verifyPassword(currentPassword, req.authUser)))
      return sendError(res, 400, "INVALID_PASSWORD", "گذرواژه‌ی فعلی درست نیست.");
    const { salt, hash } = await hashPassword(newPassword);
    runTransaction(() => {
      db.prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?").run(
        hash,
        salt,
        req.authUser.id,
      );
      db.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?").run(
        req.authUser.id,
        req.authSession.tokenHash,
      );
      db.prepare("DELETE FROM password_resets WHERE user_id = ?").run(req.authUser.id);
    });
    res.json({ message: "گذرواژه تغییر کرد." });
  });

  app.get("/auth/sessions", (req, res) => {
    if (!req.authUser) return sendError(res, 401, "UNAUTHORIZED", "ابتدا وارد حساب خود شوید.");
    const sessions = db
      .prepare(
        `SELECT token_hash, created_at, last_seen, user_agent
         FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY last_seen DESC`,
      )
      .all(req.authUser.id, new Date().toISOString())
      .map((session) => ({
        current: session.token_hash === req.authSession.tokenHash,
        device: session.user_agent || "دستگاه نامشخص",
        last_seen: session.last_seen,
      }));
    res.json(sessions);
  });

  app.delete("/me", rateLimit(5, 60 * 60 * 1000), async (req, res) => {
    if (!req.authUser) return sendError(res, 401, "UNAUTHORIZED", "ابتدا وارد حساب خود شوید.");
    if (typeof req.body?.password !== "string" || !(await verifyPassword(req.body.password, req.authUser)))
      return sendError(res, 400, "INVALID_PASSWORD", "گذرواژه درست نیست.");
    db.prepare("DELETE FROM users WHERE id = ?").run(req.authUser.id);
    clearSessionCookie(res);
    res.status(204).end();
  });

  app.get("/api/health", (req, res) => res.json({ status: "ok" }));
  app.use((req, res, next) => {
    if (!["GET", "HEAD"].includes(req.method)) return next();
    let file;
    try {
      file = decodeURIComponent(req.path.slice(1));
    } catch {
      return res.status(400).end();
    }
    if (!file) file = "index.html";
    if (file.includes("/") || !PUBLIC_FILES.has(file)) return next();
    res.sendFile(path.join(ROOT, file), (error) => {
      if (error && !res.headersSent) next(error);
    });
  });
  app.use("/auth", (req, res) =>
    sendError(res, 404, "NOT_FOUND", "مسیر احراز هویت پیدا نشد."),
  );
  app.use("/me", (req, res) => sendError(res, 404, "NOT_FOUND", "مسیر پیدا نشد."));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.type === "entity.parse.failed")
      return sendError(res, 400, "INVALID_JSON", "فرمت درخواست معتبر نیست.");
    console.error("Request failed:", error);
    return sendError(res, 500, "INTERNAL_ERROR", "خطای داخلی سرور رخ داد.");
  });

  app.locals.close = () => db.close();
  app.locals.db = db;
  return app;
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  const app = createApp();
  app.listen(port, () => {
    console.log(`Dara is running at ${process.env.APP_URL || `http://localhost:${port}`}`);
    if (!process.env.SMTP_HOST)
      console.warn("SMTP is not configured; password recovery emails are disabled.");
  });
}

module.exports = { createApp };
