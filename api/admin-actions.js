import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { neon } from "@neondatabase/serverless";

function services() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const url = String(process.env.DATABASE_URL || "").trim();
  if (!raw || !url) throw Object.assign(new Error("NovoPay backend is not configured."), { status: 503 });
  let account;
  try { account = JSON.parse(raw); }
  catch { try { account = JSON.parse(Buffer.from(raw, "base64").toString("utf8")); } catch { throw Object.assign(new Error("NovoPay Firebase server credentials are invalid."), { status: 503 }); } }
  if (typeof account === "string") account = JSON.parse(account);
  if (account?.project_id !== "novopay-finance" || !account.client_email || !account.private_key) throw Object.assign(new Error("NovoPay Firebase service account is invalid."), { status: 503 });
  account.private_key = String(account.private_key).replace(/\\n/g, "\n");
  const name = "novopay-admin-actions";
  const app = getApps().find(x => x.name === name) || initializeApp({ credential: cert(account), projectId: "novopay-finance" }, name);
  return { auth: getAuth(app), db: neon(url) };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Vary", "Authorization");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Method not allowed." }); }
  try {
    const { auth, db } = services();
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) return res.status(401).json({ error: "Sign-in required." });
    let actor;
    try { actor = await auth.verifyIdToken(token, true); } catch { return res.status(401).json({ error: "Session is invalid or expired." }); }
    if (actor.admin !== true) return res.status(403).json({ error: "Administrator permission is required." });

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const action = String(body.action || "");
    const reference = String(body.reference || "").trim().slice(0, 120);
    const id = String(body.id || "").trim().slice(0, 120);
    const status = String(body.status || "").trim().toLowerCase();
    let result;

    if (action === "deposit-approve" && reference) {
      result = await db`WITH changed AS (
        UPDATE deposits d SET status='approved', reviewed_at=now(), reviewer_uid=${actor.uid}
        FROM users u
        WHERE d.user_id=u.novopay_id AND d.reference=${reference} AND d.status='pending'
          AND EXISTS (
            SELECT 1 FROM audit_logs verified
            WHERE verified.action='deposit_blockchain_verified'
              AND verified.entity_id=d.reference
              AND lower(verified.details->>'tx_hash')=lower(d.tx_hash)
          )
          AND NOT EXISTS (
            SELECT 1 FROM ledger_transactions lt
            WHERE lt.reference='NP-DEP-'||d.reference OR lt.idempotency_key='deposit-credit:'||d.reference
          )
        RETURNING d.reference,d.user_id,d.amount,d.currency,d.tx_hash
      ), credited AS (
        UPDATE users u SET fund_balance=u.fund_balance+c.amount, updated_at=now()
        FROM changed c WHERE u.novopay_id=c.user_id
        RETURNING c.reference,c.user_id,c.amount,c.currency,c.tx_hash
      ), deposit_kind AS (
        SELECT c.*,
          CASE WHEN EXISTS (
            SELECT 1 FROM deposits previous
            WHERE previous.user_id=c.user_id AND previous.reference<>c.reference
              AND lower(previous.status) IN ('approved','completed','credited')
          ) THEN 'retopup' ELSE 'joining' END AS income_kind
        FROM credited c
      ), sponsor_chain(source_ref, source_user_id, basis_amount, income_kind, level, sponsor_id, next_sponsor_id) AS (
        SELECT d.reference,d.user_id,d.amount,d.income_kind,1,sponsor.novopay_id,sponsor.sponsor_user_id
        FROM deposit_kind d
        JOIN users downline ON downline.novopay_id=d.user_id
        JOIN users sponsor ON sponsor.novopay_id=downline.sponsor_user_id AND lower(sponsor.status)='active'
        UNION ALL
        SELECT chain.source_ref,chain.source_user_id,chain.basis_amount,chain.income_kind,chain.level+1,
          sponsor.novopay_id,sponsor.sponsor_user_id
        FROM sponsor_chain chain
        JOIN users sponsor ON sponsor.novopay_id=chain.next_sponsor_id AND lower(sponsor.status)='active'
        WHERE chain.level<15 AND chain.next_sponsor_id IS NOT NULL
      ), sponsor_caps AS (
        SELECT u.novopay_id AS user_id,
          GREATEST(0,COALESCE(SUM(a.amount),0)::numeric*5-COALESCE((
            SELECT SUM(l.amount) FROM ledger_transactions l
            WHERE l.user_id=u.novopay_id AND l.amount>0
              AND lower(l.status) IN ('posted','completed','approved','paid')
              AND (lower(l.type) LIKE '%income%' OR lower(l.type) LIKE '%roi%'
                OR lower(l.type) LIKE '%level%' OR lower(l.type) LIKE '%joining%'
                OR lower(l.type) LIKE '%retopup%' OR lower(l.type) LIKE '%bonus%'
                OR lower(l.type) LIKE '%principal_return%')
          ),0)) AS cap_remaining,
          EXISTS (SELECT 1 FROM package_activations active_a
            WHERE active_a.user_id=u.novopay_id AND lower(active_a.status)='active') AS has_active_package
        FROM users u
        LEFT JOIN package_activations a ON a.user_id=u.novopay_id
          AND lower(a.status) IN ('active','completed','approved')
        GROUP BY u.novopay_id
      ), commission_raw AS (
        SELECT chain.*,caps.cap_remaining,
          round(chain.basis_amount * CASE
            WHEN chain.income_kind='joining' AND chain.level=1 THEN 0.05
            WHEN chain.income_kind='retopup' AND chain.level=1 THEN 0.01
            ELSE 0.0025 END,8) AS proposed_amount
        FROM sponsor_chain chain
        JOIN sponsor_caps caps ON caps.user_id=chain.sponsor_id
        WHERE caps.has_active_package
          AND NOT EXISTS (SELECT 1 FROM ledger_transactions existing
            WHERE existing.idempotency_key='deposit-level:'||chain.source_ref||':L'||chain.level::text)
      ), commission_ranked AS (
        SELECT commission_raw.*,
          SUM(proposed_amount) OVER (PARTITION BY sponsor_id ORDER BY source_ref,level
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cumulative_commission
        FROM commission_raw
      ), commission_bounded AS (
        SELECT commission_ranked.*,
          LEAST(proposed_amount,GREATEST(0,cap_remaining-(cumulative_commission-proposed_amount))) AS credit_amount
        FROM commission_ranked
      ), commission_ledger AS (
        INSERT INTO ledger_transactions(reference,user_id,type,amount,currency,status,description,idempotency_key)
        SELECT 'DLI'||md5(source_ref||':L'||level::text),sponsor_id,
          CASE WHEN income_kind='joining' THEN 'joining_income' ELSE 'retopup_income' END,
          credit_amount,'USDT','posted',
          'Level '||level::text||' '||income_kind||' income from '||source_user_id||' deposit '||source_ref,
          'deposit-level:'||source_ref||':L'||level::text
        FROM commission_bounded WHERE credit_amount>0
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING user_id,amount,reference
      ), sponsor_credit AS (
        UPDATE users sponsor SET income_balance=sponsor.income_balance+totals.amount,updated_at=now()
        FROM (SELECT user_id,SUM(amount)::numeric AS amount FROM commission_ledger GROUP BY user_id) totals
        WHERE sponsor.novopay_id=totals.user_id
        RETURNING sponsor.novopay_id
      ), ledger AS (
        INSERT INTO ledger_transactions(reference,user_id,type,amount,currency,status,description,idempotency_key)
        SELECT 'NP-DEP-'||reference,user_id,'deposit_credit',amount,currency,'posted',
          'Admin approved verified USDT deposit ('||tx_hash||')','deposit-credit:'||reference
        FROM credited RETURNING id
      ), audit AS (
        INSERT INTO audit_logs(actor_uid,action,entity_type,entity_id,details)
        SELECT ${actor.uid},'deposit_approved','deposit',reference,
          jsonb_build_object('user_id',user_id,'amount',amount,'currency',currency,'tx_hash',tx_hash,
            'deposit_income_kind',(SELECT income_kind FROM deposit_kind LIMIT 1),
            'level_commissions',(SELECT count(*) FROM commission_ledger))
        FROM credited RETURNING id
      ) SELECT credited.reference,credited.user_id,credited.amount,credited.currency,
          (SELECT count(*) FROM commission_ledger)::int AS level_commissions
        FROM credited
        CROSS JOIN (SELECT count(*) FROM ledger) ledger_guard
        CROSS JOIN (SELECT count(*) FROM audit) audit_guard
        CROSS JOIN (SELECT count(*) FROM sponsor_credit) sponsor_guard`;
    } else if (action === "deposit-reject" && reference) {
      result = await db`WITH changed AS (
        UPDATE deposits SET status='rejected', reviewed_at=now(), reviewer_uid=${actor.uid}
        WHERE reference=${reference} AND status='pending' RETURNING reference,user_id,amount
      ), audit AS (
        INSERT INTO audit_logs(actor_uid,action,entity_type,entity_id,details)
        SELECT ${actor.uid},'deposit_rejected','deposit',reference,jsonb_build_object('user_id',user_id,'amount',amount) FROM changed RETURNING id
      ) SELECT reference,user_id,amount FROM changed`;
    } else if (action === "withdrawal-approve" && reference) {
      result = await db`WITH changed AS (
        UPDATE withdrawals SET status='approved', reviewed_at=now(), reviewer_uid=${actor.uid}
        WHERE reference=${reference} AND status='pending' RETURNING reference,user_id,amount,net_amount
      ), audit AS (
        INSERT INTO audit_logs(actor_uid,action,entity_type,entity_id,details)
        SELECT ${actor.uid},'withdrawal_approved','withdrawal',reference,jsonb_build_object('user_id',user_id,'amount',amount,'net_amount',net_amount) FROM changed RETURNING id
      ) SELECT reference,user_id,amount,net_amount FROM changed`;
    } else if (action === "withdrawal-reject" && reference) {
      result = await db`WITH changed AS (
        UPDATE withdrawals w SET status='rejected', reviewed_at=now(), reviewer_uid=${actor.uid}
        FROM users u WHERE w.user_id=u.novopay_id AND w.reference=${reference} AND w.status='pending'
        RETURNING w.reference,w.user_id,w.amount,w.currency
      ), refunded AS (
        UPDATE users u SET fund_balance=u.fund_balance+c.amount, updated_at=now()
        FROM changed c WHERE u.novopay_id=c.user_id RETURNING c.reference,c.user_id,c.amount,c.currency
      ), ledger AS (
        INSERT INTO ledger_transactions(reference,user_id,type,amount,currency,status,description,idempotency_key)
        SELECT 'NP-WDR-REFUND-'||reference,user_id,'withdrawal_refund',amount,currency,'posted','Refund for rejected withdrawal '||reference,'withdrawal-refund:'||reference FROM refunded
        ON CONFLICT DO NOTHING RETURNING id
      ), audit AS (
        INSERT INTO audit_logs(actor_uid,action,entity_type,entity_id,details)
        SELECT ${actor.uid},'withdrawal_rejected_refunded','withdrawal',reference,jsonb_build_object('user_id',user_id,'amount',amount) FROM refunded RETURNING id
      ) SELECT reference,user_id,amount FROM refunded`;
    } else if (action === "user-status" && id && ["active","suspended"].includes(status)) {
      result = await db`WITH changed AS (
        UPDATE users SET status=${status}, updated_at=now() WHERE novopay_id=${id} RETURNING novopay_id,status
      ), audit AS (
        INSERT INTO audit_logs(actor_uid,action,entity_type,entity_id,details)
        SELECT ${actor.uid},'user_status_changed','user',novopay_id,jsonb_build_object('status',status) FROM changed RETURNING id
      ) SELECT novopay_id,status FROM changed`;
    } else if (action === "kyc-status" && id && ["approved","rejected"].includes(status)) {
      result = await db`WITH changed AS (
        UPDATE kyc_submissions SET status=${status}, reviewed_at=now(), reviewer_uid=${actor.uid}
        WHERE id::text=${id} AND status='pending' RETURNING id,user_id,status
      ), audit AS (
        INSERT INTO audit_logs(actor_uid,action,entity_type,entity_id,details)
        SELECT ${actor.uid},'kyc_'||status,'kyc',id::text,jsonb_build_object('user_id',user_id) FROM changed RETURNING id
      ) SELECT id,user_id,status FROM changed`;
    } else if (action === "support-status" && id && ["open","pending","resolved","closed"].includes(status)) {
      result = await db`WITH changed AS (
        UPDATE support_tickets SET status=${status}, updated_at=now() WHERE id::text=${id} RETURNING id,reference,status
      ), audit AS (
        INSERT INTO audit_logs(actor_uid,action,entity_type,entity_id,details)
        SELECT ${actor.uid},'support_status_changed','support_ticket',reference,jsonb_build_object('status',status) FROM changed RETURNING id
      ) SELECT id,reference,status FROM changed`;
    } else if (action === "package-status" && id && ["active","paused","archived","draft"].includes(status)) {
      result = await db`WITH changed AS (
        UPDATE packages SET status=${status}, updated_at=now() WHERE id::text=${id} RETURNING id,name,status
      ), audit AS (
        INSERT INTO audit_logs(actor_uid,action,entity_type,entity_id,details)
        SELECT ${actor.uid},'package_status_changed','package',id::text,jsonb_build_object('name',name,'status',status) FROM changed RETURNING id
      ) SELECT id,name,status FROM changed`;
    } else if (action === "package-save") {
      const packageId = String(body.package_id || "").trim();
      const name = String(body.name || "").trim().slice(0, 120);
      const packageCode = String(body.package_code || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "_").slice(0, 60);
      const packageType = String(body.package_type || "").trim().toLowerCase();
      const description = String(body.description || "").trim().slice(0, 1000);
      const price = Number(body.price);
      const roiRate = Number(body.roi_rate);
      const durationDays = Number(body.duration_days);
      const packageStatus = String(body.status || "active").trim().toLowerCase();
      if (!name || !packageCode || !["basic", "fd"].includes(packageType)) return res.status(400).json({ error: "Enter package name, code and select Basic or FD." });
      if (!Number.isFinite(price) || price <= 0 || price > 100000000 || !Number.isFinite(roiRate) || roiRate < 0 || roiRate > 100 || !Number.isInteger(durationDays) || durationDays < 1 || durationDays > 36500) return res.status(400).json({ error: "Enter a valid amount, daily return percentage (0–100), and duration in days." });
      if (!["active", "paused", "draft", "archived"].includes(packageStatus)) return res.status(400).json({ error: "Invalid package status." });
      if (packageId) {
        result = await db`UPDATE packages SET name=${name}, package_code=${packageCode}, package_type=${packageType}, price=${price}, roi_rate=${roiRate}, duration_days=${durationDays}, currency='USDT', description=${description}, status=${packageStatus}, updated_at=now() WHERE id::text=${packageId} RETURNING id,name,package_code,package_type,price,roi_rate,duration_days,currency,description,status,created_at,updated_at`;
      } else {
        result = await db`INSERT INTO packages (name, package_code, package_type, price, roi_rate, duration_days, currency, description, status) VALUES (${name},${packageCode},${packageType},${price},${roiRate},${durationDays},'USDT',${description},${packageStatus}) RETURNING id,name,package_code,package_type,price,roi_rate,duration_days,currency,description,status,created_at,updated_at`;
      }
      if (result.length) await db`INSERT INTO audit_logs(actor_uid,action,entity_type,entity_id,details) VALUES (${actor.uid},${packageId ? 'package_updated' : 'package_created'},'package',${String(result[0].id)},${JSON.stringify({name,packageCode,packageType,price,roiRate,durationDays,status:packageStatus})}::jsonb)`;
    } else if (action === "save-settings") {
      const settings = body.settings;
      if (!settings || typeof settings !== "object" || Array.isArray(settings)) return res.status(400).json({ error: "Settings payload is required." });
      const commissions = Array.isArray(settings.commissions) ? settings.commissions.map(Number) : [];
      if (commissions.length !== 15 || commissions.some(v => !Number.isFinite(v) || v < 0 || v > 100)) return res.status(400).json({ error: "Enter 15 commission percentages from 0 to 100." });
      const address = String(settings.depositAddress || "").trim();
      if (address && !/^0x[a-fA-F0-9]{40}$/.test(address)) return res.status(400).json({ error: "Deposit wallet must be a valid EVM address (0x + 40 hex characters)." });
      const normalized = {
        maintenanceMode: settings.maintenanceMode === true,
        enforceWithdrawalTiming: settings.enforceWithdrawalTiming !== false,
        depositAddress: address,
        network: "BNB Smart Chain (BEP20)",
        asset: "USDT",
        walletLink: String(settings.walletLink || "").trim().slice(0, 500),
        qrImageUrl: String(settings.qrImageUrl || "").trim().slice(0, 1000),
        networkNotice: String(settings.networkNotice || "").trim().slice(0, 1000),
        basicPackageVisible: settings.basicPackageVisible !== false,
        fdPackageVisible: settings.fdPackageVisible !== false,
        depositVisible: settings.depositVisible !== false,
        brochurePdfUrl: (() => { const value = String(settings.brochurePdfUrl || "").trim(); if (value.length > 1100000) throw Object.assign(new Error("Brochure is too large. Upload a PDF up to 750 KB."), { status: 400 }); if (value.startsWith("data:") && !value.startsWith("data:application/pdf;base64,")) throw Object.assign(new Error("Only PDF brochure uploads are accepted."), { status: 400 }); if (value && !value.startsWith("data:application/pdf;base64,") && !/^https:\/\//i.test(value)) throw Object.assign(new Error("Enter a secure HTTPS PDF link."), { status: 400 }); return value; })(),
        commissions
      };
      await db`CREATE TABLE IF NOT EXISTS system_settings (setting_key text PRIMARY KEY, setting_value jsonb NOT NULL DEFAULT '{}'::jsonb, updated_at timestamptz NOT NULL DEFAULT now(), updated_by text)`;
      result = await db`INSERT INTO system_settings(setting_key,setting_value,updated_at,updated_by)
        VALUES ('platform',${JSON.stringify(normalized)}::jsonb,now(),${actor.uid})
        ON CONFLICT (setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,updated_at=now(),updated_by=EXCLUDED.updated_by
        RETURNING setting_key,updated_at`;
      await db`INSERT INTO audit_logs(actor_uid,action,entity_type,entity_id,details)
        VALUES (${actor.uid},'system_settings_saved','system_settings','platform',${JSON.stringify({maintenanceMode:normalized.maintenanceMode,enforceWithdrawalTiming:normalized.enforceWithdrawalTiming,depositAddressConfigured:!!address,commissions:normalized.commissions})}::jsonb)`;
    } else {
      return res.status(400).json({ error: "Unsupported action or missing record details." });
    }

    if (!result?.length) return res.status(409).json({ error: "No pending matching record was changed. It may already be reviewed or may not exist." });
    if (action === "save-settings") {
      const saved = await db`SELECT setting_value, updated_at FROM system_settings WHERE setting_key='platform' LIMIT 1`;
      return res.status(200).json({ ok: true, record: result[0], settings: saved[0]?.setting_value || {}, updatedAt: saved[0]?.updated_at || null });
    }
    return res.status(200).json({ ok: true, record: result[0] });
  } catch (error) {
    console.error("[NovoPay API] /api/admin-actions failed", { name: error?.name, code: error?.code, status: error?.status });
    return res.status(error?.status || 500).json({ error: error?.status && error.status < 500 ? error.message : error?.status === 503 ? error.message : "Admin action could not be completed safely." });
  }
}