import { z } from "zod";

const email = z
  .string()
  .trim()
  .email("قالب ایمیل درست نیست.")
  .max(254, "ایمیل بیش از اندازه طولانی است.")
  .transform((value) => value.toLowerCase());
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
    first_name: name,
    last_name: optionalName,
    email,
    password,
    accepted_terms: z.literal(true, {
      error: "برای ادامه باید شرایط را بپذیرید.",
    }),
  })
  .strict();

export const loginSchema = z
  .object({
    email,
    password: z.string().min(1).max(128),
    remember: z.boolean().optional().default(false),
  })
  .strict();

export const forgotPasswordSchema = z.object({ email }).strict();
export const verifyEmailSchema = z.object({ token: z.string().min(32).max(128) }).strict();
export const resendVerificationSchema = z.object({ email }).strict();
export const resetPasswordSchema = z
  .object({ token: z.string().min(32).max(128), new_password: password })
  .strict();
export const changePasswordSchema = z
  .object({ current_password: z.string().min(1).max(128), new_password: password })
  .strict();
export const deleteAccountSchema = z.object({ password: z.string().min(1).max(128) }).strict();

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
