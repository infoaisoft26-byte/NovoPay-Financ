import { useMemo, useState } from "react";
import {
  LayoutDashboard, Users, ArrowDownToLine, ArrowUpFromLine, ReceiptText,
  Package, ChartNoAxesCombined, Settings, Search, Bell, Menu, X, ShieldCheck,
  CircleHelp, RefreshCw, ChevronRight, WalletCards, Clock3, Database,
  LogOut, CircleUserRound, FileText, Activity
} from "lucide-react";

const navGroups = [
  { title: "WORKSPACE", items: [
    { label: "Overview", icon: LayoutDashboard },
    { label: "Users", icon: Users },
    { label: "Deposits", icon: ArrowDownToLine },
    { label: "Withdrawals", icon: ArrowUpFromLine },
    { label: "Transactions", icon: ReceiptText },
  ]},
  { title: "MANAGEMENT", items: [
    { label: "Packages", icon: Package },
    { label: "Reports", icon: ChartNoAxesCombined },
    { label: "Settings", icon: Settings },
  ]},
];

const descriptions = {
  Overview: "Monitor your platform at a glance.",
  Users: "Review and manage registered NovoPay accounts.",
  Deposits: "Review incoming deposit requests.",
  Withdrawals: "Review withdrawal requests and their status.",
  Transactions: "Search transaction records and status.",
  Packages: "Configure available packages and account rules.",
  Reports: "Review platform activity and export reports.",
  Settings: "Manage platform preferences and access controls.",
};

export default function AdminPanel({ user, onLogout }) {
  const [section, setSection] = useState("Overview");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [lastRefresh, setLastRefresh] = useState(null);
  const [notice, setNotice] = useState("");
  const sections = useMemo(() => navGroups.flatMap(g => g.items), []);
  const active = sections.find(x => x.label === section) || sections[0];
  const ActiveIcon = active.icon;

  function selectSection(label) {
    setSection(label);
    setMobileOpen(false);
    setQuery("");
    setNotice("");
  }

  const noDataTitles = {
    Users: "No user records connected",
    Deposits: "No deposit records connected",
    Withdrawals: "No withdrawal records connected",
    Transactions: "No transaction records connected",
    Packages: "Package settings are not connected",
    Reports: "Reports are not connected",
    Settings: "Platform settings are not connected",
  };

  return (
    <div className="np-admin-shell">
      {mobileOpen && <button className="np-admin-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
      <aside className={`np-admin-sidebar ${mobileOpen ? "is-open" : ""}`}>
        <div className="np-admin-brand-row">
          <span className="np-admin-brand-icon"><WalletCards size={22} /></span>
          <span className="np-admin-brand-name">NovoPay <b>Finance</b><small>ADMIN CONSOLE</small></span>
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
          <div className="np-admin-secure"><ShieldCheck size={17}/><span><b>Secure session</b><small>Signed in with Firebase</small></span></div>
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
            <span className="np-admin-env"><span/> Production workspace</span>
            <button className="np-admin-icon-button" title="Notifications" onClick={() => setNotice("Notifications will appear when the NovoPay notification backend is connected.")}><Bell size={18}/></button>
            <div className="np-admin-user"><span className="np-admin-avatar"><CircleUserRound size={20}/></span><span><b>Administrator</b><small>{user?.email || "Signed in"}</small></span></div>
          </div>
        </header>

        <div className="np-admin-content">
          <div className="np-admin-heading-row">
            <div><p className="np-admin-eyebrow">NOVOPAY FINANCE / CONTROL CENTER</p><h1>{section}</h1><p className="np-admin-subtitle">{descriptions[section]}</p></div>
            <button className="np-admin-refresh" onClick={() => { setLastRefresh(new Date().toLocaleTimeString()); setNotice("Refresh requested. Live records will appear after the NovoPay data backend is connected."); }}><RefreshCw size={16}/> Refresh</button>
          </div>
          {notice && <div className="np-admin-notice" role="status"><CircleHelp size={17}/><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss"><X size={16}/></button></div>}

          {section === "Overview" ? <>
            <div className="np-admin-welcome">
              <div><span className="np-admin-welcome-icon"><ShieldCheck size={23}/></span><div><h2>Welcome to NovoPay Admin</h2><p>Your admin workspace is ready. Connect the NovoPay data backend to show verified platform activity here.</p></div></div>
              <span className="np-admin-ready-pill"><span/> Login active</span>
            </div>
            <div className="np-admin-stat-grid">
              {[
                { label: "Total users", icon: Users, note: "Waiting for user database" },
                { label: "Pending deposits", icon: ArrowDownToLine, note: "Waiting for deposit records" },
                { label: "Pending withdrawals", icon: ArrowUpFromLine, note: "Waiting for withdrawal records" },
                { label: "Transactions", icon: Activity, note: "Waiting for ledger records" },
              ].map(stat => { const Icon = stat.icon; return <article className="np-admin-stat-card" key={stat.label}><div className="np-admin-stat-top"><span>{stat.label}</span><span className="np-admin-stat-icon"><Icon size={19}/></span></div><strong className="np-admin-stat-value">—</strong><small>{stat.note}</small></article>; })}
            </div>
            <div className="np-admin-overview-grid">
              <section className="np-admin-panel np-admin-activity-panel">
                <div className="np-admin-panel-heading"><div><h3>Recent activity</h3><p>Latest events from your platform</p></div><span className="np-admin-live-label"><span/> Awaiting data</span></div>
                <div className="np-admin-empty"><span className="np-admin-empty-icon"><ReceiptText size={22}/></span><b>No activity to display yet</b><p>Activity will appear here when NovoPay is connected to its own database and event ledger. No sample transactions are shown.</p></div>
              </section>
              <section className="np-admin-panel np-admin-quick-panel">
                <div className="np-admin-panel-heading"><div><h3>Quick access</h3><p>Jump to an admin section</p></div></div>
                {[
                  { label: "Manage users", desc: "Accounts and access", icon: Users },
                  { label: "Review deposits", desc: "Incoming funds", icon: ArrowDownToLine },
                  { label: "Review withdrawals", desc: "Outgoing requests", icon: ArrowUpFromLine },
                  { label: "Open reports", desc: "Activity and summaries", icon: FileText },
                ].map(item => { const Icon = item.icon; const target = item.label === "Manage users" ? "Users" : item.label === "Review deposits" ? "Deposits" : item.label === "Review withdrawals" ? "Withdrawals" : "Reports"; return <button className="np-admin-quick-link" key={item.label} onClick={() => selectSection(target)}><span className="np-admin-quick-icon"><Icon size={18}/></span><span><b>{item.label}</b><small>{item.desc}</small></span><ChevronRight size={17}/></button>; })}
              </section>
            </div>
            <div className="np-admin-backend-banner"><Database size={19}/><div><b>Backend connection required</b><p>Admin layout is available, but user lists, balances, approvals, package changes and reports are not active until the NovoPay database and secure server-side permissions are configured.</p></div></div>
          </> : <section className="np-admin-panel np-admin-data-panel">
            <div className="np-admin-data-toolbar"><div className="np-admin-data-title"><span className="np-admin-stat-icon"><ActiveIcon size={19}/></span><div><h3>{section} management</h3><p>{descriptions[section]}</p></div></div>
              <label className="np-admin-search"><Search size={16}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder={section === "Users" ? "Search by email or user ID" : "Search records"} /></label>
            </div>
            <div className="np-admin-table-head"><span>SECTION</span><span>STATUS</span><span>DETAILS</span></div>
            <div className="np-admin-empty np-admin-section-empty"><span className="np-admin-empty-icon"><ActiveIcon size={22}/></span><b>{noDataTitles[section] || "No records available"}</b><p>{query ? "Search cannot return results until real NovoPay records are connected." : "This section is prepared in the admin interface, but no live data source is connected yet. For safety, actions that affect balances or financial records are not simulated."}</p><button className="np-admin-secondary" onClick={() => setNotice("The data connection must be implemented and verified before this section can manage real records.")}><Database size={15}/> Check connection requirements</button></div>
          </section>}
          <footer className="np-admin-footer"><span>© {new Date().getFullYear()} NovoPay Finance</span><span><ShieldCheck size={14}/> Secure admin workspace</span>{lastRefresh && <span>Refresh requested at {lastRefresh}</span>}</footer>
        </div>
      </main>
    </div>
  );
}
