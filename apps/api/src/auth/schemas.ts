import { z } from "zod";
import {
  normalizeUsername,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
} from "./username.js";

// ایمیل اختیاری است و فقط برای بازیابی گذرواژه استفاده می‌شود؛ ورود به آن وابسته نیست.
const email = z
  .string()
  .trim()
  .email("قالب ایمیل درست نیست.")
  .max(254, "ایمیل بیش از اندازه طولانی است.")
  .transform((value) => value.toLowerCase());
const optionalEmail = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  email.optional(),
);
// نام کاربری ورود (= ثبت‌نام) همیشه یکسان‌سازی می‌شود تا بزرگی/کوچکی حرف و «ی/ک» عربی
// حساب دیگری نسازد.
const username = z
  .string({ error: "نام کاربری را وارد کنید." })
  .transform(normalizeUsername)
  .refine(
    (value) => value.length >= USERNAME_MIN_LENGTH,
    `نام کاربری باید حداقل ${USERNAME_MIN_LENGTH} کاراکتر باشد.`,
  )
  .refine(
    (value) => value.length <= USERNAME_MAX_LENGTH,
    `نام کاربری نمی‌تواند بیشتر از ${USERNAME_MAX_LENGTH} کاراکتر باشد.`,
  )
  .refine(
    (value) => USERNAME_PATTERN.test(value),
    "نام کاربری باید با حرف شروع شود و فقط شامل حرف، عدد، نقطه، خط تیره و زیرخط باشد.",
  );
const password = z
  .string()
  .min(10, "گذرواژه باید حداقل ۱۰ کاراکتر باشد.")
  .max(128, "گذرواژه نمی‌تواند بیشتر از ۱۲۸ کاراکتر باشد.")
  .refine((value) => /\p{L}/u.test(value), "گذرواژه باید شامل حرف باشد.")
  .refine((value) => /\p{N}/u.test(value), "گذرواژه باید شامل عدد باشد.");
const name = z.string().trim().min(1, "این فیلد الزامی است.").max(50, "حداکثر ۵۰ کاراکتر مجاز است.");
const optionalName = z
  .string()
  .trim()
  .max(50, "حداکثر ۵۰ کاراکتر مجاز است.")
  .optional()
  .default("");

// هر مسیر قرارداد ورودی جداگانه دارد تا فیلدهای اضافی و mass assignment رد شوند.
export const registerSchema = z
  .object({
    first_name: optionalName,
    last_name: optionalName,
    username,
    password,
    email: optionalEmail,
    accepted_terms: z.literal(true, {
      error: "برای ادامه باید شرایط را بپذیرید.",
    }),
  })
  .strict();

export const loginSchema = z
  .object({
    username,
    password: z
      .string({ error: "گذرواژه را وارد کنید." })
      .min(1, "گذرواژه را وارد کنید.")
      .max(128),
    remember: z.boolean().optional().default(false),
  })
  .strict();

export const forgotPasswordSchema = z.object({ email }).strict();
export const resetPasswordSchema = z
  .object({ token: z.string().min(32).max(128), new_password: password })
  .strict();
export const changePasswordSchema = z
  .object({
    current_password: z.string({ error: "گذرواژه را وارد کنید." }).min(1).max(128),
    new_password: password,
  })
  .strict();
export const deleteAccountSchema = z
  .object({ password: z.string({ error: "گذرواژه را وارد کنید." }).min(1).max(128) })
  .strict();

// تبدیل نام‌های فرم قدیمی به نام‌های داخلی whitelist شده، بدون پذیرش فیلدهای دیگر.
export const profileSchema = z
  .object({
    first_name: name.optional(),
    last_name: z.string().trim().max(50).optional(),
    preferred_language: z.enum(["fa", "en"]).optional(),
    primary_currency: z.enum(["IRR", "USD", "EUR", "GBP"]).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "حداقل یک فیلد برای به‌روزرسانی لازم است.");

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
