import { createTransport } from "nodemailer";
import type { Mailer } from "../auth/routes.js";
import { BrevoMailer } from "./brevo.js";

export interface MailerSettings {
  mailFrom?: string;
  brevoApiKey?: string;
  smtpHost?: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser?: string;
  smtpPassword?: string;
}

// ترتیب انتخاب: اول API روی HTTPS (چون Render Free پورت‌های SMTP را می‌بندد)، بعد SMTP برای
// توسعهٔ محلی یا میزبانی که SMTP را باز می‌گذارد. بدون فرستنده، هیچ ترابری ساخته نمی‌شود.
export function createMailer(settings: MailerSettings): Mailer | null {
  if (!settings.mailFrom) return null;
  if (settings.brevoApiKey) return new BrevoMailer(settings.brevoApiKey);
  if (!settings.smtpHost) return null;
  return createTransport({
    host: settings.smtpHost,
    port: settings.smtpPort,
    secure: settings.smtpSecure,
    ...(settings.smtpUser && settings.smtpPassword
      ? { auth: { user: settings.smtpUser, pass: settings.smtpPassword } }
      : {}),
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
}

export { BrevoMailer };
