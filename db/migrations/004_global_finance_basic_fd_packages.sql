-- NovoPay Finance only: seed the exact Global Finance Basic and FD package templates.
-- Safe to re-run: existing package rows are updated by unique name; other NovoPay data is untouched.
-- This copies package definitions only, not users, balances, activations, or credentials.
-- Configured return terms are estimates, not guaranteed returns.

ALTER TABLE packages ADD COLUMN IF NOT EXISTS package_type TEXT NOT NULL DEFAULT 'basic';
ALTER TABLE packages ADD COLUMN IF NOT EXISTS package_code TEXT;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS roi_rate NUMERIC(8,4);
ALTER TABLE packages ADD COLUMN IF NOT EXISTS duration_days INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS packages_package_code_unique
  ON packages (package_code) WHERE package_code IS NOT NULL;

WITH basic(amount, rate, days, n) AS (
  VALUES
    (2::numeric,5::numeric,25,1),(5,5,25,2),(10,1,25,3),(20,5,25,4),(25,5,25,5),
    (10000,1,25,6),(20000,1,25,7),(50000,1,25,8),(100000,1,25,9),(200000,1,25,10),(500000,1,25,11)
), rows AS (
  SELECT 'Base Plan ' || n AS name, amount AS price, 'basic'::text AS package_type,
    'GF_BASE_' || lpad(n::text,2,'0') AS package_code, rate AS roi_rate, days AS duration_days,
    'Fixed ' || to_char(amount, 'FM999,999,999,990.##') || ' USDT plan. Configured daily return: ' || rate || '% for ' || days || ' days. Returns are estimates, not guarantees.' AS description
  FROM basic
  UNION ALL
  SELECT 'Base FD Plan ' || n, amount, 'fd',
    'GF_FD_BASE_' || lpad(n::text,2,'0'), 1::numeric, 365,
    'Fixed ' || to_char(amount, 'FM999,999,999,990.##') || ' USDT FD plan for 365 days. Configured daily rate: 1%. Returns are estimates, not guarantees.'
  FROM (VALUES (1000::numeric,1),(2000,2),(5000,3),(10000,4),(20000,5),(50000,6),(100000,7),(200000,8),(500000,9)) x(amount,n)
  UNION ALL
  SELECT 'Prime FD Plan ' || n, amount, 'fd',
    'GF_FD_PRIME_' || lpad(n::text,2,'0'), 1.5::numeric, 515,
    'Fixed ' || to_char(amount, 'FM999,999,999,990.##') || ' USDT Prime FD plan for 515 days. Configured daily rate: 1.5%. Returns are estimates, not guarantees.'
  FROM (VALUES (1000::numeric,1),(2000,2),(5000,3),(10000,4),(20000,5),(50000,6),(100000,7),(200000,8),(500000,9)) x(amount,n)
)
INSERT INTO packages (name, price, currency, status, description, package_type, package_code, roi_rate, duration_days)
SELECT name, price, 'USDT', 'active', description, package_type, package_code, roi_rate, duration_days
FROM rows
ON CONFLICT (name) DO UPDATE SET
  price = EXCLUDED.price,
  currency = EXCLUDED.currency,
  description = EXCLUDED.description,
  package_type = EXCLUDED.package_type,
  package_code = EXCLUDED.package_code,
  roi_rate = EXCLUDED.roi_rate,
  duration_days = EXCLUDED.duration_days,
  status = CASE WHEN packages.status = 'archived' THEN 'archived' ELSE 'active' END,
  updated_at = now();
