-- NovoPay Finance only. Apply to a NEW, dedicated NovoPay database after review.
-- No Global Finance tables, IDs, balances, or credentials belong here.
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_uid text NOT NULL UNIQUE,
  novopay_id text NOT NULL UNIQUE,
  full_name text NOT NULL,
  email text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','closed')),
  fund_balance numeric(20,8) NOT NULL DEFAULT 0 CHECK (fund_balance >= 0),
  income_balance numeric(20,8) NOT NULL DEFAULT 0 CHECK (income_balance >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  user_id text NOT NULL,
  amount numeric(20,8) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'USDT',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','refunded')),
  tx_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewer_uid text
);

CREATE TABLE IF NOT EXISTS withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  user_id text NOT NULL,
  amount numeric(20,8) NOT NULL CHECK (amount > 0),
  fee numeric(20,8) NOT NULL DEFAULT 0 CHECK (fee >= 0),
  net_amount numeric(20,8) NOT NULL CHECK (net_amount >= 0),
  currency text NOT NULL DEFAULT 'USDT',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','refunded','paid')),
  payout_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewer_uid text
);

CREATE TABLE IF NOT EXISTS ledger_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  user_id text NOT NULL,
  type text NOT NULL,
  amount numeric(20,8) NOT NULL,
  currency text NOT NULL DEFAULT 'USDT',
  status text NOT NULL DEFAULT 'posted' CHECK (status IN ('pending','posted','reversed','failed')),
  description text,
  idempotency_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kyc_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  document_type text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewer_uid text
);

CREATE TABLE IF NOT EXISTS packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  price numeric(20,8) NOT NULL CHECK (price >= 0),
  currency text NOT NULL DEFAULT 'USDT',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','archived')),
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS package_activations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  user_id text NOT NULL,
  package_id uuid REFERENCES packages(id),
  amount numeric(20,8) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'USDT',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','cancelled','failed')),
  activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS p2p_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  sender_user_id text NOT NULL,
  receiver_user_id text NOT NULL,
  amount numeric(20,8) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'USDT',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','reversed','failed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  user_id text NOT NULL,
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','pending','resolved','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS website_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','reviewed','archived')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS survey_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text,
  survey_key text NOT NULL,
  response jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_uid text NOT NULL,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS offer_posters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  image_url text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deposits_status_created_idx ON deposits(status, created_at DESC);
CREATE INDEX IF NOT EXISTS withdrawals_status_created_idx ON withdrawals(status, created_at DESC);
CREATE INDEX IF NOT EXISTS ledger_user_created_idx ON ledger_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS kyc_status_submitted_idx ON kyc_submissions(status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS support_status_created_idx ON support_tickets(status, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_logs(created_at DESC);
