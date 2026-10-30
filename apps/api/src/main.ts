import { createApp } from "./app.js";
import { readConfig } from "./config/env.js";
import { createDatabaseClient } from "./database/client.js";
import { PrismaAuthRepository } from "./database/prisma-auth.repository.js";
import { PrismaFinanceRepository } from "./finance/finance.repository.js";
import { createMailer } from "./mail/index.js";

// نقطهٔ ورود تنها جای ساخت کلاینت دیتابیس، SMTP و listener است.
async function start(): Promise<void> {
  const config = readConfig();
  const prisma = createDatabaseClient(
    config.databaseUrl,
    config.databasePoolMax,
    config.databaseSslCaFile,
  );
  await prisma.$connect();
  const repository = new PrismaAuthRepository(prisma);
  await repository.deleteExpired(new Date());
  // پاک‌سازی نشست/توکن منقضی فقط هنگام راه‌اندازی کافی نیست؛ در سرور همیشه‌روشن هر شش ساعت تکرار می‌شود.
  setInterval(
    () => {
      void repository.deleteExpired(new Date()).catch((error: unknown) => {
        console.error("Expired session cleanup failed:", {
          name: error instanceof Error ? error.name : "UnknownError",
        });
      });
    },
    6 * 60 * 60 * 1000,
  ).unref();
  const mailer = createMailer({
    smtpPort: config.smtpPort,
    smtpSecure: config.smtpSecure,
    ...(config.mailFrom ? { mailFrom: config.mailFrom } : {}),
    ...(config.brevoApiKey ? { brevoApiKey: config.brevoApiKey } : {}),
    ...(config.smtpHost ? { smtpHost: config.smtpHost } : {}),
    ...(config.smtpUser ? { smtpUser: config.smtpUser } : {}),
    ...(config.smtpPassword ? { smtpPassword: config.smtpPassword } : {}),
  });
  // ثبت‌نام و ورود با نام کاربری به ایمیل نیاز ندارند؛ فقط بازیابی گذرواژه به ترابری ایمیل وابسته است.
  if (!mailer)
    console.warn("No e-mail transport configured (BREVO_API_KEY or SMTP); password reset e-mails are disabled.");

  const app = createApp({
    config,
    auth: { repository, appUrl: config.appUrl, mailer, mailFrom: config.mailFrom },
    finance: new PrismaFinanceRepository(prisma),
    databaseHealth: async () => {
      await prisma.$queryRaw`SELECT NOW()`;
    },
  });
  const server = app.listen(config.port, () => {
    console.info(`Dara API listening on port ${config.port}`);
  });

  const shutdown = async (signal: string) => {
    console.info(`Received ${signal}; closing the API server.`);
    server.close(async (error) => {
      if (error) {
        console.error("Failed to close API server:", error);
        process.exitCode = 1;
      }
      await prisma.$disconnect();
    });
  };
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

start().catch((error: unknown) => {
  console.error("Dara API could not start:", {
    name: error instanceof Error ? error.name : "UnknownError",
    message:
      error instanceof Error
        ? error.message.replace(/(postgres(?:ql)?:\/\/)[^@\s]+@/gi, "$1[redacted]@")
        : "Check the PostgreSQL configuration.",
  });
  process.exitCode = 1;
});
