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
  "income-all": (db, id, q, limit) => db`SELECT lt.id, lt.reference, lt.type, lt.amount, lt.currency, lt.status, lt.description, lt.created_at, (SELECT rc.referred_user_id FROM referral_commissions rc WHERE rc.sponsor_user_id = lt.user_id AND lt.description ILIKE '%' || rc.package_activation_ref || '%' ORDER BY rc.created_at DESC LIMIT 1) AS source_member_id, (SELECT referred.full_name FROM referral_commissions rc LEFT JOIN users referred ON referred.novopay_id = rc.referred_user_id WHERE rc.sponsor_user_id = lt.user_id AND lt.description ILIKE '%' || rc.package_activation_ref || '%' ORDER BY rc.created_at DESC LIMIT 1) AS source_member_name, (SELECT rc.level FROM referral_commissions rc WHERE rc.sponsor_user_id = lt.user_id AND lt.description ILIKE '%' || rc.package_activation_ref || '%' ORDER BY rc.created_at DESC LIMIT 1) AS referral_level, (SELECT rc.rate FROM referral_commissions rc WHERE rc.sponsor_user_id = lt.user_id AND lt.description ILIKE '%' || rc.package_activation_ref || '%' ORDER BY rc.created_at DESC LIMIT 1) AS referral_rate, (SELECT rc.basis_amount FROM referral_commissions rc WHERE rc.sponsor_user_id = lt.user_id AND lt.description ILIKE '%' || rc.package_activation_ref || '%' ORDER BY rc.created_at DESC LIMIT 1) AS basis_amount FROM ledger_transactions lt WHERE lt.user_id = ${id} AND (lt.type ILIKE '%income%' OR lt.type ILIKE '%salary%' OR lt.type ILIKE '%roi%' OR lt.type ILIKE '%referral%' OR lt.type ILIKE '%level%' OR lt.type ILIKE '%joining%' OR lt.type ILIKE '%first_deposit%' OR lt.type ILIKE '%retopup%' OR lt.type ILIKE '%bonus%' OR lt.type ILIKE '%principal_return%' OR lt.description ILIKE '%joining%' OR lt.description ILIKE '%first deposit%' OR lt.description ILIKE '%retopup%' OR lt.description ILIKE '%bonus%' OR lt.description ILIKE '%principal return%') AND (COALESCE(lt.reference, '') ILIKE ${q} OR COALESCE(lt.type, '') ILIKE ${q} OR COALESCE(lt.description, '') ILIKE ${q}) ORDER BY lt.created_at DESC LIMIT ${limit}`,
  "basic-roi": (db, id, q, limit) => db`SELECT lt.id, lt.reference, lt.type, lt.amount, lt.currency, lt.status, lt.description, lt.created_at, (SELECT rc.referred_user_id FROM referral_commissions rc WHERE rc.sponsor_user_id = lt.user_id AND lt.description ILIKE '%' || rc.package_activation_ref || '%' ORDER BY rc.created_at DESC LIMIT 1) AS source_member_id, (SELECT referred.full_name FROM referral_commissions rc LEFT JOIN users referred ON referred.novopay_id = rc.referred_user_id WHERE rc.sponsor_user_id = lt.user_id AND lt.description ILIKE '%' || rc.package_activation_ref || '%' ORDER BY rc.created_at DESC LIMIT 1) AS source_member_name, (SELECT rc.level FROM referral_commissions rc WHERE rc.sponsor_user_id = lt.user_id AND lt.description ILIKE '%' || rc.package_activation_ref || '%' ORDER BY rc.created_at DESC LIMIT 1) AS referral_level, (SELECT rc.rate FROM referral_commissions rc WHERE rc.sponsor_user_id = lt.user_id AND lt.description ILIKE '%' || rc.package_activation_ref || '%' ORDER BY rc.created_at DESC LIMIT 1) AS referral_rate, (SELECT rc.basis_amount FROM referral_commissions rc WHERE rc.sponsor_user_id = lt.user_id AND lt.description ILIKE '%' || rc.package_activation_ref || '%' ORDER BY rc.created_at DESC LIMIT 1) AS basis_amount FROM ledger_transactions lt WHERE lt.user_id = ${id} AND (lt.type ILIKE '%basic%roi%' OR (lt.type ILIKE '%roi%' AND lt.description ILIKE '%basic%')) AND (COALESCE(lt.reference, '') ILIKE ${q} OR COALESCE(lt.description, '') ILIKE ${q}) ORDER BY lt.created_at DESC LIMIT ${limit}`,
  "basic-referral": (db, id, q, limit) => db`SELECT lt.id, lt.reference, lt.type, lt.amount, lt.currency, lt.status, lt.description, lt.created_at, (SELECT rc.referred_user_id FROM referral_commissions rc WHERE rc.sponsor_user_id = lt.user_id AND lt.description ILIKE '%' || rc.package_activation_ref || '%' ORDER BY rc.created_at DESC LIMIT 1) AS source_member_id, (SELECT referred.full_name FROM referral_commissions rc LEFT JOIN users referred ON referred.novopay_id = rc.referred_user_id WHERE rc.sponsor_user_id = lt.user_id AND lt.description ILIKE '%' || rc.package_activation_ref || '%' ORDER BY rc.created_at DESC LIMIT 1) AS source_member_name, (SELECT rc.level FROM referral_commissions rc WHERE rc.sponsor_user_id = lt.user_id AND lt.description ILIKE '%' || rc.package_activation_ref || '%' ORDER BY rc.created_at DESC LIMIT 1) AS referral_level, (SELECT rc.rate FROM referral_commissions rc WHERE rc.sponsor_user_id = lt.user_id AND lt.description ILIKE '%' || rc.package_activation_ref || '%' ORDER BY rc.created_at DESC LIMIT 1) AS referral_rate, (SELECT rc.basis_amount FROM referral_commissions rc WHERE rc.sponsor_user_id = lt.user_id AND lt.description ILIKE '%' || rc.package_activation_ref || '%' ORDER BY rc.created_at DESC LIMIT 1) AS basis_amount FROM ledger_transactions lt WHERE lt.user_id = ${id} AND (lt.type ILIKE '%basic%referral%' OR (lt.type ILIKE '%referral%' AND lt.description ILIKE '%basic%')) AND (COALESCE(lt.reference, '') ILIKE ${q} OR COALESCE(lt.description, '') ILIKE ${q}) ORDER BY lt.created_at DESC LIMIT ${limit}`,
  "basic-level": (db, id, q, limit) => db`SELECT lt.id, lt.reference, lt.type, lt.amount, lt.currency, lt.status, lt.description, lt.created_at, (SELECT rc.referred_user_id FROM referral_commissions rc WHERE rc.sponsor_user_id = lt.user_id AND lt.description ILIKE '%' || rc.package_activation_ref || '%' ORDER BY rc.created_at DESC LIMIT 1) AS source_member_id, (SELECT referred.full_name FROM referral_commissions rc LEFT JOIN users referred ON referred.novopay_id = rc.referred_user_id WHERE rc.sponsor_user_id = lt.user_id AND lt.description ILIKE '%' || rc.package_activation_ref || '%' ORDER BY rc.created_at DESC LIMIT 1) AS source_member_name, (SELECT rc.level FROM referral_commissions rc WHERE rc.sponsor_user_id = lt.user_id AND lt.description ILIKE '%' || rc.package_activation_ref || '%' ORDER BY rc.created_at DESC LIMIT 1) AS referral_level, (SELECT rc.rate FROM referral_commissions rc WHERE rc.sponsor_user_id = lt.user_id AND lt.description ILIKE '%' || rc.package_activation_ref || '%' ORDER BY rc.created_at DESC LIMIT 1) AS referral_rate, (SELECT rc.basis_amount FROM referral_commissions rc WHERE rc.sponsor_user_id = lt.user_id AND lt.description ILIKE '%' || rc.package_activation_ref || '%' ORDER BY rc.created_at DESC LIMIT 1) AS basis_amount FROM ledger_transactions lt WHERE lt.user_id = ${id} AND (lt.type ILIKE '%basic%level%' OR (lt.type ILIKE '%level%' AND lt.description ILIKE '%basic%')) AND (COALESCE(lt.reference, '') ILIKE ${q} OR COALESCE(lt.description, '') ILIKE ${q}) ORDER BY lt.created_at DESC LIMIT ${limit}`,
  "fd-roi": (db, id, q, limit) => db`SELECT lt.id, lt.reference, lt.type, lt.amount, lt.currency, lt.status, lt.description, lt.created_at, (SELECT rc.referred_user_id FROM referral_commissions rc WHERE rc.sponsor_user_id = lt.user_id AND lt.description ILIKE '%' || rc.package_activation_ref || '%' ORDER BY rc.created_at DESC LIMIT 1) AS source_member_id, (SELECT referred.full_name FROM referral_commissions rc LEFT JOIN users referred ON referred.novopay_id = rc.referred_user_id WHERE rc.sponsor_user_id = lt.user_id AND lt.description ILIKE '%' || rc.package_activation_ref || '%' ORDER BY rc.created_at DESC LIMIT 1) AS source_member_name, (SELECT rc.level FROM referral_commissions rc WHERE rc.sponsor_user_id = lt.user_id AND lt.description ILIKE '%' || rc.package_activation_ref || '%' ORDER BY rc.created_at DESC LIMIT 1) AS referral_level, (SELECT rc.rate FROM referral_commissions rc WHERE rc.sponsor_user_id = lt.user_id AND lt.description ILIKE '%' || rc.package_activation_ref || '%' ORDER BY rc.created_at DESC LIMIT 1) AS referral_rate, (SELECT rc.basis_amount FROM referral_commissions rc WHERE rc.sponsor_user_id = lt.user_id AND lt.description ILIKE '%' || rc.package_activation_ref || '%' ORDER BY rc.created_at DESC LIMIT 1) AS basis_amount FROM ledger_transactions lt WHERE lt.user_id = ${id} AND (lt.type ILIKE '%fd%roi%' OR (lt.type ILIKE '%roi%' AND lt.description ILIKE '%fd%')) AND (COALESCE(lt.reference, '') ILIKE ${q} OR COALESCE(lt.description, '') ILIKE ${q}) ORDER BY lt.created_at DESC LIMIT ${limit}`,
  "fd-referral": (db, id, q, limit) => db`SELECT lt.id, lt.reference, lt.type, lt.amount, lt.currency, lt.status, lt.description, lt.created_at, (SELECT rc.referred_user_id FROM referral_commissions rc WHERE rc.sponsor_user_id = lt.user_id AND lt.description ILIKE '%' || rc.package_activation_ref || '%' ORDER BY rc.created_at DESC LIMIT 1) AS source_member_id, (SELECT referred.full_name FROM referral_commissions rc LEFT JOIN users referred ON referred.novopay_id = rc.referred_user_id WHERE rc.sponsor_user_id = lt.user_id AND lt.description ILIKE '%' || rc.package_activation_ref || '%' ORDER BY rc.created_at DESC LIMIT 1) AS source_member_name, (SELECT rc.level FROM referral_commissions rc WHERE rc.sponsor_user_id = lt.user_id AND lt.description ILIKE '%' || rc.package_activation_ref || '%' ORDER BY rc.created_at DESC LIMIT 1) AS referral_level, (SELECT rc.rate FROM referral_commissions rc WHERE rc.sponsor_user_id = lt.user_id AND lt.description ILIKE '%' || rc.package_activation_ref || '%' ORDER BY rc.created_at DESC LIMIT 1) AS referral_rate, (SELECT rc.basis_amount FROM referral_commissions rc WHERE rc.sponsor_user_id = lt.user_id AND lt.description ILIKE '%' || rc.package_activation_ref || '%' ORDER BY rc.created_at DESC LIMIT 1) AS basis_amount FROM ledger_transactions lt WHERE lt.user_id = ${id} AND (lt.type ILIKE '%fd%referral%' OR (lt.type ILIKE '%referral%' AND lt.description ILIKE '%fd%')) AND (COALESCE(lt.reference, '') ILIKE ${q} OR COALESCE(lt.description, '') ILIKE ${q}) ORDER BY lt.created_at DESC LIMIT ${limit}`,
  "fd-level": (db, id, q, limit) => db`SELECT lt.id, lt.reference, lt.type, lt.amount, lt.currency, lt.status, lt.description, lt.created_at, (SELECT rc.referred_user_id FROM referral_commissions rc WHERE rc.sponsor_user_id = lt.user_id AND lt.description ILIKE '%' || rc.package_activation_ref || '%' ORDER BY rc.created_at DESC LIMIT 1) AS source_member_id, (SELECT referred.full_name FROM referral_commissions rc LEFT JOIN users referred ON referred.novopay_id = rc.referred_user_id WHERE rc.sponsor_user_id = lt.user_id AND lt.description ILIKE '%' || rc.package_activation_ref || '%' ORDER BY rc.created_at DESC LIMIT 1) AS source_member_name, (SELECT rc.level FROM referral_commissions rc WHERE rc.sponsor_user_id = lt.user_id AND lt.description ILIKE '%' || rc.package_activation_ref || '%' ORDER BY rc.created_at DESC LIMIT 1) AS referral_level, (SELECT rc.rate FROM referral_commissions rc WHERE rc.sponsor_user_id = lt.user_id AND lt.description ILIKE '%' || rc.package_activation_ref || '%' ORDER BY rc.created_at DESC LIMIT 1) AS referral_rate, (SELECT rc.basis_amount FROM referral_commissions rc WHERE rc.sponsor_user_id = lt.user_id AND lt.description ILIKE '%' || rc.package_activation_ref || '%' ORDER BY rc.created_at DESC LIMIT 1) AS basis_amount FROM ledger_transactions lt WHERE lt.user_id = ${id} AND (lt.type ILIKE '%fd%level%' OR (lt.type ILIKE '%level%' AND lt.description ILIKE '%fd%')) AND (COALESCE(lt.reference, '') ILIKE ${q} OR COALESCE(lt.description, '') ILIKE ${q}) ORDER BY lt.created_at DESC LIMIT ${limit}`,
  "rd-level": (db, id, q, limit) => db`SELECT lt.id, lt.reference, lt.type, lt.amount, lt.currency, lt.status, lt.description, lt.created_at FROM ledger_transactions lt WHERE lt.user_id = ${id} AND ((lt.type ILIKE '%rd%level%') OR (lt.type ILIKE '%level%' AND (lt.description ILIKE '%rd%' OR lt.description ILIKE '%recurring deposit%')) OR lt.description ILIKE '%rd level%') AND (COALESCE(lt.reference, '') ILIKE ${q} OR COALESCE(lt.description, '') ILIKE ${q} OR COALESCE(lt.type, '') ILIKE ${q}) ORDER BY lt.created_at DESC LIMIT ${limit}`,
  salary: (db, id, q, limit) => db`SELECT lt.id, lt.reference, lt.type, lt.amount, lt.currency, lt.status, lt.description, lt.created_at, (SELECT rc.referred_user_id FROM referral_commissions rc WHERE rc.sponsor_user_id = lt.user_id AND lt.description ILIKE '%' || rc.package_activation_ref || '%' ORDER BY rc.created_at DESC LIMIT 1) AS source_member_id, (SELECT referred.full_name FROM referral_commissions rc LEFT JOIN users referred ON referred.novopay_id = rc.referred_user_id WHERE rc.sponsor_user_id = lt.user_id AND lt.description ILIKE '%' || rc.package_activation_ref || '%' ORDER BY rc.created_at DESC LIMIT 1) AS source_member_name, (SELECT rc.level FROM referral_commissions rc WHERE rc.sponsor_user_id = lt.user_id AND lt.description ILIKE '%' || rc.package_activation_ref || '%' ORDER BY rc.created_at DESC LIMIT 1) AS referral_level, (SELECT rc.rate FROM referral_commissions rc WHERE rc.sponsor_user_id = lt.user_id AND lt.description ILIKE '%' || rc.package_activation_ref || '%' ORDER BY rc.created_at DESC LIMIT 1) AS referral_rate, (SELECT rc.basis_amount FROM referral_commissions rc WHERE rc.sponsor_user_id = lt.user_id AND lt.description ILIKE '%' || rc.package_activation_ref || '%' ORDER BY rc.created_at DESC LIMIT 1) AS basis_amount FROM ledger_transactions lt WHERE lt.user_id = ${id} AND (lt.type ILIKE '%salary%' OR lt.description ILIKE '%salary%') AND (COALESCE(lt.reference, '') ILIKE ${q} OR COALESCE(lt.description, '') ILIKE ${q}) ORDER BY lt.created_at DESC LIMIT ${limit}`,
  "direct-team": (db, id, q, limit) => db`SELECT novopay_id, full_name, email, status, sponsor_user_id, created_at, 1 AS level FROM users WHERE sponsor_user_id = ${id} AND (COALESCE(novopay_id, '') ILIKE ${q} OR COALESCE(full_name, '') ILIKE ${q} OR COALESCE(email, '') ILIKE ${q}) ORDER BY created_at DESC LIMIT ${limit}`,
  "team-list": (db, id, q, limit) => db`WITH RECURSIVE team AS (SELECT u.novopay_id, u.full_name, u.email, u.status, u.sponsor_user_id, u.created_at, 1 AS level FROM users u WHERE u.sponsor_user_id = ${id} UNION ALL SELECT u.novopay_id, u.full_name, u.email, u.status, u.sponsor_user_id, u.created_at, t.level + 1 FROM users u JOIN team t ON u.sponsor_user_id = t.novopay_id WHERE t.level < 15) SELECT * FROM team WHERE (COALESCE(novopay_id, '') ILIKE ${q} OR COALESCE(full_name, '') ILIKE ${q} OR COALESCE(email, '') ILIKE ${q}) ORDER BY level, created_at DESC LIMIT ${limit}`,
  "package-requests": (db, id, q, limit) => db`SELECT a.id, a.reference, a.user_id, a.amount, a.currency, a.status, a.created_at, p.name AS package_name FROM package_activations a LEFT JOIN packages p ON p.id = a.package_id WHERE a.user_id = ${id} AND a.status = 'pending' AND (COALESCE(a.reference, '') ILIKE ${q} OR COALESCE(p.name, '') ILIKE ${q}) ORDER BY a.created_at DESC LIMIT ${limit}`,
  "basic-package": (db, _id, q, limit) => db`SELECT p.id, p.name, p.price, p.currency, p.status, p.description, to_jsonb(p)->>'package_type' AS package_type, to_jsonb(p)->>'package_code' AS package_code, to_jsonb(p)->>'roi_rate' AS roi_rate, to_jsonb(p)->>'duration_days' AS duration_days FROM packages p WHERE p.status = 'active' AND (lower(COALESCE(to_jsonb(p)->>'package_type', '')) = 'basic' OR lower(p.name) LIKE '%basic%') AND (COALESCE(p.name, '') ILIKE ${q} OR COALESCE(p.description, '') ILIKE ${q}) ORDER BY p.price LIMIT ${limit}`,
  "fd-package": (db, _id, q, limit) => db`SELECT p.id, p.name, p.price, p.currency, p.status, p.description, to_jsonb(p)->>'package_type' AS package_type, to_jsonb(p)->>'package_code' AS package_code, to_jsonb(p)->>'roi_rate' AS roi_rate, to_jsonb(p)->>'duration_days' AS duration_days FROM packages p WHERE p.status = 'active' AND (lower(COALESCE(to_jsonb(p)->>'package_type', '')) = 'fd' OR lower(p.name) LIKE '%fd%') AND (COALESCE(p.name, '') ILIKE ${q} OR COALESCE(p.description, '') ILIKE ${q}) ORDER BY p.price LIMIT ${limit}`,
  "daily-income-report": (db, id, q, limit) => db`SELECT (lt.created_at AT TIME ZONE 'Asia/Kolkata')::date::text AS period,
      CASE WHEN lower(lt.type) LIKE '%retopup%' THEN 'Retopup Income' WHEN lower(lt.type) LIKE '%joining%' OR lower(lt.type) LIKE '%referral%' THEN 'Referral / Joining Income' WHEN lower(lt.type) LIKE '%level%' THEN 'Level Income' WHEN lower(lt.type) LIKE '%roi%' THEN 'ROI Income' WHEN lower(lt.type) LIKE '%salary%' THEN 'Salary Income' WHEN lower(lt.type) LIKE '%bonus%' THEN 'Bonus Income' ELSE 'Other Income' END AS income_category,
      COALESCE(SUM(lt.amount),0)::numeric(20,8) AS total_amount, count(*)::int AS entries
    FROM ledger_transactions lt WHERE lt.user_id=${id} AND lt.amount>0 AND lower(lt.status) IN ('posted','completed','approved','paid')
      AND (lower(lt.type) LIKE '%income%' OR lower(lt.type) LIKE '%roi%' OR lower(lt.type) LIKE '%level%' OR lower(lt.type) LIKE '%referral%' OR lower(lt.type) LIKE '%joining%' OR lower(lt.type) LIKE '%retopup%' OR lower(lt.type) LIKE '%bonus%' OR lower(lt.type) LIKE '%salary%')
      AND ((lt.created_at AT TIME ZONE 'Asia/Kolkata')::date::text ILIKE ${q} OR lower(lt.type) ILIKE ${q})
    GROUP BY period,income_category ORDER BY period DESC,income_category LIMIT ${limit}` ,
  "monthly-income-report": (db, id, q, limit) => db`SELECT to_char(date_trunc('month',lt.created_at AT TIME ZONE 'Asia/Kolkata'),'YYYY-MM') AS period,
      CASE WHEN lower(lt.type) LIKE '%retopup%' THEN 'Retopup Income' WHEN lower(lt.type) LIKE '%joining%' OR lower(lt.type) LIKE '%referral%' THEN 'Referral / Joining Income' WHEN lower(lt.type) LIKE '%level%' THEN 'Level Income' WHEN lower(lt.type) LIKE '%roi%' THEN 'ROI Income' WHEN lower(lt.type) LIKE '%salary%' THEN 'Salary Income' WHEN lower(lt.type) LIKE '%bonus%' THEN 'Bonus Income' ELSE 'Other Income' END AS income_category,
      COALESCE(SUM(lt.amount),0)::numeric(20,8) AS total_amount, count(*)::int AS entries
    FROM ledger_transactions lt WHERE lt.user_id=${id} AND lt.amount>0 AND lower(lt.status) IN ('posted','completed','approved','paid')
      AND (lower(lt.type) LIKE '%income%' OR lower(lt.type) LIKE '%roi%' OR lower(lt.type) LIKE '%level%' OR lower(lt.type) LIKE '%referral%' OR lower(lt.type) LIKE '%joining%' OR lower(lt.type) LIKE '%retopup%' OR lower(lt.type) LIKE '%bonus%' OR lower(lt.type) LIKE '%salary%')
      AND (to_char(date_trunc('month',lt.created_at AT TIME ZONE 'Asia/Kolkata'),'YYYY-MM') ILIKE ${q} OR lower(lt.type) ILIKE ${q})
    GROUP BY period,income_category ORDER BY period DESC,income_category LIMIT ${limit}` ,
  reports: (db, id) => db`SELECT 'Fund Wallet (USDT)' AS name, COALESCE((SELECT fund_balance FROM users WHERE novopay_id = ${id}), 0)::text AS value
    UNION ALL SELECT 'Income Wallet (USDT)', COALESCE((SELECT income_balance FROM users WHERE novopay_id = ${id}), 0)::text
    UNION ALL SELECT 'Total investment (USDT)', COALESCE((SELECT SUM(amount) FROM package_activations WHERE user_id = ${id} AND lower(status) IN ('active','completed','approved')), 0)::text
    UNION ALL SELECT 'Total credited income (USDT)', COALESCE((SELECT SUM(amount) FROM ledger_transactions WHERE user_id = ${id} AND amount > 0 AND lower(status) IN ('posted','completed','approved','paid') AND (lower(type) LIKE '%income%' OR lower(type) LIKE '%roi%' OR lower(type) LIKE '%level%' OR lower(type) LIKE '%joining%' OR lower(type) LIKE '%retopup%' OR lower(type) LIKE '%bonus%' OR lower(type) LIKE '%salary%' OR lower(description) LIKE '%income%' OR lower(description) LIKE '%roi%' OR lower(description) LIKE '%level%' OR lower(description) LIKE '%joining%' OR lower(description) LIKE '%retopup%' OR lower(description) LIKE '%bonus%' OR lower(description) LIKE '%salary%')), 0)::text
    UNION ALL SELECT 'Ledger entries', count(*)::text FROM ledger_transactions WHERE user_id = ${id}
    UNION ALL SELECT 'Active packages', count(*)::text FROM package_activations WHERE user_id = ${id} AND status = 'active'
    UNION ALL SELECT 'Pending deposits', count(*)::text FROM deposits WHERE user_id = ${id} AND status = 'pending'
    UNION ALL SELECT 'Today credited income (USDT)', COALESCE(SUM(amount),0)::text FROM ledger_transactions WHERE user_id = ${id} AND amount>0 AND lower(status) IN ('posted','completed','approved','paid') AND created_at >= date_trunc('day', now()) AND (lower(type) LIKE '%income%' OR lower(type) LIKE '%roi%' OR lower(type) LIKE '%level%' OR lower(type) LIKE '%referral%' OR lower(type) LIKE '%joining%' OR lower(type) LIKE '%retopup%' OR lower(type) LIKE '%bonus%' OR lower(type) LIKE '%salary%')
    UNION ALL SELECT 'This month credited income (USDT)', COALESCE(SUM(amount),0)::text FROM ledger_transactions WHERE user_id = ${id} AND amount>0 AND lower(status) IN ('posted','completed','approved','paid') AND created_at >= date_trunc('month', now()) AND (lower(type) LIKE '%income%' OR lower(type) LIKE '%roi%' OR lower(type) LIKE '%level%' OR lower(type) LIKE '%referral%' OR lower(type) LIKE '%joining%' OR lower(type) LIKE '%retopup%' OR lower(type) LIKE '%bonus%' OR lower(type) LIKE '%salary%')
    UNION ALL SELECT 'Basic ROI income (USDT)', COALESCE(SUM(amount),0)::text FROM ledger_transactions WHERE user_id = ${id} AND amount>0 AND lower(status) IN ('posted','completed','approved','paid') AND (lower(type) LIKE '%basic%roi%' OR (lower(type) LIKE '%roi%' AND lower(description) LIKE '%basic%'))
    UNION ALL SELECT 'FD ROI income (USDT)', COALESCE(SUM(amount),0)::text FROM ledger_transactions WHERE user_id = ${id} AND amount>0 AND lower(status) IN ('posted','completed','approved','paid') AND (lower(type) LIKE '%fd%roi%' OR (lower(type) LIKE '%roi%' AND lower(description) LIKE '%fd%'))
    UNION ALL SELECT 'Referral income (USDT)', COALESCE(SUM(amount),0)::text FROM ledger_transactions WHERE user_id = ${id} AND amount>0 AND lower(status) IN ('posted','completed','approved','paid') AND (lower(type) LIKE '%referral%' OR lower(type) LIKE '%joining%' OR lower(type) LIKE '%first_deposit%')
    UNION ALL SELECT 'Level income (USDT)', COALESCE(SUM(amount),0)::text FROM ledger_transactions WHERE user_id = ${id} AND amount>0 AND lower(status) IN ('posted','completed','approved','paid') AND lower(type) LIKE '%level%'
    UNION ALL SELECT 'Retopup income (USDT)', COALESCE(SUM(amount),0)::text FROM ledger_transactions WHERE user_id = ${id} AND amount>0 AND lower(status) IN ('posted','completed','approved','paid') AND lower(type) LIKE '%retopup%'
    UNION ALL SELECT 'Salary / bonus income (USDT)', COALESCE(SUM(amount),0)::text FROM ledger_transactions WHERE user_id = ${id} AND amount>0 AND lower(status) IN ('posted','completed','approved','paid') AND (lower(type) LIKE '%salary%' OR lower(type) LIKE '%bonus%')
    UNION ALL SELECT 'Pending withdrawals', count(*)::text FROM withdrawals WHERE user_id = ${id} AND status = 'pending'`,
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
      const mobileInput = String(req.body?.mobile || "").trim();
      let normalizedMobile = mobileInput.replace(/\D/g, "");
      // Store Indian mobile numbers canonically so 9876543210, 09876543210,
      // and 919876543210 are treated as the same number.
      if (normalizedMobile.length === 12 && normalizedMobile.startsWith("91")) normalizedMobile = normalizedMobile.slice(2);
      else if (normalizedMobile.length === 11 && normalizedMobile.startsWith("0")) normalizedMobile = normalizedMobile.slice(1);
      const mobile = normalizedMobile;
      if (!displayName) return res.status(400).json({ error: "Please enter your full name." });
      // Mobile is optional; accept a blank value or any user-entered number.
      if (!sponsorCode) return res.status(400).json({ error: "Referral ID is required to register." });
      await db`ALTER TABLE users ADD COLUMN IF NOT EXISTS mobile text`;
      await db`ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code text`;
      await db`ALTER TABLE users ADD COLUMN IF NOT EXISTS sponsor_user_id text`;
      // Registration must be safe to retry if Firebase created the account but the
      // browser lost the profile response. Never treat the same auth user as a duplicate.
      const existingProfile = await db`SELECT id, auth_uid, novopay_id, full_name, email, mobile, status, fund_balance, income_balance, referral_code, sponsor_user_id, created_at FROM users WHERE auth_uid = ${decoded.uid} LIMIT 1`;
      if (existingProfile[0]) {
        if (!existingProfile[0].mobile && normalizedMobile) {
          const duplicateMobile = await db`SELECT novopay_id FROM users
            WHERE auth_uid <> ${decoded.uid}
              AND CASE
                WHEN length(regexp_replace(COALESCE(mobile, ''), '[^0-9]', '', 'g')) = 12
                  AND left(regexp_replace(COALESCE(mobile, ''), '[^0-9]', '', 'g'), 2) = '91'
                  THEN substring(regexp_replace(COALESCE(mobile, ''), '[^0-9]', '', 'g') from 3)
                WHEN length(regexp_replace(COALESCE(mobile, ''), '[^0-9]', '', 'g')) = 11
                  AND left(regexp_replace(COALESCE(mobile, ''), '[^0-9]', '', 'g'), 1) = '0'
                  THEN substring(regexp_replace(COALESCE(mobile, ''), '[^0-9]', '', 'g') from 2)
                ELSE regexp_replace(COALESCE(mobile, ''), '[^0-9]', '', 'g')
              END = ${normalizedMobile}
            LIMIT 1`;
          if (duplicateMobile[0]) return res.status(409).json({ error: "This mobile number is already registered. Please sign in to your existing account." });
          const updated = await db`UPDATE users SET mobile = ${normalizedMobile}, updated_at = now()
            WHERE auth_uid = ${decoded.uid} AND (mobile IS NULL OR mobile = '')
            RETURNING id, auth_uid, novopay_id, full_name, email, mobile, status, fund_balance, income_balance, referral_code, sponsor_user_id, created_at`;
          return res.status(200).json({ ok: true, user: updated[0] || existingProfile[0] });
        }
        return res.status(200).json({ ok: true, user: existingProfile[0] });
      }
      // Canonicalize existing formats when checking duplicates (10 digits, 0-prefix,
      // and +91-prefix all refer to the same Indian mobile number). Keep this check
      // in the request path read-only; index creation here can fail for legacy data.
      const duplicateMobile = normalizedMobile ? await db`SELECT novopay_id FROM users
        WHERE CASE
          WHEN length(regexp_replace(COALESCE(mobile, ''), '[^0-9]', '', 'g')) = 12
            AND left(regexp_replace(COALESCE(mobile, ''), '[^0-9]', '', 'g'), 2) = '91'
            THEN substring(regexp_replace(COALESCE(mobile, ''), '[^0-9]', '', 'g') from 3)
          WHEN length(regexp_replace(COALESCE(mobile, ''), '[^0-9]', '', 'g')) = 11
            AND left(regexp_replace(COALESCE(mobile, ''), '[^0-9]', '', 'g'), 1) = '0'
            THEN substring(regexp_replace(COALESCE(mobile, ''), '[^0-9]', '', 'g') from 2)
          ELSE regexp_replace(COALESCE(mobile, ''), '[^0-9]', '', 'g')
        END = ${normalizedMobile}
        LIMIT 1` : [];
      if (duplicateMobile[0]) return res.status(409).json({ error: "This mobile number is already registered. Please sign in to your existing account." });
      const sponsorRows = await db`SELECT novopay_id FROM users WHERE status = 'active' AND (upper(BTRIM(COALESCE(referral_code, ''))) = ${sponsorCode} OR upper(BTRIM(novopay_id)) = ${sponsorCode}) LIMIT 1`;
      if (!sponsorRows[0]) return res.status(400).json({ error: "Referral ID is invalid or inactive. Check the ID and try again." });
      const generatedId = "NP" + randomUUID().replace(/-/g, "").slice(0, 18).toUpperCase();
      await db`CREATE SEQUENCE IF NOT EXISTS novopay_referral_seq START WITH 503 INCREMENT BY 1`;
      const referralRows = await db`SELECT 'NP' || lpad(nextval('novopay_referral_seq')::text, 6, '0') AS referral_code`;
      const generatedReferral = referralRows[0].referral_code;
      const rows = await db`WITH new_user AS (
          INSERT INTO users (auth_uid, novopay_id, referral_code, sponsor_user_id, full_name, email, mobile)
          VALUES (${decoded.uid}, ${generatedId}, ${generatedReferral}, ${sponsorRows[0].novopay_id}, ${displayName}, ${email}, ${mobile})
          ON CONFLICT (auth_uid) DO NOTHING
          RETURNING id, auth_uid, novopay_id, full_name, email, mobile, status, fund_balance, income_balance, referral_code, sponsor_user_id, created_at
        ), commission AS (
          INSERT INTO referral_commissions
            (reference, sponsor_user_id, referred_user_id, package_activation_ref, basis_amount, rate, amount, currency, status, level)
          SELECT
            'REGREF-' || new_user.novopay_id,
            ${sponsorRows[0].novopay_id},
            new_user.novopay_id,
            'REG-' || new_user.novopay_id,
            0, 0, 0.50, 'USDT', 'posted', 1
          FROM new_user
          ON CONFLICT (package_activation_ref, level) DO NOTHING
          RETURNING sponsor_user_id, referred_user_id, amount, reference
        ), wallet_credit AS (
          UPDATE users AS sponsor
          SET income_balance = sponsor.income_balance + commission.amount,
              updated_at = now()
          FROM commission
          WHERE sponsor.novopay_id = commission.sponsor_user_id
          RETURNING sponsor.novopay_id
        ), ledger_credit AS (
          INSERT INTO ledger_transactions
            (reference, user_id, type, amount, currency, status, description, idempotency_key)
          SELECT
            commission.reference,
            commission.sponsor_user_id,
            'registration_referral_bonus',
            commission.amount,
            'USDT',
            'posted',
            'Registration referral bonus for ' || commission.referred_user_id,
            'registration-referral-bonus:' || commission.referred_user_id
          FROM commission
          ON CONFLICT (idempotency_key) DO NOTHING
          RETURNING id
        )
        SELECT new_user.* FROM new_user`;
      if (!rows[0]) {
        const racedProfile = await db`SELECT id, auth_uid, novopay_id, full_name, email, mobile, status, fund_balance, income_balance, referral_code, sponsor_user_id, created_at FROM users WHERE auth_uid = ${decoded.uid} LIMIT 1`;
        if (racedProfile[0]) return res.status(200).json({ ok: true, user: racedProfile[0] });
        throw new Error("Registration profile could not be created. Please try again.");
      }
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
    const depositAddress = String(platformSettings.depositAddress || process.env.NOVOPAY_BEP20_DEPOSIT_ADDRESS || "0xBF2bfe77a6Fc846cF9881A5A93508c7D5d6658b3").trim();
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

    if (section === "profile") {
      return res.status(200).json({
        ok: true, section, user: profile, rows: [],
        profileDetails: {
          novopay_id: profile.novopay_id,
          full_name: profile.full_name,
          email: profile.email || decoded.email || "",
          mobile: profile.mobile || "",
          status: profile.status,
          created_at: profile.created_at,
        },
      });
    }

    if (section === "overview") {
      const [recentTransactions, pendingDeposits, pendingWithdrawals, activePackages, activations, incomeLedger, sponsorRows, packageRows, countedIncomeRows] = await Promise.all([
        db`SELECT id, reference, type, amount, currency, status, description, created_at FROM ledger_transactions WHERE user_id = ${profile.novopay_id} ORDER BY created_at DESC LIMIT 5`,
        db`SELECT count(*)::int AS count FROM deposits WHERE user_id = ${profile.novopay_id} AND status = 'pending'`,
        db`SELECT count(*)::int AS count FROM withdrawals WHERE user_id = ${profile.novopay_id} AND status = 'pending'`,
        db`SELECT count(*)::int AS count FROM package_activations WHERE user_id = ${profile.novopay_id} AND status = 'active'`,
        db`SELECT a.id, a.reference, a.amount, a.currency, a.status, a.activated_at, p.name AS package_name, to_jsonb(p)->>'package_type' AS package_type FROM package_activations a LEFT JOIN packages p ON p.id = a.package_id WHERE a.user_id = ${profile.novopay_id} ORDER BY a.created_at DESC`,
        db`SELECT id, reference, type, amount, currency, status, description, created_at FROM ledger_transactions WHERE user_id = ${profile.novopay_id} AND (
          lower(type) IN ('roi_income','basic_roi_income','fd_roi_income','referral_income','basic_referral_income','fd_referral_income','level_income','basic_level_income','fd_level_income','joining_income','first_deposit_income','retopup_income','bonus_income','registration_bonus','principal_return','salary_income')
          OR lower(type) LIKE '%income%' OR lower(type) LIKE '%roi%' OR lower(type) LIKE '%level%'
          OR lower(type) LIKE '%joining%' OR lower(type) LIKE '%retopup%' OR lower(type) LIKE '%bonus%'
          OR lower(type) LIKE '%principal_return%'
          OR lower(description) LIKE '%income%' OR lower(description) LIKE '%roi%' OR lower(description) LIKE '%level%'
          OR lower(description) LIKE '%joining%' OR lower(description) LIKE '%retopup%' OR lower(description) LIKE '%bonus%'
          OR lower(description) LIKE '%principal return%'
        ) ORDER BY created_at DESC LIMIT 1000`,
        db`SELECT novopay_id, full_name FROM users WHERE novopay_id = ${profile.sponsor_user_id} LIMIT 1`,
        queries.packages(db, profile.novopay_id, '%', 50),
        db`SELECT COALESCE(SUM(amount), 0)::numeric AS counted_income FROM ledger_transactions WHERE user_id = ${profile.novopay_id} AND amount > 0 AND lower(status) IN ('posted','completed','approved','paid') AND (
          lower(type) LIKE '%income%' OR lower(type) LIKE '%roi%' OR lower(type) LIKE '%level%' OR lower(type) LIKE '%joining%' OR lower(type) LIKE '%retopup%' OR lower(type) LIKE '%bonus%' OR lower(type) LIKE '%principal_return%'
          OR lower(description) LIKE '%income%' OR lower(description) LIKE '%roi%' OR lower(description) LIKE '%level%' OR lower(description) LIKE '%joining%' OR lower(description) LIKE '%retopup%' OR lower(description) LIKE '%bonus%' OR lower(description) LIKE '%principal return%'
        )`,
      ]);
      const eligibleActivations = activations.filter(row => ['active','completed','approved'].includes(String(row.status || '').toLowerCase()));
      const recordedInvestment = eligibleActivations.reduce((sum,row)=>sum+Number(row.amount || 0),0);
      const countedIncome = Number(countedIncomeRows[0]?.counted_income || 0);
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
        incomeSummary: { totalIncome: countedIncome, totalInvestment: recordedInvestment },
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
    if (["packages", "basic-package", "fd-package"].includes(section)) {
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
