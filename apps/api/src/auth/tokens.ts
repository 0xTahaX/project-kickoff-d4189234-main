import { createHash, randomBytes } from "node:crypto";

// توکن تصادفی فقط یک‌بار به مرورگر داده می‌شود؛ دیتابیس تنها digest آن را می‌بیند.
export function createOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
