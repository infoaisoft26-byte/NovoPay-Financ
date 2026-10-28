# Global Finance → NovoPay Finance migration

Target repository: `infoaisoft26-byte/NovoPay-Financ`
Target branch: `migration/global-finance-modules`
Base: `novopay/backend-foundation`
Reference repository: `infoaisoft26-byte/Global-finance` (read-only reference)

## Migration rules
- Keep NovoPay's Firebase project, database, authentication, secrets, and domain independent.
- Do not copy Global Finance production user records, balances, wallet addresses, private keys, service-account JSON, or production environment variables.
- Financial screens must read verified NovoPay backend records; never use demo or fabricated balances.
- Do not enable real-money deposits, withdrawals, returns, or transfers until server-side authorization, idempotency, ledger transactions, and verification tests are in place.

## Feature inventory to migrate
- [ ] Member authentication, profile, dashboard, wallet summaries, notifications
- [ ] Basic and FD package catalog, purchase/activation history
- [ ] Deposit/recharge flow with server-side USDT transaction verification and duplicate-credit protection
- [ ] Withdrawals, fee calculation, admin review, refund/reversal handling
- [ ] Transactions/ledger and daily/monthly income reports
- [ ] Direct team, downline/team filters, referral lookup, level 1–15 reporting
- [ ] P2P transfers with atomic sender/receiver ledger entries
- [ ] Admin dashboard, users, user details, packages, activations, deposits, withdrawals, reports
- [ ] Investment leaderboard and verified level summaries
- [ ] Support tickets, feedback, surveys, notifications, offer posters
- [ ] Admin settings, audit logs, role/permission controls
- [ ] Telegram support integration (NovoPay-owned bot/config only)
- [ ] Security rules, API authorization, tests, build/deployment verification

## Status
- [x] Confirmed target repository.
- [x] Created isolated migration branch from NovoPay's backend-foundation branch.
- [ ] Map source features to NovoPay data model and API authorization.
- [ ] Implement features in small, build-checked groups.
- [ ] Validate backend and UI before proposing deployment.

This tracker records migration scope only. It does not mean the listed features are already implemented.
