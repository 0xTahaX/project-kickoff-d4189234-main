-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('CASH', 'BANK', 'SAVINGS', 'INVESTMENT');

-- CreateEnum
CREATE TYPE "CategoryKind" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "TransactionKind" AS ENUM ('INCOME', 'EXPENSE', 'TRANSFER');

-- CreateEnum
CREATE TYPE "DebtKind" AS ENUM ('OWED', 'OWED_TO_USER');

-- CreateEnum
CREATE TYPE "RecurringFrequency" AS ENUM ('WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "RecurringKind" AS ENUM ('INCOME', 'EXPENSE');

-- CreateTable
CREATE TABLE "currencies" (
    "code" CHAR(3) NOT NULL,
    "minor_units" SMALLINT NOT NULL,

    CONSTRAINT "currencies_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "first_name" VARCHAR(50) NOT NULL,
    "last_name" VARCHAR(50) NOT NULL DEFAULT '',
    "email" VARCHAR(254) NOT NULL,
    "password_hash" VARCHAR(128) NOT NULL,
    "password_salt" VARCHAR(64) NOT NULL,
    "preferred_language" CHAR(2) NOT NULL DEFAULT 'fa',
    "primary_currency" CHAR(3) NOT NULL DEFAULT 'IRR',
    "accepted_terms_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "user_agent" VARCHAR(300) NOT NULL DEFAULT '',

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_resets" (
    "token_hash" CHAR(64) NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "password_resets_pkey" PRIMARY KEY ("token_hash")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "type" "AccountType" NOT NULL,
    "opening_balance" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL DEFAULT 'IRR',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "kind" "CategoryKind" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "target_id" UUID,
    "category_id" UUID,
    "kind" "TransactionKind" NOT NULL,
    "amount" DECIMAL(20,6) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "description" VARCHAR(200) NOT NULL DEFAULT '',
    "note" VARCHAR(1000) NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budgets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "amount" DECIMAL(20,6) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "month" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "savings_goals" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "target" DECIMAL(20,6) NOT NULL,
    "saved" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL,
    "target_at" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "savings_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_payments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "category_id" UUID,
    "name" VARCHAR(100) NOT NULL,
    "kind" "RecurringKind" NOT NULL,
    "amount" DECIMAL(20,6) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "frequency" "RecurringFrequency" NOT NULL,
    "next_due_at" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recurring_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "kind" "DebtKind" NOT NULL,
    "principal" DECIMAL(20,6) NOT NULL,
    "outstanding" DECIMAL(20,6) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "due_at" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "debts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "quantity" DECIMAL(24,8) NOT NULL,
    "unit_value" DECIMAL(20,6) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "valued_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_expires_at_idx" ON "sessions"("user_id", "expires_at");

-- CreateIndex
CREATE INDEX "password_resets_user_id_idx" ON "password_resets"("user_id");

-- CreateIndex
CREATE INDEX "password_resets_expires_at_idx" ON "password_resets"("expires_at");

-- CreateIndex
CREATE INDEX "accounts_user_id_created_at_idx" ON "accounts"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_id_user_id_key" ON "accounts"("id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_id_user_id_key" ON "categories"("id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_user_id_name_kind_key" ON "categories"("user_id", "name", "kind");

-- CreateIndex
CREATE INDEX "transactions_user_id_occurred_at_idx" ON "transactions"("user_id", "occurred_at");

-- CreateIndex
CREATE INDEX "transactions_user_id_category_id_occurred_at_idx" ON "transactions"("user_id", "category_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "budgets_user_id_category_id_month_key" ON "budgets"("user_id", "category_id", "month");

-- CreateIndex
CREATE INDEX "savings_goals_user_id_target_at_idx" ON "savings_goals"("user_id", "target_at");

-- CreateIndex
CREATE INDEX "recurring_payments_user_id_next_due_at_idx" ON "recurring_payments"("user_id", "next_due_at");

-- CreateIndex
CREATE INDEX "debts_user_id_due_at_idx" ON "debts"("user_id", "due_at");

-- CreateIndex
CREATE INDEX "assets_user_id_valued_at_idx" ON "assets"("user_id", "valued_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_primary_currency_fkey" FOREIGN KEY ("primary_currency") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_currency_fkey" FOREIGN KEY ("currency") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_currency_fkey" FOREIGN KEY ("currency") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_user_id_fkey" FOREIGN KEY ("account_id", "user_id") REFERENCES "accounts"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_target_id_user_id_fkey" FOREIGN KEY ("target_id", "user_id") REFERENCES "accounts"("id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_user_id_fkey" FOREIGN KEY ("category_id", "user_id") REFERENCES "categories"("id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_currency_fkey" FOREIGN KEY ("currency") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_category_id_user_id_fkey" FOREIGN KEY ("category_id", "user_id") REFERENCES "categories"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "savings_goals" ADD CONSTRAINT "savings_goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "savings_goals" ADD CONSTRAINT "savings_goals_currency_fkey" FOREIGN KEY ("currency") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_payments" ADD CONSTRAINT "recurring_payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_payments" ADD CONSTRAINT "recurring_payments_account_id_user_id_fkey" FOREIGN KEY ("account_id", "user_id") REFERENCES "accounts"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_payments" ADD CONSTRAINT "recurring_payments_category_id_user_id_fkey" FOREIGN KEY ("category_id", "user_id") REFERENCES "categories"("id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_payments" ADD CONSTRAINT "recurring_payments_currency_fkey" FOREIGN KEY ("currency") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debts" ADD CONSTRAINT "debts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debts" ADD CONSTRAINT "debts_currency_fkey" FOREIGN KEY ("currency") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_currency_fkey" FOREIGN KEY ("currency") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed the currencies supported by the first account/profile forms.
INSERT INTO "currencies" ("code", "minor_units")
VALUES ('IRR', 2), ('USD', 2), ('EUR', 2), ('GBP', 2);

-- Keep basic financial invariants in the database as well as future API validation.
ALTER TABLE "currencies"
ADD CONSTRAINT "currencies_minor_units_range" CHECK ("minor_units" BETWEEN 0 AND 6);

ALTER TABLE "transactions"
ADD CONSTRAINT "transactions_amount_positive" CHECK ("amount" > 0),
ADD CONSTRAINT "transactions_shape_valid" CHECK (
  ("kind" = 'TRANSFER' AND "target_id" IS NOT NULL AND "target_id" <> "account_id" AND "category_id" IS NULL)
  OR
  ("kind" IN ('INCOME', 'EXPENSE') AND "target_id" IS NULL AND "category_id" IS NOT NULL)
);

ALTER TABLE "budgets"
ADD CONSTRAINT "budgets_amount_positive" CHECK ("amount" > 0);

ALTER TABLE "savings_goals"
ADD CONSTRAINT "savings_goals_amounts_valid" CHECK ("target" > 0 AND "saved" >= 0);

ALTER TABLE "recurring_payments"
ADD CONSTRAINT "recurring_payments_amount_positive" CHECK ("amount" > 0);

ALTER TABLE "debts"
ADD CONSTRAINT "debts_amounts_nonnegative" CHECK ("principal" >= 0 AND "outstanding" >= 0);

ALTER TABLE "assets"
ADD CONSTRAINT "assets_amounts_nonnegative" CHECK ("quantity" >= 0 AND "unit_value" >= 0);
