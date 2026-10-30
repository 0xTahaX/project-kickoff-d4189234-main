import type { SendMailOptions } from "nodemailer";
import type { Mailer } from "../auth/routes.js";

// Render Free ترافیک خروجی به پورت‌های SMTP (25/465/587) را مسدود می‌کند؛ بنابراین در production
// ایمیل از طریق API روی HTTPS (پورت ۴۴۳) ارسال می‌شود. این کلاس همان قرارداد Mailer را دارد.
const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";
const REQUEST_TIMEOUT_MS = 10_000;

interface Address {
  email: string;
  name?: string;
}

// "Dara <no-reply@example.com>" و "no-reply@example.com" هر دو پذیرفته می‌شوند.
export function parseAddress(value: SendMailOptions["from"]): Address {
  const raw =
    typeof value === "string"
      ? value
      : value && typeof value === "object" && "address" in value
        ? `${value.name ?? ""} <${String(value.address)}>`
        : "";
  const trimmed = raw.trim();
  const match = /^(.*?)\s*<([^<>]+)>\s*$/.exec(trimmed);
  const address = (match ? match[2]! : trimmed).trim();
  if (!/^[^@\s]+@[^@\s]+$/.test(address))
    throw new Error("MAIL_FROM آدرس ایمیل معتبری نیست.");
  const name = (match?.[1] ?? "").replace(/^"|"$/g, "").trim();
  return { email: address, ...(name ? { name } : {}) };
}

function recipients(value: SendMailOptions["to"]): Address[] {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return list.map((entry) => {
    if (typeof entry === "string") return { email: entry.trim() };
    if (entry && typeof entry === "object" && "address" in entry)
      return {
        email: String(entry.address),
        ...(entry.name ? { name: entry.name } : {}),
      };
    throw new Error("گیرندهٔ ایمیل معتبر نیست.");
  });
}

export class BrevoMailer implements Mailer {
  constructor(
    private readonly apiKey: string,
    private readonly endpoint: string = BREVO_ENDPOINT,
  ) {}

  async sendMail(message: SendMailOptions): Promise<unknown> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "api-key": this.apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: parseAddress(message.from),
        to: recipients(message.to),
        subject: String(message.subject ?? ""),
        ...(typeof message.html === "string" ? { htmlContent: message.html } : {}),
        ...(typeof message.text === "string" ? { textContent: message.text } : {}),
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok)
      // بدنهٔ پاسخ عمداً خوانده/لاگ نمی‌شود؛ می‌تواند نشانی گیرنده را برگرداند.
      throw new Error(`Brevo API responded with ${response.status}.`);
    return response.json().catch(() => ({}));
  }
}
