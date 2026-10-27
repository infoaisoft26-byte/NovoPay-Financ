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
