ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "pharmacy_patient_id" varchar;

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_users_pharmacy_patient_id"
  ON "users" ("pharmacy_patient_id")
  WHERE "pharmacy_patient_id" IS NOT NULL;