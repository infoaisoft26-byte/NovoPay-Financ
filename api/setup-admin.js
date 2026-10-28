import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

function getAdminAuth() {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    const error = new Error("NovoPay Firebase admin backend is not configured.");
    error.status = 503;
    throw error;
  }
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(serviceAccountJson);
  } catch {
    try { serviceAccount = JSON.parse(Buffer.from(serviceAccountJson, "base64").toString("utf8")); }
    catch {
      const error = new Error("NovoPay Firebase service account is not valid JSON.");
      error.status = 503;
      throw error;
    }
  }
  if (typeof serviceAccount === "string") serviceAccount = JSON.parse(serviceAccount);
  if (serviceAccount.project_id !== "novopay-finance" || !serviceAccount.client_email || !serviceAccount.private_key) {
    const error = new Error("Firebase service account must belong to the novopay-finance project.");
    error.status = 503;
    throw error;
  }
  serviceAccount.private_key = String(serviceAccount.private_key).replace(/\\n/g, "\n");
  const appName = "novopay-admin-setup";
  const app = getApps().find((item) => item.name === appName) || initializeApp({ credential: cert(serviceAccount), projectId: "novopay-finance" }, appName);
  return getAuth(app);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Vary", "Authorization");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  try {
    const auth = getAdminAuth();
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) return res.status(401).json({ error: "Please sign in to set up admin access." });

    let decoded;
    try {
      decoded = await auth.verifyIdToken(token, true);
    } catch {
      return res.status(401).json({ error: "Your session is invalid or expired. Please sign in again." });
    }

    if (String(decoded.email || "").trim().toLowerCase() !== "admin@novopay.app") {
      return res.status(403).json({ error: "Only the designated NovoPay administrator can run this setup." });
    }

    const account = await auth.getUser(decoded.uid);
    if (String(account.email || "").trim().toLowerCase() !== "admin@novopay.app") {
      return res.status(403).json({ error: "The signed-in account does not match the NovoPay admin account." });
    }

    const existingClaims = account.customClaims || {};
    if (existingClaims.admin === true) {
      return res.status(200).json({ ok: true, message: "Admin permission is already configured." });
    }

    await auth.setCustomUserClaims(account.uid, { ...existingClaims, admin: true });
    return res.status(200).json({
      ok: true,
      message: "Admin permission configured. Refreshing the sign-in token is required.",
    });
  } catch (error) {
    const status = error?.status || 500;
    return res.status(status).json({
      error: status === 503 ? error.message : "Admin permission setup could not be completed.",
    });
  }
}
