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
        if (!/^\+?[0-9\s()-]{10,18}$/.test(mobile.trim()) || mobile.replace(/\D/g, "").length < 10 || mobile.replace(/\D/g, "").length > 15) throw new Error("Please enter a valid mobile number.");
        if (!code) throw new Error("Referral ID is required to register.");
        const validationResponse = await fetch("/api/referral-check?code=" + encodeURIComponent(code), { cache: "no-store" });
        const validation = await validationResponse.json().catch(() => ({}));
        if (!validationResponse.ok || !validation.valid) throw new Error(validation.error || "Sponsor ID is invalid or inactive.");
        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        try {
          if (name.trim()) await updateProfile(credential.user, { displayName: name.trim() });
          const token = await credential.user.getIdToken();
          const profileResponse = await fetch("/api/user", { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ action: "ensure-profile", full_name: name.trim(), mobile: mobile.trim(), sponsor_code: code }), cache: "no-store" });
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
            <span className="np-brand-mark"><WalletCards size={21} /></span><span>NovoPay <b>Finance</b></span>
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

  return <AuthScreen {...{ mode, setMode, name, setName, email, setEmail, password, setPassword, showPassword, setShowPassword, busy, notice, setNotice, handleSubmit, handleReset, navigate, isAdminPath }} />;
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
            <span className="np-brand-mark"><WalletCards size={23} /></span><span>NovoPay <b>Finance</b></span>
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
                <label className="np-field"><span>Mobile number</span><input type="tel" inputMode="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="Enter mobile number" autoComplete="tel" minLength={10} maxLength={18} pattern="\+?[0-9 ()-]{10,18}" required /></label>
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
          {!adminLogin && <><p className="np-legal">By continuing, you agree to NovoPay Finance’s account terms and responsible-use policy.</p><button type="button" className="np-admin-link" onClick={() => { setMode("login"); navigate("/admin/login"); }}>Admin login</button></>}
        </section>
      </section>
      <footer className="np-auth-footer"><span>© {new Date().getFullYear()} NovoPay Finance</span><span>Developed by <strong>AISOFT Studio</strong></span></footer>
    </main>
  );
}
