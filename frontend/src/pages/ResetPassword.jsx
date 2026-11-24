import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ErrorText } from "../components/Bits";
import { supabase } from "../supabase";
import { useSession } from "../session";

// Opened from the link in an invitation or reset email: Supabase signs the person in, then they pick a password.
export default function ResetPassword() {
  const { signedIn, clearRecovery } = useSession();
  const nav = useNavigate();
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  async function submit(e) {
    e.preventDefault();
    const { error: err } = await supabase.auth.updateUser({ password: pw });
    if (err) return setError(err.message);
    clearRecovery(); nav("/");
  }
  return (
    <div className="login-form" style={{ minHeight: "100vh" }}>
      <form onSubmit={submit}>
        <h1>Set your password</h1>
        {!signedIn && <p className="muted">Open this page from the link in your invitation or reset email.</p>}
        <label>New password<input type="password" minLength={6} value={pw} onChange={(e) => setPw(e.target.value)} required /></label>
        <ErrorText error={error} />
        <button className="btn primary" disabled={!signedIn} style={{ justifyContent: "center" }}>Save password</button>
      </form>
    </div>
  );
}
