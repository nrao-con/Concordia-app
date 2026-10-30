-- Add FSA/HSA eligibility flag to OTC products
ALTER TABLE otc_products ADD COLUMN IF NOT EXISTS fsa_eligible boolean DEFAULT false NOT NULL;
