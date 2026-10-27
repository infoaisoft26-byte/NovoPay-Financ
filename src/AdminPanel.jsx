import { useMemo, useState } from "react";
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
    setNotice("Refresh requested. Live records will appear after NovoPay's independent backend is connected.");
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
              ].map(stat => { const Icon = stat.icon; return <article className="np-admin-stat-card" key={stat.label}><div className="np-admin-stat-top"><span>{stat.label}</span><span className="np-admin-stat-icon"><Icon size={19}/></span></div><strong className="np-admin-stat-value">—</strong><small>{stat.note}</small></article>; })}
            </div>
            <div className="np-admin-overview-grid">
              <section className="np-admin-panel np-admin-activity-panel">
                <div className="np-admin-panel-heading"><div><h3>Recent activity</h3><p>Latest events from NovoPay records</p></div><span className="np-admin-live-label"><span/> Awaiting data</span></div>
                <div className="np-admin-empty"><span className="np-admin-empty-icon"><ReceiptText size={22}/></span><b>No activity connected yet</b><p>Connect the independent NovoPay event ledger before showing transactions or administrative events. No sample financial activity is invented.</p></div>
              </section>
              <section className="np-admin-panel np-admin-quick-panel">
                <div className="np-admin-panel-heading"><div><h3>Quick access</h3><p>Open a control module</p></div></div>
                {quickLinks.map(item => { const Icon = item.icon; return <button className="np-admin-quick-link" key={item.label} onClick={() => selectSection(item.target)}><span className="np-admin-quick-icon"><Icon size={18}/></span><span><b>{item.label}</b><small>{item.desc}</small></span><ChevronRight size={17}/></button>; })}
              </section>
            </div>
            <div className="np-admin-backend-banner"><Database size={19}/><div><b>Independent backend connection required</b><p>These modules are now available in the NovoPay admin navigation. Live users, wallet balances, approvals, reports and package changes must be wired to NovoPay's own database and secure server-side authorization before financial actions can be enabled.</p></div></div>
          </> : <section className="np-admin-panel np-admin-data-panel">
            <div className="np-admin-data-toolbar"><div className="np-admin-data-title"><span className="np-admin-stat-icon"><ActiveIcon size={19}/></span><div><h3>{section} management</h3><p>{descriptions[section]}</p></div></div>
              <label className="np-admin-search"><Search size={16}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder={section === "Users" ? "Search by email or NovoPay ID" : "Search records"} /></label>
            </div>
            <div className="np-admin-table-head">{(tableColumns[section] || ["RECORD", "STATUS", "DETAILS"]).map(col => <span key={col}>{col}</span>)}</div>
            <div className="np-admin-empty np-admin-section-empty"><span className="np-admin-empty-icon"><ActiveIcon size={22}/></span><b>{emptyTitles[section] || "No records available"}</b><p>{query ? "Search cannot return results until real NovoPay records are connected." : "The module layout is ready, but this section has no connected live data source yet. Actions affecting accounts or financial records are intentionally not simulated."}</p><button className="np-admin-secondary" onClick={() => setNotice("Next implementation step: create and connect the NovoPay-specific data model and enforce administrator permissions on the server.")}><Database size={15}/> View connection requirement</button></div>
          </section>}
          <footer className="np-admin-footer"><span>© {new Date().getFullYear()} NovoPay Finance</span><span><ShieldCheck size={14}/> Independent admin workspace</span>{lastRefresh && <span>Refresh requested at {lastRefresh}</span>}</footer>
        </div>
      </main>
    </div>
  );
}
