import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { CalendarDays, Eye, Users, ListChecks } from "lucide-react";
import Logo from "../components/Logo";
import { ErrorText } from "../components/Bits";
import { supabase, authConfigured } from "../supabase";
import { useSession } from "../session";

export default function Login() {
  const { signedIn, recovery } = useSession();
  const nav = useNavigate();
  const [mode, setMode] = useState("in"); // in | up | forgot
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  if (signedIn && !recovery) return <Navigate to="/" replace />;
  if (recovery) return <Navigate to="/reset-password" replace />;

  async function submit(e) {
    e.preventDefault();
    setError(""); setInfo("");
    if (!authConfigured) return setError("Sign-in is not set up: add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to frontend/.env");
    setBusy(true);
    try {
      if (mode === "forgot") {
        const { error: err } = await supabase.auth.resetPasswordForEmail(f.email, { redirectTo: `${window.location.origin}/reset-password` });
        if (err) throw err;
        setInfo("If that email has an account, a reset link is on its way.");
      } else if (mode === "up") {
        if (!f.name.trim()) throw new Error("Please enter your name");
        const { data, error: err } = await supabase.auth.signUp({ email: f.email, password: f.password, options: { data: { full_name: f.name.trim() } } });
        if (err) throw err;
        if (data.session) nav("/"); else setInfo("Account created. Check your email to confirm it, then sign in.");
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email: f.email, password: f.password });
        if (err) throw err;
        nav("/");
      }
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  const title = { in: "Welcome back", up: "Create your account", forgot: "Reset your password" }[mode];
  return (
    <div className="login-wrap">
      <div className="login-art">
        <div className="row"><Logo size={48} /><h2 style={{ margin: 0, fontSize: 22 }}>Task Meeting Tracker</h2></div>
        <h1>One place for every project, task and deadline.</h1>
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 12 }}>
          <li className="row"><Eye size={20} /> Anyone can view projects and tasks</li>
          <li className="row"><ListChecks size={20} /> Team members update their own tasks</li>
          <li className="row"><Users size={20} /> The project manager runs the team and roles</li>
          <li className="row"><CalendarDays size={20} /> Calendar and “my day” keep deadlines in sight</li>
        </ul>
      </div>
      <div className="login-form">
        <form onSubmit={submit}>
          <h1>{title}</h1>
          {mode === "up" && <label>Full name<input value={f.name} onChange={(e) => set("name", e.target.value)} autoComplete="name" /></label>}
          <label>Email<input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} autoComplete="email" required /></label>
          {mode !== "forgot" && <label>Password<input type="password" minLength={6} value={f.password} onChange={(e) => set("password", e.target.value)} autoComplete={mode === "up" ? "new-password" : "current-password"} required /></label>}
          <ErrorText error={error} />
          {info && <p className="ok-text">{info}</p>}
          <button className="btn primary" disabled={busy} style={{ justifyContent: "center" }}>{busy ? "Please wait…" : { in: "Sign in", up: "Sign up", forgot: "Send reset link" }[mode]}</button>
          <div className="row small wrap">
            {mode !== "in" && <a href="#in" onClick={(e) => { e.preventDefault(); setMode("in"); }}>Back to sign in</a>}
            {mode === "in" && <><a href="#up" onClick={(e) => { e.preventDefault(); setMode("up"); }}>Create an account</a><span className="grow" /><a href="#forgot" onClick={(e) => { e.preventDefault(); setMode("forgot"); }}>Forgot password?</a></>}
          </div>
          <Link to="/" className="small">Continue without signing in (read-only)</Link>
        </form>
      </div>
    </div>
  );
}
