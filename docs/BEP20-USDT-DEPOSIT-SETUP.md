# NovoPay BEP20 USDT deposits — setup and release checklist

This checklist applies only to the separate `novopay-finance` backend and database.

## Required server-side configuration

Set these in the NovoPay Vercel project (Production and Preview as appropriate):

- `BSC_RPC_URL`: trusted BNB Smart Chain RPC endpoint. Keep it server-side.
- `USDT_BEP20_TOKEN_CONTRACT`: exact verified USDT token contract for BNB Smart Chain.
- `USDT_BEP20_RECEIVING_ADDRESS`: the receiving wallet address supplied and confirmed by the project owner.
- `USDT_BEP20_MIN_CONFIRMATIONS`: required confirmation count chosen for operational risk tolerance.
- `FIREBASE_SERVICE_ACCOUNT_JSON`: service account for the `novopay-finance` Firebase project.
- `DATABASE_URL`: connection string for the separate NovoPay Neon database.

Never put private keys, seed phrases, or signing credentials in Vite/client variables. A public receiving address is not a private key. Do not enable deposits while the receiving address, token contract, RPC, and database schema have not been verified.

## Required deposit flow

1. The signed-in user sees the configured network (BEP20), token symbol, receiving address, copy action, QR code, and deposit instructions.
2. User submits a transaction hash. Server derives the user from the verified Firebase ID token; it must not trust a client-supplied user ID or amount.
3. Server fetches the transaction and receipt from BNB Smart Chain and validates: successful receipt, expected chain, USDT contract address, ERC-20 Transfer event, exact recipient, positive token amount/decimals, and minimum confirmations.
4. The transaction hash has a database unique constraint. A hash cannot be submitted twice, even across different users.
5. A valid on-chain transfer is marked `verified` and remains visible to admin for review. Invalid or not-yet-confirmed transactions must not be credited.
6. Admin actions require a server-verified admin role, record reviewer UID, timestamp, decision, and audit event. Rejections require a reason.
7. Balance credit, if enabled after accounting review, must be a single database transaction that creates exactly one ledger entry and marks the request credited atomically. Enforce uniqueness on the ledger/deposit reference. Never credit on a browser response or based only on a pasted hash.
8. User dashboard and admin dashboard should display matching status, amount, network, hash, submission/verification/review timestamps, and failure/rejection reason where applicable.

## Database migration

Apply `db/migrations/003_bep20_usdt_deposits.sql` only to the NovoPay database after checking the existing `users` schema and migration process. It adds deposit-request and audit tables; it does not change balances or credit funds.

## Release gates — not yet confirmed

- [ ] Owner provides and verifies the receiving address.
- [ ] Confirm official token contract and decimals from a trusted source.
- [ ] Confirm `users` schema and apply migration to NovoPay database.
- [ ] Add/verify server-side transaction receipt verification endpoint.
- [ ] Add admin deposit queue and role-protected approve/reject actions.
- [ ] Connect user deposit screen and show consistent status/history.
- [ ] Add atomic, idempotent ledger-credit flow only after accounting review.
- [ ] Test wrong network, wrong token, wrong recipient, failed receipt, insufficient confirmations, duplicate hash, unauthorized admin, and repeated approval.
- [ ] Deploy and verify the actual production deployment and smoke tests.

Until all release gates pass, do not display the feature as live or instruct users to send funds.
