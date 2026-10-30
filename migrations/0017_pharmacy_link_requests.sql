CREATE TABLE IF NOT EXISTS "pharmacy_link_requests" (
  "id" serial PRIMARY KEY NOT NULL,
  "clerk_subject" varchar NOT NULL,
  "concordia_id" varchar NOT NULL,
  "pharmacy_patient_id" varchar NOT NULL,
  "status" varchar NOT NULL DEFAULT 'pending',
  "rejection_reason" varchar(280),
  "requested_at" timestamp NOT NULL DEFAULT now(),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  "reviewed_at" timestamp,
  "reviewer_subject" varchar
);
ALTER TABLE "pharmacy_link_requests"
  ADD COLUMN IF NOT EXISTS "requested_at" timestamp NOT NULL DEFAULT now();
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CK_pharmacy_link_requests_status') THEN
    ALTER TABLE "pharmacy_link_requests" ADD CONSTRAINT "CK_pharmacy_link_requests_status"
      CHECK ("status" IN ('pending', 'approved', 'rejected'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CK_pharmacy_link_requests_rejection_reason') THEN
    ALTER TABLE "pharmacy_link_requests" ADD CONSTRAINT "CK_pharmacy_link_requests_rejection_reason"
      CHECK ("rejection_reason" IS NULL OR char_length("rejection_reason") BETWEEN 1 AND 280);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CK_pharmacy_link_requests_reviewed') THEN
    ALTER TABLE "pharmacy_link_requests" ADD CONSTRAINT "CK_pharmacy_link_requests_reviewed"
      CHECK (("status" = 'pending' AND "reviewed_at" IS NULL AND "reviewer_subject" IS NULL)
          OR ("status" IN ('approved','rejected') AND "reviewed_at" IS NOT NULL AND "reviewer_subject" IS NOT NULL));
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS "pharmacy_link_audit" (
  "id" serial PRIMARY KEY NOT NULL,
  "request_id" integer NOT NULL REFERENCES "pharmacy_link_requests"("id"),
  "action" varchar NOT NULL,
  "actor_subject" varchar NOT NULL,
  "reason_code" varchar(64),
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "CK_pharmacy_link_audit_action"
    CHECK ("action" IN ('requested','approved','rejected','approval_failed'))
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CK_pharmacy_link_audit_action') THEN
    ALTER TABLE "pharmacy_link_audit" ADD CONSTRAINT "CK_pharmacy_link_audit_action"
      CHECK ("action" IN ('requested','approved','rejected','approval_failed'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "IDX_pharmacy_link_audit_request" ON "pharmacy_link_audit" ("request_id", "created_at");
CREATE INDEX IF NOT EXISTS "IDX_pharmacy_link_requests_subject" ON "pharmacy_link_requests" ("clerk_subject", "created_at");
CREATE INDEX IF NOT EXISTS "IDX_pharmacy_link_requests_patient" ON "pharmacy_link_requests" ("pharmacy_patient_id", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_pharmacy_link_requests_pending_subject"
  ON "pharmacy_link_requests" ("clerk_subject") WHERE "status" = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_pharmacy_link_requests_pending_patient"
  ON "pharmacy_link_requests" ("pharmacy_patient_id") WHERE "status" = 'pending';