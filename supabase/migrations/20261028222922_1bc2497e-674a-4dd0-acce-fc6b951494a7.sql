-- ============================================================
-- Dara - Phase 1 foundation
-- Creates the application schema in Supabase's public schema,
-- matching apps/api/prisma/schema.prisma, with data-access rules.
-- ============================================================

-- ---------- Enums ----------
CREATE TYPE "public"."AccountType" AS ENUM ('CASH','BANK','SAVINGS','INVESTMENT');
CREATE TYPE "public"."CategoryKind" AS ENUM ('INCOME','EXPENSE');
CREATE TYPE "public"."TransactionKind" AS ENUM ('INCOME','EXPENSE','TRANSFER');
CREATE TYPE "public"."DebtKind" AS ENUM ('OWED','OWED_TO_USER');
CREATE TYPE "public"."RecurringFrequency" AS ENUM ('WEEKLY','MONTHLY');
CREATE TYPE "public"."RecurringKind" AS ENUM ('INCOME','EXPENSE');

-- ---------- currencies ----------
CREATE TABLE "public"."currencies" (
    "code" CHAR(3) NOT NULL,
    "minor_units" SMALLINT NOT NULL,
    CONSTRAINT "currencies_pkey" PRIMARY KEY ("code")
);
GRANT SELECT ON "public"."currencies" TO authenticated;
GRANT ALL ON "public"."currencies" TO service_role;
GRANT ALL ON "public"."currencies" TO postgres;
ALTER TABLE "public"."currencies" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "currencies_readable_by_signed_in_users"
    ON "public"."currencies" FOR SELECT TO authenticated
    USING (true);

-- ---------- users ----------
-- Credential-bearing table: reachable only by the API's own database role.
CREATE TABLE "public"."users" (
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
GRANT ALL ON "public"."users" TO service_role;
GRANT ALL ON "public"."users" TO postgres;
ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;

-- ---------- sessions ----------
CREATE TABLE "public"."sessions" (
    "id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "user_agent" VARCHAR(300) NOT NULL DEFAULT '',
    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);
GRANT ALL ON "public"."sessions" TO service_role;
GRANT ALL ON "public"."sessions" TO postgres;
ALTER TABLE "public"."sessions" ENABLE ROW LEVEL SECURITY;

-- ---------- password_resets ----------
CREATE TABLE "public"."password_resets" (
    "token_hash" CHAR(64) NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "password_resets_pkey" PRIMARY KEY ("token_hash")
);
GRANT ALL ON "public"."password_resets" TO service_role;
GRANT ALL ON "public"."password_resets" TO postgres;
ALTER TABLE "public"."password_resets" ENABLE ROW LEVEL SECURITY;

-- ---------- accounts ----------
CREATE TABLE "public"."accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "type" "public"."AccountType" NOT NULL,
    "opening_balance" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL DEFAULT 'IRR',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);
GRANT SELECT, INSERT, UPDATE, DELETE ON "public"."accounts" TO authenticated;
GRANT ALL ON "public"."accounts" TO service_role;
GRANT ALL ON "public"."accounts" TO postgres;
ALTER TABLE "public"."accounts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "accounts_owner_only" ON "public"."accounts"
    FOR ALL TO authenticated
    USING (auth.uid() = "user_id") WITH CHECK (auth.uid() = "user_id");

-- ---------- categories ----------
CREATE TABLE "public"."categories" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "kind" "public"."CategoryKind" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);
GRANT SELECT, INSERT, UPDATE, DELETE ON "public"."categories" TO authenticated;
GRANT ALL ON "public"."categories" TO service_role;
GRANT ALL ON "public"."categories" TO postgres;
ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categories_owner_only" ON "public"."categories"
    FOR ALL TO authenticated
    USING (auth.uid() = "user_id") WITH CHECK (auth.uid() = "user_id");

-- ---------- transactions ----------
CREATE TABLE "public"."transactions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "target_id" UUID,
    "category_id" UUID,
    "kind" "public"."TransactionKind" NOT NULL,
    "amount" DECIMAL(20,6) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "description" VARCHAR(200) NOT NULL DEFAULT '',
    "note" VARCHAR(1000) NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);
GRANT SELECT, INSERT, UPDATE, DELETE ON "public"."transactions" TO authenticated;
GRANT ALL ON "public"."transactions" TO service_role;
GRANT ALL ON "public"."transactions" TO postgres;
ALTER TABLE "public"."transactions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transactions_owner_only" ON "public"."transactions"
    FOR ALL TO authenticated
    USING (auth.uid() = "user_id") WITH CHECK (auth.uid() = "user_id");

-- ---------- budgets ----------
CREATE TABLE "public"."budgets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "amount" DECIMAL(20,6) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "month" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);
GRANT SELECT, INSERT, UPDATE, DELETE ON "public"."budgets" TO authenticated;
GRANT ALL ON "public"."budgets" TO service_role;
GRANT ALL ON "public"."budgets" TO postgres;
ALTER TABLE "public"."budgets" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "budgets_owner_only" ON "public"."budgets"
    FOR ALL TO authenticated
    USING (auth.uid() = "user_id") WITH CHECK (auth.uid() = "user_id");

-- ---------- savings_goals ----------
CREATE TABLE "public"."savings_goals" (
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
GRANT SELECT, INSERT, UPDATE, DELETE ON "public"."savings_goals" TO authenticated;
GRANT ALL ON "public"."savings_goals" TO service_role;
GRANT ALL ON "public"."savings_goals" TO postgres;
ALTER TABLE "public"."savings_goals" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "savings_goals_owner_only" ON "public"."savings_goals"
    FOR ALL TO authenticated
    USING (auth.uid() = "user_id") WITH CHECK (auth.uid() = "user_id");

-- ---------- recurring_payments ----------
CREATE TABLE "public"."recurring_payments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "category_id" UUID,
    "name" VARCHAR(100) NOT NULL,
    "kind" "public"."RecurringKind" NOT NULL,
    "amount" DECIMAL(20,6) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "frequency" "public"."RecurringFrequency" NOT NULL,
    "next_due_at" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "recurring_payments_pkey" PRIMARY KEY ("id")
);
GRANT SELECT, INSERT, UPDATE, DELETE ON "public"."recurring_payments" TO authenticated;
GRANT ALL ON "public"."recurring_payments" TO service_role;
GRANT ALL ON "public"."recurring_payments" TO postgres;
ALTER TABLE "public"."recurring_payments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recurring_payments_owner_only" ON "public"."recurring_payments"
    FOR ALL TO authenticated
    USING (auth.uid() = "user_id") WITH CHECK (auth.uid() = "user_id");

-- ---------- debts ----------
CREATE TABLE "public"."debts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "kind" "public"."DebtKind" NOT NULL,
    "principal" DECIMAL(20,6) NOT NULL,
    "outstanding" DECIMAL(20,6) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "due_at" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "debts_pkey" PRIMARY KEY ("id")
);
GRANT SELECT, INSERT, UPDATE, DELETE ON "public"."debts" TO authenticated;
GRANT ALL ON "public"."debts" TO service_role;
GRANT ALL ON "public"."debts" TO postgres;
ALTER TABLE "public"."debts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "debts_owner_only" ON "public"."debts"
    FOR ALL TO authenticated
    USING (auth.uid() = "user_id") WITH CHECK (auth.uid() = "user_id");

-- ---------- assets ----------
CREATE TABLE "public"."assets" (
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
GRANT SELECT, INSERT, UPDATE, DELETE ON "public"."assets" TO authenticated;
GRANT ALL ON "public"."assets" TO service_role;
GRANT ALL ON "public"."assets" TO postgres;
ALTER TABLE "public"."assets" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assets_owner_only" ON "public"."assets"
    FOR ALL TO authenticated
    USING (auth.uid() = "user_id") WITH CHECK (auth.uid() = "user_id");

-- ---------- Indexes ----------
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email");
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "public"."sessions"("token_hash");
CREATE INDEX "sessions_user_id_expires_at_idx" ON "public"."sessions"("user_id", "expires_at");
CREATE INDEX "password_resets_user_id_idx" ON "public"."password_resets"("user_id");
CREATE INDEX "password_resets_expires_at_idx" ON "public"."password_resets"("expires_at");
CREATE INDEX "accounts_user_id_created_at_idx" ON "public"."accounts"("user_id", "created_at");
CREATE UNIQUE INDEX "accounts_id_user_id_key" ON "public"."accounts"("id", "user_id");
CREATE UNIQUE INDEX "categories_id_user_id_key" ON "public"."categories"("id", "user_id");
CREATE UNIQUE INDEX "categories_user_id_name_kind_key" ON "public"."categories"("user_id", "name", "kind");
CREATE INDEX "transactions_user_id_occurred_at_idx" ON "public"."transactions"("user_id", "occurred_at");
CREATE INDEX "transactions_user_id_category_id_occurred_at_idx" ON "public"."transactions"("user_id", "category_id", "occurred_at");
CREATE UNIQUE INDEX "budgets_user_id_category_id_month_key" ON "public"."budgets"("user_id", "category_id", "month");
CREATE INDEX "savings_goals_user_id_target_at_idx" ON "public"."savings_goals"("user_id", "target_at");
CREATE INDEX "recurring_payments_user_id_next_due_at_idx" ON "public"."recurring_payments"("user_id", "next_due_at");
CREATE INDEX "debts_user_id_due_at_idx" ON "public"."debts"("user_id", "due_at");
CREATE INDEX "assets_user_id_valued_at_idx" ON "public"."assets"("user_id", "valued_at");

-- ---------- Foreign keys ----------
ALTER TABLE "public"."users" ADD CONSTRAINT "users_primary_currency_fkey"
    FOREIGN KEY ("primary_currency") REFERENCES "public"."currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."sessions" ADD CONSTRAINT "sessions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."password_resets" ADD CONSTRAINT "password_resets_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."accounts" ADD CONSTRAINT "accounts_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."accounts" ADD CONSTRAINT "accounts_currency_fkey"
    FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."categories" ADD CONSTRAINT "categories_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."transactions" ADD CONSTRAINT "transactions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."transactions" ADD CONSTRAINT "transactions_currency_fkey"
    FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."transactions" ADD CONSTRAINT "transactions_account_id_user_id_fkey"
    FOREIGN KEY ("account_id", "user_id") REFERENCES "public"."accounts"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."transactions" ADD CONSTRAINT "transactions_target_id_user_id_fkey"
    FOREIGN KEY ("target_id", "user_id") REFERENCES "public"."accounts"("id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."transactions" ADD CONSTRAINT "transactions_category_id_user_id_fkey"
    FOREIGN KEY ("category_id", "user_id") REFERENCES "public"."categories"("id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."budgets" ADD CONSTRAINT "budgets_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."budgets" ADD CONSTRAINT "budgets_currency_fkey"
    FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."budgets" ADD CONSTRAINT "budgets_category_id_user_id_fkey"
    FOREIGN KEY ("category_id", "user_id") REFERENCES "public"."categories"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."savings_goals" ADD CONSTRAINT "savings_goals_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."savings_goals" ADD CONSTRAINT "savings_goals_currency_fkey"
    FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."recurring_payments" ADD CONSTRAINT "recurring_payments_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."recurring_payments" ADD CONSTRAINT "recurring_payments_account_id_user_id_fkey"
    FOREIGN KEY ("account_id", "user_id") REFERENCES "public"."accounts"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."recurring_payments" ADD CONSTRAINT "recurring_payments_category_id_user_id_fkey"
    FOREIGN KEY ("category_id", "user_id") REFERENCES "public"."categories"("id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."recurring_payments" ADD CONSTRAINT "recurring_payments_currency_fkey"
    FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."debts" ADD CONSTRAINT "debts_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."debts" ADD CONSTRAINT "debts_currency_fkey"
    FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."assets" ADD CONSTRAINT "assets_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."assets" ADD CONSTRAINT "assets_currency_fkey"
    FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------- Seed: currencies supported by the first account/profile forms ----------
INSERT INTO "public"."currencies" ("code", "minor_units")
VALUES ('IRR', 2), ('USD', 2), ('EUR', 2), ('GBP', 2);

-- ---------- Financial invariants kept in the database ----------
ALTER TABLE "public"."currencies"
    ADD CONSTRAINT "currencies_minor_units_range" CHECK ("minor_units" BETWEEN 0 AND 6);
ALTER TABLE "public"."transactions"
    ADD CONSTRAINT "transactions_amount_positive" CHECK ("amount" > 0),
    ADD CONSTRAINT "transactions_shape_valid" CHECK (
        ("kind" = 'TRANSFER' AND "target_id" IS NOT NULL AND "target_id" <> "account_id" AND "category_id" IS NULL)
        OR
        ("kind" IN ('INCOME','EXPENSE') AND "target_id" IS NULL AND "category_id" IS NOT NULL)
    );
ALTER TABLE "public"."budgets"
    ADD CONSTRAINT "budgets_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "public"."savings_goals"
    ADD CONSTRAINT "savings_goals_amounts_valid" CHECK ("target" > 0 AND "saved" >= 0);
ALTER TABLE "public"."recurring_payments"
    ADD CONSTRAINT "recurring_payments_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "public"."debts"
    ADD CONSTRAINT "debts_amounts_nonnegative" CHECK ("principal" >= 0 AND "outstanding" >= 0);
ALTER TABLE "public"."assets"
    ADD CONSTRAINT "assets_amounts_nonnegative" CHECK ("quantity" >= 0 AND "unit_value" >= 0);

-- ---------- Keep updated_at accurate ----------
CREATE OR REPLACE FUNCTION "public"."set_updated_at"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW."updated_at" = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER "users_set_updated_at" BEFORE UPDATE ON "public"."users"
    FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE TRIGGER "accounts_set_updated_at" BEFORE UPDATE ON "public"."accounts"
    FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE TRIGGER "transactions_set_updated_at" BEFORE UPDATE ON "public"."transactions"
    FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();