-- NovoPay Finance: BEP20 USDT deposit verification foundation.
-- Apply only to the separate NovoPay database after reviewing the schema.
-- No balances are credited by this migration or by verification alone.

CREATE TABLE IF NOT EXISTS novopay_deposit_requests (
  id BIGSERIAL PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  network TEXT NOT NULL DEFAULT 'BEP20' CHECK (network = 'BEP20'),
  token_symbol TEXT NOT NULL DEFAULT 'USDT' CHECK (token_symbol = 'USDT'),
  token_contract TEXT NOT NULL,
  receiving_address TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  amount NUMERIC(38, 18),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'submitted', 'verified', 'rejected', 'credited', 'failed')),
  block_number BIGINT,
  confirmations INTEGER,
  verification_message TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at TIMESTAMPTZ,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  credited_ledger_id BIGINT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT novopay_deposit_tx_hash_unique UNIQUE (tx_hash)
);

CREATE INDEX IF NOT EXISTS novopay_deposit_user_submitted_idx
  ON novopay_deposit_requests (user_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS novopay_deposit_status_submitted_idx
  ON novopay_deposit_requests (status, submitted_at DESC);

CREATE TABLE IF NOT EXISTS novopay_deposit_audit_log (
  id BIGSERIAL PRIMARY KEY,
  deposit_request_id BIGINT NOT NULL REFERENCES novopay_deposit_requests(id) ON DELETE RESTRICT,
  actor_uid TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('submitted', 'verification_passed', 'verification_failed', 'approved', 'rejected', 'credited')),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS novopay_deposit_audit_request_idx
  ON novopay_deposit_audit_log (deposit_request_id, created_at DESC);
