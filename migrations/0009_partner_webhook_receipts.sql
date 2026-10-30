CREATE TABLE IF NOT EXISTS "partner_webhook_receipts" (
  "id" serial PRIMARY KEY,
  "source" varchar NOT NULL,
  "source_event_id" varchar NOT NULL,
  "payload_hash" varchar NOT NULL,
  "status" varchar NOT NULL DEFAULT 'processing',
  "received_at" timestamp NOT NULL DEFAULT now(),
  "processed_at" timestamp
);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_partner_webhook_source_event"
  ON "partner_webhook_receipts" ("source", "source_event_id");
CREATE INDEX IF NOT EXISTS "IDX_partner_webhook_received"
  ON "partner_webhook_receipts" ("received_at");