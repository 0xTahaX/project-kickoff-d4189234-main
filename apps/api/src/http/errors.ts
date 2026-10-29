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
