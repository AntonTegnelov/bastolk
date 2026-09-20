-- Nearest-neighbour search is an ordinary SQL query over this extension.
-- The pgvector image ships it, but a plain postgres image would not, so
-- the migration creates it rather than assuming it.
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "account_role" AS ENUM ('BANK', 'VAT', 'OTHER');

-- CreateEnum
CREATE TYPE "vat_treatment" AS ENUM ('DOMESTIC_25', 'DOMESTIC_12', 'DOMESTIC_6', 'REVERSE_CHARGE_EU', 'REVERSE_CHARGE_NON_EU', 'NONE');

-- CreateEnum
CREATE TYPE "example_source" AS ENUM ('HISTORY', 'CORRECTION');

-- CreateEnum
CREATE TYPE "model_status" AS ENUM ('TRAINING', 'READY', 'ACTIVE', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "run_status" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "org_number" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "account_role" NOT NULL DEFAULT 'OTHER',

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sie_import" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sie_import_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "import_id" TEXT NOT NULL,
    "series" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_line" (
    "id" TEXT NOT NULL,
    "verification_id" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "amount_ore" INTEGER NOT NULL,
    "text" TEXT,

    CONSTRAINT "verification_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_transaction" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "booked_on" DATE NOT NULL,
    "text" TEXT NOT NULL,
    "amount_ore" INTEGER NOT NULL,
    "hash" TEXT NOT NULL,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_example" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "amount_ore" INTEGER NOT NULL,
    "account_number" TEXT NOT NULL,
    "vat_treatment" "vat_treatment" NOT NULL,
    "source" "example_source" NOT NULL,
    "occurred_on" DATE NOT NULL,
    "embedding" vector(384),

    CONSTRAINT "training_example_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suggestion" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "bank_transaction_id" TEXT NOT NULL,
    "candidates" JSONB NOT NULL,
    "predictor" TEXT NOT NULL,
    "model_version_id" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL,
    "evidence" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decision" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "bank_transaction_id" TEXT NOT NULL,
    "suggestion_id" TEXT,
    "account_number" TEXT NOT NULL,
    "vat_treatment" "vat_treatment" NOT NULL,
    "differed_from_suggestion" BOOLEAN NOT NULL,
    "decided_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entry" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "decision_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "text" TEXT NOT NULL,
    "exported_at" TIMESTAMP(3),

    CONSTRAINT "journal_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_line" (
    "id" TEXT NOT NULL,
    "journal_entry_id" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "amount_ore" INTEGER NOT NULL,

    CONSTRAINT "journal_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_version" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "base_model" TEXT NOT NULL,
    "dataset_size" INTEGER NOT NULL,
    "status" "model_status" NOT NULL,
    "file_path" TEXT,
    "metrics" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_run" (
    "id" TEXT NOT NULL,
    "status" "run_status" NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "log_tail" TEXT,
    "model_version_id" TEXT,

    CONSTRAINT "training_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_org_number_key" ON "company"("org_number");

-- CreateIndex
CREATE INDEX "account_company_id_idx" ON "account"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "account_company_id_number_key" ON "account"("company_id", "number");

-- CreateIndex
CREATE INDEX "sie_import_company_id_idx" ON "sie_import"("company_id");

-- CreateIndex
CREATE INDEX "verification_company_id_date_idx" ON "verification"("company_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "verification_import_id_series_number_key" ON "verification"("import_id", "series", "number");

-- CreateIndex
CREATE INDEX "verification_line_verification_id_idx" ON "verification_line"("verification_id");

-- CreateIndex
CREATE INDEX "bank_transaction_company_id_booked_on_idx" ON "bank_transaction"("company_id", "booked_on");

-- CreateIndex
CREATE UNIQUE INDEX "bank_transaction_company_id_hash_key" ON "bank_transaction"("company_id", "hash");

-- CreateIndex
CREATE INDEX "training_example_company_id_occurred_on_idx" ON "training_example"("company_id", "occurred_on");

-- CreateIndex
CREATE INDEX "suggestion_company_id_bank_transaction_id_idx" ON "suggestion"("company_id", "bank_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "decision_bank_transaction_id_key" ON "decision"("bank_transaction_id");

-- CreateIndex
CREATE INDEX "decision_company_id_decided_at_idx" ON "decision"("company_id", "decided_at");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entry_decision_id_key" ON "journal_entry"("decision_id");

-- CreateIndex
CREATE INDEX "journal_entry_company_id_date_idx" ON "journal_entry"("company_id", "date");

-- CreateIndex
CREATE INDEX "journal_line_journal_entry_id_idx" ON "journal_line"("journal_entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "model_version_name_key" ON "model_version"("name");

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sie_import" ADD CONSTRAINT "sie_import_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification" ADD CONSTRAINT "verification_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification" ADD CONSTRAINT "verification_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "sie_import"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_line" ADD CONSTRAINT "verification_line_verification_id_fkey" FOREIGN KEY ("verification_id") REFERENCES "verification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transaction" ADD CONSTRAINT "bank_transaction_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_example" ADD CONSTRAINT "training_example_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suggestion" ADD CONSTRAINT "suggestion_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suggestion" ADD CONSTRAINT "suggestion_bank_transaction_id_fkey" FOREIGN KEY ("bank_transaction_id") REFERENCES "bank_transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suggestion" ADD CONSTRAINT "suggestion_model_version_id_fkey" FOREIGN KEY ("model_version_id") REFERENCES "model_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decision" ADD CONSTRAINT "decision_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decision" ADD CONSTRAINT "decision_bank_transaction_id_fkey" FOREIGN KEY ("bank_transaction_id") REFERENCES "bank_transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decision" ADD CONSTRAINT "decision_suggestion_id_fkey" FOREIGN KEY ("suggestion_id") REFERENCES "suggestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entry" ADD CONSTRAINT "journal_entry_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entry" ADD CONSTRAINT "journal_entry_decision_id_fkey" FOREIGN KEY ("decision_id") REFERENCES "decision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_line" ADD CONSTRAINT "journal_line_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_run" ADD CONSTRAINT "training_run_model_version_id_fkey" FOREIGN KEY ("model_version_id") REFERENCES "model_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;
