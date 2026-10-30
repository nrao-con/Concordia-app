SET lock_timeout = '5s';

CREATE INDEX IF NOT EXISTS "IDX_medications_user"
  ON medications (user_id);
CREATE INDEX IF NOT EXISTS "IDX_orders_user_created"
  ON orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS "IDX_order_items_order"
  ON order_items (order_id);
CREATE INDEX IF NOT EXISTS "IDX_blister_packs_user"
  ON blister_packs (user_id);
CREATE INDEX IF NOT EXISTS "IDX_blister_dose_slots_pack_planned"
  ON blister_dose_slots (blister_pack_id, planned_date);
CREATE INDEX IF NOT EXISTS "IDX_reminders_user_active"
  ON reminders (user_id, is_active);
CREATE INDEX IF NOT EXISTS "IDX_notifications_user_created"
  ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS "IDX_caregiver_links_caregiver_status"
  ON caregiver_links (caregiver_id, status);
CREATE INDEX IF NOT EXISTS "IDX_caregiver_links_patient_status"
  ON caregiver_links (patient_id, status);
CREATE INDEX IF NOT EXISTS "IDX_pharmacy_messages_user_created"
  ON pharmacy_messages (user_id, created_at DESC);