-- Canonical identity: each member's NovoPay ID is also their referral ID.
UPDATE users SET referral_code = novopay_id WHERE referral_code IS DISTINCT FROM novopay_id;

-- Automatically reject duplicate pending submissions while preserving reviewed/credited records.
WITH ranked AS (
  SELECT id, status,
         row_number() OVER (
           PARTITION BY lower(tx_hash)
           ORDER BY CASE WHEN status IN ('approved','refunded') THEN 0 ELSE 1 END,
                    created_at ASC, id ASC
         ) AS duplicate_rank
  FROM deposits
  WHERE tx_hash IS NOT NULL AND btrim(tx_hash) <> ''
)
UPDATE deposits d
SET status='rejected', reviewed_at=COALESCE(d.reviewed_at, now())
FROM ranked r
WHERE d.id=r.id AND r.duplicate_rank > 1 AND d.status='pending';

-- Fail safely if already-credited duplicate hashes need ledger reconciliation.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM deposits
    WHERE tx_hash IS NOT NULL AND btrim(tx_hash) <> '' AND status <> 'rejected'
    GROUP BY lower(tx_hash) HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate active/credited deposit hashes need ledger reconciliation before the unique guard can be applied.';
  END IF;
  CREATE UNIQUE INDEX IF NOT EXISTS deposits_tx_hash_unique_active_idx
    ON deposits (lower(tx_hash))
    WHERE tx_hash IS NOT NULL AND btrim(tx_hash) <> '' AND status <> 'rejected';
END $$;
