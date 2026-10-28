import { randomUUID } from "node:crypto";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { neon } from "@neondatabase/serverless";

let adminAuth;
let sql;
function services() {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson || !process.env.DATABASE_URL) {
    const error = new Error("NovoPay account backend is not configured yet.");
    error.status = 503;
    throw error;
  }
  if (!adminAuth) {
    const serviceAccount = JSON.parse(serviceAccountJson);
    if (serviceAccount.project_id !== "novopay-finance") {
      const error = new Error("NovoPay Firebase service account must belong to the novopay-finance project.");
      error.status = 503;
      throw error;
    }
    const app = getApps()[0] || initializeApp({ credential: cert(serviceAccount) });
    adminAuth = getAuth(app);
  }
  if (!sql) sql = neon(process.env.DATABASE_URL);
  return { adminAuth, sql };
}

async function authenticatedUser(req, auth) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) {
    const error = new Error("Please sign in to view your account.");
    error.status = 401;
    throw error;
  }
  try {
    return await auth.verifyIdToken(token, true);
  } catch {
    const error = new Error("Your session has expired. Please sign in again.");
    error.status = 401;
    throw error;
  }
}

async function getProfile(db, uid) {
  const rows = await db`SELECT id, auth_uid, novopay_id, full_name, email, status, fund_balance, income_balance, created_at FROM users WHERE auth_uid = ${uid} LIMIT 1`;
  return rows[0] || null;
}

const queries = {
  deposits: (db, id, q, limit) => db`SELECT id, reference, amount, currency, status, tx_hash, created_at, reviewed_at FROM deposits WHERE user_id = ${id} AND (COALESCE(reference, '') ILIKE ${q} OR COALESCE(tx_hash, '') ILIKE ${q}) ORDER BY created_at DESC LIMIT ${limit}`,
  withdrawals: (db, id, q, limit) => db`SELECT id, reference, amount, fee, net_amount, currency, status, payout_reference, created_at, reviewed_at FROM withdrawals WHERE user_id = ${id} AND (COALESCE(reference, '') ILIKE ${q} OR COALESCE(payout_reference, '') ILIKE ${q}) ORDER BY created_at DESC LIMIT ${limit}`,
  transactions: (db, id, q, limit) => db`SELECT id, reference, type, amount, currency, status, description, created_at FROM ledger_transactions WHERE user_id = ${id} AND (COALESCE(reference, '') ILIKE ${q} OR COALESCE(type, '') ILIKE ${q} OR COALESCE(description, '') ILIKE ${q}) ORDER BY created_at DESC LIMIT ${limit}`,
  packages: (db, _id, q, limit) => db`SELECT id, name, price, currency, status, description, created_at FROM packages WHERE status = 'active' AND (COALESCE(name, '') ILIKE ${q} OR COALESCE(description, '') ILIKE ${q}) ORDER BY price ASC LIMIT ${limit}`,
  activations: (db, id, q, limit) => db`SELECT a.id, a.reference, a.user_id, a.amount, a.currency, a.status, a.activated_at, a.created_at, p.name AS package_name FROM package_activations a LEFT JOIN packages p ON p.id = a.package_id WHERE a.user_id = ${id} AND (COALESCE(a.reference, '') ILIKE ${q} OR COALESCE(p.name, '') ILIKE ${q}) ORDER BY a.created_at DESC LIMIT ${limit}`,
  p2p: (db, id, q, limit) => db`SELECT id, reference, sender_user_id, receiver_user_id, amount, currency, status, created_at FROM p2p_transfers WHERE (sender_user_id = ${id} OR receiver_user_id = ${id}) AND (COALESCE(reference, '') ILIKE ${q} OR COALESCE(sender_user_id, '') ILIKE ${q} OR COALESCE(receiver_user_id, '') ILIKE ${q}) ORDER BY created_at DESC LIMIT ${limit}`,
  support: (db, id, q, limit) => db`SELECT id, reference, subject, status, created_at, updated_at FROM support_tickets WHERE user_id = ${id} AND (COALESCE(reference, '') ILIKE ${q} OR COALESCE(subject, '') ILIKE ${q}) ORDER BY created_at DESC LIMIT ${limit}`,
};

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Vary", "Authorization");
  try {
    const { adminAuth: auth, sql: db } = services();
    const decoded = await authenticatedUser(req, auth);

    if (req.method === "POST") {
      const action = String(req.body?.action || "");
      if (action === "activate-package") {
        const packageId = String(req.body?.package_id || "");
        const idempotencyKey = String(req.body?.idempotency_key || "");
        if (!/^[0-9a-f-]{36}$/i.test(packageId)) {
          return res.status(400).json({ error: "Choose a valid package." });
        }
        if (!/^[0-9a-f-]{36}$/i.test(idempotencyKey)) {
          return res.status(400).json({ error: "Please refresh and try activating the package again." });
        }

        const profile = await getProfile(db, decoded.uid);
        if (!profile) return res.status(409).json({ error: "Your account profile is not ready yet. Refresh the dashboard and try again." });
        if (profile.status !== "active") return res.status(403).json({ error: "Your account is not active. Please contact NovoPay support." });

        const previous = await db`SELECT reference, amount, currency, description, created_at FROM ledger_transactions WHERE idempotency_key = ${idempotencyKey} LIMIT 1`;
        if (previous[0]) {
          return res.status(200).json({ ok: true, duplicate: true, message: "This package activation was already processed.", activation: previous[0] });
        }

        const activationReference = "NPA-" + randomUUID().replace(/-/g, "").slice(0, 18).toUpperCase();
        const ledgerReference = "NPL-" + randomUUID().replace(/-/g, "").slice(0, 18).toUpperCase();
        let result;
        try {
          result = await db`WITH selected_package AS MATERIALIZED (
              SELECT id, name, price, currency FROM packages WHERE id = ${packageId}::uuid AND status = 'active'
            ),
            debited_user AS (
              UPDATE users AS u
              SET fund_balance = u.fund_balance - p.price, updated_at = now()
              FROM selected_package AS p
              WHERE u.auth_uid = ${decoded.uid}
                AND u.status = 'active'
                AND u.fund_balance >= p.price
                AND NOT EXISTS (SELECT 1 FROM ledger_transactions WHERE idempotency_key = ${idempotencyKey})
              RETURNING u.novopay_id, u.fund_balance, u.income_balance
            ),
            activation AS (
              INSERT INTO package_activations (reference, user_id, package_id, amount, currency, status, activated_at)
              SELECT ${activationReference}, d.novopay_id, p.id, p.price, p.currency, 'active', now()
              FROM debited_user AS d CROSS JOIN selected_package AS p
              RETURNING reference, user_id, package_id, amount, currency, status, activated_at, created_at
            ),
            ledger AS (
              INSERT INTO ledger_transactions (reference, user_id, type, amount, currency, status, description, idempotency_key)
              SELECT ${ledgerReference}, a.user_id, 'package_purchase', -a.amount, a.currency, 'posted',
                'Package activation: ' || p.name, ${idempotencyKey}
              FROM activation AS a JOIN selected_package AS p ON p.id = a.package_id
              RETURNING id
            )
            SELECT a.reference, a.user_id, a.package_id, p.name AS package_name, a.amount, a.currency,
              a.status, a.activated_at, a.created_at, d.fund_balance, d.income_balance
            FROM activation AS a
            JOIN selected_package AS p ON p.id = a.package_id
            CROSS JOIN debited_user AS d
            CROSS JOIN ledger AS l`;
        } catch (error) {
          const duplicate = await db`SELECT reference, amount, currency, description, created_at FROM ledger_transactions WHERE idempotency_key = ${idempotencyKey} LIMIT 1`;
          if (duplicate[0]) {
            return res.status(200).json({ ok: true, duplicate: true, message: "This package activation was already processed.", activation: duplicate[0] });
          }
          throw error;
        }
        if (result[0]) {
          return res.status(200).json({ ok: true, message: "Package activated successfully.", activation: result[0] });
        }

        const packageRows = await db`SELECT id, price, currency FROM packages WHERE id = ${packageId}::uuid AND status = 'active' LIMIT 1`;
        if (!packageRows[0]) return res.status(404).json({ error: "This package is not available right now." });
        const freshProfile = await getProfile(db, decoded.uid);
        if (!freshProfile || Number(freshProfile.fund_balance) < Number(packageRows[0].price)) {
          return res.status(400).json({ error: "Insufficient Fund Wallet balance for this package." });
        }
        return res.status(409).json({ error: "Package activation could not be completed. Refresh and try again." });
      }

      if (action !== "ensure-profile") {
        return res.status(400).json({ error: "Unsupported account action." });
      }
      const email = String(decoded.email || "").trim().toLowerCase();
      if (!email) return res.status(400).json({ error: "A verified email address is required." });
      const displayName = String(req.body?.full_name || decoded.name || email.split("@")[0] || "Member").trim().slice(0, 120);
      const generatedId = "NP" + randomUUID().replace(/-/g, "").slice(0, 18).toUpperCase();
      const rows = await db`INSERT INTO users (auth_uid, novopay_id, full_name, email) VALUES (${decoded.uid}, ${generatedId}, ${displayName || "Member"}, ${email}) ON CONFLICT (auth_uid) DO UPDATE SET full_name = CASE WHEN users.full_name = '' THEN EXCLUDED.full_name ELSE users.full_name END, email = EXCLUDED.email, updated_at = now() RETURNING id, auth_uid, novopay_id, full_name, email, status, fund_balance, income_balance, created_at`;
      return res.status(200).json({ ok: true, user: rows[0] });
    }

    if (req.method !== "GET") {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ error: "Method not allowed." });
    }

    const section = String(req.query?.section || "overview").toLowerCase();
    const rawSearch = typeof req.query?.q === "string" ? req.query.q.trim().slice(0, 100) : "";
    const pattern = `%${rawSearch.replace(/[\\%_]/g, "\\$&")}%`;
    const parsedLimit = Number.parseInt(String(req.query?.limit || "50"), 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(100, Math.max(1, parsedLimit)) : 50;
    const profile = await getProfile(db, decoded.uid);

    if (!profile) {
      if (section === "packages") {
        const rows = await queries.packages(db, "", pattern, limit);
        return res.status(200).json({ ok: true, section, user: null, profilePending: true, rows });
      }
      return res.status(200).json({ ok: true, section, user: null, profilePending: true, rows: [] });
    }
    if (profile.status !== "active") {
      return res.status(403).json({ error: "Your account is not active. Please contact NovoPay support." });
    }

    if (section === "overview") {
      const [recentTransactions, pendingDeposits, pendingWithdrawals, activePackages] = await Promise.all([
        db`SELECT id, reference, type, amount, currency, status, description, created_at FROM ledger_transactions WHERE user_id = ${profile.novopay_id} ORDER BY created_at DESC LIMIT 5`,
        db`SELECT count(*)::int AS count FROM deposits WHERE user_id = ${profile.novopay_id} AND status = 'pending'`,
        db`SELECT count(*)::int AS count FROM withdrawals WHERE user_id = ${profile.novopay_id} AND status = 'pending'`,
        db`SELECT count(*)::int AS count FROM package_activations WHERE user_id = ${profile.novopay_id} AND status = 'active'`,
      ]);
      return res.status(200).json({
        ok: true, section, user: profile, rows: recentTransactions, recentTransactions,
        summary: { pendingDeposits: pendingDeposits[0]?.count ?? 0, pendingWithdrawals: pendingWithdrawals[0]?.count ?? 0, activePackages: activePackages[0]?.count ?? 0 },
      });
    }
    if (section === "wallet") {
      const rows = await queries.transactions(db, profile.novopay_id, pattern, limit);
      return res.status(200).json({ ok: true, section, user: profile, rows });
    }
    const query = queries[section];
    if (!query) return res.status(400).json({ error: "Unknown account section." });
    const rows = await query(db, profile.novopay_id, pattern, limit);
    if (section === "packages") {
      const activations = await queries.activations(db, profile.novopay_id, pattern, limit);
      return res.status(200).json({ ok: true, section, user: profile, rows, activations });
    }
    return res.status(200).json({ ok: true, section, user: profile, rows });
  } catch (error) {
    const status = error?.status || 500;
    if (status === 503 || status === 401) return res.status(status).json({ error: error.message });
    // Never send internal database or credential details to the browser.
    return res.status(status === 403 ? 403 : 500).json({ error: status === 403 ? error.message : "NovoPay account data could not be loaded." });
  }
}
