import type { RequestHandler } from "express";
import type { AuthRepository } from "../domain/auth.js";
import { hashToken } from "./tokens.js";
import { ApiError } from "../http/errors.js";

export const SESSION_COOKIE = "dara_session";

// کوکی امن را به نشست سمت سرور وصل می‌کند؛ مقدار خام توکن فقط در درخواست جاری وجود دارد.
export function authentication(repository: AuthRepository): RequestHandler {
  return async (request, _response, next) => {
    request.authUser = null;
    request.authSession = null;
    request.rawSessionToken = null;
    const cookie = request.headers.cookie
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${SESSION_COOKIE}=`));
    if (!cookie) {
      next();
      return;
    }

    let token: string;
    try {
      token = decodeURIComponent(cookie.slice(SESSION_COOKIE.length + 1));
    } catch {
      next();
      return;
    }
    if (!token || token.length > 128) {
      next();
      return;
    }
    const active = await repository.findActiveSession(hashToken(token), new Date());
    // تأیید ایمیل شرط ورود نیست؛ نشست معتبر یعنی کاربر وارد شده است.
    if (active) {
      request.rawSessionToken = token;
      request.authSession = active.session;
      request.authUser = active.user;
      await repository.touchSession(active.session.tokenHash, new Date());
    }
    next();
  };
}

export const requireUser: RequestHandler = (request, _response, next) => {
  if (!request.authUser || !request.authSession) {
    next(new ApiError(401, "UNAUTHORIZED", "ابتدا وارد حساب خود شوید."));
    return;
  }
  next();
};
