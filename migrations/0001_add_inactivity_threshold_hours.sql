-- Migration: add inactivity_threshold_hours to users table
-- Safe to run on existing environments (column add with default, IF NOT EXISTS guard via DO block)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'inactivity_threshold_hours'
  ) THEN
    ALTER TABLE "users" ADD COLUMN "inactivity_threshold_hours" integer DEFAULT 24 NOT NULL;
  END IF;
END $$;
