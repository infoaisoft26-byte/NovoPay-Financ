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
  users: (sql, q, limit) => sql`SELECT u.id, u.auth_uid, u.novopay_id, u.full_name, u.email, u.status, u.fund_balance, u.income_balance, u.sponsor_user_id, COALESCE(s.full_name, '') AS sponsor_name, COALESCE(team.member_count, 0)::int AS team_count, COALESCE(invested.token_amount, 0)::numeric(20,8) AS token_amount, active_package.package_name, u.created_at FROM users u LEFT JOIN users s ON s.novopay_id = u.sponsor_user_id LEFT JOIN LATERAL (SELECT count(*)::int AS member_count FROM users child WHERE child.sponsor_user_id = u.novopay_id) team ON true LEFT JOIN LATERAL (SELECT COALESCE(sum(a.amount), 0) AS token_amount FROM package_activations a WHERE a.user_id = u.novopay_id AND a.status = 'active') invested ON true LEFT JOIN LATERAL (SELECT p.name AS package_name FROM package_activations a LEFT JOIN packages p ON p.id = a.package_id WHERE a.user_id = u.novopay_id AND a.status = 'active' ORDER BY a.activated_at DESC NULLS LAST, a.created_at DESC LIMIT 1) active_package ON true WHERE (COALESCE(u.full_name, '') ILIKE ${q} OR COALESCE(u.email, '') ILIKE ${q} OR COALESCE(u.novopay_id, '') ILIKE ${q} OR COALESCE(u.sponsor_user_id, '') ILIKE ${q} OR COALESCE(s.full_name, '') ILIKE ${q}) ORDER BY u.created_at DESC LIMIT ${limit}`,
  deposits: (sql, q, limit) => sql`SELECT d.id, d.reference, d.user_id, d.amount, d.currency, d.status, d.tx_hash, d.created_at, d.reviewed_at,
    EXISTS (SELECT 1 FROM audit_logs verified WHERE verified.action='deposit_blockchain_verified' AND verified.entity_id=d.reference AND lower(verified.details->>'tx_hash')=lower(d.tx_hash)) AS blockchain_verified
    FROM deposits d WHERE (COALESCE(d.reference, '') ILIKE ${q} OR COALESCE(d.tx_hash, '') ILIKE ${q} OR COALESCE(d.user_id, '') ILIKE ${q}) ORDER BY d.created_at DESC LIMIT ${limit}`,
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
  "income-reports": (sql, q, limit) => sql`SELECT lt.id, lt.reference, lt.user_id, u.full_name, lt.type, lt.amount, lt.currency, lt.status, lt.description, lt.created_at,
      source.referred_user_id AS source_member_id, COALESCE(source.full_name, '') AS source_member_name,
      source.level AS referral_level, source.rate AS referral_rate, source.basis_amount,
      CASE
        WHEN lower(concat_ws(' ',lt.type,lt.description)) LIKE '%salary%' THEN 'Salary Income'
        WHEN lower(concat_ws(' ',lt.type,lt.description)) LIKE '%retopup%' OR lower(concat_ws(' ',lt.type,lt.description)) LIKE '%re-topup%' THEN 'Retopup Income'
        WHEN lower(concat_ws(' ',lt.type,lt.description)) LIKE '%joining%' OR lower(concat_ws(' ',lt.type,lt.description)) LIKE '%first deposit%' THEN 'Joining Income'
        WHEN lower(concat_ws(' ',lt.type,lt.description)) LIKE '%fd%roi%' THEN 'FD ROI Income'
        WHEN lower(concat_ws(' ',lt.type,lt.description)) LIKE '%fd%referral%' THEN 'FD Referral Income'
        WHEN lower(concat_ws(' ',lt.type,lt.description)) LIKE '%fd%level%' THEN 'FD Level Income'
        WHEN lower(concat_ws(' ',lt.type,lt.description)) LIKE '%basic%roi%' THEN 'Basic ROI Income'
        WHEN lower(concat_ws(' ',lt.type,lt.description)) LIKE '%basic%referral%' THEN 'Basic Referral Income'
        WHEN lower(concat_ws(' ',lt.type,lt.description)) LIKE '%basic%level%' THEN 'Basic Level Income'
        WHEN lower(concat_ws(' ',lt.type,lt.description)) LIKE '%level%' THEN 'Level Income'
        WHEN lower(concat_ws(' ',lt.type,lt.description)) LIKE '%referral%' THEN 'Referral Income'
        WHEN lower(concat_ws(' ',lt.type,lt.description)) LIKE '%roi%' THEN 'ROI Income'
        WHEN lower(concat_ws(' ',lt.type,lt.description)) LIKE '%bonus%' THEN 'Bonus Income'
        ELSE 'Other Ledger Entry' END AS income_category
    FROM ledger_transactions lt LEFT JOIN users u ON u.novopay_id=lt.user_id
    LEFT JOIN LATERAL (
      SELECT rc.referred_user_id, referred.full_name, rc.level, rc.rate, rc.basis_amount
      FROM referral_commissions rc LEFT JOIN users referred ON referred.novopay_id=rc.referred_user_id
      WHERE rc.sponsor_user_id=lt.user_id AND lt.description ILIKE '%' || rc.package_activation_ref || '%'
      ORDER BY rc.created_at DESC LIMIT 1
    ) source ON true
    WHERE (COALESCE(lt.user_id,'') ILIKE ${q} OR COALESCE(u.full_name,'') ILIKE ${q} OR COALESCE(lt.reference,'') ILIKE ${q}
      OR COALESCE(lt.type,'') ILIKE ${q} OR COALESCE(lt.description,'') ILIKE ${q} OR COALESCE(source.referred_user_id,'') ILIKE ${q} OR COALESCE(source.full_name,'') ILIKE ${q})
    ORDER BY lt.created_at DESC LIMIT ${limit}`,
  "daily-income-report": (sql, q, limit) => sql`SELECT (created_at AT TIME ZONE 'Asia/Kolkata')::date::text AS period,
      CASE WHEN lower(type) LIKE '%retopup%' THEN 'Retopup Income' WHEN lower(type) LIKE '%joining%' OR lower(type) LIKE '%referral%' THEN 'Referral / Joining Income' WHEN lower(type) LIKE '%level%' THEN 'Level Income' WHEN lower(type) LIKE '%roi%' THEN 'ROI Income' WHEN lower(type) LIKE '%salary%' THEN 'Salary Income' WHEN lower(type) LIKE '%bonus%' THEN 'Bonus Income' ELSE 'Other Income' END AS income_category,
      COALESCE(SUM(amount),0)::numeric(20,8) AS total_amount, count(*)::int AS entries
    FROM ledger_transactions WHERE amount>0 AND lower(status) IN ('posted','completed','approved','paid')
      AND (lower(type) LIKE '%income%' OR lower(type) LIKE '%roi%' OR lower(type) LIKE '%level%' OR lower(type) LIKE '%referral%' OR lower(type) LIKE '%joining%' OR lower(type) LIKE '%retopup%' OR lower(type) LIKE '%bonus%' OR lower(type) LIKE '%salary%')
      AND ((created_at AT TIME ZONE 'Asia/Kolkata')::date::text ILIKE ${q} OR lower(type) ILIKE ${q} OR user_id ILIKE ${q})
    GROUP BY period,income_category ORDER BY period DESC,income_category LIMIT ${limit}`,
  "monthly-income-report": (sql, q, limit) => sql`SELECT to_char(date_trunc('month',created_at AT TIME ZONE 'Asia/Kolkata'),'YYYY-MM') AS period,
      CASE WHEN lower(type) LIKE '%retopup%' THEN 'Retopup Income' WHEN lower(type) LIKE '%joining%' OR lower(type) LIKE '%referral%' THEN 'Referral / Joining Income' WHEN lower(type) LIKE '%level%' THEN 'Level Income' WHEN lower(type) LIKE '%roi%' THEN 'ROI Income' WHEN lower(type) LIKE '%salary%' THEN 'Salary Income' WHEN lower(type) LIKE '%bonus%' THEN 'Bonus Income' ELSE 'Other Income' END AS income_category,
      COALESCE(SUM(amount),0)::numeric(20,8) AS total_amount, count(*)::int AS entries
    FROM ledger_transactions WHERE amount>0 AND lower(status) IN ('posted','completed','approved','paid')
      AND (lower(type) LIKE '%income%' OR lower(type) LIKE '%roi%' OR lower(type) LIKE '%level%' OR lower(type) LIKE '%referral%' OR lower(type) LIKE '%joining%' OR lower(type) LIKE '%retopup%' OR lower(type) LIKE '%bonus%' OR lower(type) LIKE '%salary%')
      AND (to_char(date_trunc('month',created_at AT TIME ZONE 'Asia/Kolkata'),'YYYY-MM') ILIKE ${q} OR lower(type) ILIKE ${q} OR user_id ILIKE ${q})
    GROUP BY period,income_category ORDER BY period DESC,income_category LIMIT ${limit}`,
  reports: (sql) => sql`SELECT 'Registered users' AS name, 'live' AS status, count(*)::text || ' accounts' AS details FROM users
    UNION ALL SELECT 'Active users', 'live', count(*)::text || ' accounts' FROM users WHERE lower(status)='active'
    UNION ALL SELECT 'Active package investment', 'live', COALESCE(to_char(sum(amount),'FM999999990.00'),'0.00') || ' USDT' FROM package_activations WHERE lower(status)='active'
    UNION ALL SELECT 'Total approved investment', 'live', COALESCE(to_char(sum(amount),'FM999999990.00'),'0.00') || ' USDT' FROM package_activations WHERE lower(status) IN ('active','completed','approved')
    UNION ALL SELECT 'Total credited income', 'live', COALESCE(to_char(sum(amount),'FM999999990.00'),'0.00') || ' USDT' FROM ledger_transactions WHERE amount>0 AND lower(status) IN ('posted','completed','approved','paid') AND (lower(type) LIKE '%income%' OR lower(type) LIKE '%roi%' OR lower(type) LIKE '%level%' OR lower(type) LIKE '%referral%' OR lower(type) LIKE '%joining%' OR lower(type) LIKE '%retopup%' OR lower(type) LIKE '%bonus%' OR lower(type) LIKE '%salary%')
    UNION ALL SELECT 'Today credited income', 'live', COALESCE(to_char(sum(amount),'FM999999990.00'),'0.00') || ' USDT' FROM ledger_transactions WHERE amount>0 AND lower(status) IN ('posted','completed','approved','paid') AND created_at>=date_trunc('day',now()) AND (lower(type) LIKE '%income%' OR lower(type) LIKE '%roi%' OR lower(type) LIKE '%level%' OR lower(type) LIKE '%referral%' OR lower(type) LIKE '%joining%' OR lower(type) LIKE '%retopup%' OR lower(type) LIKE '%bonus%' OR lower(type) LIKE '%salary%')
    UNION ALL SELECT 'This month credited income', 'live', COALESCE(to_char(sum(amount),'FM999999990.00'),'0.00') || ' USDT' FROM ledger_transactions WHERE amount>0 AND lower(status) IN ('posted','completed','approved','paid') AND created_at>=date_trunc('month',now()) AND (lower(type) LIKE '%income%' OR lower(type) LIKE '%roi%' OR lower(type) LIKE '%level%' OR lower(type) LIKE '%referral%' OR lower(type) LIKE '%joining%' OR lower(type) LIKE '%retopup%' OR lower(type) LIKE '%bonus%' OR lower(type) LIKE '%salary%')
    UNION ALL SELECT 'ROI income', 'live', COALESCE(to_char(sum(amount),'FM999999990.00'),'0.00') || ' USDT' FROM ledger_transactions WHERE amount>0 AND lower(status) IN ('posted','completed','approved','paid') AND lower(type) LIKE '%roi%'
    UNION ALL SELECT 'Referral / joining income', 'live', COALESCE(to_char(sum(amount),'FM999999990.00'),'0.00') || ' USDT' FROM ledger_transactions WHERE amount>0 AND lower(status) IN ('posted','completed','approved','paid') AND (lower(type) LIKE '%referral%' OR lower(type) LIKE '%joining%' OR lower(type) LIKE '%first_deposit%')
    UNION ALL SELECT 'Level income', 'live', COALESCE(to_char(sum(amount),'FM999999990.00'),'0.00') || ' USDT' FROM ledger_transactions WHERE amount>0 AND lower(status) IN ('posted','completed','approved','paid') AND lower(type) LIKE '%level%'
    UNION ALL SELECT 'Retopup income', 'live', COALESCE(to_char(sum(amount),'FM999999990.00'),'0.00') || ' USDT' FROM ledger_transactions WHERE amount>0 AND lower(status) IN ('posted','completed','approved','paid') AND lower(type) LIKE '%retopup%'
    UNION ALL SELECT 'Ledger transactions', 'live', count(*)::text || ' entries' FROM ledger_transactions
    UNION ALL SELECT 'Pending deposits', 'review', count(*)::text || ' requests' FROM deposits WHERE lower(status)='pending'
    UNION ALL SELECT 'Pending withdrawals', 'review', count(*)::text || ' requests' FROM withdrawals WHERE lower(status)='pending'
    UNION ALL SELECT 'Open support tickets', 'review', count(*)::text || ' tickets' FROM support_tickets WHERE lower(status) IN ('open','pending')`,
  leaderboard: (sql, q, limit) => sql`WITH RECURSIVE network(root_id, member_id, level) AS (
      SELECT u.novopay_id, child.novopay_id, 1 FROM users u JOIN users child ON child.sponsor_user_id = u.novopay_id
      UNION ALL
      SELECT n.root_id, child.novopay_id, n.level + 1 FROM network n JOIN users child ON child.sponsor_user_id = n.member_id WHERE n.level < 15
    ), team AS (
      SELECT root_id, count(*) FILTER (WHERE level=1)::int AS direct_members, count(*)::int AS team_count,
        count(*) FILTER (WHERE level=1)::int AS level_1, count(*) FILTER (WHERE level=2)::int AS level_2,
        count(*) FILTER (WHERE level=3)::int AS level_3, count(*) FILTER (WHERE level=4)::int AS level_4,
        count(*) FILTER (WHERE level=5)::int AS level_5, count(*) FILTER (WHERE level=6)::int AS level_6,
        count(*) FILTER (WHERE level=7)::int AS level_7, count(*) FILTER (WHERE level=8)::int AS level_8,
        count(*) FILTER (WHERE level=9)::int AS level_9, count(*) FILTER (WHERE level=10)::int AS level_10,
        count(*) FILTER (WHERE level=11)::int AS level_11, count(*) FILTER (WHERE level=12)::int AS level_12,
        count(*) FILTER (WHERE level=13)::int AS level_13, count(*) FILTER (WHERE level=14)::int AS level_14,
        count(*) FILTER (WHERE level=15)::int AS level_15 FROM network GROUP BY root_id
    ), ranked AS (
      SELECT u.novopay_id, u.full_name, u.sponsor_user_id,
        COALESCE(sum(a.amount) FILTER (WHERE lower(a.status) IN ('active','completed','approved')),0)::numeric(20,8) AS total_investment,
        COALESCE(t.direct_members,0)::int AS direct_members, COALESCE(t.team_count,0)::int AS team_count,
        COALESCE(t.level_1,0)::int AS level_1, COALESCE(t.level_2,0)::int AS level_2, COALESCE(t.level_3,0)::int AS level_3,
        COALESCE(t.level_4,0)::int AS level_4, COALESCE(t.level_5,0)::int AS level_5, COALESCE(t.level_6,0)::int AS level_6,
        COALESCE(t.level_7,0)::int AS level_7, COALESCE(t.level_8,0)::int AS level_8, COALESCE(t.level_9,0)::int AS level_9,
        COALESCE(t.level_10,0)::int AS level_10, COALESCE(t.level_11,0)::int AS level_11, COALESCE(t.level_12,0)::int AS level_12,
        COALESCE(t.level_13,0)::int AS level_13, COALESCE(t.level_14,0)::int AS level_14, COALESCE(t.level_15,0)::int AS level_15,
        row_number() OVER (ORDER BY COALESCE(sum(a.amount) FILTER (WHERE lower(a.status) IN ('active','completed','approved')),0) DESC, u.created_at ASC)::int AS rank
      FROM users u LEFT JOIN package_activations a ON a.user_id=u.novopay_id LEFT JOIN team t ON t.root_id=u.novopay_id
      WHERE (COALESCE(u.novopay_id,'') ILIKE ${q} OR COALESCE(u.full_name,'') ILIKE ${q})
      GROUP BY u.novopay_id,u.full_name,u.sponsor_user_id,u.created_at,t.direct_members,t.team_count,
        t.level_1,t.level_2,t.level_3,t.level_4,t.level_5,t.level_6,t.level_7,t.level_8,t.level_9,t.level_10,
        t.level_11,t.level_12,t.level_13,t.level_14,t.level_15
    ) SELECT * FROM ranked ORDER BY total_investment DESC, rank ASC LIMIT ${limit}`,
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
    if (section === "settings") {
      await db`CREATE TABLE IF NOT EXISTS system_settings (setting_key text PRIMARY KEY, setting_value jsonb NOT NULL DEFAULT '{}'::jsonb, updated_at timestamptz NOT NULL DEFAULT now(), updated_by text)`;
      await db`INSERT INTO system_settings(setting_key, setting_value) VALUES ('platform', jsonb_build_object(
        'maintenanceMode', false, 'enforceWithdrawalTiming', true,
        'depositAddress', '', 'network', 'BNB Smart Chain (BEP20)', 'asset', 'USDT',
        'walletLink', '', 'qrImageUrl', '', 'networkNotice', 'Only USDT on BNB Smart Chain (BEP20) is accepted.',
        'basicPackageVisible', true, 'fdPackageVisible', true, 'depositVisible', true,
        'brochurePdfUrl', '', 'commissions', jsonb_build_array(5,1,1,1,1,1,1,1,1,1,1,1,0.5,0.5,0.5)
      )) ON CONFLICT (setting_key) DO NOTHING`;
      const saved = await db`SELECT setting_value, updated_at FROM system_settings WHERE setting_key='platform' LIMIT 1`;
      return res.status(200).json({ ok: true, section, settings: saved[0]?.setting_value || {}, updatedAt: saved[0]?.updated_at || null });
    }
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
