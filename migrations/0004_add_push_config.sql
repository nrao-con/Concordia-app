-- Add push_config table for operator-configurable pharmacy alert urgency settings
CREATE TABLE IF NOT EXISTS "push_config" (
  "id" serial PRIMARY KEY NOT NULL,
  "key" text NOT NULL,
  "vibrate_pattern" integer[] NOT NULL,
  "require_interaction" boolean DEFAULT true NOT NULL,
  "updated_at" timestamp DEFAULT now(),
  CONSTRAINT "push_config_key_unique" UNIQUE("key")
);
