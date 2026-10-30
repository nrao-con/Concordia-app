ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "clerk_user_id" varchar,
  ADD COLUMN IF NOT EXISTS "email_normalized" varchar,
  ADD COLUMN IF NOT EXISTS "phone_normalized" varchar,
  ADD COLUMN IF NOT EXISTS "identity_review_required" boolean DEFAULT false;

-- Legacy collisions are held for explicit review; they remain unindexed/null.
WITH email_collisions AS (
  SELECT lower(normalize(btrim(email), NFKC)) AS value FROM users WHERE email IS NOT NULL
  GROUP BY lower(normalize(btrim(email), NFKC)) HAVING count(*) > 1
)
UPDATE users u SET identity_review_required = true, email_normalized = NULL
FROM email_collisions c WHERE lower(normalize(btrim(u.email), NFKC)) = c.value;

-- Only backfill unambiguous legacy identities. Colliding rows remain NULL and
-- therefore cannot make this migration fail or silently merge accounts.
WITH email_groups AS (
  SELECT lower(normalize(btrim(email), NFKC)) AS value FROM users
  WHERE email IS NOT NULL GROUP BY lower(normalize(btrim(email), NFKC)) HAVING count(*) = 1
)
UPDATE users u SET email_normalized = eg.value
FROM email_groups eg WHERE u.email IS NOT NULL AND lower(normalize(btrim(u.email), NFKC)) = eg.value
  AND u.email_normalized IS NULL;

WITH phone_groups AS (
  SELECT CASE WHEN regexp_replace(phone, '[^0-9]', '', 'g') ~ '^1[0-9]{10}$'
    THEN '+' || regexp_replace(phone, '[^0-9]', '', 'g')
    WHEN regexp_replace(phone, '[^0-9]', '', 'g') ~ '^[0-9]{10}$'
    THEN '+1' || regexp_replace(phone, '[^0-9]', '', 'g') END AS value
  FROM users WHERE phone IS NOT NULL
  GROUP BY 1 HAVING count(*) = 1
)
UPDATE users u SET phone_normalized = pg.value
FROM phone_groups pg
WHERE u.phone IS NOT NULL AND u.phone_normalized IS NULL
  AND pg.value IS NOT NULL
  AND pg.value = CASE WHEN regexp_replace(u.phone, '[^0-9]', '', 'g') ~ '^1[0-9]{10}$'
    THEN '+' || regexp_replace(u.phone, '[^0-9]', '', 'g')
    WHEN regexp_replace(u.phone, '[^0-9]', '', 'g') ~ '^[0-9]{10}$'
    THEN '+1' || regexp_replace(u.phone, '[^0-9]', '', 'g') END;

WITH phone_collisions AS (
  SELECT CASE WHEN regexp_replace(phone, '[^0-9]', '', 'g') ~ '^1[0-9]{10}$'
    THEN '+' || regexp_replace(phone, '[^0-9]', '', 'g')
    WHEN regexp_replace(phone, '[^0-9]', '', 'g') ~ '^[0-9]{10}$'
    THEN '+1' || regexp_replace(phone, '[^0-9]', '', 'g') END AS value
  FROM users WHERE phone IS NOT NULL GROUP BY 1 HAVING count(*) > 1
)
UPDATE users u SET identity_review_required = true, phone_normalized = NULL
FROM phone_collisions c WHERE c.value IS NOT NULL AND c.value = CASE
  WHEN regexp_replace(u.phone, '[^0-9]', '', 'g') ~ '^1[0-9]{10}$' THEN '+' || regexp_replace(u.phone, '[^0-9]', '', 'g')
  WHEN regexp_replace(u.phone, '[^0-9]', '', 'g') ~ '^[0-9]{10}$' THEN '+1' || regexp_replace(u.phone, '[^0-9]', '', 'g') END;

SET lock_timeout = '5s';
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_users_clerk_user_id" ON "users" ("clerk_user_id") WHERE "clerk_user_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_users_email_normalized" ON "users" ("email_normalized") WHERE "email_normalized" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_users_phone_normalized" ON "users" ("phone_normalized") WHERE "phone_normalized" IS NOT NULL;