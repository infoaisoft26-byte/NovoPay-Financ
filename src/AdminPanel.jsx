import { useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard, Users, ArrowDownToLine, ArrowUpFromLine, ReceiptText,
  Package, ChartNoAxesCombined, Settings, Search, Bell, Menu, X, ShieldCheck,
  CircleHelp, RefreshCw, ChevronRight, WalletCards, Database, LogOut,
  CircleUserRound, FileText, Activity, UserCheck, LifeBuoy, Trophy,
  ArrowLeftRight, ClipboardList, Megaphone, ScrollText, MessageSquare,
  PackageCheck, ShieldAlert, Network, Gauge, Download
} from "lucide-react";

const navGroups = [
  { title: "WORKSPACE", items: [
    { label: "Overview", icon: LayoutDashboard },
    { label: "Users", icon: Users },
    { label: "KYC Approvals", icon: UserCheck },
    { label: "Deposits", icon: ArrowDownToLine },
    { label: "Withdrawals", icon: ArrowUpFromLine },
    { label: "Transactions", icon: ReceiptText },
    { label: "P2P Transfers", icon: ArrowLeftRight },
  ]},
  { title: "FINANCE & PACKAGES", items: [
    { label: "Packages", icon: Package },
    { label: "Package Activations", icon: PackageCheck },
    { label: "Reports", icon: ChartNoAxesCombined },
    { label: "Income Leaderboard", icon: Trophy },
  ]},
  { title: "OPERATIONS & SECURITY", items: [
    { label: "Support Tickets", icon: LifeBuoy },
    { label: "Website Feedback", icon: MessageSquare },
    { label: "Survey Responses", icon: ClipboardList },
    { label: "Audit Logs", icon: ScrollText },
    { label: "Offer Posters", icon: Megaphone },
    { label: "Settings", icon: Settings },
  ]},
];

const descriptions = {
  Overview: "Monitor NovoPay platform health and operational activity.",
  Users: "Registered accounts, account status, referral links and wallet summaries.",
  "KYC Approvals": "Review identity verification submissions and decisions.",
  Deposits: "Review incoming deposit requests and blockchain/payment references.",
  Withdrawals: "Review payout requests, deductions, approvals and refund status.",
  Transactions: "Search the financial ledger and inspect transaction references.",
  "P2P Transfers": "Review internal transfers and sender/receiver accounting.",
  Packages: "Manage available packages, prices and eligibility rules.",
  "Package Activations": "Review package purchases and activation history.",
  Reports: "Review platform, transaction and finance summaries.",
  "Income Leaderboard": "Rank eligible accounts using verified NovoPay records.",
  "Support Tickets": "Manage customer questions and support status.",
  "Website Feedback": "Review submitted product feedback.",
  "Survey Responses": "Review user survey submissions.",
  "Audit Logs": "Inspect administrative actions and security events.",
  "Offer Posters": "Manage published promotional artwork.",
  Settings: "Manage platform configuration and access controls.",
};

const emptyTitles = {
  Users: "No user records connected",
  "KYC Approvals": "No KYC submissions connected",
  Deposits: "No deposit records connected",
  Withdrawals: "No withdrawal records connected",
  Transactions: "No ledger records connected",
  "P2P Transfers": "No transfer records connected",
  Packages: "Package configuration is not connected",
  "Package Activations": "No activation records connected",
  Reports: "Reports data source is not connected",
  "Income Leaderboard": "No verified ranking data connected",
  "Support Tickets": "No support tickets connected",
  "Website Feedback": "No feedback records connected",
  "Survey Responses": "No survey responses connected",
  "Audit Logs": "No audit event source connected",
  "Offer Posters": "Poster storage is not connected",
  Settings: "Settings service is not connected",
};

const sectionSlugs = {
  Overview: "overview", Users: "users", "KYC Approvals": "kyc", Deposits: "deposits",
  Withdrawals: "withdrawals", Transactions: "transactions", "P2P Transfers": "p2p",
  Packages: "packages", "Package Activations": "activations", "Support Tickets": "support",
  "Website Feedback": "feedback", "Survey Responses": "surveys", "Audit Logs": "audit", "Offer Posters": "posters",
  Reports: "reports", "Income Leaderboard": "leaderboard", Settings: "settings",
};

function recordCells(section, row) {
  const amount = (value, currency = "USDT") => value == null ? "—" : String(value) + " " + currency;
  switch (section) {
    case "Users": return [String(row.novopay_id || row.id) + " · " + (row.full_name || "") + " · " + (row.email || ""), row.status, "Fund: " + amount(row.fund_balance) + " / Income: " + amount(row.income_balance)];
    case "KYC Approvals": return [row.user_id, row.status, (row.document_type || "Document") + " · " + (row.reviewed_at || "Not reviewed")];
    case "Deposits": return [row.reference, row.status, amount(row.amount, row.currency) + " · " + (row.tx_hash || "No TX hash")];
    case "Withdrawals": return [row.reference, row.status, amount(row.amount, row.currency) + " · fee " + row.fee + " · net " + row.net_amount];
    case "Transactions": return [row.reference, row.type + " · " + row.status, row.user_id + " · " + amount(row.amount, row.currency)];
    case "P2P Transfers": return [row.reference, row.status, row.sender_user_id + " → " + row.receiver_user_id + " · " + amount(row.amount, row.currency)];
    case "Packages": return [row.name, row.status, amount(row.price, row.currency) + " · " + (row.description || "")];
    case "Package Activations": return [row.reference, row.status, row.user_id + " · " + (row.package_id || "No package") + " · " + amount(row.amount, row.currency)];
    case "Support Tickets": return [row.reference, row.status, row.user_id + " · " + row.subject];
    case "Website Feedback": return [row.id, row.status, (row.user_id || "Anonymous") + " · " + row.message];
    case "Survey Responses": return [row.id, row.survey_key, JSON.stringify(row.response)];
    case "Audit Logs": return [row.id, row.actor_uid, row.action + " · " + (row.entity_type || "") + " · " + (row.entity_id || "")];
    case "Offer Posters": return [row.title, row.status, row.image_url];
    case "Reports": return [row.name, row.status, row.details];
    case "Income Leaderboard": return [row.novopay_id + " · " + (row.full_name || ""), String(row.total_investment || "0") + " USDT", "Sponsor: " + (row.sponsor_user_id || "—") + " · Direct: " + row.direct_members];
    case "Settings": return [row.name, row.status, row.details];
    default: return [row.id || "—", row.status || "—", "—"];
  }
}

const tableColumns = {
  Users: ["USER / NOVOPAY ID", "ACCOUNT STATUS", "WALLET SUMMARY"],
  "KYC Approvals": ["SUBMISSION", "REVIEW STATUS", "DECISION"],
  Deposits: ["DEPOSIT REF", "STATUS", "AMOUNT / TX HASH"],
  Withdrawals: ["WITHDRAWAL REF", "STATUS", "AMOUNT / FEE"],
  Transactions: ["LEDGER REF", "TYPE / STATUS", "ACCOUNT / AMOUNT"],
  "P2P Transfers": ["TRANSFER REF", "STATUS", "SENDER / RECEIVER"],
  Packages: ["PACKAGE", "STATUS", "PRICE / RULES"],
  "Package Activations": ["ACTIVATION REF", "STATUS", "USER / PACKAGE"],
  Reports: ["REPORT", "DATA STATUS", "LAST UPDATED"],
  "Income Leaderboard": ["RANK / USER ID", "VERIFIED TOTAL", "LEVEL DETAILS"],
  "Support Tickets": ["TICKET REF", "STATUS", "USER / SUBJECT"],
  "Website Feedback": ["FEEDBACK REF", "STATUS", "SUBMISSION"],
  "Survey Responses": ["RESPONSE REF", "STATUS", "SUBMISSION"],
  "Audit Logs": ["EVENT REF", "ACTOR", "ACTION / TIME"],
  "Offer Posters": ["POSTER", "PUBLISH STATUS", "UPDATED"],
  Settings: ["SETTING", "CURRENT STATUS", "DETAILS"],
};

export default function AdminPanel({ user, onLogout }) {
  const [section, setSection] = useState("Overview");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [lastRefresh, setLastRefresh] = useState(null);
  const [notice, setNotice] = useState("");
  const [rows, setRows] = useState([]);
  const [overviewCounts, setOverviewCounts] = useState(null);
  const [recentActivity, setRecentActivity] = useState([]);
  const [dataError, setDataError] = useState("");
  const [loadingData, setLoadingData] = useState(false);
  const [settingUpAdmin, setSettingUpAdmin] = useState(false);
  const [actionBusy, setActionBusy] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const sections = useMemo(() => navGroups.flatMap(g => g.items), []);
  const active = sections.find(x => x.label === section) || { icon: LayoutDashboard };
  const ActiveIcon = active.icon;

  function selectSection(label) {
    setSection(label);
    setMobileOpen(false);
    setQuery("");
    setNotice("");
  }

  function requestRefresh() {
    setLastRefresh(new Date().toLocaleTimeString());
    setReloadKey(value => value + 1);
  }

  useEffect(() => {
    const normalizedSection = String(section || "").trim();
    // Keep Settings explicitly mapped even if the selected label contains whitespace from the UI.
    const slug = sectionSlugs[normalizedSection] || sectionSlugs[normalizedSection.replace(/\\s+/g, " ")] || (normalizedSection.toLowerCase() === "settings" ? "settings" : undefined);
    if (!slug) {
      setRows([]);
      setOverviewCounts(null);
      setDataError("This module needs its own verified NovoPay data query.");
      setLoadingData(false);
      return undefined;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoadingData(true);
      setDataError("");
      try {
        const token = await user.getIdToken();
        const params = new URLSearchParams({ section: slug });
        if (section !== "Overview" && query.trim()) params.set("q", query.trim());
        const response = await fetch("/api/admin?" + params.toString(), { headers: { Authorization: "Bearer " + token }, cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (response.status === 403) throw new Error("Admin server permission is not set. Set the Firebase custom claim admin=true for the NovoPay admin account.");
          if (response.status === 503) throw new Error("NovoPay backend is not configured yet. Set DATABASE_URL and FIREBASE_SERVICE_ACCOUNT_JSON on the NovoPay Vercel project.");
          throw new Error(payload.error || "Admin data could not be loaded.");
        }
        if (cancelled) return;
        if (section === "Overview") {
          setOverviewCounts(payload.counts || null);
          setRecentActivity(Array.isArray(payload.recentActivity) ? payload.recentActivity : []);
        } else setRows(Array.isArray(payload.rows) ? payload.rows : []);
      } catch (error) {
        if (!cancelled) { setRows([]); setOverviewCounts(null); setRecentActivity([]); setDataError(error.message || "Admin data could not be loaded."); }
      } finally { if (!cancelled) setLoadingData(false); }
    }, query ? 250 : 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [section, query, reloadKey, user]);

  useEffect(() => {
    const interval = window.setInterval(() => setReloadKey(value => value + 1), 15000);
    return () => window.clearInterval(interval);
  }, []);

  async function runAdminAction(action, row, label) {
    const key = action + ":" + (row.reference || row.id || row.novopay_id || "");
    if (actionBusy) return;
    const confirmText = label === "Approve deposit" ? "Approve this deposit and credit the user's NovoPay fund wallet?" :
      label === "Reject withdrawal" ? "Reject this withdrawal and refund its amount to the user's fund wallet?" :
      label === "Suspend user" ? "Suspend this user's NovoPay account?" :
      label === "Activate package" ? "Make this package available to users?" :
      label === "Pause package" ? "Pause this package for new activations?" : label + "?";
    if (!window.confirm(confirmText)) return;
    setActionBusy(key); setDataError(""); setNotice("");
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/admin-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ action, reference: row.reference, id: row.id || row.novopay_id, status: action.endsWith("-status") ? (label.toLowerCase().includes("approve") ? "approved" : label.toLowerCase().includes("reject") ? "rejected" : label.toLowerCase().includes("suspend") ? "suspended" : label.toLowerCase().includes("activate") ? "active" : label.toLowerCase().includes("pause") ? "paused" : label.toLowerCase().includes("close") ? "closed" : label.toLowerCase().includes("resolve") ? "resolved" : "active") : undefined })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Admin action could not be completed.");
      setNotice(label + " completed successfully.");
      setReloadKey(value => value + 1);
    } catch (error) {
      setDataError(error.message || "Admin action could not be completed.");
    } finally { setActionBusy(""); }
  }

  function rowActions(row) {
    const actions = [];
    if (section === "Deposits" && row.status === "pending") {
      actions.push(["deposit-approve", "Approve deposit", "success"], ["deposit-reject", "Reject deposit", "danger"]);
    } else if (section === "Withdrawals" && row.status === "pending") {
      actions.push(["withdrawal-approve", "Approve withdrawal", "success"], ["withdrawal-reject", "Reject withdrawal", "danger"]);
    } else if (section === "KYC Approvals" && row.status === "pending") {
      actions.push(["kyc-status", "Approve KYC", "success"], ["kyc-status", "Reject KYC", "danger"]);
    } else if (section === "Users") {
      actions.push(["user-status", row.status === "suspended" ? "Activate user" : "Suspend user", row.status === "suspended" ? "success" : "danger"]);
    } else if (section === "Support Tickets" && !["closed", "resolved"].includes(row.status)) {
      actions.push(["support-status", "Resolve ticket", "success"], ["support-status", "Close ticket", "danger"]);
    } else if (section === "Packages") {
      actions.push(["package-status", row.status === "active" ? "Pause package" : "Activate package", row.status === "active" ? "danger" : "success"]);
    }
    return actions;
  }

  const quickLinks = [
    { label: "Manage users", desc: "Accounts and wallet summaries", icon: Users, target: "Users" },
    { label: "Review deposits", desc: "Incoming fund requests", icon: ArrowDownToLine, target: "Deposits" },
    { label: "Review withdrawals", desc: "Payouts, fees and status", icon: ArrowUpFromLine, target: "Withdrawals" },
    { label: "Open reports", desc: "Verified activity summaries", icon: FileText, target: "Reports" },
    { label: "Package activations", desc: "Purchases and activation status", icon: PackageCheck, target: "Package Activations" },
    { label: "Security audit", desc: "Admin actions and events", icon: ShieldAlert, target: "Audit Logs" },
  ];

  return (
    <div className="np-admin-shell">
      {mobileOpen && <button className="np-admin-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
      <aside className={`np-admin-sidebar ${mobileOpen ? "is-open" : ""}`}>
        <div className="np-admin-brand-row">
          <span className="np-admin-brand-icon"><WalletCards size={22} /></span>
          <span className="np-admin-brand-name">NovoPay <b>Finance</b><small>ADMIN CONTROL DESK</small></span>
          <button className="np-admin-mobile-close" aria-label="Close menu" onClick={() => setMobileOpen(false)}><X size={19}/></button>
        </div>
        <div className="np-admin-workspace"><span className="np-admin-workspace-dot"/><span><b>Administration</b><small>Independent NovoPay workspace</small></span></div>
        <nav className="np-admin-nav">
          {navGroups.map(group => <div className="np-admin-nav-group" key={group.title}>
            <p>{group.title}</p>
            {group.items.map(item => {
              const Icon = item.icon;
              return <button key={item.label} className={`np-admin-nav-item ${section === item.label ? "active" : ""}`} onClick={() => selectSection(item.label)}>
                <Icon size={18}/><span>{item.label}</span>{section === item.label && <ChevronRight className="np-admin-nav-chevron" size={15}/>}
              </button>;
            })}
          </div>)}
        </nav>
        <div className="np-admin-sidebar-bottom">
          <div className="np-admin-secure"><ShieldCheck size={17}/><span><b>Signed-in session</b><small>{user?.email || "Firebase account"}</small></span></div>
          <button className="np-admin-logout" onClick={onLogout}><LogOut size={17}/> Sign out</button>
        </div>
      </aside>

      <main className="np-admin-main">
        <header className="np-admin-topbar">
          <div className="np-admin-top-left">
            <button className="np-admin-menu-button" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={21}/></button>
            <div className="np-admin-breadcrumb"><span>Admin</span><ChevronRight size={14}/><b>{section}</b></div>
          </div>
          <div className="np-admin-top-actions">
            <span className="np-admin-env"><span/> NovoPay workspace</span>
            <button className="np-admin-icon-button" title="Notifications" onClick={() => setNotice("Notifications require the NovoPay notification service.")}><Bell size={18}/></button>
            <div className="np-admin-user"><span className="np-admin-avatar"><CircleUserRound size={20}/></span><span><b>Administrator</b><small>{user?.email || "Signed in"}</small></span></div>
          </div>
        </header>

        <div className="np-admin-content">
          <div className="np-admin-heading-row">
            <div><p className="np-admin-eyebrow">NOVOPAY FINANCE / ADMIN CONTROL DESK</p><h1>{section}</h1><p className="np-admin-subtitle">{descriptions[section]}</p></div>
            <button className="np-admin-refresh" onClick={requestRefresh}><RefreshCw size={16}/> Refresh</button>
          </div>
          {notice && <div className="np-admin-notice" role="status"><CircleHelp size={17}/><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss"><X size={16}/></button></div>}
          {dataError.includes("Admin server permission is not set") && <div className="np-admin-inline-error" role="alert"><ShieldAlert size={17}/><span>Admin permission setup is required for this Firebase account.</span><button className="np-admin-refresh" disabled={settingUpAdmin} onClick={async () => { setSettingUpAdmin(true); setDataError(""); try { const token = await user.getIdToken(true); const response = await fetch("/api/setup-admin", { method: "POST", headers: { Authorization: "Bearer " + token } }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || "Admin setup could not be completed."); await user.getIdToken(true); setDataError(""); setNotice("Admin access setup complete. Loading your admin records."); setReloadKey(value => value + 1); } catch (error) { setDataError(error.message || "Admin setup could not be completed."); } finally { setSettingUpAdmin(false); } }}>{settingUpAdmin ? "Setting up…" : "Set up admin access"}</button></div>}

          {section === "Overview" ? <>
            <div className="np-admin-welcome">
              <div><span className="np-admin-welcome-icon"><ShieldCheck size={23}/></span><div><h2>Welcome to NovoPay Admin</h2><p>Admin modules are organized below. Live counts, records and financial actions require NovoPay's own database and server-side authorization.</p></div></div>
              <span className="np-admin-ready-pill"><span/> Login active</span>
            </div>
            <div className="np-admin-stat-grid">
              {[
                { label: "Registered users", icon: Users, note: "Waiting for verified account records" },
                { label: "Pending deposits", icon: ArrowDownToLine, note: "Waiting for deposit requests" },
                { label: "Pending withdrawals", icon: ArrowUpFromLine, note: "Waiting for withdrawal requests" },
                { label: "Ledger transactions", icon: Activity, note: "Waiting for ledger records" },
                { label: "KYC reviews", icon: UserCheck, note: "Waiting for KYC submissions" },
                { label: "Active packages", icon: Package, note: "Waiting for package configuration" },
                { label: "Open support tickets", icon: LifeBuoy, note: "Waiting for support records" },
                { label: "Audit events", icon: ScrollText, note: "Waiting for security event records" },
              ].map(stat => { const Icon = stat.icon; return <article className="np-admin-stat-card" key={stat.label}><div className="np-admin-stat-top"><span>{stat.label}</span><span className="np-admin-stat-icon"><Icon size={19}/></span></div><strong className="np-admin-stat-value">{overviewCounts ? ({ "Registered users": overviewCounts.users, "Pending deposits": overviewCounts.pendingDeposits, "Pending withdrawals": overviewCounts.pendingWithdrawals, "Ledger transactions": overviewCounts.transactions, "KYC reviews": overviewCounts.pendingKyc, "Active packages": overviewCounts.activePackages, "Open support tickets": overviewCounts.openTickets, "Audit events": overviewCounts.auditEvents }[stat.label] ?? "—") : "—"}</strong><small>{overviewCounts ? "Live NovoPay database count" : stat.note}</small></article>; })}
            </div>
            <div className="np-admin-overview-grid">
              <section className="np-admin-panel np-admin-activity-panel">
                <div className="np-admin-panel-heading"><div><h3>Recent activity</h3><p>Latest events from NovoPay records</p></div><span className="np-admin-live-label"><span/> Auto-refresh · 15 sec</span></div>
                {recentActivity.length ? <div className="np-admin-record-list">{recentActivity.map((item, index) => <div className="np-admin-record-row" key={item.id || item.reference || index}><span>{item.reference || item.type || "Ledger event"}</span><span>{item.type} · {item.status}</span><span>{item.user_id} · {item.amount} {item.currency} · {item.created_at ? new Date(item.created_at).toLocaleString() : "—"}</span></div>)}</div> : <div className="np-admin-empty"><span className="np-admin-empty-icon"><ReceiptText size={22}/></span><b>{dataError ? "Activity unavailable" : "No ledger activity yet"}</b><p>{dataError || "New verified ledger entries will appear here automatically. No sample financial activity is invented."}</p></div>}
              </section>
              <section className="np-admin-panel np-admin-quick-panel">
                <div className="np-admin-panel-heading"><div><h3>Quick access</h3><p>Open a control module</p></div></div>
                {quickLinks.map(item => { const Icon = item.icon; return <button className="np-admin-quick-link" key={item.label} onClick={() => selectSection(item.target)}><span className="np-admin-quick-icon"><Icon size={18}/></span><span><b>{item.label}</b><small>{item.desc}</small></span><ChevronRight size={17}/></button>; })}
              </section>
            </div>
            <div className="np-admin-backend-banner"><Database size={19}/><div><b>{overviewCounts ? "Connected to NovoPay database" : "NovoPay backend status"}</b><p>{dataError || (overviewCounts ? "Counts above were loaded from the independent NovoPay database. Financial write actions remain disabled until audited transactional endpoints are implemented." : "The admin API is read-only and requires a dedicated NovoPay database plus a server-verified Firebase admin claim. No sample financial data is displayed.")}</p></div></div>
          </> : <section className="np-admin-panel np-admin-data-panel">
            <div className="np-admin-data-toolbar"><div className="np-admin-data-title"><span className="np-admin-stat-icon"><ActiveIcon size={19}/></span><div><h3>{section} management</h3><p>{descriptions[section]}</p></div></div>
              <label className="np-admin-search"><Search size={16}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder={section === "Users" ? "Search by email or NovoPay ID" : "Search records"} /></label>
            </div>
            <div className="np-admin-table-head">{(tableColumns[section] || ["RECORD", "STATUS", "DETAILS"]).map(col => <span key={col}>{col}</span>)}</div>
            {dataError && <div className="np-admin-inline-error" role="status"><ShieldAlert size={17}/><span>{dataError}</span></div>}
            {loadingData ? <div className="np-admin-empty np-admin-section-empty"><RefreshCw size={22}/><b>Loading NovoPay records…</b><p>Reading from the authenticated admin API.</p></div> : rows.length ? <div className="np-admin-record-list">{rows.map((row, index) => <div className={`np-admin-record-row ${rowActions(row).length ? "has-actions" : ""}`} key={row.id || row.reference || index}>{recordCells(section, row).map((cell, cellIndex) => <span key={cellIndex} title={String(cell ?? "")}>{cell == null || cell === "" ? "—" : String(cell)}</span>)}{rowActions(row).length > 0 && <div className="np-admin-row-actions">{rowActions(row).map(([action, label, kind]) => <button key={action + label} className={`np-admin-action-button ${kind}`} disabled={!!actionBusy} onClick={() => runAdminAction(action, row, label)}>{actionBusy === action + ":" + (row.reference || row.id || row.novopay_id || "") ? "Working…" : label}</button>)}</div>}</div>)}</div> : <div className="np-admin-empty np-admin-section-empty"><span className="np-admin-empty-icon"><ActiveIcon size={22}/></span><b>{dataError ? "Records unavailable" : emptyTitles[section] || "No records available"}</b><p>{dataError ? "Resolve the backend configuration or admin permission message above, then refresh." : query ? "No records matched this search." : "No records exist in this section yet. No sample financial records are invented."}</p></div>}
          </section>}
          <footer className="np-admin-footer"><span>© {new Date().getFullYear()} NovoPay Finance</span><span><ShieldCheck size={14}/> Independent admin workspace</span>{lastRefresh && <span>Refresh requested at {lastRefresh}</span>}</footer>
        </div>
      </main>
    </div>
  );
}
