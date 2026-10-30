-- ورود از این پس با نام کاربری و گذرواژه انجام می‌شود؛ تأیید ایمیل از جریان ثبت‌نام حذف شده است.
-- ایمیل و گذرواژه اختیاری می‌شوند تا هنگام افزودن ورود Google، حساب بدون گذرواژه هم ممکن باشد.

ALTER TABLE "users" ADD COLUMN "username" VARCHAR(32);

-- حساب‌های قدیمی نام کاربری ندارند؛ از بخش محلی ایمیل آن‌ها به‌همراه ۸ نویسهٔ شناسه ساخته می‌شود
-- تا هم قابل حدس نباشد و هم بدون برخورد یکتا بماند. حرف اول همیشه حرف لاتین است تا با قاعدهٔ
-- اعتبارسنجی نام کاربری در API بخواند.
WITH derived AS (
    SELECT
        "id",
        LEFT(
            COALESCE(
                NULLIF(regexp_replace(lower(split_part("email", '@', 1)), '[^a-z0-9_.-]', '', 'g'), ''),
                'user'
            ),
            22
        ) AS base
    FROM "users"
)
UPDATE "users" AS u
SET "username" =
    (CASE WHEN d.base ~ '^[a-z]' THEN d.base ELSE 'u' || d.base END)
    || '_'
    || LEFT(replace(u."id"::text, '-', ''), 8)
FROM derived AS d
WHERE u."id" = d."id";

ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;

ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;
ALTER TABLE "users" ALTER COLUMN "password_salt" DROP NOT NULL;

-- تأیید ایمیل دیگر بخشی از ورود نیست؛ ستون و جدول مربوطه حذف می‌شوند.
ALTER TABLE "users" DROP COLUMN "email_verified_at";
DROP TABLE "email_verifications";

CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
