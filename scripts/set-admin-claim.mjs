import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();

if (!raw || !email) {
  throw new Error("Set FIREBASE_SERVICE_ACCOUNT_JSON and ADMIN_EMAIL in your local shell before running this script.");
}

const serviceAccount = JSON.parse(raw);
const app = getApps()[0] || initializeApp({ credential: cert(serviceAccount) });
const auth = getAuth(app);
const user = await auth.getUserByEmail(email);
await auth.setCustomUserClaims(user.uid, { ...(user.customClaims || {}), admin: true });
console.log(`Admin claim set for ${email}. Sign out and sign in again to refresh the ID token.`);
