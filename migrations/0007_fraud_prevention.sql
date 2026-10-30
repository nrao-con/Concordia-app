ALTER TABLE users ADD COLUMN IF NOT EXISTS identity_trust_status TEXT DEFAULT 'verified';
ALTER TABLE users ALTER COLUMN identity_trust_status SET DEFAULT 'unverified';
ALTER TABLE medications ADD COLUMN IF NOT EXISTS last_refill_confirmation_key VARCHAR;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR UNIQUE;

CREATE TABLE IF NOT EXISTS fraud_events (
  id SERIAL PRIMARY KEY,
  event_id VARCHAR NOT NULL UNIQUE,
  request_id VARCHAR NOT NULL UNIQUE,
  actor_id VARCHAR NOT NULL,
  patient_user_id VARCHAR,
  action TEXT NOT NULL,
  outcome TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  risk_band TEXT NOT NULL CHECK (risk_band IN ('low', 'medium', 'high', 'critical')),
  signals JSONB NOT NULL DEFAULT '[]'::jsonb,
  safe_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_hash VARCHAR,
  user_agent_hash VARCHAR,
  source TEXT NOT NULL DEFAULT 'app',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "IDX_fraud_events_patient_created" ON fraud_events(patient_user_id, created_at);
CREATE INDEX IF NOT EXISTS "IDX_fraud_events_actor_action" ON fraud_events(actor_id, action, created_at);

CREATE TABLE IF NOT EXISTS fraud_cases (
  id SERIAL PRIMARY KEY,
  case_number VARCHAR NOT NULL UNIQUE,
  event_id INTEGER NOT NULL REFERENCES fraud_events(id),
  patient_user_id VARCHAR,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_review', 'approved', 'denied', 'dismissed')),
  priority TEXT NOT NULL CHECK (priority IN ('medium', 'high', 'critical')),
  assigned_to VARCHAR,
  claim_expires_at TIMESTAMP,
  opened_at TIMESTAMP NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMP
);
ALTER TABLE fraud_cases ADD COLUMN IF NOT EXISTS claim_expires_at TIMESTAMP;
ALTER TABLE fraud_events DROP CONSTRAINT IF EXISTS fraud_events_patient_user_id_fkey;
ALTER TABLE fraud_cases DROP CONSTRAINT IF EXISTS fraud_cases_patient_user_id_fkey;

CREATE TABLE IF NOT EXISTS fraud_decisions (
  id SERIAL PRIMARY KEY,
  case_id INTEGER NOT NULL REFERENCES fraud_cases(id),
  decision TEXT NOT NULL CHECK (decision IN ('approve', 'deny', 'dismiss', 'escalate')),
  reason_code TEXT NOT NULL,
  note TEXT,
  decided_by VARCHAR NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "IDX_fraud_decisions_case_created" ON fraud_decisions(case_id, created_at);

CREATE TABLE IF NOT EXISTS fraud_ingestion_receipts (
  id SERIAL PRIMARY KEY,
  source TEXT NOT NULL,
  source_event_id VARCHAR NOT NULL,
  payload_hash VARCHAR NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('accepted', 'duplicate', 'rejected')),
  event_id INTEGER REFERENCES fraud_events(id),
  received_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT "UQ_fraud_ingestion_source_event" UNIQUE(source, source_event_id)
);

CREATE TABLE IF NOT EXISTS fraud_mutation_receipts (
  id SERIAL PRIMARY KEY,
  actor_id VARCHAR NOT NULL,
  action TEXT NOT NULL,
  idempotency_key VARCHAR NOT NULL,
  resource_id VARCHAR,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT "UQ_fraud_mutation_receipt" UNIQUE(actor_id, action, idempotency_key)
);
CREATE TABLE IF NOT EXISTS identity_aliases (
  old_user_id VARCHAR PRIMARY KEY,
  current_user_id VARCHAR NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "IDX_identity_alias_current" ON identity_aliases(current_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_medication_external_rx_per_patient"
ON medications(user_id, external_rx_id) WHERE external_rx_id IS NOT NULL;

REVOKE UPDATE, DELETE ON fraud_events, fraud_decisions, fraud_ingestion_receipts FROM PUBLIC;

CREATE OR REPLACE FUNCTION reject_fraud_evidence_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'fraud evidence is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS fraud_events_immutable ON fraud_events;
CREATE TRIGGER fraud_events_immutable BEFORE UPDATE OR DELETE ON fraud_events
FOR EACH ROW EXECUTE FUNCTION reject_fraud_evidence_mutation();
DROP TRIGGER IF EXISTS fraud_decisions_immutable ON fraud_decisions;
CREATE TRIGGER fraud_decisions_immutable BEFORE UPDATE OR DELETE ON fraud_decisions
FOR EACH ROW EXECUTE FUNCTION reject_fraud_evidence_mutation();
DROP TRIGGER IF EXISTS fraud_receipts_immutable ON fraud_ingestion_receipts;
CREATE TRIGGER fraud_receipts_immutable BEFORE UPDATE OR DELETE ON fraud_ingestion_receipts
FOR EACH ROW EXECUTE FUNCTION reject_fraud_evidence_mutation();
DROP TRIGGER IF EXISTS fraud_mutation_receipts_immutable ON fraud_mutation_receipts;
CREATE TRIGGER fraud_mutation_receipts_immutable BEFORE UPDATE OR DELETE ON fraud_mutation_receipts
FOR EACH ROW EXECUTE FUNCTION reject_fraud_evidence_mutation();