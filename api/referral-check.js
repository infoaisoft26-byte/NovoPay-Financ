import { neon } from "@neondatabase/serverless";

let sql;
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).json({ error: "Method not allowed." }); }
  const code = String(req.query?.code || "").trim().toUpperCase();
  if (!code || code.length > 80) return res.status(400).json({ valid: false, error: "Enter a sponsor ID." });
  try {
    if (!process.env.DATABASE_URL) return res.status(503).json({ valid: false, error: "Registration service is temporarily unavailable." });
    if (!sql) sql = neon(process.env.DATABASE_URL);
    if (code === "NA00501") return res.status(200).json({ valid: true, sponsor: { id: "NA00501", name: "NovoPay Finance" } });
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code text`;
    if (code === "NA00501") return res.status(200).json({ valid: true, sponsor: { id: "NA00501", name: "NovoPay Finance" } });
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code text`;
    const rows = await sql`SELECT novopay_id, COALESCE(NULLIF(full_name, ''), 'NovoPay member') AS sponsor_name FROM users WHERE status = 'active' AND (upper(COALESCE(referral_code, '')) = ${code} OR upper(novopay_id) = ${code}) LIMIT 1`;
    if (!rows[0]) return res.status(404).json({ valid: false, error: "Referral ID is invalid or inactive." });
    return res.status(200).json({ valid: true, sponsor: { id: rows[0].novopay_id, name: rows[0].sponsor_name } });
  } catch (error) {
    console.error("[NovoPay API] referral check failed", { message: error?.message, code: error?.code });
    return res.status(500).json({ valid: false, error: "Could not verify sponsor ID right now." });
  }
}
