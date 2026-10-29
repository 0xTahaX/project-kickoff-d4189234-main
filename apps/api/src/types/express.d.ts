import type { Session, User } from "../domain/auth.js";

declare global {
  namespace Express {
    interface Request {
      authUser: User | null;
      authSession: Session | null;
      rawSessionToken: string | null;
    }
  }
}

export {};
