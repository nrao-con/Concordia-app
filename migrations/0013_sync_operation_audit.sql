-- PHI-free administrative audit history for partner sync operations.
CREATE TABLE IF NOT EXISTS "sync_operation_audit" (
  "id" serial PRIMARY KEY NOT NULL,
  "actor_user_id" varchar NOT NULL,
  "operation_id" integer NOT NULL,
  "action" varchar NOT NULL,
  "result" varchar NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "IDX_sync_operation_audit_operation"
  ON "sync_operation_audit" ("operation_id", "created_at");
CREATE INDEX IF NOT EXISTS "IDX_sync_operation_audit_created"
  ON "sync_operation_audit" ("created_at");