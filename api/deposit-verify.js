import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { neon } from "@neondatabase/serverless";

const TOKEN_CONTRACT = "0x55d398326f99059fF775485246999027B3197955".toLowerCase();
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const RPC_URL = String(process.env.BSC_RPC_URL || "https://bsc-dataseed.binance.org").trim();
const REQUIRED_CONFIRMATIONS = Math.max(1, Number.parseInt(process.env.BSC_DEPOSIT_CONFIRMATIONS || "3", 10) || 3);

function fail(message, status = 400) { const error = new Error(message); error.status = status; throw error; }
function services() {
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim();
  const url = String(process.env.DATABASE_URL || "").trim();
  if (!raw || !url) fail("Deposit verification is not configured.", 503);
  let account;
  try { account = JSON.parse(raw); } catch { try { account = JSON.parse(Buffer.from(raw, "base64").toString("utf8")); } catch { fail("Deposit verification is not configured.", 503); } }
  if (typeof account === "string") account = JSON.parse(account);
  if (account?.project_id !== "novopay-finance" || !account.client_email || !account.private_key) fail("Deposit verification is not configured for NovoPay.", 503);
  account.private_key = String(account.private_key).replace(/\\n/g, "\n");
  const name = "novopay-deposit-verification";
  const app = getApps().find(item => item.name === name) || initializeApp({ credential: cert(account), projectId: "novopay-finance" }, name);
  return { auth: getAuth(app), sql: neon(url) };
}
async function rpc(method, params) {
  const response = await fetch(RPC_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("BSC RPC unavailable");
  const payload = await response.json();
  if (payload.error || payload.result === undefined) throw new Error("BSC RPC returned an invalid response");
  return payload.result;
}
function addressFromTopic(topic) {
  if (!topic || !/^0x[0-9a-fA-F]{64}$/.test(topic)) return "";
  return "0x" + topic.slice(-40).toLowerCase();
}
function toUnits(value) {
  const text = String(value ?? "").trim();
  if (!/^\d+(?:\.\d{1,8})?$/.test(text)) fail("Deposit amount is invalid.");
  const [whole, fraction = ""] = text.split(".");
  return BigInt(whole) * 1000000000000000000n + BigInt((fraction + "0".repeat(18)).slice(0, 18));
}
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Vary", "Authorization");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ ok: false, error: "Method not allowed." }); }
  try {
    const { auth, sql } = services();
    const header = String(req.headers.authorization || "");
    if (!header.startsWith("Bearer ")) fail("Sign in to verify this deposit.", 401);
    let decoded;
    try { decoded = await auth.verifyIdToken(header.slice(7), true); } catch { fail("Your session has expired. Please sign in again.", 401); }
    const txHash = String(req.body?.tx_hash || "").trim().toLowerCase();
    if (!/^0x[a-f0-9]{64}$/.test(txHash)) fail("Enter a valid BSC transaction hash.");
    const profileRows = await sql`SELECT novopay_id, status FROM users WHERE auth_uid = ${decoded.uid} LIMIT 1`;
    const profile = profileRows[0];
    if (!profile) fail("Account profile is not ready.", 409);
    if (profile.status !== "active") fail("Your account is not active.", 403);
    const depositRows = await sql`SELECT reference, user_id, amount::text AS amount, currency, status, tx_hash FROM deposits WHERE lower(tx_hash)=${txHash} LIMIT 2`;
    const deposit = depositRows[0];
    if (!deposit || deposit.user_id !== profile.novopay_id) fail("No deposit request was found for this transaction. Submit the deposit request first.", 404);
    if (["approved", "completed", "credited"].includes(String(deposit.status).toLowerCase())) return res.status(200).json({ ok: true, status: "approved", message: "This deposit has already been credited.", reference: deposit.reference });
    if (String(deposit.status).toLowerCase() !== "pending") fail("This deposit is not pending verification.", 409);
    if (String(deposit.currency || "").toUpperCase() !== "USDT") fail("Only USDT deposits can be verified here.", 409);
    if (depositRows.length > 1) fail("This transaction hash is linked to multiple requests. Contact support; no additional credit was made.", 409);

    const platformRows = await sql`SELECT setting_value FROM system_settings WHERE setting_key='platform' LIMIT 1`;
    const settings = platformRows[0]?.setting_value || {};
    const receivingAddress = String(settings.depositAddress || process.env.NOVOPAY_BEP20_DEPOSIT_ADDRESS || "0xBF2bfe77a6Fc846cF9881A5A93508c7D5d6658b3").trim().toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(receivingAddress)) fail("The NovoPay receiving address has not been configured by the administrator.", 503);

    let receipt;
    try { receipt = await rpc("eth_getTransactionReceipt", [txHash]); }
    catch { fail("Blockchain verification is temporarily unavailable. Your deposit remains pending.", 503); }
    if (!receipt) return res.status(202).json({ ok: true, status: "pending", message: "Transaction not yet confirmed on BNB Smart Chain. Your deposit remains pending." });
    if (String(receipt.status || "").toLowerCase() !== "0x1") fail("This blockchain transaction failed. No funds were credited.", 409);
    const blockHex = await rpc("eth_blockNumber", []);
    const confirmations = Number(BigInt(blockHex) - BigInt(receipt.blockNumber) + 1n);
    if (confirmations < REQUIRED_CONFIRMATIONS) return res.status(202).json({ ok: true, status: "pending", confirmations, requiredConfirmations: REQUIRED_CONFIRMATIONS, message: "Waiting for blockchain confirmations. Your deposit remains pending." });

    const matching = (receipt.logs || []).filter(log =>
      String(log.address || "").toLowerCase() === TOKEN_CONTRACT &&
      String(log.topics?.[0] || "").toLowerCase() === TRANSFER_TOPIC &&
      addressFromTopic(log.topics?.[2]) === receivingAddress
    );
    const amountUnits = toUnits(deposit.amount);
    const transfer = matching.find(log => {
      try { return BigInt(log.data) === amountUnits; } catch { return false; }
    });
    if (!transfer) fail("Transaction token, receiving address, or amount does not match this deposit request.", 409);

    await sql`
      INSERT INTO audit_logs(actor_uid,action,entity_type,entity_id,details)
      SELECT ${decoded.uid}, 'deposit_blockchain_verified', 'deposit', ${deposit.reference},
        jsonb_build_object('user_id',${profile.novopay_id},'amount',${deposit.amount}::numeric,
          'currency','USDT','tx_hash',${txHash},'confirmations',${confirmations})
      WHERE NOT EXISTS (
        SELECT 1 FROM audit_logs
        WHERE action='deposit_blockchain_verified' AND entity_id=${deposit.reference}
          AND lower(details->>'tx_hash')=${txHash}
      )
    `;
    return res.status(200).json({
      ok: true,
      status: "pending",
      blockchainVerified: true,
      message: "Transaction verified successfully. Your deposit is now waiting for admin approval.",
      reference: deposit.reference,
      confirmations
    });
  } catch (error) {
    console.error("[NovoPay deposit verification]", { name: error?.name, code: error?.code, status: error?.status });
    return res.status(error?.status || 500).json({ ok: false, error: error?.status ? error.message : "Deposit verification could not be completed safely." });
  }
}
