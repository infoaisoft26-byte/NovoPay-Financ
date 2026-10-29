import { neon } from "@neondatabase/serverless";

let sql;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Vary", "Accept");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ valid: false, error: "Method not allowed." });
  }

  const rawCode = req.query?.code;
  const code = String(Array.isArray(rawCode) ? rawCode[0] : rawCode || "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();

  if (!code || code.length > 80) {
    return res.status(400).json({ valid: false, error: "Enter a sponsor ID." });
  }

  try {
    const databaseUrl = String(process.env.DATABASE_URL || "").trim();
    if (!/^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
      console.error("[NovoPay API] referral check unavailable: DATABASE_URL is missing or invalid");
      return res.status(503).json({ valid: false, error: "Registration service is temporarily unavailable. Please try again shortly." });
    }

    if (!sql) sql = neon(databaseUrl);

    const rows = await sql`
      SELECT novopay_id,
             COALESCE(NULLIF(BTRIM(full_name), ''), 'NovoPay member') AS sponsor_name
      FROM users
      WHERE LOWER(BTRIM(COALESCE(status, ''))) = 'active'
        AND (
          UPPER(BTRIM(COALESCE(referral_code, ''))) = ${code}
          OR UPPER(BTRIM(COALESCE(novopay_id, ''))) = ${code}
        )
      ORDER BY CASE WHEN UPPER(BTRIM(COALESCE(referral_code, ''))) = ${code} THEN 0 ELSE 1 END
      LIMIT 1
    `;

    if (!rows[0]) {
      return res.status(404).json({ valid: false, error: "Referral ID is invalid or inactive. Check the ID and try again." });
    }

    return res.status(200).json({
      valid: true,
      sponsor: { id: rows[0].novopay_id, name: rows[0].sponsor_name }
    });
  } catch (error) {
    console.error("[NovoPay API] referral check failed", { message: error?.message, code: error?.code });
    return res.status(500).json({
      valid: false,
      error: "Could not verify sponsor ID right now. Please try again shortly."
    });
  }
}
