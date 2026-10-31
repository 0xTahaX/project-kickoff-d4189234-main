import type { PrismaClient } from "../generated/prisma/client.js";
import type {
  AuthRepository,
  NewSession,
  NewUser,
  PasswordCredential,
  ProfileUpdate,
  Session,
  SessionSummary,
  User,
} from "../domain/auth.js";

// اتصال اولیه به Supabase از منطقه‌ای دور، بیشتر از مهلت پیش‌فرض Prisma (۵ ثانیه) برای باز
// کردن یک تراکنش طول می‌کشد؛ بنابراین مهلت انتظار به‌صراحت و یک‌جا برای همهٔ تراکنش‌ها تنظیم می‌شود.
export const TRANSACTION_MAX_WAIT_MS = 20_000;

// این آداپتر همهٔ دسترسی‌های Prisma را متمرکز می‌کند؛ سرویس دامنه به ORM وابسته نیست.
export class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly prisma: PrismaClient) {}

  createUser(user: NewUser): Promise<User> {
    return this.prisma.user.create({ data: user });
  }

  findUserByUsername(username: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { username } });
  }

  findUserByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findUserById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  updateProfile(id: string, update: ProfileUpdate): Promise<User> {
    return this.prisma.user.update({ where: { id }, data: update });
  }

  async createSession(session: NewSession): Promise<void> {
    await this.prisma.session.create({ data: session });
  }

  async findActiveSession(
    tokenHash: string,
    now: Date,
  ): Promise<{ session: Session; user: User } | null> {
    const result = await this.prisma.session.findFirst({
      where: { tokenHash, expiresAt: { gt: now } },
      include: { user: true },
    });
    if (!result) return null;
    const { user, ...session } = result;
    return { session, user };
  }

  async touchSession(tokenHash: string, lastSeenAt: Date): Promise<void> {
    await this.prisma.session.updateMany({ where: { tokenHash }, data: { lastSeenAt } });
  }

  listSessions(userId: string, now: Date): Promise<SessionSummary[]> {
    return this.prisma.session.findMany({
      where: { userId, expiresAt: { gt: now } },
      orderBy: { lastSeenAt: "desc" },
      select: { tokenHash: true, createdAt: true, lastSeenAt: true, userAgent: true },
    });
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { tokenHash } });
  }

  async deleteSessionsForUser(userId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { userId } });
  }

  async deleteOtherSessions(userId: string, currentTokenHash: string): Promise<void> {
    await this.prisma.session.deleteMany({
      where: { userId, tokenHash: { not: currentTokenHash } },
    });
  }

  async createPasswordReset(tokenHash: string, userId: string, expiresAt: Date): Promise<void> {
    await this.prisma.$transaction(
      [
        this.prisma.passwordReset.deleteMany({ where: { userId } }),
        this.prisma.passwordReset.create({ data: { tokenHash, userId, expiresAt } }),
      ],
      { maxWait: TRANSACTION_MAX_WAIT_MS },
    );
  }

  async deletePasswordReset(tokenHash: string): Promise<void> {
    await this.prisma.passwordReset.deleteMany({ where: { tokenHash } });
  }

  // مصرف اتمیک: ابتدا ردیف با شرط انقضا حذف می‌شود و فقط اگر همین فراخوانی موفق به حذف شد
  // گذرواژه تغییر می‌کند؛ درخواست‌های همزمان با یک توکن، دومی را رد می‌کند.
  async consumePasswordReset(
    tokenHash: string,
    now: Date,
    credential: PasswordCredential,
  ): Promise<boolean> {
    return this.prisma.$transaction(
      async (db) => {
        const reset = await db.passwordReset.findFirst({
          where: { tokenHash, expiresAt: { gt: now } },
          select: { userId: true },
        });
        if (!reset) return false;
        const claimed = await db.passwordReset.deleteMany({
          where: { tokenHash, expiresAt: { gt: now } },
        });
        if (!claimed.count) return false;
        await db.user.update({ where: { id: reset.userId }, data: credential });
        await db.session.deleteMany({ where: { userId: reset.userId } });
        await db.passwordReset.deleteMany({ where: { userId: reset.userId } });
        return true;
      },
      { maxWait: TRANSACTION_MAX_WAIT_MS, timeout: TRANSACTION_MAX_WAIT_MS },
    );
  }

  async changePassword(
    userId: string,
    credential: PasswordCredential,
    currentTokenHash: string,
  ): Promise<void> {
    await this.prisma.$transaction(
      [
        this.prisma.user.update({ where: { id: userId }, data: credential }),
        this.prisma.session.deleteMany({
          where: { userId, tokenHash: { not: currentTokenHash } },
        }),
        this.prisma.passwordReset.deleteMany({ where: { userId } }),
      ],
      { maxWait: TRANSACTION_MAX_WAIT_MS },
    );
  }

  async deleteUser(userId: string): Promise<void> {
    await this.prisma.user.delete({ where: { id: userId } });
  }

  async hasLedgerEntries(userId: string): Promise<boolean> {
    const accounts = await this.prisma.account.count({ where: { userId } });
    return accounts > 0;
  }

  async deleteExpired(now: Date): Promise<void> {
    await this.prisma.$transaction(
      [
        this.prisma.session.deleteMany({ where: { expiresAt: { lte: now } } }),
        this.prisma.passwordReset.deleteMany({ where: { expiresAt: { lte: now } } }),
      ],
      { maxWait: TRANSACTION_MAX_WAIT_MS, timeout: TRANSACTION_MAX_WAIT_MS },
    );
  }
}
