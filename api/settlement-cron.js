import { neon } from "@neondatabase/serverless";

function businessDateIST() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const secret = String(process.env.CRON_SECRET || "").trim();
  const authHeader = String(req.headers.authorization || "");
  if (!secret) return res.status(503).json({ ok: false, error: "Settlement cron is not configured." });
  if (authHeader !== `Bearer ${secret}`) return res.status(401).json({ ok: false, error: "Unauthorized." });
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  const databaseUrl = String(process.env.DATABASE_URL || "").trim();
  if (!databaseUrl) return res.status(503).json({ ok: false, error: "Database is not configured." });
  const sql = neon(databaseUrl);
  const settlementDate = businessDateIST();

  try {
    const rows = await sql`
      WITH business AS (
        SELECT ${settlementDate}::date AS settle_date
      ), investments AS (
        SELECT a.user_id, COALESCE(SUM(a.amount), 0)::numeric * 5 AS total_cap
        FROM package_activations a
        WHERE lower(a.status) IN ('active','completed','approved')
        GROUP BY a.user_id
      ), counted AS (
        SELECT l.user_id, COALESCE(SUM(l.amount), 0)::numeric AS counted_income
        FROM ledger_transactions l
        WHERE lower(l.status) IN ('posted','completed','approved','paid')
          AND l.amount > 0
          AND (
            lower(l.type) LIKE '%income%' OR lower(l.type) LIKE '%roi%'
            OR lower(l.type) LIKE '%level%' OR lower(l.type) LIKE '%joining%'
            OR lower(l.type) LIKE '%retopup%' OR lower(l.type) LIKE '%bonus%'
            OR lower(l.type) LIKE '%principal_return%'
            OR lower(l.description) LIKE '%income%' OR lower(l.description) LIKE '%roi%'
            OR lower(l.description) LIKE '%level%' OR lower(l.description) LIKE '%joining%'
            OR lower(l.description) LIKE '%retopup%' OR lower(l.description) LIKE '%bonus%'
            OR lower(l.description) LIKE '%principal return%'
          )
        GROUP BY l.user_id
      ), candidates AS (
        SELECT a.reference AS activation_ref, a.user_id, a.amount AS investment,
               a.activated_at, p.name AS package_name,
               lower(COALESCE(p.package_type, '')) AS package_type,
               COALESCE(p.roi_rate, 0)::numeric AS roi_rate,
               COALESCE(p.duration_days, 0)::integer AS duration_days,
               b.settle_date,
               (b.settle_date - (a.activated_at AT TIME ZONE 'Asia/Kolkata')::date) AS day_number,
               round(a.amount * COALESCE(p.roi_rate, 0)::numeric / 100, 8) AS gross_roi,
               COALESCE(i.total_cap, 0)::numeric AS total_cap,
               COALESCE(c.counted_income, 0)::numeric AS counted_income
        FROM package_activations a
        JOIN packages p ON p.id = a.package_id
        CROSS JOIN business b
        LEFT JOIN investments i ON i.user_id = a.user_id
        LEFT JOIN counted c ON c.user_id = a.user_id
        WHERE lower(a.status) = 'active'
          AND COALESCE(p.roi_rate, 0) > 0
          AND COALESCE(p.duration_days, 0) > 0
          AND b.settle_date > (a.activated_at AT TIME ZONE 'Asia/Kolkata')::date
          AND (b.settle_date - (a.activated_at AT TIME ZONE 'Asia/Kolkata')::date) BETWEEN 1 AND COALESCE(p.duration_days, 0)
      ), ranked AS (
        SELECT candidates.*,
               GREATEST(0, total_cap - counted_income) AS cap_remaining,
               SUM(gross_roi) OVER (
                 PARTITION BY user_id ORDER BY activated_at, activation_ref
                 ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
               ) AS cumulative_roi
        FROM candidates
      ), bounded AS (
        SELECT ranked.*,
               LEAST(gross_roi, GREATEST(0, cap_remaining - (cumulative_roi - gross_roi))) AS credit_amount
        FROM ranked
      ), credited AS (
        INSERT INTO ledger_transactions
          (reference, user_id, type, amount, currency, status, description, idempotency_key)
        SELECT 'ROI' || replace(activation_ref, '-', '') || to_char(settle_date, 'YYYYMMDD'),
               user_id,
               CASE WHEN package_type = 'basic' THEN 'basic_roi_income'
                    WHEN package_type = 'fd' THEN 'fd_roi_income'
                    ELSE 'roi_income' END,
               credit_amount, 'USDT', 'posted',
               'Daily ROI settlement for ' || package_name || ' (day ' || day_number || ')',
               'roi:' || activation_ref || ':' || to_char(settle_date, 'YYYY-MM-DD')
        FROM bounded
        WHERE credit_amount > 0
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING user_id, amount, reference, type, idempotency_key
      ), sponsor_chain(source_user_id, source_ref, basis_amount, level, sponsor_id, next_sponsor_id) AS (
        SELECT credited.user_id, credited.reference, credited.amount, 1,
               sponsor.novopay_id, sponsor.sponsor_user_id
        FROM credited
        JOIN users downline ON downline.novopay_id = credited.user_id
        JOIN users sponsor ON sponsor.novopay_id = downline.sponsor_user_id
          AND lower(sponsor.status) = 'active'
        UNION ALL
        SELECT chain.source_user_id, chain.source_ref, chain.basis_amount, chain.level + 1,
               sponsor.novopay_id, sponsor.sponsor_user_id
        FROM sponsor_chain chain
        JOIN users sponsor ON sponsor.novopay_id = chain.next_sponsor_id
          AND lower(sponsor.status) = 'active'
        WHERE chain.level < 15 AND chain.next_sponsor_id IS NOT NULL
      ), sponsor_caps AS (
        SELECT u.novopay_id AS user_id,
          GREATEST(0, COALESCE(SUM(a.amount),0)::numeric * 5 -
            COALESCE((
              SELECT SUM(l.amount) FROM ledger_transactions l
              WHERE l.user_id=u.novopay_id AND l.amount>0
                AND lower(l.status) IN ('posted','completed','approved','paid')
                AND (lower(l.type) LIKE '%income%' OR lower(l.type) LIKE '%roi%'
                  OR lower(l.type) LIKE '%level%' OR lower(l.type) LIKE '%joining%'
                  OR lower(l.type) LIKE '%retopup%' OR lower(l.type) LIKE '%bonus%'
                  OR lower(l.type) LIKE '%principal_return%')
            ),0)
            - COALESCE((SELECT SUM(c2.amount) FROM credited c2 WHERE c2.user_id=u.novopay_id),0)
          ) AS cap_remaining,
          EXISTS (
            SELECT 1 FROM package_activations active_a
            WHERE active_a.user_id=u.novopay_id AND lower(active_a.status)='active'
          ) AS has_active_package
        FROM users u
        LEFT JOIN package_activations a ON a.user_id=u.novopay_id
          AND lower(a.status) IN ('active','completed','approved')
        GROUP BY u.novopay_id
      ), level_raw AS (
        SELECT chain.*, caps.cap_remaining,
          round(chain.basis_amount * CASE WHEN chain.level=1 THEN 0.05 ELSE 0.01 END, 8) AS proposed_amount
        FROM sponsor_chain chain
        JOIN sponsor_caps caps ON caps.user_id=chain.sponsor_id
        WHERE caps.has_active_package
          AND NOT EXISTS (
            SELECT 1 FROM ledger_transactions existing
            WHERE existing.idempotency_key =
              'roi-level:' || chain.source_ref || ':L' || chain.level::text
          )
      ), level_ranked AS (
        SELECT level_raw.*,
          SUM(proposed_amount) OVER (
            PARTITION BY sponsor_id ORDER BY source_ref, level
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ) AS cumulative_commission
        FROM level_raw
      ), level_bounded AS (
        SELECT level_ranked.*,
          LEAST(proposed_amount, GREATEST(0, cap_remaining -
            (cumulative_commission - proposed_amount))) AS credit_amount
        FROM level_ranked
      ), level_credited AS (
        INSERT INTO ledger_transactions
          (reference,user_id,type,amount,currency,status,description,idempotency_key)
        SELECT 'RLI' || md5(source_ref || ':L' || level::text),
          sponsor_id,'roi_level_income',credit_amount,'USDT','posted',
          'Level ' || level::text || ' ROI income from ' || source_user_id ||
            ' daily ROI (' || source_ref || ')',
          'roi-level:' || source_ref || ':L' || level::text
        FROM level_bounded
        WHERE credit_amount > 0
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING user_id,amount,reference,type,idempotency_key
      ), balance_updates AS (
        UPDATE users u
        SET income_balance = u.income_balance + totals.amount,
            updated_at = now()
        FROM (
          SELECT user_id, SUM(amount)::numeric AS amount
          FROM (
            SELECT user_id, amount FROM credited
            UNION ALL
            SELECT user_id, amount FROM level_credited
          ) credits
          GROUP BY user_id
        ) totals
        WHERE u.novopay_id = totals.user_id
        RETURNING u.novopay_id
      ), audit AS (
        INSERT INTO audit_logs (actor_uid, action, entity_type, entity_id, details)
        SELECT 'system:settlement-cron', 'daily_roi_settlement', 'settlement', ${settlementDate},
               jsonb_build_object('credited_entries', (SELECT count(*) FROM credited),
                                  'credited_amount', COALESCE((SELECT SUM(amount) FROM credited), 0),
                                  'users_updated', (SELECT count(*) FROM balance_updates))
        RETURNING id
      )
      SELECT ${settlementDate} AS settlement_date,
             (SELECT count(*) FROM credited)::int AS credited_entries,
             COALESCE((SELECT SUM(amount) FROM credited), 0)::text AS credited_amount,
             (SELECT count(*) FROM balance_updates)::int AS users_updated
      FROM audit
    `;

    await sql`
      UPDATE package_activations a
      SET status = 'completed'
      FROM packages p
      WHERE p.id = a.package_id
        AND lower(a.status) = 'active'
        AND COALESCE(p.duration_days, 0) > 0
        AND (${settlementDate}::date - (a.activated_at AT TIME ZONE 'Asia/Kolkata')::date) >= p.duration_days
    `;

    return res.status(200).json({ ok: true, ...rows[0], timezone: "Asia/Kolkata" });
  } catch (error) {
    console.error("NovoPay settlement failed", error);
    return res.status(500).json({ ok: false, error: "Automatic settlement failed. Check server logs." });
  }
}
