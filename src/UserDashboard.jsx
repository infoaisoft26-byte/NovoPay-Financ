import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Bell, ChevronRight, Users, Copy,
  CircleHelp, Clock3, CreditCard, Download, FileText, Home, Layers3, LogOut,
  Menu, Package, RefreshCw, Search, ShieldCheck, UserRound, Wallet, X
} from "lucide-react";
import "./user-dashboard.css";

const NAV_GROUPS = [
  { title: "FINANCE", items: [
    { id: "overview", label: "Dashboard", icon: Home },
    { id: "brochure", label: "Download Brochure", icon: Download },
    { id: "deposits", label: "Recharge Fund", icon: ArrowDownLeft },
  ]},
  { title: "TRANSACTIONAL", items: [
    { id: "transactions", label: "Transaction Ledger", icon: Activity },
    { id: "p2p", label: "P2P Transfer", icon: ArrowLeftRight },
    { id: "transfer-income-fund", label: "Transfer Income To Fund", icon: CreditCard },
    { id: "withdrawals", label: "Fund Withdrawal", icon: ArrowUpRight },
  ]},
  { title: "PACKAGE ACTIVATION", items: [
    { id: "basic-package", label: "Basic Package", icon: Package },
    { id: "fd-package", label: "FD Package", icon: Layers3 },
    { id: "package-requests", label: "Package Requests", icon: Clock3 },
  ]},
  { title: "DOWNLINE", items: [
    { id: "direct-team", label: "Direct Team", icon: Users },
    { id: "team-list", label: "Team List", icon: Users },
  ]},
  { title: "INCOME", items: [
    { id: "income-all", label: "Income History (All)", icon: Activity },
    { id: "basic-roi", label: "Basic ROI Income", icon: Activity },
    { id: "basic-referral", label: "Basic Referral Income", icon: Users },
    { id: "basic-level", label: "Basic Level Income", icon: Users },
    { id: "fd-roi", label: "FD ROI Income", icon: Activity },
    { id: "fd-referral", label: "FD Referral Income", icon: Users },
    { id: "fd-level", label: "FD Level Income", icon: Users },
    { id: "salary", label: "Salary Income", icon: CreditCard },
  ]},
  { title: "REPORTS & SUPPORT", items: [
    { id: "reports", label: "Reports", icon: FileText },
    { id: "support", label: "Support Tickets", icon: CircleHelp },
    { id: "wallet", label: "My Wallet", icon: Wallet },
    { id: "profile", label: "My Profile", icon: UserRound },
  ]},
];
const NAV = NAV_GROUPS.flatMap(group => group.items);

const TITLES = {
  overview: ["Dashboard", "Your account at a glance."],
  brochure: ["Download Brochure", "Get the latest NovoPay information."],
  wallet: ["My Wallet", "Review your available balances."],
  deposits: ["Recharge Fund", "Send USDT on BNB Smart Chain (BEP-20) and submit the transaction hash."],
  withdrawals: ["Fund Withdrawal", "Request a payout and track admin review."],
  transactions: ["Transaction Ledger", "Your account ledger, newest first."],
  packages: ["Packages", "Available packages configured by NovoPay."],
  "basic-package": ["Basic Package", "Browse and activate available Basic packages."],
  "fd-package": ["FD Package", "Browse and activate available FD packages."],
  "package-requests": ["Package Requests", "Track package activation requests."],
  referrals: ["Referrals & Income", "Your referral ID, direct members and credited rewards."],
  p2p: ["P2P Transfer", "View P2P transfers associated with your account."],
  "transfer-income-fund": ["Transfer Income To Fund", "Move available income balance to your Fund Wallet."],
  "direct-team": ["Direct Team", "Members directly sponsored by your account."],
  "team-list": ["Team List", "Your referral team across levels."],
  "income-all": ["Income History (All)", "All credited income records from your NovoPay ledger."],
  "basic-roi": ["Basic ROI Income", "Basic package ROI entries from your ledger."],
  "basic-referral": ["Basic Referral Income", "Basic referral income entries from your ledger."],
  "basic-level": ["Basic Level Income", "Basic level income entries from your ledger."],
  "fd-roi": ["FD ROI Income", "FD package ROI entries from your ledger."],
  "fd-referral": ["FD Referral Income", "FD referral income entries from your ledger."],
  "fd-level": ["FD Level Income", "FD level income entries from your ledger."],
  salary: ["Salary Income", "Salary entries recorded in your ledger."],
  reports: ["Reports", "Summary of your own account activity."],
  support: ["Support Tickets", "Track support requests linked to your account."],
  profile: ["My Profile", "Your registered account details."],
};
function money(value) {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 8 }) + " USDT" : "—";
}
function date(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString();
}
function statusClass(value) {
  const v = String(value || "unknown").toLowerCase();
  if (["approved", "active", "completed", "posted", "paid", "resolved"].includes(v)) return "good";
  if (["rejected", "failed", "suspended", "closed"].includes(v)) return "bad";
  if (["pending", "draft", "open"].includes(v)) return "wait";
  return "neutral";
}

export default function UserDashboard({ user, onLogout }) {
  const [section, setSection] = useState("overview");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [historyEntries, setHistoryEntries] = useState(10);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [depositAmount, setDepositAmount] = useState("2");
  const [txHash, setTxHash] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [payoutAddress, setPayoutAddress] = useState("");
  const [p2pRecipient, setP2pRecipient] = useState("");
  const [p2pAmount, setP2pAmount] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await user.getIdToken();
      const params = new URLSearchParams({ section, limit: "50" });
      if (query.trim()) params.set("q", query.trim());
      const response = await fetch(`/api/user?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      let result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Account data could not be loaded.");
      if (result.profilePending && section !== "packages") {
        const createProfile = await fetch("/api/user", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ action: "ensure-profile", full_name: user.displayName || "" }),
          cache: "no-store",
        });
        const profileResult = await createProfile.json().catch(() => ({}));
        if (!createProfile.ok) throw new Error(profileResult.error || "Your account profile could not be initialized.");
        result = { ...result, user: profileResult.user, profilePending: false };
        if (section === "overview") {
          const refreshed = await fetch(`/api/user?section=overview&limit=50`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          });
          const refreshedResult = await refreshed.json().catch(() => ({}));
          if (refreshed.ok) result = refreshedResult;
        }
      }
      setData(result);
      setLastUpdated(new Date());
    } catch (err) {
      setData(null);
      setError(err.message || "Account data could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [user, section, query]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => load(), 15000);
    return () => window.clearInterval(timer);
  }, [load]);

  const profile = data?.user || null;
  const rows = useMemo(() => Array.isArray(data?.rows) ? data.rows : [], [data]);
  const title = TITLES[section] || TITLES.overview;

  async function submitAction(action, payload = {}) {
    setActionBusy(true); setActionMessage("");
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/user-actions", { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ action, ...payload }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Request could not be completed.");
      setActionMessage(result.message || "Request submitted."); setTxHash(""); setWithdrawAmount("");
      await load();
    } catch (err) { setActionMessage(err.message || "Request could not be completed."); }
    finally { setActionBusy(false); }
  }

  function chooseSection(next) {
    setSection(next);
    setQuery("");
    setMobileOpen(false);
  }

  return (
    <main className="np-user-shell">
      <aside className={`np-user-sidebar ${mobileOpen ? "open" : ""}`}>
        <div className="np-user-brand-row">
          <span className="np-user-brand"><img className="np-sidebar-logo" src="/novopay-logo.svg" alt="NovoPay Finance" /><small>MEMBER PORTAL</small></span>
          <button className="np-user-close" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X size={19} /></button>
        </div>
        <div className="np-user-member">
          <span className="np-user-avatar">{(user.displayName || user.email || "U").slice(0, 1).toUpperCase()}</span>
          <span><b>{profile?.full_name || user.displayName || "Member"}</b><small>{profile?.novopay_id || "Account profile"}</small></span>
        </div>
        <p className="np-user-nav-label">ACCOUNT MENU</p>
        <nav className="np-user-nav">
          {NAV_GROUPS.map(group => <div className="np-user-nav-group" key={group.title}>
            <p className="np-user-nav-group-title">{group.title}</p>
            {group.items.map(item => { const Icon = item.icon; return <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => chooseSection(item.id)}><Icon size={17} /><span>{item.label}</span>{section === item.id && <ChevronRight size={15} />}</button>; })}
          </div>)}
        </nav>
        <div className="np-user-sidebar-bottom">
          <div className="np-user-security"><ShieldCheck size={18} /><span><b>Account security</b><small>Signed in securely</small></span></div>
          <button className="np-user-logout" onClick={onLogout}><LogOut size={17} /> Sign out</button>
        </div>
      </aside>
      {mobileOpen && <button className="np-user-scrim" onClick={() => setMobileOpen(false)} aria-label="Close menu overlay" />}
      <section className="np-user-main">
        <header className="np-user-topbar">
          <div className="np-user-top-left">
            <button className="np-user-menu" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu size={21} /></button>
            <div><p className="np-user-breadcrumb">Member Portal <ChevronRight size={13} /> <b>{title[0]}</b></p><small>{title[1]}</small></div>
          </div>
          <div className="np-user-top-actions">
            <span className="np-user-secure-pill"><span /> Secure session</span>
            <button className="np-user-icon-btn" onClick={load} disabled={loading} aria-label="Refresh account data"><RefreshCw size={17} className={loading ? "spin" : ""} /></button>
            <span className="np-user-top-avatar">{(user.displayName || user.email || "U").slice(0, 1).toUpperCase()}</span>
          </div>
        </header>
        <div className="np-user-content">
          <div className="np-user-heading">
            <div><p className="np-user-eyebrow">NOVOPAY FINANCE</p><h1>{section === "overview" ? `Welcome, ${profile?.full_name || user.displayName || "Member"}` : title[0]}</h1><p>{title[1]}</p></div>
            <button className="np-user-refresh" onClick={load} disabled={loading}><RefreshCw size={15} className={loading ? "spin" : ""} /> Refresh</button>
          </div>

          {error && <div className="np-user-error" role="alert"><CircleHelp size={19} /><div><b>Account data unavailable</b><p>{error}</p><small>Your account details are temporarily unavailable. Please try again in a moment.</small><button onClick={load}>Try again</button></div></div>}

          {!error && section === "overview" && (
            <>
              <div className="np-user-welcome-card">
                <div><span className="np-user-welcome-icon"><Wallet size={21} /></span><p>ACCOUNT STATUS</p><h2>{profile?.status ? profile.status[0].toUpperCase() + profile.status.slice(1) : loading ? "Loading…" : "Profile pending"}</h2><small>{profile?.novopay_id ? `NovoPay ID: ${profile.novopay_id}` : "Your account details will appear after profile setup."}</small></div>
                <div className="np-user-welcome-right"><ShieldCheck size={28} /><span>Private member area</span><small>Only your authenticated account data</small></div>
              </div>
              <div className="np-user-action-shortcuts">
                <Quick icon={ArrowDownLeft} label="Recharge Fund" onClick={() => chooseSection("deposits")} />
                <Quick icon={Package} label="Basic Package" onClick={() => chooseSection("basic-package")} />
                <Quick icon={ArrowLeftRight} label="P2P Transfer" onClick={() => chooseSection("p2p")} />
                <Quick icon={ArrowUpRight} label="Withdraw" onClick={() => chooseSection("withdrawals")} />
              </div>
              <div className="np-user-package-overview">
                {(data?.packages || []).filter(p => String(p.package_type || p.name || '').toLowerCase().includes('basic')).slice(0,1).map(p => <PackageSummary key={p.id} title="Basic Package" row={p} onActivate={() => chooseSection("basic-package")} />)}
                {(data?.packages || []).filter(p => { const k=String(p.package_type || p.name || '').toLowerCase(); return k === 'fd' || k.includes('fixed deposit') || k.startsWith('fd '); }).slice(0,1).map(p => <PackageSummary key={p.id} title="FD Package" row={p} onActivate={() => chooseSection("fd-package")} />)}
                {!(data?.packages || []).some(p => String(p.package_type || p.name || '').toLowerCase().includes('basic')) && <PackageSummary title="Basic Package" row={null} onActivate={() => chooseSection("basic-package")} />}
                {!(data?.packages || []).some(p => { const k=String(p.package_type || p.name || '').toLowerCase(); return k === 'fd' || k.includes('fixed deposit') || k.startsWith('fd '); }) && <PackageSummary title="FD Package" row={null} onActivate={() => chooseSection("fd-package")} />}
              </div>
              <section className="np-user-cap-card">
                <div className="np-user-cap-head"><div><span className="np-user-eyebrow">LIVE 5X CAPPING</span><h2>Investment cap overview</h2><p>Calculated from recorded package activations and eligible posted income.</p></div><span className="np-user-status good">{profile?.status || "Active"}</span></div>
                <div className="np-user-cap-stats">
                  <CapValue label="Recorded investment" value={money(data?.capping?.recordedInvestment ?? 0)} />
                  <CapValue label="Total 5X cap" value={money(data?.capping?.totalCap ?? 0)} />
                  <CapValue label="Counted income" value={money(data?.capping?.countedIncome ?? 0)} />
                  <CapValue label="Remaining cap" value={money(data?.capping?.remainingCap ?? 0)} />
                </div>
              </section>
              <div className="np-user-stats np-user-overview-stats">
                <Stat icon={Wallet} label="Fund Wallet" value={profile ? money(profile.fund_balance) : "—"} tone="blue" />
                <Stat icon={Activity} label="Income Wallet" value={profile ? money(profile.income_balance) : "—"} tone="green" />
                <Stat icon={Layers3} label="Total Investment" value={money(data?.incomeSummary?.totalInvestment ?? data?.capping?.recordedInvestment ?? 0)} tone="violet" />
                <Stat icon={CreditCard} label="Total Credited Income" value={money(data?.incomeSummary?.totalIncome ?? data?.capping?.countedIncome ?? 0)} tone="amber" />
                <Stat icon={Package} label="Active Packages" value={String(data?.summary?.activePackages ?? 0)} tone="blue" />
              </div>
              <section className="np-user-panel np-user-referral-overview">
                <PanelTitle title="Your Referral Link" subtitle="Share your NovoPay referral link with new members." />
                <div className="np-user-referral-code">{profile?.referral_code || profile?.novopay_id || "Loading…"}</div>
                <div className="np-user-referral-link">{typeof window !== "undefined" && profile ? window.location.origin + "/register?ref=" + encodeURIComponent(profile.referral_code || profile.novopay_id) : "Your referral link will appear here."}</div>
                <div className="np-user-referral-meta"><span><small>Referral ID</small><b>{profile?.referral_code || profile?.novopay_id || "—"}</b></span><span><small>Sponsor ID</small><b>{profile?.sponsor_user_id || "—"}</b></span><span><small>Sponsor Name</small><b>{data?.sponsor?.full_name || "—"}</b></span><span><small>Primary Mobile</small><b>{profile?.mobile || profile?.phone || "—"}</b></span></div>
                <div className="np-user-referral-buttons"><button className="np-user-referral-copy" onClick={async () => { try { await navigator.clipboard.writeText(window.location.origin + "/register?ref=" + encodeURIComponent(profile?.referral_code || profile?.novopay_id || "")); setActionMessage("Referral URL copied."); } catch { setActionMessage("Select and copy the referral URL."); } }}>Copy Referral URL</button><button className="np-user-referral-copy secondary" onClick={async () => { try { await navigator.clipboard.writeText(profile?.referral_code || profile?.novopay_id || ""); setActionMessage("Referral ID copied."); } catch { setActionMessage("Select and copy the referral ID."); } }}>Copy ID</button></div>
                {actionMessage && <p role="status">{actionMessage}</p>}
              </section>
              <section className="np-user-panel np-user-level-income">
                <PanelTitle title="Level-wise Income Details" subtitle="Actual credited amounts from your income ledger. Levels with no matching credited entry show 0.00." />
                <LevelIncome title="ROI Level Income" rate="L1 5% · L2–L12 1% · L13–L15 0.5%" values={data?.levelIncome?.roi || {}} />
                <LevelIncome title="Joining / First Deposit Level Income" rate="L1 5% · L2–L15 0.25%" values={data?.levelIncome?.joining || {}} />
                <LevelIncome title="Retopup Income" rate="L1 1% · L2–L15 0.25%" values={data?.levelIncome?.retopup || {}} />
                <p className="np-user-income-note">Rates show the configured schedule, not a guaranteed return. Credits appear here only after they are recorded in the ledger.</p>
              </section>
              <div className="np-user-grid-two">
                <section className="np-user-panel"><PanelTitle title="Recent transactions" subtitle="Latest ledger activity" action="View all" onAction={() => chooseSection("transactions")} /><Records rows={(data?.recentTransactions || []).slice(0, 5)} type="transactions" loading={loading} /></section>
                <section className="np-user-panel"><PanelTitle title="Quick actions" subtitle="Account shortcuts" /><div className="np-user-quick-grid"><Quick icon={ArrowDownLeft} label="Deposit history" onClick={() => chooseSection("deposits")} /><Quick icon={ArrowUpRight} label="Withdrawal history" onClick={() => chooseSection("withdrawals")} /><Quick icon={Layers3} label="View packages" onClick={() => chooseSection("packages")} /><Quick icon={CircleHelp} label="Get support" onClick={() => chooseSection("support")} /></div><p className="np-user-safe-note">Deposits require transaction verification; withdrawals and package activations remain subject to the configured review rules.</p></section>
              </div>
              <p className="np-user-updated">{lastUpdated ? `Last refreshed ${lastUpdated.toLocaleTimeString()}` : "Your account activity updates when new records are available."}</p>
            </>
          )}

          {!error && section === "wallet" && <><div className="np-user-stats"><Stat icon={Wallet} label="Fund Wallet" value={profile ? money(profile.fund_balance) : "—"} tone="blue" /><Stat icon={Activity} label="Income Wallet" value={profile ? money(profile.income_balance) : "—"} tone="green" /></div><section className="np-user-panel"><PanelTitle title="Wallet ledger" subtitle="Verified wallet entries" /><Records rows={rows} type="transactions" loading={loading} /></section></>}
          {!error && section === "deposits" && <section className="np-user-panel">{data?.platformSettings?.depositVisible === false ? <><PanelTitle title="USDT Recharge Wallet" subtitle="Deposits are temporarily unavailable." /><p role="status">Please check back later or contact support.</p></> : <><PanelTitle title="USDT Recharge Wallet" subtitle={data?.platformSettings?.networkNotice || "Network: BNB Smart Chain (BEP-20). Send USDT only on this network."} />
            {data?.platformSettings?.qrImageUrl && <div className="np-user-deposit-qr"><img src={data.platformSettings.qrImageUrl} alt="USDT deposit QR code" style={{maxWidth:220,width:"100%",height:"auto",display:"block",margin:"0 auto 16px"}} /></div>}
            <div className="np-user-deposit-address-card"><div><b>USDT deposit address</b><p>{data?.depositAddress || "Deposit address is temporarily unavailable. Please check back later."}</p><small>Network: BSC / BEP-20 · Token: USDT</small></div><button type="button" disabled={!data?.depositAddress} onClick={async () => { try { await navigator.clipboard.writeText(data.depositAddress); setActionMessage("Deposit wallet address copied."); } catch { setActionMessage("Please select and copy the wallet address."); } }}><Copy size={15}/> Copy address</button></div>
            {data?.platformSettings?.walletLink && <p><a href={data.platformSettings.walletLink} target="_blank" rel="noreferrer">Open deposit wallet</a></p>}
            {actionMessage && <p role="status">{actionMessage}</p>}
            <PanelTitle title="Submit deposit transaction" subtitle="Submit your BSC transaction hash; funds are credited only after verification." /><form className="np-user-action-form" onSubmit={e => { e.preventDefault(); submitAction("deposit-request", { amount: depositAmount, tx_hash: txHash }); }}><label>Amount (USDT)<input type="number" min="2" step="0.00000001" required value={depositAmount} onChange={e => setDepositAmount(e.target.value)} /></label><label>BSC transaction hash<input required minLength={64} maxLength={66} value={txHash} onChange={e => setTxHash(e.target.value.trim())} placeholder="0x…" /></label><button disabled={actionBusy}>{actionBusy ? "Submitting…" : "Submit deposit request"}</button>{actionMessage && <p role="status">{actionMessage}</p>}</form><div className="np-user-table-toolbar"><PanelTitle title="Deposit history" subtitle="Your submitted requests" /><label className="np-user-search"><Search size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search records…" /></label></div><Records rows={rows} type={section} loading={loading} /></>}</section>}
          {!error && section === "withdrawals" && <section className="np-user-panel"><PanelTitle title="Request a withdrawal" subtitle="5% service fee; payout is reviewed by admin. Confirm your address carefully." /><form className="np-user-action-form" onSubmit={e => { e.preventDefault(); submitAction("withdrawal-request", { amount: withdrawAmount, payout_address: payoutAddress }); }}><label>Amount (USDT)<input type="number" min="2" step="0.00000001" required value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)} /></label><label>BSC payout address<input required pattern="0x[a-fA-F0-9]{40}" value={payoutAddress} onChange={e => setPayoutAddress(e.target.value.trim())} placeholder="0x…" /></label><button disabled={actionBusy}>{actionBusy ? "Submitting…" : "Request withdrawal"}</button>{actionMessage && <p role="status">{actionMessage}</p>}</form><div className="np-user-table-toolbar"><PanelTitle title="Withdrawal history" subtitle="Your submitted requests" /><label className="np-user-search"><Search size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search records…" /></label></div><Records rows={rows} type={section} loading={loading} /></section>}
          {!error && section === "p2p" && <section className="np-user-panel"><PanelTitle title="P2P Transfer" subtitle="Send USDT from your Fund Wallet to another active NovoPay member." /><form className="np-user-action-form" onSubmit={e => { e.preventDefault(); submitAction("p2p-transfer", { receiver_id: p2pRecipient.trim().toUpperCase(), amount: p2pAmount }); }}><label>Recipient NovoPay ID<input required minLength={10} maxLength={32} value={p2pRecipient} onChange={e => setP2pRecipient(e.target.value.toUpperCase())} placeholder="NP…" /></label><label>Amount (USDT)<input type="number" min="0.00000001" step="0.00000001" required value={p2pAmount} onChange={e => setP2pAmount(e.target.value)} /></label><button disabled={actionBusy || !profile || Number(profile.fund_balance || 0) <= 0}>{actionBusy ? "Processing…" : "Send USDT"}</button>{actionMessage && <p role="status">{actionMessage}</p>}</form><div className="np-user-table-toolbar"><PanelTitle title="P2P transfer history" subtitle="Sent and received transfers" /><label className="np-user-search"><Search size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search records…" /></label></div><Records rows={rows} type="p2p" loading={loading} /></section>}
          {!error && ["transactions", "income-all", "basic-roi", "basic-referral", "basic-level", "fd-roi", "fd-referral", "fd-level", "salary", "direct-team", "team-list", "package-requests", "reports"].includes(section) && <section className="np-user-panel np-user-table-panel"><div className="np-user-table-toolbar"><PanelTitle title={title[0]} subtitle="Records returned for your account" /><label className="np-user-search"><Search size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search records…" /></label></div><Records rows={rows} type={section} loading={loading} /></section>}
          {!error && ["packages", "basic-package", "fd-package"].includes(section) && <>
            {section === "packages" && <section className="np-user-panel"><PanelTitle title="My package activations" subtitle="Your package purchases and activation status" /><Records rows={data?.activations || []} type="activations" loading={loading} /></section>}
            {section === "basic-package" && <section className="np-basic-activation">
              <div className="np-basic-activation-head">
                <div><p className="np-user-eyebrow">PACKAGE ACTIVATION</p><h2>Basic Package Activation</h2><p>Choose a plan and review the daily income and total profit before purchase.</p></div>
                <span className="np-user-status good">USDT · BSC</span>
              </div>
              <div className="np-basic-balance">
                <div><span>Available USDT</span><strong>{profile ? money(profile.fund_balance) : "—"}</strong></div>
                <button type="button" onClick={() => chooseSection("deposits")}>Add USDT</button>
              </div>
              {loading ? <Loading /> : rows.length ? <div className="np-basic-plan-grid">{rows.map(row => {
                const price = Number(row.price || 0);
                const rate = Number(row.roi_rate || 0);
                const days = Number(row.duration_days || 0);
                const daily = price * rate / 100;
                const total = daily * days;
                const enough = Number(profile?.fund_balance || 0) >= price;
                return <article className="np-basic-plan" key={row.id}>
                  <div className="np-basic-plan-top"><div><h3>{row.name}</h3><small>{row.package_code || ""}</small></div><span className={`np-user-status ${statusClass(row.status)}`}>{row.status}</span></div>
                  <div className="np-basic-plan-amount"><span>Plan Amount</span><strong>{price.toLocaleString("en-US", {minimumFractionDigits:2,maximumFractionDigits:2})}</strong><small>USDT</small></div>
                  <div className="np-basic-plan-metrics">
                    <div><span>Daily Return</span><b>{rate}%</b></div>
                    <div><span>Daily Income</span><b>{daily.toFixed(2)} USDT</b></div>
                    <div><span>Days</span><b>{days}</b></div>
                  </div>
                  <div className="np-basic-plan-note"><b>Daily {rate}% ROI</b><p>Configured daily return for {days} days. Total Profit excludes principal.</p></div>
                  <div className="np-basic-plan-profit"><span>Total Profit</span><strong>{total.toLocaleString("en-US", {minimumFractionDigits:2,maximumFractionDigits:2})} USDT</strong></div>
                  <button className="np-basic-purchase" disabled={actionBusy || !enough} onClick={() => {
                    if (window.confirm(`Purchase ${row.name} for ${money(price)} from your available USDT balance?`)) submitAction("package-purchase", { package_id: row.id });
                  }}>{actionBusy ? "Processing…" : enough ? "Purchase with USDT" : "Insufficient USDT — Add USDT"}</button>
                </article>;
              })}</div> : <Empty title="No Basic plans available" message="No active Basic plans are configured right now." />}
              <section className="np-user-panel np-basic-history" id="np-basic-purchase-history">
                <div className="np-basic-history-title"><PanelTitle title="Purchase History" subtitle="Your actual package activation records" /><div className="np-basic-history-actions"><button type="button" onClick={load} disabled={loading}><RefreshCw size={14}/> Refresh</button><button type="button" onClick={() => window.print()}><Download size={14}/> Download PDF</button></div></div>
                <div className="np-basic-history-toolbar"><label>Show <select value={historyEntries} onChange={e => setHistoryEntries(Number(e.target.value))}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option></select> entries</label><label className="np-user-search"><Search size={15}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search records…"/></label></div>
                {loading ? <Loading/> : (data?.activations || []).length ? <><div className="np-user-table-wrap"><table className="np-user-table np-basic-history-table"><thead><tr><th>#</th><th>Date</th><th>Package</th><th>Amount (USDT)</th><th>Status</th></tr></thead><tbody>{(data.activations || []).slice(0,historyEntries).map((item,index)=><tr key={item.id || item.reference}><td>{index+1}</td><td>{date(item.activated_at || item.created_at)}</td><td>{item.package_name || "Package"}</td><td>USDT {Number(item.amount || 0).toFixed(8)}</td><td><span className={`np-user-status ${statusClass(item.status)}`}>{item.status}</span></td></tr>)}</tbody></table></div><p className="np-basic-history-count">Showing 1 to {Math.min(historyEntries,data.activations.length)} of {data.activations.length} entries</p></> : <Empty title="No purchases yet" message="Your completed package activations will appear here."/>}
              </section>
            </section>}
            {section !== "basic-package" && <section className="np-user-panel"><PanelTitle title={section === "fd-package" ? "Available FD packages" : "Available packages"} subtitle="Available plans and their current terms" />{loading ? <Loading /> : rows.length ? <div className="np-user-package-grid">{rows.map(row => { const daily = Number(row.price || 0) * Number(row.roi_rate || 0) / 100; const total = daily * Number(row.duration_days || 0); return <article className="np-user-package" key={row.id}><span className="np-user-package-icon"><Package size={21} /></span><span className={`np-user-status ${statusClass(row.status)}`}>{row.status}</span><small className="np-user-eyebrow">{String(row.package_type || "package").toUpperCase()} {row.package_code ? "· " + row.package_code : ""}</small><h3>{row.name}</h3><strong>{money(row.price)}</strong><p>{row.description || "Package terms are configured by NovoPay."}</p>{row.roi_rate != null && row.duration_days != null && <div className="np-user-package-terms"><p>Daily rate: <b>{Number(row.roi_rate).toFixed(2)}%</b></p><p>Daily amount: <b>{money(daily)}</b></p><p>Duration: <b>{Number(row.duration_days)} days</b></p><p>Total scheduled return: <b>{money(total)}</b></p>{row.package_type === "fd" && <p>Maturity estimate: <b>{money(Number(row.price) + total)}</b></p>}</div>}<button disabled={actionBusy || Number(profile?.fund_balance || 0) < Number(row.price || 0)} onClick={() => { if (window.confirm("Activate " + row.name + " for " + money(row.price) + " from your Fund Wallet?")) submitAction("package-purchase", { package_id: row.id }); }}>{actionBusy ? "Processing…" : Number(profile?.fund_balance || 0) < Number(row.price || 0) ? "Insufficient balance" : "Activate package"}</button></article>; })}</div> : <Empty title="No packages available" message="No plans are available right now. Please check back later." />}</section>}
          </>}
          {!error && section === "referrals" && <section className="np-user-referrals">
            <div className="np-user-panel np-user-referral-card">
              <PanelTitle title="Your Referral ID" subtitle="Share this link so new members can register under your account." />
              <div className="np-user-referral-code">{profile?.referral_code || profile?.novopay_id || "Loading…"}</div>
              <div className="np-user-referral-link">{typeof window !== "undefined" && profile ? window.location.origin + "/register?ref=" + encodeURIComponent(profile.referral_code || profile.novopay_id) : "Your referral link will appear here."}</div>
              <button className="np-user-referral-copy" disabled={!profile} onClick={async () => { try { await navigator.clipboard.writeText(window.location.origin + "/register?ref=" + encodeURIComponent(profile.referral_code || profile.novopay_id)); setActionMessage("Referral link copied."); } catch { setActionMessage("Copy was unavailable. Select and copy the referral link above."); } }}><Copy size={16} /> Copy referral link</button>
              {actionMessage && <p className="np-user-referral-message" role="status">{actionMessage}</p>}
            </div>
            <div className="np-user-stats">
              <Stat icon={Users} label="Direct Members" value={String(data?.referralSummary?.direct_members ?? 0)} tone="blue" />
              <Stat icon={Activity} label="Referral Income" value={money(data?.referralSummary?.referral_income ?? 0)} tone="green" />
            </div>
            <section className="np-user-panel"><PanelTitle title="Referral reward history" subtitle="Direct rewards credited after eligible package activation" /><Records rows={rows} type="referrals" loading={loading} /></section>
            <section className="np-user-panel"><PanelTitle title="Your direct members" subtitle="Members registered with your referral ID" />{loading ? <Loading /> : data?.members?.length ? <div className="np-user-table-wrap"><table className="np-user-table"><thead><tr><th>NovoPay ID</th><th>Member</th><th>Status</th><th>Joined</th></tr></thead><tbody>{data.members.map(member => <tr key={member.novopay_id}><td><span className="np-user-ref">{member.novopay_id}</span></td><td>{member.full_name || "Member"}</td><td><span className={`np-user-status ${statusClass(member.status)}`}>{member.status}</span></td><td>{date(member.created_at)}</td></tr>)}</tbody></table></div> : <Empty title="No direct members yet" message="Share your referral link to invite new members." />}</section>
          </section>}
          {!error && section === "transfer-income-fund" && <section className="np-user-panel"><PanelTitle title="Transfer Income To Fund" subtitle="Move funds between your own NovoPay wallets. This is recorded in your ledger." /><div className="np-user-stats"><Stat icon={Activity} label="Available Income" value={profile ? money(profile.income_balance) : "—"} tone="green" /><Stat icon={Wallet} label="Fund Wallet" value={profile ? money(profile.fund_balance) : "—"} tone="blue" /></div><form className="np-user-action-form" onSubmit={e => { e.preventDefault(); submitAction("income-to-fund", { amount: withdrawAmount }); }}><label>Amount (USDT)<input type="number" min="0.00000001" step="0.00000001" required value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)} /></label><button disabled={actionBusy || !profile || Number(profile.income_balance || 0) <= 0}>{actionBusy ? "Processing…" : "Transfer to Fund Wallet"}</button>{actionMessage && <p role="status">{actionMessage}</p>}</form></section>}
          {!error && section === "brochure" && <section className="np-user-panel"><PanelTitle title="Download Brochure" subtitle="Official NovoPay brochure configured by the administrator." />{data?.brochureUrl ? <a className="np-user-primary-link" href={data.brochureUrl} target="_blank" rel="noreferrer"><Download size={17}/> Open / Download Brochure</a> : <Empty title="Brochure not configured" message="The brochure is temporarily unavailable. Please check back later." />}</section>}
          {!error && section === "profile" && <section className="np-user-panel"><PanelTitle title="Profile information" subtitle="Verified details from your NovoPay account" />{profile ? <div className="np-user-profile-grid"><ProfileField label="Full name" value={profile.full_name} /><ProfileField label="NovoPay ID" value={profile.novopay_id} /><ProfileField label="Email address" value={profile.email} /><ProfileField label="Account status" value={profile.status} /><ProfileField label="Member since" value={date(profile.created_at)} /></div> : <Empty title="Profile not ready" message="Your verified profile will appear here once the account record has been created." />}</section>}
          {!error && section === "support" && <section className="np-user-panel"><PanelTitle title="Support" subtitle="Your support history" /><Records rows={rows} type="support" loading={loading} /><div className="np-user-support-note"><CircleHelp size={19} /><div><b>Need help?</b><p>You can contact our support team if you need help with your account.</p></div></div></section>}
        </div>
        <footer className="np-user-footer"><span>© {new Date().getFullYear()} NovoPay Finance</span><span>Developed by <strong>AISOFT Studio</strong></span></footer>
      </section>
      </main>
  );
}

function PackageSummary({ title, row, onActivate }) {
  return <article className="np-user-package-summary"><div><span className="np-user-eyebrow">{title}</span><h3>{row?.name || (title === "Basic Package" ? "Active Daily ROI Plan" : "Fixed Deposit Lock Plan")}</h3><strong>{money(row?.price ?? 0)}</strong><p>{row?.description || (row ? "Package details" : "Details will appear soon")}</p></div><button onClick={onActivate}>Activate</button></article>;
}
function CapValue({ label, value }) { return <div className="np-user-cap-value"><small>{label}</small><b>{value}</b></div>; }
function LevelIncome({ title, rate, values }) {
  const total = Array.from({length:15},(_,i)=>Number(values?.[i+1] || 0)).reduce((a,b)=>a+b,0);
  return <div className="np-user-income-group"><div className="np-user-income-group-head"><div><h3>{title}</h3><small>{rate}</small></div><div><small>Total credited</small><b>{money(total)}</b></div></div><div className="np-user-level-grid">{Array.from({length:15},(_,i)=>i+1).map(level => <div className="np-user-level-tile" key={level}><span>Level {level}</span><b>{money(values?.[level] || 0)}</b></div>)}</div></div>;
}
function Stat({ icon: Icon, label, value, tone }) {
  return <article className="np-user-stat"><span className={`np-user-stat-icon ${tone}`}><Icon size={20} /></span><div><p>{label}</p><strong>{value}</strong><small>Verified account data</small></div></article>;
}
function PanelTitle({ title, subtitle, action, onAction }) {
  return <div className="np-user-panel-title"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action && <button onClick={onAction}>{action} <ChevronRight size={15} /></button>}</div>;
}
function Quick({ icon: Icon, label, onClick }) {
  return <button className="np-user-quick" onClick={onClick}><span><Icon size={18} /></span><b>{label}</b><ChevronRight size={15} /></button>;
}
function ProfileField({ label, value }) {
  return <div className="np-user-profile-field"><span>{label}</span><b>{value || "—"}</b></div>;
}
function Loading() { return <div className="np-user-empty"><RefreshCw className="spin" size={21} /><p>Loading verified records…</p></div>; }
function Empty({ title, message }) {
  return <div className="np-user-empty"><FileText size={27} /><b>{title}</b><p>{message}</p></div>;
}
function Records({ rows, type, loading }) {
  if (loading) return <Loading />;
  if (!rows?.length) return <Empty title="No records yet" message="There are no verified records to display for this section." />;

  const incomeSections = ["income-all", "basic-roi", "basic-referral", "basic-level", "fd-roi", "fd-referral", "fd-level", "salary"];
  let columns;

  if (["direct-team", "team-list"].includes(type)) {
    columns = [["novopay_id", "NovoPay ID"], ["full_name", "Member"], ["email", "Email"], ["status", "Status"], ["level", "Level"], ["created_at", "Joined"]];
  } else if (type === "reports") {
    columns = [["name", "Report"], ["value", "Value"]];
  } else if (type === "referrals") {
    columns = [["created_at", "Date & Time"], ["referred_user_id", "Source Member ID"], ["reference", "Income Ref"], ["basis_amount", "Package Amount"], ["rate", "Rate"], ["amount", "Income (USDT)"], ["status", "Status"]];
  } else if (type === "activations") {
    columns = [["activated_at", "Date & Time"], ["reference", "Activation Ref"], ["package_name", "Package"], ["amount", "Amount (USDT)"], ["status", "Status"]];
  } else if (type === "deposits") {
    columns = [["created_at", "Date & Time"], ["reference", "Deposit Ref"], ["tx_hash", "BSC TX Hash"], ["amount", "Amount (USDT)"], ["status", "Status"]];
  } else if (type === "withdrawals") {
    columns = [["created_at", "Date & Time"], ["reference", "Withdrawal Ref"], ["amount", "Requested (USDT)"], ["fee", "Fee"], ["net_amount", "Net (USDT)"], ["status", "Status"]];
  } else if (type === "support") {
    columns = [["created_at", "Date & Time"], ["reference", "Ticket"], ["subject", "Subject"], ["status", "Status"]];
  } else if (type === "p2p") {
    columns = [["created_at", "Date & Time"], ["reference", "Transfer Ref"], ["sender_user_id", "Sender ID"], ["receiver_user_id", "Recipient ID"], ["amount", "Amount (USDT)"], ["status", "Status"]];
  } else if (incomeSections.includes(type)) {
    columns = [["created_at", "Date & Time"], ["source_member_id", "Source Member ID"], ["type", "Income Type"], ["description", "Income Description"], ["amount", "Amount (USDT)"], ["status", "Status"]];
  } else {
    columns = [["created_at", "Date & Time"], ["reference", "Ledger Ref"], ["type", "Transaction Type"], ["description", "Description"], ["amount", "Amount (USDT)"], ["status", "Status"]];
  }

  function renderCell(row, key) {
    if (["amount", "net_amount", "fee", "basis_amount"].includes(key) || (key === "value" && /USDT/i.test(String(row.name || "")))) {
      return money(row[key]);
    }
    if (key === "rate") {
      return row[key] == null ? "—" : `${(Number(row[key]) * (Number(row[key]) <= 1 ? 100 : 1)).toFixed(2)}%`;
    }
    if (key === "created_at" || key === "activated_at") return date(row[key]);
    if (key === "status") return <span className={`np-user-status ${statusClass(row[key])}`}>{row[key] || "unknown"}</span>;
    return <span className={["reference", "source_member_id", "novopay_id"].includes(key) ? "np-user-ref" : ""}>{row[key] ?? "—"}</span>;
  }

  return (
    <div className="np-user-table-wrap">
      <table className="np-user-table">
        <thead>
          <tr>{columns.map(([key, label]) => <th key={key}>{label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id || row.reference || i}>
              {columns.map(([key]) => <td key={key}>{renderCell(row, key)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
