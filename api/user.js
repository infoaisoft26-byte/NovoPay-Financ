import { randomUUID } from "node:crypto";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { neon } from "@neondatabase/serverless";

let adminAuth;
let sql;

function configurationError(message) {
  const error = new Error(message);
  error.status = 503;
  return error;
}

function parseServiceAccount(rawValue) {
  let value = String(rawValue || "").trim();
  if (!value) throw configurationError("NovoPay Firebase server credentials are missing.");

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(value);
  } catch {
    // Accept a base64-encoded service-account JSON as well as plain JSON.
    try {
      serviceAccount = JSON.parse(Buffer.from(value, "base64").toString("utf8"));
    } catch {
      throw configurationError("NovoPay Firebase server credentials are not valid JSON. Recheck FIREBASE_SERVICE_ACCOUNT_JSON.");
    }
  }
  if (typeof serviceAccount === "string") {
    try {
      serviceAccount = JSON.parse(serviceAccount);
    } catch {
      throw configurationError("NovoPay Firebase server credentials are not valid JSON.");
    }
  }
  if (!serviceAccount || typeof serviceAccount !== "object" ||
      serviceAccount.project_id !== "novopay-finance" ||
      !serviceAccount.client_email || !serviceAccount.private_key) {
    throw configurationError("NovoPay Firebase server credentials must be a complete service account for novopay-finance.");
  }
  serviceAccount.private_key = String(serviceAccount.private_key).replace(/\\n/g, "\n");
  return serviceAccount;
}

function services() {
  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const databaseUrl = String(process.env.DATABASE_URL || "").trim();
  if (!rawServiceAccount || !databaseUrl) {
    throw configurationError("NovoPay account backend is not configured yet. Check the production server environment variables.");
  }
  if (!/^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
    throw configurationError("NovoPay DATABASE_URL is not a valid PostgreSQL connection URL.");
  }
  if (!adminAuth) {
    const serviceAccount = parseServiceAccount(rawServiceAccount);
    const appName = "novopay-user-api";
    const app = getApps().find((item) => item.name === appName) ||
      initializeApp({ credential: cert(serviceAccount), projectId: "novopay-finance" }, appName);
    adminAuth = getAuth(app);
  }
  if (!sql) sql = neon(databaseUrl);
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
  const rows = await db`SELECT id, auth_uid, novopay_id, full_name, email, mobile, status, fund_balance, income_balance, referral_code, sponsor_user_id, created_at FROM users WHERE auth_uid = ${uid} LIMIT 1`;
  return rows[0] || null;
}

const queries = {
  deposits: (db, id, q, limit) => db`SELECT id, reference, amount, currency, status, tx_hash, created_at, reviewed_at FROM deposits WHERE user_id = ${id} AND (COALESCE(reference, '') ILIKE ${q} OR COALESCE(tx_hash, '') ILIKE ${q}) ORDER BY created_at DESC LIMIT ${limit}`,
  withdrawals: (db, id, q, limit) => db`SELECT id, reference, amount, fee, net_amount, currency, status, payout_reference, created_at, reviewed_at FROM withdrawals WHERE user_id = ${id} AND (COALESCE(reference, '') ILIKE ${q} OR COALESCE(payout_reference, '') ILIKE ${q}) ORDER BY created_at DESC LIMIT ${limit}`,
  transactions: (db, id, q, limit) => db`SELECT id, reference, type, amount, currency, status, description, created_at FROM ledger_transactions WHERE user_id = ${id} AND (COALESCE(reference, '') ILIKE ${q} OR COALESCE(type, '') ILIKE ${q} OR COALESCE(description, '') ILIKE ${q}) ORDER BY created_at DESC LIMIT ${limit}`,
  packages: (db, _id, q, limit) => db`SELECT p.id, p.name, p.price, p.currency, p.status, p.description, to_jsonb(p)->>'package_type' AS package_type, to_jsonb(p)->>'package_code' AS package_code, to_jsonb(p)->>'roi_rate' AS roi_rate, to_jsonb(p)->>'duration_days' AS duration_days, p.created_at FROM packages p WHERE p.status = 'active' AND (COALESCE(p.name, '') ILIKE ${q} OR COALESCE(p.description, '') ILIKE ${q} OR COALESCE(to_jsonb(p)->>'package_type', '') ILIKE ${q}) ORDER BY CASE to_jsonb(p)->>'package_type' WHEN 'basic' THEN 1 WHEN 'fd' THEN 2 ELSE 3 END, p.price ASC LIMIT ${limit}`,
  activations: (db, id, q, limit) => db`SELECT a.id, a.reference, a.user_id, a.amount, a.currency, a.status, a.activated_at, a.created_at, p.name AS package_name FROM package_activations a LEFT JOIN packages p ON p.id = a.package_id WHERE a.user_id = ${id} AND (COALESCE(a.reference, '') ILIKE ${q} OR COALESCE(p.name, '') ILIKE ${q}) ORDER BY a.created_at DESC LIMIT ${limit}`,
  p2p: (db, id, q, limit) => db`SELECT id, reference, sender_user_id, receiver_user_id, amount, currency, status, created_at FROM p2p_transfers WHERE (sender_user_id = ${id} OR receiver_user_id = ${id}) AND (COALESCE(reference, '') ILIKE ${q} OR COALESCE(sender_user_id, '') ILIKE ${q} OR COALESCE(receiver_user_id, '') ILIKE ${q}) ORDER BY created_at DESC LIMIT ${limit}`,
  support: (db, id, q, limit) => db`SELECT id, reference, subject, status, created_at, updated_at FROM support_tickets WHERE user_id = ${id} AND (COALESCE(reference, '') ILIKE ${q} OR COALESCE(subject, '') ILIKE ${q}) ORDER BY created_at DESC LIMIT ${limit}`,

  "transfer-income-fund": (db, id, q, limit) => db`SELECT id, reference, type, amount, currency, status, description, created_at FROM ledger_transactions WHERE user_id = ${id} AND type IN ('income_to_fund', 'fund_wallet_transfer') AND (COALESCE(reference, '') ILIKE ${q} OR COALESCE(description, '') ILIKE ${q}) ORDER BY created_at DESC LIMIT ${limit}`,
  "income-all": (db, id, q, limit) => db`SELECT id, reference, type, amount, currency, status, description, created_at FROM ledger_transactions WHERE user_id = ${id} AND (type ILIKE '%income%' OR type ILIKE '%salary%' OR type ILIKE '%roi%' OR type ILIKE '%referral%' OR type ILIKE '%level%') AND (COALESCE(reference, '') ILIKE ${q} OR COALESCE(type, '') ILIKE ${q} OR COALESCE(description, '') ILIKE ${q}) ORDER BY created_at DESC LIMIT ${limit}`,
  "basic-roi": (db, id, q, limit) => db`SELECT id, reference, type, amount, currency, status, description, created_at FROM ledger_transactions WHERE user_id = ${id} AND (type ILIKE '%basic%roi%' OR (type ILIKE '%roi%' AND description ILIKE '%basic%')) AND (COALESCE(reference, '') ILIKE ${q} OR COALESCE(description, '') ILIKE ${q}) ORDER BY created_at DESC LIMIT ${limit}`,
  "basic-referral": (db, id, q, limit) => db`SELECT id, reference, type, amount, currency, status, description, created_at FROM ledger_transactions WHERE user_id = ${id} AND (type ILIKE '%basic%referral%' OR (type ILIKE '%referral%' AND description ILIKE '%basic%')) AND (COALESCE(reference, '') ILIKE ${q} OR COALESCE(description, '') ILIKE ${q}) ORDER BY created_at DESC LIMIT ${limit}`,
  "basic-level": (db, id, q, limit) => db`SELECT id, reference, type, amount, currency, status, description, created_at FROM ledger_transactions WHERE user_id = ${id} AND (type ILIKE '%basic%level%' OR (type ILIKE '%level%' AND description ILIKE '%basic%')) AND (COALESCE(reference, '') ILIKE ${q} OR COALESCE(description, '') ILIKE ${q}) ORDER BY created_at DESC LIMIT ${limit}`,
  "fd-roi": (db, id, q, limit) => db`SELECT id, reference, type, amount, currency, status, description, created_at FROM ledger_transactions WHERE user_id = ${id} AND (type ILIKE '%fd%roi%' OR (type ILIKE '%roi%' AND description ILIKE '%fd%')) AND (COALESCE(reference, '') ILIKE ${q} OR COALESCE(description, '') ILIKE ${q}) ORDER BY created_at DESC LIMIT ${limit}`,
  "fd-referral": (db, id, q, limit) => db`SELECT id, reference, type, amount, currency, status, description, created_at FROM ledger_transactions WHERE user_id = ${id} AND (type ILIKE '%fd%referral%' OR (type ILIKE '%referral%' AND description ILIKE '%fd%')) AND (COALESCE(reference, '') ILIKE ${q} OR COALESCE(description, '') ILIKE ${q}) ORDER BY created_at DESC LIMIT ${limit}`,
  "fd-level": (db, id, q, limit) => db`SELECT id, reference, type, amount, currency, status, description, created_at FROM ledger_transactions WHERE user_id = ${id} AND (type ILIKE '%fd%level%' OR (type ILIKE '%level%' AND description ILIKE '%fd%')) AND (COALESCE(reference, '') ILIKE ${q} OR COALESCE(description, '') ILIKE ${q}) ORDER BY created_at DESC LIMIT ${limit}`,
  salary: (db, id, q, limit) => db`SELECT id, reference, type, amount, currency, status, description, created_at FROM ledger_transactions WHERE user_id = ${id} AND (type ILIKE '%salary%' OR description ILIKE '%salary%') AND (COALESCE(reference, '') ILIKE ${q} OR COALESCE(description, '') ILIKE ${q}) ORDER BY created_at DESC LIMIT ${limit}`,
  "direct-team": (db, id, q, limit) => db`SELECT novopay_id, full_name, email, status, sponsor_user_id, created_at, 1 AS level FROM users WHERE sponsor_user_id = ${id} AND (COALESCE(novopay_id, '') ILIKE ${q} OR COALESCE(full_name, '') ILIKE ${q} OR COALESCE(email, '') ILIKE ${q}) ORDER BY created_at DESC LIMIT ${limit}`,
  "team-list": (db, id, q, limit) => db`WITH RECURSIVE team AS (SELECT u.novopay_id, u.full_name, u.email, u.status, u.sponsor_user_id, u.created_at, 1 AS level FROM users u WHERE u.sponsor_user_id = ${id} UNION ALL SELECT u.novopay_id, u.full_name, u.email, u.status, u.sponsor_user_id, u.created_at, t.level + 1 FROM users u JOIN team t ON u.sponsor_user_id = t.novopay_id WHERE t.level < 15) SELECT * FROM team WHERE (COALESCE(novopay_id, '') ILIKE ${q} OR COALESCE(full_name, '') ILIKE ${q} OR COALESCE(email, '') ILIKE ${q}) ORDER BY level, created_at DESC LIMIT ${limit}`,
  "package-requests": (db, id, q, limit) => db`SELECT a.id, a.reference, a.user_id, a.amount, a.currency, a.status, a.created_at, p.name AS package_name FROM package_activations a LEFT JOIN packages p ON p.id = a.package_id WHERE a.user_id = ${id} AND a.status = 'pending' AND (COALESCE(a.reference, '') ILIKE ${q} OR COALESCE(p.name, '') ILIKE ${q}) ORDER BY a.created_at DESC LIMIT ${limit}`,
  "basic-package": (db, _id, q, limit) => db`SELECT p.id, p.name, p.price, p.currency, p.status, p.description, to_jsonb(p)->>'package_type' AS package_type, to_jsonb(p)->>'package_code' AS package_code, to_jsonb(p)->>'roi_rate' AS roi_rate, to_jsonb(p)->>'duration_days' AS duration_days FROM packages p WHERE p.status = 'active' AND (lower(COALESCE(to_jsonb(p)->>'package_type', '')) = 'basic' OR lower(p.name) LIKE '%basic%') AND (COALESCE(p.name, '') ILIKE ${q} OR COALESCE(p.description, '') ILIKE ${q}) ORDER BY p.price LIMIT ${limit}`,
  "fd-package": (db, _id, q, limit) => db`SELECT p.id, p.name, p.price, p.currency, p.status, p.description, to_jsonb(p)->>'package_type' AS package_type, to_jsonb(p)->>'package_code' AS package_code, to_jsonb(p)->>'roi_rate' AS roi_rate, to_jsonb(p)->>'duration_days' AS duration_days FROM packages p WHERE p.status = 'active' AND (lower(COALESCE(to_jsonb(p)->>'package_type', '')) = 'fd' OR lower(p.name) LIKE '%fd%') AND (COALESCE(p.name, '') ILIKE ${q} OR COALESCE(p.description, '') ILIKE ${q}) ORDER BY p.price LIMIT ${limit}`,
  reports: (db, id) => db`SELECT 'My ledger entries' AS name, count(*)::text AS value FROM ledger_transactions WHERE user_id = ${id} UNION ALL SELECT 'Active packages', count(*)::text FROM package_activations WHERE user_id = ${id} AND status = 'active' UNION ALL SELECT 'Pending deposits', count(*)::text FROM deposits WHERE user_id = ${id} AND status = 'pending' UNION ALL SELECT 'Pending withdrawals', count(*)::text FROM withdrawals WHERE user_id = ${id} AND status = 'pending'`,
};

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Vary", "Authorization");
  try {
    const { adminAuth: auth, sql: db } = services();
    const decoded = await authenticatedUser(req, auth);

    if (req.method === "POST") {
      if (req.body?.action !== "ensure-profile") {
        return res.status(400).json({ error: "Unsupported account action." });
      }
      const email = String(decoded.email || "").trim().toLowerCase();
      if (!email) return res.status(400).json({ error: "A verified email address is required." });
      const displayName = String(req.body?.full_name || decoded.name || email.split("@")[0] || "Member").trim().slice(0, 120);
      const sponsorCode = String(req.body?.sponsor_code || "").trim().toUpperCase();
      const mobile = String(req.body?.mobile || "").trim();
      const normalizedMobile = mobile.replace(/\D/g, "");
      if (!displayName) return res.status(400).json({ error: "Please enter your full name." });
      if (!/^\+?[0-9\s()-]{10,18}$/.test(mobile) || normalizedMobile.length < 10 || normalizedMobile.length > 15) return res.status(400).json({ error: "Please enter a valid mobile number." });
      if (!sponsorCode) return res.status(400).json({ error: "Referral ID is required to register." });
      await db`ALTER TABLE users ADD COLUMN IF NOT EXISTS mobile text`;
      await db`ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code text`;
      await db`ALTER TABLE users ADD COLUMN IF NOT EXISTS sponsor_user_id text`;
      await db`CREATE UNIQUE INDEX IF NOT EXISTS users_mobile_unique_idx ON users ((regexp_replace(mobile, '[^0-9]', '', 'g'))) WHERE mobile IS NOT NULL AND mobile <> ''`;
      await db`CREATE UNIQUE INDEX IF NOT EXISTS users_referral_code_unique_idx ON users (upper(referral_code)) WHERE referral_code IS NOT NULL AND referral_code <> ''`;
      const duplicateMobile = await db`SELECT novopay_id FROM users WHERE regexp_replace(COALESCE(mobile, ''), '[^0-9]', '', 'g') = ${normalizedMobile} LIMIT 1`;
      if (duplicateMobile[0]) return res.status(409).json({ error: "This mobile number is already registered. Please sign in to your existing account." });
      const sponsorRows = sponsorCode === "NA00501" ? [{ novopay_id: "NA00501" }] : await db`SELECT novopay_id FROM users WHERE status = 'active' AND (upper(COALESCE(referral_code, '')) = ${sponsorCode} OR upper(novopay_id) = ${sponsorCode}) LIMIT 1`;
      if (!sponsorRows[0]) return res.status(400).json({ error: "Referral ID is invalid or inactive. Check the ID and try again." });
      const generatedId = "NP" + randomUUID().replace(/-/g, "").slice(0, 18).toUpperCase();
      await db`CREATE SEQUENCE IF NOT EXISTS novopay_referral_seq START WITH 502 INCREMENT BY 1`;
      const referralRows = await db`SELECT 'NA' || lpad(nextval('novopay_referral_seq')::text, 5, '0') AS referral_code`;
      const generatedReferral = referralRows[0].referral_code;
      const rows = await db`INSERT INTO users (auth_uid, novopay_id, referral_code, sponsor_user_id, full_name, email, mobile)
        VALUES (${decoded.uid}, ${generatedId}, ${generatedReferral}, ${sponsorRows[0].novopay_id}, ${displayName}, ${email}, ${mobile})
        ON CONFLICT (auth_uid) DO UPDATE SET
          full_name = CASE WHEN users.full_name = '' THEN EXCLUDED.full_name ELSE users.full_name END,
          email = EXCLUDED.email,
          mobile = COALESCE(NULLIF(users.mobile, ''), EXCLUDED.mobile),
          referral_code = COALESCE(NULLIF(users.referral_code, ''), EXCLUDED.referral_code),
          updated_at = now()
        RETURNING id, auth_uid, novopay_id, full_name, email, mobile, status, fund_balance, income_balance, referral_code, sponsor_user_id, created_at`;
      return res.status(200).json({ ok: true, user: rows[0] });
    }

    if (req.method !== "GET") {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ error: "Method not allowed." });
    }

    const section = String(req.query?.section || "overview").toLowerCase();
    await db`CREATE TABLE IF NOT EXISTS system_settings (setting_key text PRIMARY KEY, setting_value jsonb NOT NULL DEFAULT '{}'::jsonb, updated_at timestamptz NOT NULL DEFAULT now(), updated_by text)`;
    const platformRows = await db`SELECT setting_value FROM system_settings WHERE setting_key='platform' LIMIT 1`;
    const platformSettings = platformRows[0]?.setting_value || {};
    const depositAddress = String(platformSettings.depositAddress || process.env.NOVOPAY_BEP20_DEPOSIT_ADDRESS || "").trim();
    const brochureUrl = String(platformSettings.brochurePdfUrl || process.env.NOVOPAY_BROCHURE_URL || "").trim();
    const maintenanceMode = platformSettings.maintenanceMode === true;
    if (maintenanceMode && decoded.admin !== true) return res.status(503).json({ error: "NovoPay Finance is temporarily under maintenance. Please try again later.", maintenanceMode: true });

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
      const [recentTransactions, pendingDeposits, pendingWithdrawals, activePackages, activations, incomeLedger, sponsorRows, packageRows] = await Promise.all([
        db`SELECT id, reference, type, amount, currency, status, description, created_at FROM ledger_transactions WHERE user_id = ${profile.novopay_id} ORDER BY created_at DESC LIMIT 5`,
        db`SELECT count(*)::int AS count FROM deposits WHERE user_id = ${profile.novopay_id} AND status = 'pending'`,
        db`SELECT count(*)::int AS count FROM withdrawals WHERE user_id = ${profile.novopay_id} AND status = 'pending'`,
        db`SELECT count(*)::int AS count FROM package_activations WHERE user_id = ${profile.novopay_id} AND status = 'active'`,
        db`SELECT a.id, a.reference, a.amount, a.currency, a.status, a.activated_at, p.name AS package_name, to_jsonb(p)->>'package_type' AS package_type FROM package_activations a LEFT JOIN packages p ON p.id = a.package_id WHERE a.user_id = ${profile.novopay_id} ORDER BY a.created_at DESC`,
        db`SELECT id, reference, type, amount, currency, status, description, created_at FROM ledger_transactions WHERE user_id = ${profile.novopay_id} AND (type ILIKE '%income%' OR type ILIKE '%roi%' OR type ILIKE '%level%' OR type ILIKE '%joining%' OR type ILIKE '%retopup%' OR description ILIKE '%income%' OR description ILIKE '%roi%' OR description ILIKE '%level%' OR description ILIKE '%joining%' OR description ILIKE '%retopup%') ORDER BY created_at DESC LIMIT 1000`,
        db`SELECT novopay_id, full_name FROM users WHERE novopay_id = ${profile.sponsor_user_id} LIMIT 1`,
        queries.packages(db, profile.novopay_id, '%', 50),
      ]);
      const eligibleActivations = activations.filter(row => ['active','completed','approved'].includes(String(row.status || '').toLowerCase()));
      const recordedInvestment = eligibleActivations.reduce((sum,row)=>sum+Number(row.amount || 0),0);
      const countedIncome = incomeLedger.filter(row => ['posted','completed','approved','paid'].includes(String(row.status || '').toLowerCase()) && Number(row.amount || 0) > 0).reduce((sum,row)=>sum+Number(row.amount || 0),0);
      const levelIncome = { roi: {}, joining: {}, retopup: {} };
      for (const row of incomeLedger) {
        const type = String(row.type || '').toLowerCase(), desc = String(row.description || '').toLowerCase(), label = type + ' ' + desc;
        const category = label.includes('retopup') || label.includes('re-topup') ? 'retopup' : (label.includes('joining') || label.includes('first deposit') || label.includes('new deposit')) ? 'joining' : (label.includes('roi') ? 'roi' : '');
        const match = label.match(/(?:level|\bl)\s*[-:#]?\s*(\d{1,2})/i);
        const level = match ? Number(match[1]) : null;
        if (category && level >= 1 && level <= 15 && ['posted','completed','approved','paid'].includes(String(row.status || '').toLowerCase())) {
          levelIncome[category][level] = (levelIncome[category][level] || 0) + Math.max(0, Number(row.amount || 0));
        }
      }
      const visiblePackages = packageRows.filter(row => {
        const kind = String(row.package_type || row.name || '').toLowerCase();
        if (kind.includes('basic') && platformSettings.basicPackageVisible === false) return false;
        if ((kind === 'fd' || kind.includes('fixed deposit') || kind.startsWith('fd ')) && platformSettings.fdPackageVisible === false) return false;
        return true;
      });
      const totalCap = recordedInvestment * 5;
      return res.status(200).json({
        ok: true, section, user: profile, rows: recentTransactions, recentTransactions, depositAddress, brochureUrl, maintenanceMode, platformSettings,
        activations, packages: visiblePackages, levelIncome, sponsor: sponsorRows[0] || null,
        capping: { recordedInvestment, totalCap, countedIncome, remainingCap: Math.max(0, totalCap - countedIncome) },
        summary: { pendingDeposits: pendingDeposits[0]?.count ?? 0, pendingWithdrawals: pendingWithdrawals[0]?.count ?? 0, activePackages: activePackages[0]?.count ?? 0 },
      });
    }
    if (section === "wallet") {
      const rows = await queries.transactions(db, profile.novopay_id, pattern, limit);
      return res.status(200).json({ ok: true, section, user: profile, rows, depositAddress, brochureUrl, maintenanceMode, platformSettings });
    }
    if (section === "referrals") {
      const [members, commissions, summary] = await Promise.all([
        db`SELECT novopay_id, full_name, status, created_at FROM users WHERE sponsor_user_id = ${profile.novopay_id} ORDER BY created_at DESC LIMIT ${limit}`,
        db`SELECT reference, referred_user_id, basis_amount, rate, amount, currency, status, created_at FROM referral_commissions WHERE sponsor_user_id = ${profile.novopay_id} ORDER BY created_at DESC LIMIT ${limit}`,
        db`SELECT (SELECT count(*)::int FROM users WHERE sponsor_user_id = ${profile.novopay_id}) AS direct_members, COALESCE((SELECT sum(amount) FROM referral_commissions WHERE sponsor_user_id = ${profile.novopay_id} AND status = 'posted'), 0)::numeric AS referral_income`
      ]);
      return res.status(200).json({ ok: true, section, user: profile, rows: commissions, members, referralSummary: summary[0] });
    }
    if (section === "brochure") return res.status(200).json({ ok: true, section, user: profile, brochureUrl, maintenanceMode, platformSettings });
    const query = queries[section];
    if (!query) return res.status(400).json({ error: "Unknown account section." });
    let rows = await query(db, profile.novopay_id, pattern, limit);
    if (["packages", "basic-package", "fd-package"].includes(section)) {
      rows = rows.filter(row => {
        const kind = String(row.package_type || row.name || "").toLowerCase();
        if (kind.includes("basic") && platformSettings.basicPackageVisible === false) return false;
        if ((kind === "fd" || kind.includes("fixed deposit") || kind.startsWith("fd ")) && platformSettings.fdPackageVisible === false) return false;
        return true;
      });
    }
    if (section === "packages") {
      const activations = await queries.activations(db, profile.novopay_id, pattern, limit);
      return res.status(200).json({ ok: true, section, user: profile, rows, activations, depositAddress, brochureUrl, maintenanceMode, platformSettings });
    }
    return res.status(200).json({ ok: true, section, user: profile, rows, depositAddress, brochureUrl, maintenanceMode, platformSettings });
  } catch (error) {
    const status = error?.status || 500;
    if (status === 503) return res.status(status).json({ error: "Your account service is temporarily unavailable. Please try again later." });
    if (status === 401) return res.status(status).json({ error: "Your session has expired. Please sign in again." });
    // Log a safe diagnostic on the server; never expose database or credential details to the browser.
    console.error("[NovoPay API] /api/user failed", { name: error?.name, message: error?.message, code: error?.code, status, section: req.query?.section || "overview" });
    return res.status(status === 403 ? 403 : 500).json({ error: status === 403 ? error.message : "NovoPay account data could not be loaded." });
  }
}
