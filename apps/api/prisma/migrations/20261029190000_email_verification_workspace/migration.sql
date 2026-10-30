ALTER TABLE "users"
ADD COLUMN "email_verified_at" TIMESTAMPTZ(6);

CREATE TABLE "email_verifications" (
    "token_hash" CHAR(64) NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "email_verifications_pkey" PRIMARY KEY ("token_hash")
);

CREATE TABLE "user_workspace" (
    "user_id" UUID NOT NULL,
    "key" VARCHAR(32) NOT NULL,
    "data" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_workspace_pkey" PRIMARY KEY ("user_id", "key")
);

CREATE INDEX "email_verifications_user_id_idx" ON "email_verifications"("user_id");
CREATE INDEX "email_verifications_expires_at_idx" ON "email_verifications"("expires_at");

ALTER TABLE "email_verifications"
ADD CONSTRAINT "email_verifications_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_workspace"
ADD CONSTRAINT "user_workspace_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
