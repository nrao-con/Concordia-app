ALTER TABLE "blister_packs"
  ADD COLUMN IF NOT EXISTS "pharmacy_enrollment_id" varchar,
  ADD COLUMN IF NOT EXISTS "enrollment_payload_hash" varchar(64);

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_blister_packs_pharmacy_enrollment_id"
  ON "blister_packs" ("pharmacy_enrollment_id")
  WHERE "pharmacy_enrollment_id" IS NOT NULL;