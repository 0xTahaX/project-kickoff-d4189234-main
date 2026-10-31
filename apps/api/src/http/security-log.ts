import { createHash } from "node:crypto";

// رویدادهای امنیتی به شکل JSON یک‌خطی لاگ می‌شوند تا در Render/لog aggregator قابل جست‌وجو باشند.
// هیچ رمز، توکن یا دادهٔ مالی در این رکوردها نوشته نمی‌شود؛ شناسهٔ کاربر با hash کوتاه ثبت می‌شود.
export type SecurityEvent =
  | "registration_success"
  | "login_success"
  | "login_failure"
  | "logout"
  | "password_reset_requested"
  | "password_reset_completed"
  | "password_changed"
  | "account_deleted"
  | "authorization_denied";

interface SecurityEventDetails {
  ip?: string | undefined;
  username?: string | undefined;
  route?: string | undefined;
  reason?: string | undefined;
}

// برای همبستگی رخدادها کافی است و نام کاربری خام را در لاگ نگه نمی‌دارد.
export function actorHash(username: string): string {
  return createHash("sha256").update(username.trim().toLowerCase()).digest("hex").slice(0, 12);
}

export function logSecurityEvent(
  event: SecurityEvent,
  details: SecurityEventDetails = {},
): void {
  const record = {
    level: "security",
    event,
    at: new Date().toISOString(),
    ...(details.ip ? { ip: details.ip } : {}),
    ...(details.username ? { actor: actorHash(details.username) } : {}),
    ...(details.route ? { route: details.route } : {}),
    ...(details.reason ? { reason: details.reason } : {}),
  };
  console.info(JSON.stringify(record));
}
