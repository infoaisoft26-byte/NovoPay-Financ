import { useState } from "react";
import { ArrowRight, ShieldCheck, WalletCards, CircleHelp, Menu, X, LockKeyhole, Globe2 } from "lucide-react";
import { auth, firebaseConfigured } from "./firebase.js";

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [email, setEmail] = useState("");

  function handleContinue(event) {
    event.preventDefault();
    if (!firebaseConfigured || !auth) {
      setNotice("Firebase setup is pending. Configure VITE_FIREBASE_API_KEY in the deployment environment before enabling sign-in.");
      return;
    }
    setNotice("Firebase is configured. Account sign-in flow is not enabled in this starter yet.");
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="NovoPay Finance home">
          <span className="brand-mark"><WalletCards size={22} /></span>
          <span>NovoPay <b>Finance</b></span>
        </a>
        <button className="mobile-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle navigation">
          {menuOpen ? <X /> : <Menu />}
        </button>
        <nav className={menuOpen ? "nav-links open" : "nav-links"}>
          <a href="#features" onClick={() => setMenuOpen(false)}>Platform</a>
          <a href="#security" onClick={() => setMenuOpen(false)}>Security</a>
          <a href="#help" onClick={() => setMenuOpen(false)}>Help</a>
          <a className="nav-cta" href="#access" onClick={() => setMenuOpen(false)}>Get started <ArrowRight size={16} /></a>
        </nav>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><span className="status-dot" /> YOUR FINANCIAL SPACE, REIMAGINED</div>
            <h1>Clarity for your money.<br /><span>Confidence for tomorrow.</span></h1>
            <p className="hero-text">A fresh, independent finance platform designed around a clear experience, transparent information and security-first foundations.</p>
            <div className="hero-actions">
              <a className="primary-button" href="#access">Explore NovoPay <ArrowRight size={18} /></a>
              <a className="text-button" href="#features">Discover the platform</a>
            </div>
            <div className="trust-line"><ShieldCheck size={17} /> Built with independent infrastructure</div>
          </div>
          <div className="hero-art" aria-label="NovoPay finance overview illustration">
            <div className="orb orb-one" /><div className="orb orb-two" />
            <div className="glass-card">
              <div className="card-top"><span className="mini-brand"><span className="mini-mark">N</span> NovoPay</span><span className="card-chip">PREVIEW</span></div>
              <div className="card-label">Your finance overview</div>
              <div className="preview-value">— — —</div>
              <div className="preview-caption">Balance will appear when account services are enabled.</div>
              <div className="chart-placeholder"><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /></div>
              <div className="card-bottom"><span>ACCOUNT STATUS</span><strong><i /> Setup in progress</strong></div>
            </div>
            <div className="floating-pill"><span className="pill-icon"><LockKeyhole size={16} /></span><span><b>Security first</b><small>Independent setup</small></span></div>
          </div>
        </section>

        <section className="features" id="features">
          <div className="section-heading"><span className="eyebrow">A BETTER STARTING POINT</span><h2>Designed for clarity.<br />Built for trust.</h2></div>
          <div className="feature-grid">
            <article className="feature-card"><span className="feature-icon blue"><WalletCards /></span><h3>A clear overview</h3><p>A focused interface with room for account details and activity when those features are ready.</p></article>
            <article className="feature-card"><span className="feature-icon green"><ShieldCheck /></span><h3>Security by design</h3><p>Separate project configuration and secure access rules are part of the foundation.</p></article>
            <article className="feature-card"><span className="feature-icon violet"><Globe2 /></span><h3>Independent platform</h3><p>NovoPay uses its own Firebase project and is kept separate from other production systems.</p></article>
          </div>
        </section>

        <section className="access-section" id="access">
          <div className="access-copy">
            <span className="eyebrow">EARLY PLATFORM ACCESS</span>
            <h2>Your NovoPay journey<br />starts here.</h2>
            <p>The starter site is being configured. Sign-in, balances, deposits and withdrawals will only be enabled after their security and backend checks are complete.</p>
            <div className="security-note"><LockKeyhole size={18} /><span><b>Account services are not live yet.</b><small>No real transactions are processed by this starter.</small></span></div>
          </div>
          <form className="access-form" onSubmit={handleContinue}>
            <div className="form-icon"><CircleHelp size={22} /></div>
            <h3>Get started</h3>
            <p>Enter your email to check platform setup.</p>
            <label htmlFor="email">Email address</label>
            <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
            <button className="primary-button form-button" type="submit">Continue <ArrowRight size={18} /></button>
            {notice && <p className="form-notice" role="status">{notice}</p>}
            <p className="form-footnote">This form does not create an account or send an email yet.</p>
          </form>
        </section>
      </main>

      <footer id="help">
        <a className="brand footer-brand" href="#"><span className="brand-mark"><WalletCards size={20} /></span><span>NovoPay <b>Finance</b></span></a>
        <span className="footer-copy">Independent project · Setup in progress</span>
        <span className="footer-security"><ShieldCheck size={15} /> Security-first foundation</span>
      </footer>
    </div>
  );
}
