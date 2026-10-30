import { z } from "zod";

const optionalValue = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().optional(),
);

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  WEB_ORIGIN: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().url().optional(),
  ),
  APP_URL: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().url().optional(),
  ),
  RENDER_EXTERNAL_URL: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().url().optional(),
  ),
  DATABASE_URL: z.string().min(1, "DATABASE_URL باید به PostgreSQL اشاره کند."),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(20).default(5),
  DATABASE_SSL_CA_FILE: optionalValue,
  SMTP_HOST: optionalValue,
  SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(587),
  SMTP_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  SMTP_USER: optionalValue,
  SMTP_PASS: optionalValue,
  SMTP_FROM: optionalValue,
}).superRefine((value, context) => {
  if (Boolean(value.SMTP_USER) !== Boolean(value.SMTP_PASS)) {
    context.addIssue({
      code: "custom",
      path: ["SMTP_USER"],
      message: "SMTP_USER و SMTP_PASS باید هر دو تنظیم شوند.",
    });
  }
});

export type AppConfig = {
  nodeEnv: "development" | "test" | "production";
  port: number;
  webOrigin: string;
  appUrl: string;
  databaseUrl: string;
  databasePoolMax: number;
  databaseSslCaFile?: string;
  smtpHost?: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser?: string;
  smtpPassword?: string;
  smtpFrom?: string;
};

// اعتبارسنجی متغیرهای محیطی هنگام راه‌اندازی، خطاهای پیکربندی را زود و واضح گزارش می‌کند.
export function readConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = environmentSchema.safeParse(environment);
  if (!result.success) {
    const messages = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`پیکربندی محیط معتبر نیست:\n${messages.join("\n")}`);
  }
  const value = result.data;
  const appUrl = value.APP_URL ?? value.RENDER_EXTERNAL_URL ?? "http://localhost:5173";
  return {
    nodeEnv: value.NODE_ENV,
    port: value.PORT,
    webOrigin: (value.WEB_ORIGIN ?? appUrl).replace(/\/+$/, ""),
    appUrl: appUrl.replace(/\/+$/, ""),
    databaseUrl: value.DATABASE_URL,
    databasePoolMax: value.DATABASE_POOL_MAX,
    ...(value.DATABASE_SSL_CA_FILE
      ? { databaseSslCaFile: value.DATABASE_SSL_CA_FILE }
      : {}),
    ...(value.SMTP_HOST ? { smtpHost: value.SMTP_HOST } : {}),
    smtpPort: value.SMTP_PORT,
    smtpSecure: value.SMTP_SECURE,
    ...(value.SMTP_USER ? { smtpUser: value.SMTP_USER } : {}),
    ...(value.SMTP_PASS ? { smtpPassword: value.SMTP_PASS } : {}),
    ...(value.SMTP_FROM ? { smtpFrom: value.SMTP_FROM } : {}),
  };
}
