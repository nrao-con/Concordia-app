ALTER TABLE orders ADD COLUMN IF NOT EXISTS staff_checkout_status text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS staff_checkout_error text;
CREATE TABLE IF NOT EXISTS staff_checkout_receipts (
  order_id integer PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  staff_order_id text NOT NULL,
  tracking_token text,
  tracking_expires_at text
);
ALTER TABLE staff_checkout_receipts DROP CONSTRAINT IF EXISTS staff_checkout_receipts_order_id_fkey;
ALTER TABLE staff_checkout_receipts ADD CONSTRAINT staff_checkout_receipts_order_id_fkey
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
ALTER TABLE partner_outbox DROP CONSTRAINT IF EXISTS "CK_partner_outbox_operation";
ALTER TABLE partner_outbox ADD CONSTRAINT "CK_partner_outbox_operation"
  CHECK (operation IN ('concordia_order','concordia_refill','staff_order','staff_checkout','pharmflow_rx_order','pharmflow_cancel_order','concordia_patient','pharmflow_patient','concordia_medication','pharmflow_message'));
