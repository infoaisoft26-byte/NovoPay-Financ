# NovoPay Finance

Independent starter application for the Firebase project `novopay-finance`.

## Safety boundaries
- This project is separate from Global Finance and its production infrastructure.
- Work is on `novopay/independent-starter`; do not merge into `main` without review.
- The starter intentionally does not process deposits, withdrawals, investment returns, or real-money transactions.
- Never add service-account JSON, private keys, production credentials, or real payment secrets to the repository.

## Local setup
1. Install Node.js 20 or later.
2. Copy `.env.example` to `.env.local`.
3. Set `VITE_FIREBASE_API_KEY` and confirm the remaining values match the independent `novopay-finance` Firebase project.
4. Run `npm install`, then `npm run dev`.
5. Run `npm run build` before deployment.

## Firebase
Only the Firebase web client configuration belongs in Vite public environment variables. Configure Firebase Authentication providers and restrictive Firestore/Storage rules separately before enabling account features. Do not use Global Finance credentials or databases.

## Deployment
Deploy this branch as a preview first. Set the Vite environment variables on the new NovoPay deployment only. Keep production domains and credentials for other projects untouched.


## Admin API foundation (read-only)

The `api/admin.js` endpoint is intentionally read-only. It verifies Firebase ID tokens and requires the server-verified custom claim `admin: true`; matching an email address in browser code is not treated as authorization. No deposit approvals, withdrawals, wallet credits, package mutations, or other financial writes are exposed by this API.

### Required Vercel environment variables

Set these on the NovoPay project only:
- `DATABASE_URL`: pooled connection string for a dedicated NovoPay Neon database.
- `FIREBASE_SERVICE_ACCOUNT_JSON`: Firebase service-account JSON as a single environment-variable value for the `novopay-finance` project. Keep it secret; never commit it.
- Keep the existing `VITE_FIREBASE_*` web configuration for the client.

### Database setup

1. Create/select a dedicated NovoPay database. Do not reuse Global Finance's database.
2. Review and apply `db/schema.sql` to that NovoPay database.
3. Add the Vercel environment variables above and redeploy.
4. In a trusted local shell, set `FIREBASE_SERVICE_ACCOUNT_JSON` and `ADMIN_EMAIL=admin@novopay.app`, then run `node scripts/set-admin-claim.mjs` once. Do not run this script with an untrusted service account. Sign out/in afterwards to refresh the ID token.
5. Confirm that the admin API returns live counts only after the database and claim are configured.

The API intentionally fails closed if configuration, authentication, or the admin claim is missing. This starter does not invent seed users or financial records. Before enabling any money-moving operation, implement audited transactional endpoints, idempotency, authorization checks, and reconciliation tests.
