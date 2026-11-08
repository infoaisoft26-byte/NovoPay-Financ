import { useEffect, useState } from "react";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import { ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck, WalletCards } from "lucide-react";
import { auth, firebaseConfigured } from "./firebase.js";
import AdminPanel from "./AdminPanel.jsx";
import UserDashboard from "./UserDashboard.jsx";

const ADMIN_EMAIL = "admin@novopay.app";

export default function App() {
  const [path, setPath] = useState(window.location.pathname);
  const [mode, setMode] = useState("login");
  const [user, setUser] = useState(null);
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [sponsorCode, setSponsorCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");


  useEffect(() => {
    // Festive welcome is globally time-limited to the first 24 hours after launch.
    const campaignEndsAt = Date.parse("2026-11-09T09:34:00Z");
    if (Date.now() >= campaignEndsAt) return undefined;

    const style = document.createElement("style");
    style.dataset.novopayDiwali = "true";
    style.textContent = `
      .np-diwali-overlay{position:fixed;inset:0;z-index:99999;display:grid;place-items:center;overflow:hidden;background:radial-gradient(ellipse at 50% 42%,#43205d 0%,#160d2d 48%,#080817 100%);color:#fff;opacity:1;transition:opacity .9s ease}
      .np-diwali-overlay.np-diwali-out{opacity:0;pointer-events:none}
      .np-diwali-stars{position:absolute;inset:0;overflow:hidden}
      .np-diwali-star{position:absolute;width:3px;height:3px;border-radius:50%;background:#ffe9a6;box-shadow:0 0 12px 3px #ffc94b;animation:np-twinkle 1.5s ease-in-out infinite alternate}
      .np-diwali-burst{position:absolute;width:5px;height:5px;border-radius:50%;background:transparent;animation:np-firework 1.7s ease-out infinite}
      .np-diwali-burst:before,.np-diwali-burst:after{content:"";position:absolute;inset:-3px;border-radius:50%;background:conic-gradient(from 0deg,transparent 0 8%,#ffd76b 9% 11%,transparent 12% 22%,#ff8b55 23% 25%,transparent 26% 36%,#fff0ae 37% 39%,transparent 40% 50%,#f7a5ff 51% 53%,transparent 54% 64%,#ffd76b 65% 67%,transparent 68% 78%,#ff8b55 79% 81%,transparent 82%)}
      .np-diwali-burst:after{transform:rotate(45deg)}
      .np-diwali-content{position:relative;z-index:2;text-align:center;padding:28px;animation:np-rise .9s .2s both}
      .np-diwali-lamp{font-size:clamp(44px,8vw,76px);filter:drop-shadow(0 0 20px #ffb83d);animation:np-lamp 1.3s ease-in-out infinite alternate}
      .np-diwali-brand{margin:14px 0 0;font:700 12px/1.4 'DM Sans',sans-serif;letter-spacing:5px;color:#f9d98a;text-transform:uppercase}
      .np-diwali-title{margin:18px 0 10px;font:900 clamp(38px,8vw,76px)/1.02 'Manrope',sans-serif;letter-spacing:2px;background:linear-gradient(100deg,#fff6cf,#ffc34d 45%,#fff1b4 70%,#e8a7ff);background-clip:text;-webkit-background-clip:text;color:transparent;text-shadow:0 8px 45px #f5ad5033;opacity:0;animation:np-title-in 1s 3.1s forwards}
      .np-diwali-sub{font:500 clamp(13px,2vw,18px)/1.7 'DM Sans',sans-serif;color:#f8e9ca;letter-spacing:1px;opacity:0;animation:np-title-in .8s 3.7s forwards}
      .np-diwali-rule{width:90px;height:2px;margin:22px auto;background:linear-gradient(90deg,transparent,#ffcf6b,transparent);opacity:0;animation:np-title-in .8s 4s forwards}
      .np-diwali-footer{font:600 10px/1.5 'DM Sans',sans-serif;letter-spacing:3px;color:#e6c6a1;opacity:0;animation:np-title-in .8s 4.3s forwards}
      @keyframes np-twinkle{from{opacity:.18;transform:scale(.65)}to{opacity:1;transform:scale(1.5)}}
      @keyframes np-firework{0%{transform:scale(.1);opacity:0}12%{opacity:1}100%{transform:scale(18);opacity:0}}
      @keyframes np-rise{from{opacity:0;transform:translateY(18px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
      @keyframes np-title-in{from{opacity:0;transform:translateY(15px);filter:blur(7px)}to{opacity:1;transform:translateY(0);filter:blur(0)}}
      @keyframes np-lamp{from{transform:translateY(0) scale(1);filter:drop-shadow(0 0 12px #ffb83d)}to{transform:translateY(-5px) scale(1.05);filter:drop-shadow(0 0 28px #ffcf6b)}}
      @media(prefers-reduced-motion:reduce){.np-diwali-star,.np-diwali-burst,.np-diwali-lamp,.np-diwali-title,.np-diwali-sub,.np-diwali-rule,.np-diwali-footer,.np-diwali-content{animation:none!important;opacity:1!important}.np-diwali-overlay{transition:none}}
    `;
    document.head.appendChild(style);
    const overlay = document.createElement("div");
    overlay.className = "np-diwali-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", "Happy Diwali from NovoPay Finance");
    const stars = Array.from({ length: 46 }, (_, i) => {
      const left = (i * 37 + 11) % 100;
      const top = (i * 61 + 7) % 100;
      const delay = (i % 9) * .19;
      return '<i class="np-diwali-star" style="left:' + left + '%;top:' + top + '%;animation-delay:' + delay + 's"></i>';
    }).join("");
    const fireworks = [[18,24,0],[78,20,.45],[84,66,.9],[14,70,1.25],[50,12,1.6],[65,78,2]];
    overlay.innerHTML = '<div class="np-diwali-stars">' + stars + fireworks.map(([x,y,d]) => '<i class="np-diwali-burst" style="left:' + x + '%;top:' + y + '%;animation-delay:' + d + 's"></i>').join("") + '</div><div class="np-diwali-content"><div class="np-diwali-lamp" aria-hidden="true">🪔</div><div class="np-diwali-brand">NovoPay Finance</div><h1 class="np-diwali-title">HAPPY DIWALI</h1><p class="np-diwali-sub">May your life shine with prosperity, happiness &amp; new beginnings</p><div class="np-diwali-rule"></div><div class="np-diwali-footer">WISHING YOU A BRIGHT &amp; JOYFUL DIWALI</div></div>';
    document.body.appendChild(overlay);
    const closeTimer = window.setTimeout(() => {
      overlay.classList.add("np-diwali-out");
      window.setTimeout(() => overlay.remove(), 950);
    }, 8200);
    return () => {
      window.clearTimeout(closeTimer);
      overlay.remove();
      style.remove();
    };
  }, []);

  const isAdminPath = path.startsWith("/admin");
  const isDashboardPath = path.startsWith("/dashboard");

  function navigate(nextPath) {
    window.history.pushState({}, "", nextPath);
    setPath(nextPath);
    setNotice("");
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const referral = params.get("ref") || "";
    if (window.location.pathname === "/register" || referral) setMode("register");
    if (window.location.pathname === "/login") setMode("login");
    if (referral) setSponsorCode(referral.trim().toUpperCase());
  }, []);

  useEffect(() => {
    const handlePopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (!firebaseConfigured || !auth) return undefined;
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      if (nextUser && path === "/") {
        navigate(nextUser.email?.toLowerCase() === ADMIN_EMAIL ? "/admin" : "/dashboard");
      }
      if (!nextUser && ((path.startsWith("/admin") && path !== "/admin/login") || path.startsWith("/dashboard"))) {
        navigate("/");
      }
    });
  // The listener is registered once; route changes are handled by the explicit guards below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setNotice("");
    if (!firebaseConfigured || !auth) {
      setNotice("We could not process your request right now. Please try again later.");
      return;
    }
    if (mode === "register" && email.trim().toLowerCase() === ADMIN_EMAIL) {
      setNotice("Admin account ko public registration se create nahi kiya ja sakta. Firebase Authentication mein admin account create karein.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "register") {
        const code = sponsorCode.trim().toUpperCase();
        if (!name.trim()) throw new Error("Please enter your full name.");
        let normalizedMobile = mobile.replace(/\D/g, "");
        // Normalize common Indian formats to the same 10-digit number.
        if (normalizedMobile.length === 12 && normalizedMobile.startsWith("91")) normalizedMobile = normalizedMobile.slice(2);
        else if (normalizedMobile.length === 11 && normalizedMobile.startsWith("0")) normalizedMobile = normalizedMobile.slice(1);
        // Mobile is optional; do not block registration based on its length.
        if (!code) throw new Error("Referral ID is required to register.");
        const validationResponse = await fetch("/api/referral-check?code=" + encodeURIComponent(code), { cache: "no-store" });
        const validation = await validationResponse.json().catch(() => ({}));
        if (!validationResponse.ok || !validation.valid) throw new Error(validation.error || "Sponsor ID is invalid or inactive.");
        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        try {
          if (name.trim()) await updateProfile(credential.user, { displayName: name.trim() });
          const token = await credential.user.getIdToken();
          const profileResponse = await fetch("/api/user", { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ action: "ensure-profile", full_name: name.trim(), mobile: normalizedMobile, sponsor_code: code }), cache: "no-store" });
          const profileResult = await profileResponse.json().catch(() => ({}));
          if (!profileResponse.ok) throw new Error(profileResult.error || "Registration profile could not be created.");
        } catch (profileError) { await deleteUser(credential.user).catch(() => {}); throw profileError; }
        navigate("/dashboard");
      } else {
        const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
        if (credential.user.email?.toLowerCase() === ADMIN_EMAIL) {
          navigate("/admin");
        } else {
          navigate("/dashboard");
        }
      }
    } catch (error) {
      const messages = {
        "auth/invalid-credential": "Email ya password sahi nahi hai.",
        "auth/user-not-found": "Is email ka account nahi mila. Pehle register karein.",
        "auth/wrong-password": "Password sahi nahi hai.",
        "auth/email-already-in-use": "Is email se account pehle se bana hua hai. Login karein.",
        "auth/weak-password": "Password kam se kam 6 characters ka hona chahiye.",
        "auth/invalid-email": "Valid email address enter karein.",
        "auth/too-many-requests": "Bahut attempts hue hain. Thodi der baad try karein.",
        "auth/operation-not-allowed": "Registration is temporarily unavailable. Please try again later.",
      };
      setNotice(messages[error.code] || (mode === "register" ? (error.message || "Registration could not be completed. Please check your details and try again.") : "We could not sign you in. Please check your details and try again."));
    } finally {
      setBusy(false);
    }
  }

  async function handleReset() {
    setNotice("");
    if (!firebaseConfigured || !auth) {
      setNotice("This service is temporarily unavailable. Please try again later.");
      return;
    }
    if (!email.trim()) {
      setNotice("Password reset ke liye pehle email enter karein.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setNotice("Agar is email ka account hai, to password reset email bhej di gayi hai.");
    } catch (error) {
      setNotice(error.code === "auth/invalid-email" ? "Valid email address enter karein." : "Password reset email abhi nahi bheji ja saki.");
    }
  }

  async function handleLogout() {
    if (auth) await signOut(auth);
    setUser(null);
    setMode("login");
    setPassword("");
    navigate("/");
  }

  if (isAdminPath || isDashboardPath) {
    const signedIn = Boolean(user);
    const isAdmin = user?.email?.toLowerCase() === ADMIN_EMAIL;
    if (!signedIn) {
      return <AuthScreen {...{ mode, setMode, name, setName, mobile, setMobile, sponsorCode, setSponsorCode, email, setEmail, password, setPassword, showPassword, setShowPassword, busy, notice, setNotice, handleSubmit, handleReset, navigate, isAdminPath }} />;
    }
    if (isAdminPath && !isAdmin) {
      return (
        <main className="np-dashboard">
          <section className="np-dashboard-card">
            <ShieldCheck size={36} />
            <h1>Admin access denied</h1>
            <p>Is account ko NovoPay admin access nahi mila hai.</p>
            <button className="np-primary" onClick={handleLogout}>Logout</button>
          </section>
        </main>
      );
    }
    if (isAdminPath && isAdmin) return <AdminPanel user={user} onLogout={handleLogout} />;

    if (isDashboardPath && isAdmin) {
      navigate("/admin");
      return null;
    }
    if (isDashboardPath && !isAdmin) return <UserDashboard user={user} onLogout={handleLogout} />;
    return (
      <main className="np-dashboard">
        <header className="np-dash-header">
          <a className="np-brand" href="/" onClick={(e) => { e.preventDefault(); navigate(isAdmin ? "/admin" : "/dashboard"); }}>
            <img className="np-logo-image" src="/novopay-logo.svg" alt="NovoPay Finance" />
          </a>
          <button className="np-outline-button" onClick={handleLogout}>Logout</button>
        </header>
        <section className="np-dashboard-card">
          <span className="np-dashboard-icon">{isAdmin ? <ShieldCheck size={30} /> : <WalletCards size={30} />}</span>
          <p className="np-kicker">{isAdmin ? "ADMIN CONTROL" : "YOUR ACCOUNT"}</p>
          <h1>{isAdmin ? "Admin Panel" : "Welcome to NovoPay"}</h1>
          <p className="np-muted">Signed in as <strong>{user.email}</strong></p>
          <div className="np-status-box">
            <LockKeyhole size={18} />
            <span>{isAdmin ? "Admin login successful. User management and financial operations are not enabled yet." : "Your account is active. Wallet, deposits and withdrawals are not enabled yet."}</span>
          </div>
          <p className="np-small-note">Account services will appear here after backend security and transaction checks are completed.</p>
        </section>
      </main>
    );
  }

  return <AuthScreen {...{ mode, setMode, name, setName, mobile, setMobile, sponsorCode, setSponsorCode, email, setEmail, password, setPassword, showPassword, setShowPassword, busy, notice, setNotice, handleSubmit, handleReset, navigate, isAdminPath }} />;
}

function AuthScreen({ mode, setMode, name, setName, mobile, setMobile, sponsorCode, setSponsorCode, email, setEmail, password, setPassword, showPassword, setShowPassword, busy, notice, setNotice, handleSubmit, handleReset, navigate, isAdminPath }) {
  const adminLogin = Boolean(isAdminPath);
  return (
    <main className="np-auth-page">
      <div className="np-auth-glow np-glow-one" />
      <div className="np-auth-glow np-glow-two" />
      <section className="np-auth-layout">
        <div className="np-auth-intro">
          <a className="np-brand" href="/" onClick={(e) => { e.preventDefault(); navigate("/"); }}>
            <img className="np-logo-image" src="/novopay-logo.svg" alt="NovoPay Finance" />
          </a>
          <div className="np-intro-copy">
            <span className="np-kicker"><span className="np-live-dot" /> WELCOME TO NOVOPAY FINANCE</span>
            <h1>{adminLogin ? "Admin access." : "Welcome back."}<br /><span>{adminLogin ? "Control NovoPay." : "Your finance space."}</span></h1>
            <p>{adminLogin ? "Sign in with the authorized NovoPay administrator account to access the admin area." : "Sign in to your account or create one to get started with NovoPay Finance."}</p>
            <div className="np-trust"><ShieldCheck size={18} /><span>Your account is protected with secure sign-in</span></div>
          </div>
        </div>
        <section className="np-auth-card">
          <div className="np-card-icon"><LockKeyhole size={22} /></div>
          <h2>{adminLogin ? "Admin Login" : mode === "register" ? "Create your account" : "Sign in to NovoPay"}</h2>
          <p className="np-card-subtitle">{adminLogin ? "Authorized administrators only" : mode === "register" ? "Enter your details to register" : "Enter your credentials to continue"}</p>
          {!adminLogin && (
            <div className="np-auth-tabs">
              <button className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setNotice(""); }}>Login</button>
              <button className={mode === "register" ? "active" : ""} onClick={() => { setMode("register"); setNotice(""); }}>Register</button>
            </div>
          )}
          <form onSubmit={handleSubmit}>
            {mode === "register" && !adminLogin && (
              <>
                <label className="np-field"><span>Full name</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter your full name" autoComplete="name" maxLength={120} required /></label>
                <label className="np-field"><span>Email address</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required /></label>
                <label className="np-field"><span>Mobile number (optional)</span><input type="tel" inputMode="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="Enter mobile number" autoComplete="tel" maxLength={30} /></label>
                <label className="np-field"><span>Referral ID</span><input value={sponsorCode} onChange={(e) => setSponsorCode(e.target.value.toUpperCase())} placeholder="Enter referral ID" autoComplete="off" maxLength={80} required /></label>
              </>
            )}
            {mode !== "register" && <label className="np-field"><span>Email address</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required /></label>}
            <label className="np-field"><span>Password</span><span className="np-password-wrap"><input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" autoComplete={mode === "register" ? "new-password" : "current-password"} minLength={6} required /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>
            {mode === "login" && !adminLogin && <button type="button" className="np-forgot" onClick={handleReset}>Forgot password?</button>}
            <button className="np-primary np-submit" type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "register" && !adminLogin ? "Create account" : "Login"} <ArrowRight size={17} /></button>
          </form>
          {notice && <p className="np-notice" role="status">{notice}</p>}
          
          {adminLogin && <button className="np-back-link" onClick={() => { setMode("login"); navigate("/"); }}>← Back to user login</button>}
          {!adminLogin && <p className="np-legal">By continuing, you agree to NovoPay Finance’s account terms and responsible-use policy.</p>}
        </section>
      </section>
      <footer className="np-auth-footer"><span>© {new Date().getFullYear()} NovoPay Finance</span><span>Developed by <strong>AISOFT Studio</strong></span></footer>
    </main>
  );
}
