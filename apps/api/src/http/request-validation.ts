import type { RequestHandler } from "express";
import type { ZodType } from "zod";

// اعتبارسنجی در مرز HTTP انجام می‌شود و کنترلر فقط دادهٔ parse شده را می‌بیند.
export function validateBody(schema: ZodType): RequestHandler {
  return (request, _response, next) => {
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      next(parsed.error);
      return;
    }
    request.body = parsed.data;
    next();
  };
}
