import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { neon } from "@neondatabase/serverless";

let adminAuth = null;
let db = null;

function configurationError(message) {
  const error = new Error(message);
  error.status = 503;
  return error;
}

function parseServiceAccount(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) throw configurationError("NovoPay Firebase server credentials are missing.");
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(value);
  } catch {
    try {
      serviceAccount = JSON.parse(Buffer.from(value, "base64").toString("utf8"));
    } catch {
      throw configurationError("NovoPay Firebase server credentials are not valid JSON.");
    }
  }
  if (typeof serviceAccount === "string") {
    try { serviceAccount = JSON.parse(serviceAccount); }
    catch { throw configurationError("NovoPay Firebase server credentials are not valid JSON."); }
  }
  if (!serviceAccount || typeof serviceAccount !== "object" ||
      serviceAccount.project_id !== "novopay-finance" ||
      !serviceAccount.client_email || !serviceAccount.private_key) {
    throw configurationError("NovoPay Firebase credentials must be a complete service account for novopay-finance.");
  }
  serviceAccount.private_key = String(serviceAccount.private_key).replace(/\\n/g, "\n");
  return serviceAccount;
}

function getServices() {
  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const databaseUrl = String(process.env.DATABASE_URL || "").trim();
  if (!rawServiceAccount || !databaseUrl) {
    throw configurationError("NovoPay admin backend is not configured. Check production server environment variables.");
  }
  if (!/^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
    throw configurationError("NovoPay DATABASE_URL is not a valid PostgreSQL URL.");
  }
  if (!adminAuth) {
    const serviceAccount = parseServiceAccount(rawServiceAccount);
    const appName = "novopay-admin-api";
    const app = getApps().find((item) => item.name === appName) ||
      initializeApp({ credential: cert(serviceAccount), projectId: "novopay-finance" }, appName);
    adminAuth = getAuth(app);
  }
  if (!db) db = neon(databaseUrl);
  return { adminAuth, db };
}

const sectionQueries = {
  users: (sql, q, limit) => sql`SELECT id, auth_uid, novopay_id, full_name, email, status, fund_balance, income_balance, created_at FROM users WHERE (COALESCE(full_name, '') ILIKE ${q} OR COALESCE(email, '') ILIKE ${q} OR COALESCE(novopay_id, '') ILIKE ${q}) ORDER BY created_at DESC LIMIT ${limit}`,
  deposits: (sql, q, limit) => sql`SELECT id, reference, user_id, amount, currency, status, tx_hash, created_at, reviewed_at FROM deposits WHERE (COALESCE(reference, '') ILIKE ${q} OR COALESCE(tx_hash, '') ILIKE ${q} OR COALESCE(user_id, '') ILIKE ${q}) ORDER BY created_at DESC LIMIT ${limit}`,
  withdrawals: (sql, q, limit) => sql`SELECT id, reference, user_id, amount, fee, net_amount, currency, status, payout_reference, created_at, reviewed_at FROM withdrawals WHERE (COALESCE(reference, '') ILIKE ${q} OR COALESCE(user_id, '') ILIKE ${q} OR COALESCE(payout_reference, '') ILIKE ${q}) ORDER BY created_at DESC LIMIT ${limit}`,
  transactions: (sql, q, limit) => sql`SELECT id, reference, user_id, type, amount, currency, status, description, created_at FROM ledger_transactions WHERE (COALESCE(reference, '') ILIKE ${q} OR COALESCE(user_id, '') ILIKE ${q} OR COALESCE(description, '') ILIKE ${q}) ORDER BY created_at DESC LIMIT ${limit}`,
  kyc: (sql, q, limit) => sql`SELECT id, user_id, status, document_type, submitted_at, reviewed_at, reviewer_uid FROM kyc_submissions WHERE (COALESCE(user_id, '') ILIKE ${q} OR COALESCE(document_type, '') ILIKE ${q}) ORDER BY submitted_at DESC LIMIT ${limit}`,
  packages: (sql, q, limit) => sql`SELECT p.id, p.name, p.price, p.currency, p.status, p.description, to_jsonb(p)->>'package_type' AS package_type, to_jsonb(p)->>'package_code' AS package_code, to_jsonb(p)->>'roi_rate' AS roi_rate, to_jsonb(p)->>'duration_days' AS duration_days, p.created_at, p.updated_at FROM packages p WHERE (COALESCE(p.name, '') ILIKE ${q} OR COALESCE(p.description, '') ILIKE ${q} OR COALESCE(to_jsonb(p)->>'package_type', '') ILIKE ${q}) ORDER BY CASE to_jsonb(p)->>'package_type' WHEN 'basic' THEN 1 WHEN 'fd' THEN 2 ELSE 3 END, p.price ASC LIMIT ${limit}`,
  activations: (sql, q, limit) => sql`SELECT id, reference, user_id, package_id, amount, currency, status, activated_at, created_at FROM package_activations WHERE (COALESCE(reference, '') ILIKE ${q} OR COALESCE(user_id, '') ILIKE ${q}) ORDER BY created_at DESC LIMIT ${limit}`,
  p2p: (sql, q, limit) => sql`SELECT id, reference, sender_user_id, receiver_user_id, amount, currency, status, created_at FROM p2p_transfers WHERE (COALESCE(reference, '') ILIKE ${q} OR COALESCE(sender_user_id, '') ILIKE ${q} OR COALESCE(receiver_user_id, '') ILIKE ${q}) ORDER BY created_at DESC LIMIT ${limit}`,
  support: (sql, q, limit) => sql`SELECT id, reference, user_id, subject, status, created_at, updated_at FROM support_tickets WHERE (COALESCE(reference, '') ILIKE ${q} OR COALESCE(subject, '') ILIKE ${q} OR COALESCE(user_id, '') ILIKE ${q}) ORDER BY created_at DESC LIMIT ${limit}`,
  feedback: (sql, q, limit) => sql`SELECT id, user_id, message, status, created_at FROM website_feedback WHERE (COALESCE(user_id, '') ILIKE ${q} OR COALESCE(message, '') ILIKE ${q}) ORDER BY created_at DESC LIMIT ${limit}`,
  surveys: (sql, q, limit) => sql`SELECT id, user_id, survey_key, response, created_at FROM survey_responses WHERE (COALESCE(user_id, '') ILIKE ${q} OR COALESCE(survey_key, '') ILIKE ${q}) ORDER BY created_at DESC LIMIT ${limit}`,
  audit: (sql, q, limit) => sql`SELECT id, actor_uid, action, entity_type, entity_id, details, created_at FROM audit_logs WHERE (COALESCE(actor_uid, '') ILIKE ${q} OR COALESCE(action, '') ILIKE ${q} OR COALESCE(entity_id, '') ILIKE ${q}) ORDER BY created_at DESC LIMIT ${limit}`,
  posters: (sql, q, limit) => sql`SELECT id, title, image_url, status, starts_at, ends_at, created_at FROM offer_posters WHERE COALESCE(title, '') ILIKE ${q} ORDER BY created_at DESC LIMIT ${limit}`,
  reports: (sql) => sql`SELECT 'Registered users' AS name, 'live' AS status, count(*)::text || ' accounts' AS details FROM users
    UNION ALL SELECT 'Active package investment', 'live', COALESCE(to_char(sum(amount), 'FM999999990.00'), '0.00') || ' USDT' FROM package_activations WHERE status = 'active'
    UNION ALL SELECT 'Ledger transactions', 'live', count(*)::text || ' entries' FROM ledger_transactions
    UNION ALL SELECT 'Pending deposits', 'review', count(*)::text || ' requests' FROM deposits WHERE status = 'pending'
    UNION ALL SELECT 'Pending withdrawals', 'review', count(*)::text || ' requests' FROM withdrawals WHERE status = 'pending'
    UNION ALL SELECT 'Open support tickets', 'review', count(*)::text || ' tickets' FROM support_tickets WHERE status IN ('open', 'pending')`,
  leaderboard: (sql, q, limit) => sql`SELECT u.novopay_id, u.full_name, u.sponsor_user_id,
      COALESCE(sum(a.amount) FILTER (WHERE a.status = 'active'), 0)::numeric(20,8) AS total_investment,
      (SELECT count(*)::int FROM users child WHERE child.sponsor_user_id = u.novopay_id) AS direct_members
    FROM users u LEFT JOIN package_activations a ON a.user_id = u.novopay_id
    WHERE (COALESCE(u.novopay_id, '') ILIKE ${q} OR COALESCE(u.full_name, '') ILIKE ${q})
    GROUP BY u.novopay_id, u.full_name, u.sponsor_user_id
    ORDER BY total_investment DESC, u.created_at ASC LIMIT ${limit}`,
  settings: (sql) => sql`SELECT 'Database connection' AS name, 'connected' AS status, 'Live NovoPay database queries are responding' AS details
    UNION ALL SELECT 'Package catalog', CASE WHEN count(*) FILTER (WHERE status = 'active') > 0 THEN 'active' ELSE 'needs setup' END, count(*) FILTER (WHERE status = 'active')::text || ' active packages' FROM packages
    UNION ALL SELECT 'Admin authorization', 'protected', 'Firebase verified ID token and admin claim required'`,
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
      const [counts, recentActivity] = await Promise.all([
        Promise.all([
          db`SELECT count(*)::int AS count FROM users`,
          db`SELECT count(*)::int AS count FROM deposits WHERE status = 'pending'`,
          db`SELECT count(*)::int AS count FROM withdrawals WHERE status = 'pending'`,
          db`SELECT count(*)::int AS count FROM ledger_transactions`,
          db`SELECT count(*)::int AS count FROM kyc_submissions WHERE status = 'pending'`,
          db`SELECT count(*)::int AS count FROM packages WHERE status = 'active'`,
          db`SELECT count(*)::int AS count FROM support_tickets WHERE status IN ('open', 'pending')`,
          db`SELECT count(*)::int AS count FROM audit_logs`,
        ]),
        db`SELECT id, reference, user_id, type, amount, currency, status, description, created_at FROM ledger_transactions ORDER BY created_at DESC LIMIT 8`,
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
        recentActivity,
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
    // Safe server-side diagnostics only; never expose SQL or credentials to the browser.
    console.error("[NovoPay API] /api/admin failed", {
      name: error?.name,
      message: error?.message,
      code: error?.code,
      status,
      section: req.query?.section || "overview"
    });
    if (status === 503) return res.status(503).json({ error: error.message });
    return res.status(500).json({ error: "Admin data could not be loaded." });
  }
}
