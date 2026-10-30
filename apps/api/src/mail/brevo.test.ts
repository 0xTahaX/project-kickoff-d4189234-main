import { afterEach, describe, expect, it, vi } from "vitest";
import type { SendMailOptions } from "nodemailer";
import { BrevoMailer, parseAddress } from "./brevo.js";
import { createMailer } from "./index.js";

const mail: SendMailOptions = {
  from: "Dara <no-reply@example.com>",
  to: "user@example.com",
  subject: "بازیابی گذرواژهٔ دارا",
  text: "plain",
  html: "<p>html</p>",
};

function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseAddress", () => {
  it("reads the display name and address", () => {
    expect(parseAddress("Dara <no-reply@example.com>")).toEqual({
      name: "Dara",
      email: "no-reply@example.com",
    });
  });

  it("accepts a bare address", () => {
    expect(parseAddress("no-reply@example.com")).toEqual({ email: "no-reply@example.com" });
  });

  it("rejects an invalid sender", () => {
    expect(() => parseAddress("not-an-email")).toThrow("معتبر");
  });
});

describe("BrevoMailer", () => {
  it("sends the reset mail through the HTTPS API", async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) => jsonResponse(201, { messageId: "1" }));
    vi.stubGlobal("fetch", fetchMock);

    await new BrevoMailer("api-key").sendMail(mail);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["api-key"]).toBe("api-key");
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.sender).toEqual({ name: "Dara", email: "no-reply@example.com" });
    expect(body.to).toEqual([{ email: "user@example.com" }]);
    expect(body.subject).toBe(mail.subject);
    expect(body.textContent).toBe("plain");
    expect(body.htmlContent).toBe("<p>html</p>");
  });

  it("fails with the status code only, without returning the provider body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(401, { message: "user@example.com blocked" })),
    );

    const error = await new BrevoMailer("bad-key").sendMail(mail).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Brevo API responded with 401.");
    expect((error as Error).message).not.toContain("user@example.com");
  });
});

describe("createMailer", () => {
  it("prefers Brevo because free hosting blocks SMTP ports", () => {
    const mailer = createMailer({
      mailFrom: "Dara <no-reply@example.com>",
      brevoApiKey: "key",
      smtpHost: "smtp.example.com",
      smtpPort: 587,
      smtpSecure: false,
    });
    expect(mailer).toBeInstanceOf(BrevoMailer);
  });

  it("falls back to SMTP when only SMTP is configured (local development)", () => {
    const mailer = createMailer({
      mailFrom: "no-reply@example.com",
      smtpHost: "127.0.0.1",
      smtpPort: 1025,
      smtpSecure: false,
    });
    expect(mailer).not.toBeNull();
    expect(typeof mailer!.sendMail).toBe("function");
  });

  it("returns null when no sender or transport is configured", () => {
    expect(createMailer({ smtpPort: 587, smtpSecure: false })).toBeNull();
    expect(
      createMailer({ mailFrom: "no-reply@example.com", smtpPort: 587, smtpSecure: false }),
    ).toBeNull();
  });
});
