import { randomUUID } from "node:crypto";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { neon } from "@neondatabase/serverless";

function fail(message, status = 400) { const error = new Error(message); error.status = status; throw error; }
function services() {
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim();
  const url = String(process.env.DATABASE_URL || "").trim();
  if (!raw || !url) fail("NovoPay backend configuration is incomplete.", 503);
  let account;
  try { account = JSON.parse(raw); } catch { try { account = JSON.parse(Buffer.from(raw, "base64").toString("utf8")); } catch { fail("Firebase server credentials are invalid.", 503); } }
  if (typeof account === "string") account = JSON.parse(account);
  if (account?.project_id !== "novopay-finance" || !account.client_email || !account.private_key) fail("Use the Firebase service account for novopay-finance.", 503);
  account.private_key = String(account.private_key).replace(/\\n/g, "\n");
  const app = getApps().find(x => x.name === "novopay-user-actions") || initializeApp({ credential: cert(account), projectId: "novopay-finance" }, "novopay-user-actions");
  return { auth: getAuth(app), sql: neon(url) };
}
async function userFor(req, auth, sql) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) fail("Sign in to continue.", 401);
  let decoded;
  try { decoded = await auth.verifyIdToken(header.slice(7), true); } catch { fail("Session expired. Please sign in again.", 401); }
  const rows = await sql`SELECT novopay_id, status FROM users WHERE auth_uid = ${decoded.uid} LIMIT 1`;
  if (!rows[0]) fail("Account profile is not ready. Refresh the dashboard and try again.", 409);
  if (rows[0].status !== "active") fail("Your account is not active.", 403);
  return { decoded, profile: rows[0] };
}
function positiveAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > 100000000 || !/^\\d+(?:\\.\\d{1,8})?$/.test(String(value))) fail("Enter a valid amount greater than zero (up to 8 decimal places).");
  return n.toFixed(8);
}
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Vary", "Authorization");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Method not allowed." }); }
  try {
    const { auth, sql } = services();
    const { decoded, profile } = await userFor(req, auth, sql);
    const action = String(req.body?.action || "");
    const reference = "NP" + randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase();

    if (action === "deposit-request") {
      const amount = positiveAmount(req.body?.amount);
      const txHash = String(req.body?.tx_hash || "").trim();
      if (!/^(0x)?[a-fA-F0-9]{64}$/.test(txHash)) fail("Enter a valid BSC transaction hash.");
      const normalizedHash = txHash.startsWith("0x") ? txHash.toLowerCase() : "0x" + txHash.toLowerCase();
      const rows = await sql`WITH created AS (
        INSERT INTO deposits (reference, user_id, amount, currency, status, tx_hash)
        VALUES (${reference}, ${profile.novopay_id}, ${amount}, 'USDT', 'pending', ${normalizedHash})
        RETURNING reference, amount, status, tx_hash, created_at
      ), audited AS (
        INSERT INTO audit_logs (actor_uid, action, entity_type, entity_id, details)
        SELECT ${decoded.uid}, 'deposit_requested', 'deposit', reference, jsonb_build_object('amount', amount, 'currency', 'USDT') FROM created
        RETURNING id
      )
      SELECT created.* FROM created CROSS JOIN (SELECT count(*) FROM audited) audit_guard`;
      return res.status(201).json({ ok: true, message: "Deposit request submitted. Funds will be credited only after transaction verification.", record: rows[0] });
    }

    if (action === "withdrawal-request") {
      const amount = positiveAmount(req.body?.amount);
      const address = String(req.body?.payout_address || "").trim();
      if (!/^0x[a-fA-F0-9]{40}$/.test(address)) fail("Enter a valid BSC wallet address.");
      const feeRate = 0.05;
      const fee = (Number(amount) * feeRate).toFixed(8);
      const net = (Number(amount) - Number(fee)).toFixed(8);
      const rows = await sql`WITH debited AS (
        UPDATE users SET fund_balance = fund_balance - ${amount}::numeric, updated_at = now()
        WHERE novopay_id = ${profile.novopay_id} AND fund_balance >= ${amount}::numeric
        RETURNING novopay_id
      ), created AS (
        INSERT INTO withdrawals (reference, user_id, amount, fee, net_amount, currency, status, payout_address)
        SELECT ${reference}, novopay_id, ${amount}, ${fee}, ${net}, 'USDT', 'pending', ${address} FROM debited
        RETURNING reference, amount, fee, net_amount, status, created_at, user_id
      ), ledger AS (
        INSERT INTO ledger_transactions (reference, user_id, type, amount, currency, status, description, idempotency_key)
        SELECT ${"LD" + reference}, user_id, 'withdrawal_request', -amount, 'USDT', 'posted', 'Withdrawal request; 5% fee applied at payout', ${"withdrawal:" + reference} FROM created
        RETURNING id
      ), audited AS (
        INSERT INTO audit_logs (actor_uid, action, entity_type, entity_id, details)
        SELECT ${decoded.uid}, 'withdrawal_requested', 'withdrawal', reference, jsonb_build_object('amount', amount, 'fee', fee, 'net', net_amount) FROM created
        RETURNING id
      )
      SELECT created.reference, created.amount, created.fee, created.net_amount, created.status, created.created_at
      FROM created CROSS JOIN (SELECT count(*) FROM ledger) ledger_guard CROSS JOIN (SELECT count(*) FROM audited) audit_guard`;
      if (!rows.length) fail("Insufficient Fund Wallet balance.", 409);
      return res.status(201).json({ ok: true, message: "Withdrawal request submitted for admin review.", record: rows[0] });
    }

    if (action === "package-purchase") {
      const packageId = String(req.body?.package_id || "");
      if (!/^[0-9a-f-]{36}$/i.test(packageId)) fail("Select a valid package.");
      const packages = await sql`SELECT id, name, price, currency, status FROM packages WHERE id = ${packageId}::uuid LIMIT 1`;
      const pkg = packages[0];
      if (!pkg || pkg.status !== "active") fail("This package is not currently available.", 409);
      const purchaseRef = reference;
      const activation = await sql`WITH debited AS (
        UPDATE users SET fund_balance = fund_balance - ${pkg.price}::numeric, updated_at = now()
        WHERE novopay_id = ${profile.novopay_id} AND fund_balance >= ${pkg.price}::numeric
        RETURNING novopay_id
      ), created AS (
        INSERT INTO package_activations (reference, user_id, package_id, amount, currency, status, activated_at)
        SELECT ${purchaseRef}, novopay_id, ${pkg.id}::uuid, ${pkg.price}, ${pkg.currency}, 'active', now() FROM debited
        RETURNING reference, user_id, package_id, amount, currency, status, activated_at
      ), commission AS (
        INSERT INTO referral_commissions (reference, sponsor_user_id, referred_user_id, package_activation_ref, basis_amount, rate, amount, currency, status)
        SELECT ${"RC" + purchaseRef}, sponsor.novopay_id, created.user_id, created.reference, created.amount, 0.07, round(created.amount * 0.07, 8), created.currency, 'posted'
        FROM created
        JOIN users referred ON referred.novopay_id = created.user_id
        JOIN users sponsor ON sponsor.novopay_id = referred.sponsor_user_id AND sponsor.status = 'active'
        WHERE referred.sponsor_user_id IS NOT NULL
        ON CONFLICT (package_activation_ref) DO NOTHING
        RETURNING reference, sponsor_user_id, referred_user_id, package_activation_ref, amount, currency
      ), sponsor_credit AS (
        UPDATE users sponsor SET income_balance = sponsor.income_balance + commission.amount, updated_at = now()
        FROM commission
        WHERE sponsor.novopay_id = commission.sponsor_user_id
        RETURNING sponsor.novopay_id, commission.reference, commission.referred_user_id, commission.package_activation_ref, commission.amount, commission.currency
      ), referral_ledger AS (
        INSERT INTO ledger_transactions (reference, user_id, type, amount, currency, status, description, idempotency_key)
        SELECT ${"RL" + purchaseRef}, sponsor_credit.novopay_id, 'referral_income', sponsor_credit.amount, sponsor_credit.currency, 'posted', ${"Direct referral reward (7%) for package activation " + purchaseRef}, ${"referral:" + purchaseRef}
        FROM sponsor_credit
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING id
      ), ledger AS (
        INSERT INTO ledger_transactions (reference, user_id, type, amount, currency, status, description, idempotency_key)
        SELECT ${"LD" + purchaseRef}, user_id, 'package_purchase', -amount, currency, 'posted', ${"Package purchase: " + pkg.name}, ${"package:" + purchaseRef} FROM created
        RETURNING id
      ), audited AS (
        INSERT INTO audit_logs (actor_uid, action, entity_type, entity_id, details)
        SELECT ${decoded.uid}, 'package_purchased', 'package_activation', reference, jsonb_build_object('package_id', package_id::text, 'amount', amount) FROM created
        RETURNING id
      )
      SELECT created.reference, created.amount, created.status, created.activated_at,
             COALESCE((SELECT sum(amount) FROM commission), 0) AS referral_reward
      FROM created CROSS JOIN (SELECT count(*) FROM ledger) ledger_guard CROSS JOIN (SELECT count(*) FROM audited) audit_guard`;
      if (!activation.length) fail("Insufficient Fund Wallet balance. Deposit and verify funds first.", 409);
      return res.status(201).json({ ok: true, message: "Package activated.", record: activation[0] });
    }
    fail("Unsupported action.");
  } catch (error) {
    const status = error?.status || (error?.code === "23505" ? 409 : 500);
    console.error("[NovoPay API] user action failed", { action: req.body?.action, message: error?.message, code: error?.code, status });
    return res.status(status).json({ error: status === 500 ? "Request could not be processed safely. Refresh and try again." : error.message });
  }
}
