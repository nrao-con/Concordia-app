-- Care Navigator tables
CREATE TABLE IF NOT EXISTS patient_conditions (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  condition_name TEXT NOT NULL,
  icd10_code TEXT,
  diagnosed_at TIMESTAMP,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS health_journal_entries (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  condition_id INTEGER REFERENCES patient_conditions(id) ON DELETE SET NULL,
  entry_date TIMESTAMP NOT NULL DEFAULT NOW(),
  symptoms_json JSONB,
  mood INTEGER,
  energy_level INTEGER,
  side_effects_text TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS condition_explainer_cache (
  id SERIAL PRIMARY KEY,
  condition_key TEXT UNIQUE NOT NULL,
  response_json JSONB NOT NULL,
  generated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS medication_condition_links (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  medication_id TEXT NOT NULL,
  condition_id INTEGER NOT NULL REFERENCES patient_conditions(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW()
);
