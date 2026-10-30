import { createApp } from "./app.js";
import { readConfig } from "./config/env.js";
import { createDatabaseClient } from "./database/client.js";
import { PrismaAuthRepository } from "./database/prisma-auth.repository.js";
import { PrismaFinanceRepository } from "./finance/finance.repository.js";
import { createTransport } from "nodemailer";

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
  const mailer =
    config.smtpHost && config.smtpFrom
      ? createTransport({
          host: config.smtpHost,
          port: config.smtpPort,
          secure: config.smtpSecure,
          ...(config.smtpUser && config.smtpPassword
            ? { auth: { user: config.smtpUser, pass: config.smtpPassword } }
            : {}),
        })
      : null;
  if (config.nodeEnv === "production" && !mailer)
    throw new Error("SMTP_HOST و SMTP_FROM برای احراز ایمیل در production الزامی هستند.");

  const app = createApp({
    config,
    auth: { repository, appUrl: config.appUrl, mailer, mailFrom: config.smtpFrom },
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
