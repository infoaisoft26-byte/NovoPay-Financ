import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { neon } from "@neondatabase/serverless";

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
let adminAuth = null;
let db = null;

function getServices() {
  if (!serviceAccountJson || !process.env.DATABASE_URL) {
    const error = new Error("NovoPay admin backend is not configured.");
    error.status = 503;
    throw error;
  }
  if (!adminAuth) {
    const serviceAccount = JSON.parse(serviceAccountJson);
    const app = getApps()[0] || initializeApp({ credential: cert(serviceAccount) });
    adminAuth = getAuth(app);
  }
  if (!db) db = neon(process.env.DATABASE_URL);
  return { adminAuth, db };
}

const sectionQueries = {
  users: (sql, q, limit) => sql`SELECT id, auth_uid, novopay_id, full_name, email, status, fund_balance, income_balance, created_at FROM users WHERE (COALESCE(full_name, '') ILIKE ${q} OR COALESCE(email, '') ILIKE ${q} OR COALESCE(novopay_id, '') ILIKE ${q}) ORDER BY created_at DESC LIMIT ${limit}`,
  deposits: (sql, q, limit) => sql`SELECT id, reference, user_id, amount, currency, status, tx_hash, created_at, reviewed_at FROM deposits WHERE (COALESCE(reference, '') ILIKE ${q} OR COALESCE(tx_hash, '') ILIKE ${q} OR COALESCE(user_id, '') ILIKE ${q}) ORDER BY created_at DESC LIMIT ${limit}`,
  withdrawals: (sql, q, limit) => sql`SELECT id, reference, user_id, amount, fee, net_amount, currency, status, payout_reference, created_at, reviewed_at FROM withdrawals WHERE (COALESCE(reference, '') ILIKE ${q} OR COALESCE(user_id, '') ILIKE ${q} OR COALESCE(payout_reference, '') ILIKE ${q}) ORDER BY created_at DESC LIMIT ${limit}`,
  transactions: (sql, q, limit) => sql`SELECT id, reference, user_id, type, amount, currency, status, description, created_at FROM ledger_transactions WHERE (COALESCE(reference, '') ILIKE ${q} OR COALESCE(user_id, '') ILIKE ${q} OR COALESCE(description, '') ILIKE ${q}) ORDER BY created_at DESC LIMIT ${limit}`,
  kyc: (sql, q, limit) => sql`SELECT id, user_id, status, document_type, submitted_at, reviewed_at, reviewer_uid FROM kyc_submissions WHERE (COALESCE(user_id, '') ILIKE ${q} OR COALESCE(document_type, '') ILIKE ${q}) ORDER BY submitted_at DESC LIMIT ${limit}`,
  packages: (sql, q, limit) => sql`SELECT id, name, price, currency, status, description, created_at, updated_at FROM packages WHERE (COALESCE(name, '') ILIKE ${q} OR COALESCE(description, '') ILIKE ${q}) ORDER BY created_at DESC LIMIT ${limit}`,
  activations: (sql, q, limit) => sql`SELECT id, reference, user_id, package_id, amount, currency, status, activated_at, created_at FROM package_activations WHERE (COALESCE(reference, '') ILIKE ${q} OR COALESCE(user_id, '') ILIKE ${q}) ORDER BY created_at DESC LIMIT ${limit}`,
  p2p: (sql, q, limit) => sql`SELECT id, reference, sender_user_id, receiver_user_id, amount, currency, status, created_at FROM p2p_transfers WHERE (COALESCE(reference, '') ILIKE ${q} OR COALESCE(sender_user_id, '') ILIKE ${q} OR COALESCE(receiver_user_id, '') ILIKE ${q}) ORDER BY created_at DESC LIMIT ${limit}`,
  support: (sql, q, limit) => sql`SELECT id, reference, user_id, subject, status, created_at, updated_at FROM support_tickets WHERE (COALESCE(reference, '') ILIKE ${q} OR COALESCE(subject, '') ILIKE ${q} OR COALESCE(user_id, '') ILIKE ${q}) ORDER BY created_at DESC LIMIT ${limit}`,
  feedback: (sql, q, limit) => sql`SELECT id, user_id, message, status, created_at FROM website_feedback WHERE (COALESCE(user_id, '') ILIKE ${q} OR COALESCE(message, '') ILIKE ${q}) ORDER BY created_at DESC LIMIT ${limit}`,
  surveys: (sql, q, limit) => sql`SELECT id, user_id, survey_key, response, created_at FROM survey_responses WHERE (COALESCE(user_id, '') ILIKE ${q} OR COALESCE(survey_key, '') ILIKE ${q}) ORDER BY created_at DESC LIMIT ${limit}`,
  audit: (sql, q, limit) => sql`SELECT id, actor_uid, action, entity_type, entity_id, details, created_at FROM audit_logs WHERE (COALESCE(actor_uid, '') ILIKE ${q} OR COALESCE(action, '') ILIKE ${q} OR COALESCE(entity_id, '') ILIKE ${q}) ORDER BY created_at DESC LIMIT ${limit}`,
  posters: (sql, q, limit) => sql`SELECT id, title, image_url, status, starts_at, ends_at, created_at FROM offer_posters WHERE COALESCE(title, '') ILIKE ${q} ORDER BY created_at DESC LIMIT ${limit}`,
};

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Vary", "Authorization");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }

  try {
    const { adminAuth, db } = getServices();
    const authorization = req.headers.authorization || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token) return res.status(401).json({ error: "Sign-in required." });

    let decoded;
    try {
      decoded = await adminAuth.verifyIdToken(token, true);
    } catch {
      return res.status(401).json({ error: "Session is invalid or expired." });
    }
    if (decoded.admin !== true) {
      return res.status(403).json({ error: "Administrator permission is required." });
    }

    const section = String(req.query?.section || "overview").toLowerCase();
    if (section === "overview") {
      const counts = await Promise.all([
        db`SELECT count(*)::int AS count FROM users`,
        db`SELECT count(*)::int AS count FROM deposits WHERE status = 'pending'`,
        db`SELECT count(*)::int AS count FROM withdrawals WHERE status = 'pending'`,
        db`SELECT count(*)::int AS count FROM ledger_transactions`,
        db`SELECT count(*)::int AS count FROM kyc_submissions WHERE status = 'pending'`,
        db`SELECT count(*)::int AS count FROM packages WHERE status = 'active'`,
        db`SELECT count(*)::int AS count FROM support_tickets WHERE status IN ('open', 'pending')`,
        db`SELECT count(*)::int AS count FROM audit_logs`,
      ]);
      return res.status(200).json({
        ok: true,
        section,
        counts: {
          users: counts[0][0].count,
          pendingDeposits: counts[1][0].count,
          pendingWithdrawals: counts[2][0].count,
          transactions: counts[3][0].count,
          pendingKyc: counts[4][0].count,
          activePackages: counts[5][0].count,
          openTickets: counts[6][0].count,
          auditEvents: counts[7][0].count,
        },
      });
    }

    const runQuery = sectionQueries[section];
    if (!runQuery) return res.status(400).json({ error: "Unknown or unsupported section." });
    const rawSearch = typeof req.query?.q === "string" ? req.query.q.trim().slice(0, 120) : "";
    const pattern = `%${rawSearch.replace(/[\\%_]/g, "\\$&")}%`;
    const requestedLimit = Number.parseInt(String(req.query?.limit || "50"), 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(100, Math.max(1, requestedLimit)) : 50;
    const rows = await runQuery(db, pattern, limit);
    return res.status(200).json({ ok: true, section, rows });
  } catch (error) {
    const status = error?.status || 500;
    if (status === 503) return res.status(503).json({ error: error.message });
    // Keep internal database/service details out of API responses.
    return res.status(500).json({ error: "Admin data could not be loaded." });
  }
}
