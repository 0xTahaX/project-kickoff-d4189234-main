// این انواع مرز داده‌های احراز هویت را مشخص می‌کنند و جزئیات Prisma را از منطق دامنه جدا نگه می‌دارند.
export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  emailVerifiedAt: Date | null;
  passwordHash: string;
  passwordSalt: string;
  preferredLanguage: string;
  primaryCurrency: string;
  acceptedTermsAt: Date;
  createdAt: Date;
}

export interface NewUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  acceptedTermsAt: Date;
}

export interface Session {
  tokenHash: string;
  userId: string;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  userAgent: string;
}

export interface NewSession {
  tokenHash: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
  userAgent: string;
}

export interface ProfileUpdate {
  firstName?: string;
  lastName?: string;
  preferredLanguage?: string;
  primaryCurrency?: string;
}

export interface PasswordCredential {
  passwordHash: string;
  passwordSalt: string;
}

export interface SessionSummary {
  tokenHash: string;
  createdAt: Date;
  lastSeenAt: Date;
  userAgent: string;
}

// این contract اجازه می‌دهد مسیرهای HTTP بدون اتصال واقعی به PostgreSQL نیز تست شوند.
export interface AuthRepository {
  createUser(user: NewUser): Promise<User>;
  createEmailVerification(tokenHash: string, userId: string, expiresAt: Date): Promise<void>;
  deleteEmailVerification(tokenHash: string): Promise<void>;
  consumeEmailVerification(tokenHash: string, now: Date): Promise<User | null>;
  findUserByEmail(email: string): Promise<User | null>;
  findUserById(id: string): Promise<User | null>;
  updateProfile(id: string, update: ProfileUpdate): Promise<User>;
  createSession(session: NewSession): Promise<void>;
  findActiveSession(tokenHash: string, now: Date): Promise<{ session: Session; user: User } | null>;
  touchSession(tokenHash: string, lastSeenAt: Date): Promise<void>;
  listSessions(userId: string, now: Date): Promise<SessionSummary[]>;
  deleteSession(tokenHash: string): Promise<void>;
  deleteSessionsForUser(userId: string): Promise<void>;
  deleteOtherSessions(userId: string, currentTokenHash: string): Promise<void>;
  createPasswordReset(tokenHash: string, userId: string, expiresAt: Date): Promise<void>;
  deletePasswordReset(tokenHash: string): Promise<void>;
  findPasswordReset(tokenHash: string, now: Date): Promise<{ userId: string } | null>;
  completePasswordReset(userId: string, credential: PasswordCredential): Promise<void>;
  changePassword(
    userId: string,
    credential: PasswordCredential,
    currentTokenHash: string,
  ): Promise<void>;
  deleteUser(userId: string): Promise<void>;
  deleteExpired(now: Date): Promise<void>;
}
