ALTER TABLE "medications"
  ADD COLUMN IF NOT EXISTS "sync_source" text,
  ADD COLUMN IF NOT EXISTS "last_synced_at" timestamp;

CREATE TABLE IF NOT EXISTS "pharmacy_sync_conflicts" (
  "id" serial PRIMARY KEY NOT NULL,
  "fingerprint" varchar NOT NULL UNIQUE,
  "conflict_type" varchar NOT NULL,
  "pharmacy_patient_id" varchar NOT NULL,
  "concordia_id" varchar NOT NULL,
  "prescription_id" varchar,
  "status" varchar NOT NULL DEFAULT 'open',
  "occurrence_count" integer NOT NULL DEFAULT 1,
  "first_seen_at" timestamp NOT NULL DEFAULT now(),
  "last_seen_at" timestamp NOT NULL DEFAULT now()
);