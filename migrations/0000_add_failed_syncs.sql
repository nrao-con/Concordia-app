-- Migration: add failed_syncs table for Concordia order sync retry queue
-- Safe to run on existing environments (IF NOT EXISTS guard)
CREATE TABLE IF NOT EXISTS "failed_syncs" (
  "id" serial PRIMARY KEY NOT NULL,
  "order_id" integer NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "last_error" text,
  "sync_status" text DEFAULT 'pending' NOT NULL,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);
