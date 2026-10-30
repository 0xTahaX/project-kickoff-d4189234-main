import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import type { PasswordCredential, User } from "../domain/auth.js";

const keyLength = 64;
const options = { N: 32_768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function deriveKey(value: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(value, salt, keyLength, options, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

// scrypt با salt مستقل برای هر کاربر، ذخیرهٔ گذرواژهٔ خام را حذف می‌کند.
export async function hashPassword(value: string): Promise<PasswordCredential> {
  const salt = randomBytes(16);
  const key = await deriveKey(value, salt);
  return { passwordSalt: salt.toString("hex"), passwordHash: key.toString("hex") };
}

// حساب ساخته‌شده با Google گذرواژه ندارد؛ چنین حسابی هرگز با گذرواژه وارد نمی‌شود.
const dummySalt = randomBytes(16);
export async function verifyPassword(value: string, user: User | null): Promise<boolean> {
  const usable = Boolean(user?.passwordSalt && user.passwordHash);
  // برای نام کاربری ناموجود یا حساب بدون گذرواژه نیز scrypt اجرا می‌شود تا اختلاف زمان پاسخ،
  // وجود حساب را لو ندهد.
  const salt = usable ? Buffer.from(user!.passwordSalt!, "hex") : dummySalt;
  const expected = usable ? Buffer.from(user!.passwordHash!, "hex") : Buffer.alloc(keyLength);
  const actual = await deriveKey(value, salt);
  return Boolean(usable && actual.length === expected.length && timingSafeEqual(actual, expected));
}
