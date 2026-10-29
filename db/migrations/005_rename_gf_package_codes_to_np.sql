-- Rename legacy Global Finance package codes to NovoPay codes.
-- Only package_code identifiers are changed; package names, prices, ROI, durations,
-- activations, wallet balances, and ledger records remain untouched.
UPDATE packages
SET package_code = regexp_replace(package_code, '^GF_', 'NP_'),
    updated_at = now()
WHERE package_code LIKE 'GF\_%' ESCAPE '\';
