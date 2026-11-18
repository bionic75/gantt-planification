-- AlterTable
ALTER TABLE "mfa_validations" ADD COLUMN "device_hash" TEXT;

-- CreateIndex
CREATE INDEX "mfa_validations_user_id_device_hash_idx" ON "mfa_validations"("user_id", "device_hash");

