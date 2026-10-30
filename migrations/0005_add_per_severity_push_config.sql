-- Add per-severity vibration and urgency columns to push_config
ALTER TABLE "push_config"
  ADD COLUMN IF NOT EXISTS "urgent_vibrate_pattern" integer[],
  ADD COLUMN IF NOT EXISTS "urgent_require_interaction" boolean,
  ADD COLUMN IF NOT EXISTS "high_vibrate_pattern" integer[],
  ADD COLUMN IF NOT EXISTS "high_require_interaction" boolean,
  ADD COLUMN IF NOT EXISTS "info_vibrate_pattern" integer[],
  ADD COLUMN IF NOT EXISTS "info_require_interaction" boolean;
