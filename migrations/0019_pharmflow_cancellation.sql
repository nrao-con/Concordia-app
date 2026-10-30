ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "pharmflow_cancellation_status" text,
  ADD COLUMN IF NOT EXISTS "pharmflow_cancellation_confirmed_at" timestamp;
ALTER TABLE "partner_outbox" DROP CONSTRAINT IF EXISTS "CK_partner_outbox_operation";
ALTER TABLE "partner_outbox" ADD CONSTRAINT "CK_partner_outbox_operation"
  CHECK (operation IN ('concordia_order','concordia_refill','staff_order','pharmflow_rx_order','pharmflow_cancel_order','concordia_patient','pharmflow_patient','concordia_medication','pharmflow_message'));
