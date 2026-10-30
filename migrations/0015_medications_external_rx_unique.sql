DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM medications
    WHERE external_rx_id IS NOT NULL
    GROUP BY external_rx_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot create UQ_medications_external_rx_id: duplicate external_rx_id values exist';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_medications_external_rx_id"
  ON "medications" ("external_rx_id")
  WHERE "external_rx_id" IS NOT NULL;