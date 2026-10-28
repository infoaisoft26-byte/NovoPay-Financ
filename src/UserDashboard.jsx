import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Bell, ChevronRight,
  CircleHelp, Clock3, CreditCard, Download, FileText, Home, Layers3, LogOut,
  Menu, Package, RefreshCw, Search, ShieldCheck, UserRound, Wallet, X
} from "lucide-react";
import "./user-dashboard.css";

const NAV = [
  { id: "overview", label: "Overview", icon: Home },
  { id: "wallet", label: "My Wallet", icon: Wallet },
  { id: "deposits", label: "Deposits", icon: ArrowDownLeft },
  { id: "withdrawals", label: "Withdrawals", icon: ArrowUpRight },
  { id: "transactions", label: "Transactions", icon: Activity },
  { id: "packages", label: "Packages", icon: Layers3 },
  { id: "p2p", label: "P2P Transfer", icon: ArrowLeftRight },
  { id: "support", label: "Help & Support", icon: CircleHelp },
  { id: "profile", label: "My Profile", icon: UserRound },
];

const TITLES = {
  overview: ["Dashboard", "Your account at a glance."],
  wallet: ["My Wallet", "Review your available balances."],
  deposits: ["Deposits", "Track your deposit requests."],
  withdrawals: ["Withdrawals", "Review withdrawal request history."],
  transactions: ["Transactions", "Your account ledger, newest first."],
  packages: ["Packages", "Available packages configured by NovoPay."],
  p2p: ["P2P Transfer", "Peer-to-peer transfers are not enabled yet."],
  support: ["Help & Support", "Get help with your account."],
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [depositAmount, setDepositAmount] = useState("2");
  const [txHash, setTxHash] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [payoutAddress, setPayoutAddress] = useState("");

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
          <span className="np-user-brand-icon"><Wallet size={22} /></span>
          <span className="np-user-brand">NovoPay <b>Finance</b><small>MEMBER PORTAL</small></span>
          <button className="np-user-close" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X size={19} /></button>
        </div>
        <div className="np-user-member">
          <span className="np-user-avatar">{(user.displayName || user.email || "U").slice(0, 1).toUpperCase()}</span>
          <span><b>{profile?.full_name || user.displayName || "Member"}</b><small>{profile?.novopay_id || "Account profile"}</small></span>
        </div>
        <p className="np-user-nav-label">ACCOUNT MENU</p>
        <nav className="np-user-nav">
          {NAV.map(item => {
            const Icon = item.icon;
            return <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => chooseSection(item.id)}><Icon size={17} /><span>{item.label}</span>{section === item.id && <ChevronRight size={15} />}</button>;
          })}
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

          {error && <div className="np-user-error" role="alert"><CircleHelp size={19} /><div><b>Account data unavailable</b><p>{error}</p><small>Financial values are hidden until the secure NovoPay backend returns verified records.</small><button onClick={load}>Try again</button></div></div>}

          {!error && section === "overview" && (
            <>
              <div className="np-user-welcome-card">
                <div><span className="np-user-welcome-icon"><Wallet size={21} /></span><p>ACCOUNT STATUS</p><h2>{profile?.status ? profile.status[0].toUpperCase() + profile.status.slice(1) : loading ? "Loading…" : "Profile pending"}</h2><small>{profile?.novopay_id ? `NovoPay ID: ${profile.novopay_id}` : "Your account details will appear after profile setup."}</small></div>
                <div className="np-user-welcome-right"><ShieldCheck size={28} /><span>Private member area</span><small>Only your authenticated account data</small></div>
              </div>
              <div className="np-user-stats">
                <Stat icon={Wallet} label="Fund Wallet" value={profile ? money(profile.fund_balance) : "—"} tone="blue" />
                <Stat icon={Activity} label="Income Wallet" value={profile ? money(profile.income_balance) : "—"} tone="green" />
                <Stat icon={ArrowDownLeft} label="Pending Deposits" value={data?.summary ? String(data.summary.pendingDeposits) : "—"} tone="violet" />
                <Stat icon={Clock3} label="Pending Withdrawals" value={data?.summary ? String(data.summary.pendingWithdrawals) : "—"} tone="amber" />
                <Stat icon={Package} label="Active Packages" value={data?.summary ? String(data.summary.activePackages ?? 0) : "—"} tone="green" />
              </div>
              <div className="np-user-grid-two">
                <section className="np-user-panel"><PanelTitle title="Recent transactions" subtitle="Latest ledger activity" action="View all" onAction={() => chooseSection("transactions")} /><Records rows={(data?.recentTransactions || []).slice(0, 5)} type="transactions" loading={loading} /></section>
                <section className="np-user-panel"><PanelTitle title="Quick actions" subtitle="Account shortcuts" /><div className="np-user-quick-grid"><Quick icon={ArrowDownLeft} label="Deposit history" onClick={() => chooseSection("deposits")} /><Quick icon={ArrowUpRight} label="Withdrawal history" onClick={() => chooseSection("withdrawals")} /><Quick icon={Layers3} label="View packages" onClick={() => chooseSection("packages")} /><Quick icon={CircleHelp} label="Get support" onClick={() => chooseSection("support")} /></div><p className="np-user-safe-note">Requests that move funds remain disabled until the secure backend and transaction controls are configured.</p></section>
              </div>
              <p className="np-user-updated">{lastUpdated ? `Last refreshed ${lastUpdated.toLocaleTimeString()}` : "Live records load from the secure NovoPay backend."}</p>
            </>
          )}

          {!error && section === "wallet" && <><div className="np-user-stats"><Stat icon={Wallet} label="Fund Wallet" value={profile ? money(profile.fund_balance) : "—"} tone="blue" /><Stat icon={Activity} label="Income Wallet" value={profile ? money(profile.income_balance) : "—"} tone="green" /></div><section className="np-user-panel"><PanelTitle title="Wallet ledger" subtitle="Verified wallet entries" /><Records rows={rows} type="transactions" loading={loading} /></section></>}
          {!error && section === "deposits" && <section className="np-user-panel"><PanelTitle title="Request a USDT deposit" subtitle="Submit your BSC transaction hash; credit happens only after verification." /><form className="np-user-action-form" onSubmit={e => { e.preventDefault(); submitAction("deposit-request", { amount: depositAmount, tx_hash: txHash }); }}><label>Amount (USDT)<input type="number" min="0.01" step="0.00000001" required value={depositAmount} onChange={e => setDepositAmount(e.target.value)} /></label><label>BSC transaction hash<input required minLength={64} maxLength={66} value={txHash} onChange={e => setTxHash(e.target.value.trim())} placeholder="0x…" /></label><button disabled={actionBusy}>{actionBusy ? "Submitting…" : "Submit deposit request"}</button>{actionMessage && <p role="status">{actionMessage}</p>}</form><div className="np-user-table-toolbar"><PanelTitle title="Deposit history" subtitle="Your submitted requests" /><label className="np-user-search"><Search size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search records…" /></label></div><Records rows={rows} type={section} loading={loading} /></section>}
          {!error && section === "withdrawals" && <section className="np-user-panel"><PanelTitle title="Request a withdrawal" subtitle="5% service fee; payout is reviewed by admin. Confirm your address carefully." /><form className="np-user-action-form" onSubmit={e => { e.preventDefault(); submitAction("withdrawal-request", { amount: withdrawAmount, payout_address: payoutAddress }); }}><label>Amount (USDT)<input type="number" min="0.01" step="0.00000001" required value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)} /></label><label>BSC payout address<input required pattern="0x[a-fA-F0-9]{40}" value={payoutAddress} onChange={e => setPayoutAddress(e.target.value.trim())} placeholder="0x…" /></label><button disabled={actionBusy}>{actionBusy ? "Submitting…" : "Request withdrawal"}</button>{actionMessage && <p role="status">{actionMessage}</p>}</form><div className="np-user-table-toolbar"><PanelTitle title="Withdrawal history" subtitle="Your submitted requests" /><label className="np-user-search"><Search size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search records…" /></label></div><Records rows={rows} type={section} loading={loading} /></section>}
          {!error && ["transactions", "p2p", "support"].includes(section) && <section className="np-user-panel np-user-table-panel"><div className="np-user-table-toolbar"><PanelTitle title={title[0]} subtitle="Records returned for your account" /><label className="np-user-search"><Search size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search records…" /></label></div><Records rows={rows} type={section} loading={loading} /></section>}
          {!error && section === "packages" && <><section className="np-user-panel"><PanelTitle title="My package activations" subtitle="Your package purchases and activation status" /><Records rows={data?.activations || []} type="activations" loading={loading} /></section><section className="np-user-panel"><PanelTitle title="Available packages" subtitle="NovoPay package catalog; returns are estimates, not guarantees" />{loading ? <Loading /> : rows.length ? <div className="np-user-package-grid">{rows.map(row => { const daily = Number(row.price || 0) * Number(row.roi_rate || 0) / 100; const total = daily * Number(row.duration_days || 0); return <article className="np-user-package" key={row.id}><span className="np-user-package-icon"><Package size={21} /></span><span className={`np-user-status ${statusClass(row.status)}`}>{row.status}</span><small className="np-user-eyebrow">{String(row.package_type || "package").toUpperCase()} {row.package_code ? "· " + row.package_code : ""}</small><h3>{row.name}</h3><strong>{money(row.price)}</strong><p>{row.description || "Package terms are configured by NovoPay."}</p>{row.roi_rate != null && row.duration_days != null && <div className="np-user-package-terms"><p>Daily rate: <b>{Number(row.roi_rate).toFixed(2)}%</b></p><p>Daily amount: <b>{money(daily)}</b></p><p>Duration: <b>{Number(row.duration_days)} days</b></p><p>Total scheduled return: <b>{money(total)}</b></p>{row.package_type === "fd" && <p>Maturity estimate: <b>{money(Number(row.price) + total)}</b></p>}</div>}<button disabled={actionBusy || Number(profile?.fund_balance || 0) < Number(row.price || 0)} onClick={() => { if (window.confirm("Activate " + row.name + " for " + money(row.price) + " from your Fund Wallet?")) submitAction("package-purchase", { package_id: row.id }); }}>{actionBusy ? "Processing…" : Number(profile?.fund_balance || 0) < Number(row.price || 0) ? "Insufficient balance" : "Activate package"}</button></article>; })}</div> : <Empty title="No packages available" message="Apply the NovoPay package migration to add the Basic and FD catalog." />}</section></>}
          {!error && section === "profile" && <section className="np-user-panel"><PanelTitle title="Profile information" subtitle="Verified details from your NovoPay account" />{profile ? <div className="np-user-profile-grid"><ProfileField label="Full name" value={profile.full_name} /><ProfileField label="NovoPay ID" value={profile.novopay_id} /><ProfileField label="Email address" value={profile.email} /><ProfileField label="Account status" value={profile.status} /><ProfileField label="Member since" value={date(profile.created_at)} /></div> : <Empty title="Profile not ready" message="Your verified profile will appear here once the account record has been created." />}</section>}
          {!error && section === "support" && <section className="np-user-panel"><PanelTitle title="Support" subtitle="Your support history" /><Records rows={rows} type="support" loading={loading} /><div className="np-user-support-note"><CircleHelp size={19} /><div><b>Need help?</b><p>Support ticket creation will be enabled when the secure account API is configured.</p></div></div></section>}
        </div>
      </section>
    </main>
  );
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
  const columns = type === "activations"
    ? [["reference", "Reference"], ["package_name", "Package"], ["amount", "Amount"], ["status", "Status"], ["activated_at", "Activated"]]
    : type === "deposits"
    ? [["reference", "Reference"], ["amount", "Amount"], ["status", "Status"], ["created_at", "Created"]]
    : type === "withdrawals"
      ? [["reference", "Reference"], ["amount", "Amount"], ["net_amount", "Net amount"], ["status", "Status"], ["created_at", "Created"]]
      : type === "support"
        ? [["reference", "Ticket"], ["subject", "Subject"], ["status", "Status"], ["created_at", "Created"]]
        : type === "p2p"
          ? [["reference", "Reference"], ["receiver_user_id", "Recipient"], ["amount", "Amount"], ["status", "Status"], ["created_at", "Created"]]
          : [["reference", "Reference"], ["type", "Type"], ["amount", "Amount"], ["status", "Status"], ["created_at", "Date"]];
  return <div className="np-user-table-wrap"><table className="np-user-table"><thead><tr>{columns.map(([key, label]) => <th key={key}>{label}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={row.id || row.reference || i}>{columns.map(([key]) => <td key={key}>{key === "amount" || key === "net_amount" ? money(row[key]) : (key === "created_at" || key === "activated_at") ? date(row[key]) : key === "status" ? <span className={`np-user-status ${statusClass(row[key])}`}>{row[key] || "unknown"}</span> : <span className={key === "reference" ? "np-user-ref" : ""}>{row[key] ?? "—"}</span>}</td>)}</tr>)}</tbody></table></div>;
}
