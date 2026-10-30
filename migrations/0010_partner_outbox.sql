ALTER TABLE partner_webhook_receipts ADD COLUMN IF NOT EXISTS lease_token varchar;

CREATE TABLE IF NOT EXISTS "partner_outbox" (
  "id" serial PRIMARY KEY,
  "partner" varchar NOT NULL,
  "operation" varchar NOT NULL,
  "idempotency_key" varchar NOT NULL,
  "payload" jsonb NOT NULL,
  "status" varchar NOT NULL DEFAULT 'pending',
  "lease_token" varchar,
  "attempts" integer NOT NULL DEFAULT 0,
  "next_attempt_at" timestamp NOT NULL DEFAULT now(),
  "last_error" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_partner_outbox_idempotency" ON "partner_outbox" ("partner", "operation", "idempotency_key");
CREATE INDEX IF NOT EXISTS "IDX_partner_outbox_due" ON "partner_outbox" ("status", "next_attempt_at");
ALTER TABLE partner_outbox
  ADD CONSTRAINT "CK_partner_outbox_operation" CHECK (operation IN ('concordia_order','concordia_refill','staff_order','pharmflow_rx_order','concordia_patient','pharmflow_patient','concordia_medication','pharmflow_message')),
  ADD CONSTRAINT "CK_partner_outbox_status" CHECK (status IN ('pending','processing','completed','failed')),
  ADD CONSTRAINT "CK_partner_outbox_payload_size" CHECK (octet_length(payload::text) <= 262144);