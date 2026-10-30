import type { ErrorRequestHandler, Response } from "express";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// شکل خطاهای API در همهٔ مسیرها یکسان است و جزئیات داخلی به کاربر نمی‌رسد.
export function sendError(
  response: Response,
  status: number,
  code: string,
  message: string,
  fields?: Record<string, string>,
): void {
  response.status(status).json({ code, message, ...(fields ? { fields } : {}) });
}

// Prisma نام ستون(های) نقض‌شده در یکتایی را در meta.target می‌گذارد؛ درایورها گاهی آرایه و
// گاهی نام index را به شکل رشته برمی‌گردانند، پس هر دو شکل خوانده می‌شود.
function uniqueTarget(error: unknown): string {
  if (typeof error !== "object" || error === null || !("meta" in error)) return "";
  const meta = (error as { meta?: { target?: unknown } }).meta;
  const target = meta?.target;
  if (Array.isArray(target)) return target.join(",");
  return typeof target === "string" ? target : "";
}

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof ApiError) {
    sendError(response, error.status, error.code, error.message, error.fields);
    return;
  }
  if (error instanceof ZodError) {
    const fields = Object.fromEntries(
      error.issues.map((issue) => [String(issue.path[0] || "form"), issue.message]),
    );
    sendError(response, 400, "VALIDATION", "اطلاعات فرم معتبر نیست.", fields);
    return;
  }
  const dbCode =
    typeof error === "object" && error !== null && "code" in error
      ? error.code
      : undefined;
  if (dbCode === "P2002") {
    // نام کاربری شناسهٔ ورود است و باید پیام جداگانه داشته باشد؛ سایر یکتایی‌ها مربوط به ایمیل‌اند.
    if (uniqueTarget(error).includes("username")) {
      sendError(response, 409, "USERNAME_IN_USE", "این نام کاربری قبلاً گرفته شده است.", {
        username: "این نام کاربری قبلاً گرفته شده است.",
      });
      return;
    }
    sendError(response, 409, "EMAIL_IN_USE", "این ایمیل قبلاً ثبت شده است.", {
      email: "این ایمیل قبلاً ثبت شده است.",
    });
    return;
  }
  if (dbCode === "P2025") {
    sendError(response, 404, "NOT_FOUND", "رکورد موردنظر پیدا نشد.");
    return;
  }
  console.error("Unhandled API error:", {
    name: error instanceof Error ? error.name : "UnknownError",
  });
  sendError(response, 500, "INTERNAL_ERROR", "خطای داخلی سرور رخ داد.");
};
