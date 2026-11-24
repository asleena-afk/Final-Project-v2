import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import TaskOpener from "../components/TaskOpener";
import { Avatar, Empty, ErrorText, HealthDot, RoleTag, StatusPill } from "../components/Bits";
import { api, qs } from "../api";
import { STATUS_COLOR, accent } from "../constants";
import { supabase } from "../supabase";
import { useSession } from "../session";
import { fmtDate, isOverdue } from "../util";

// Your own page: details you can edit, the projects and tasks that are yours, and your password.
export default function Profile() {
  const { me, refreshMe } = useSession();
  const [name, setName] = useState("");
  const [nameMsg, setNameMsg] = useState({ ok: "", err: "" });
  const [projects, setProjects] = useState(null);
  const [tasks, setTasks] = useState(null);
  const [open, setOpen] = useState(null);
  const [tick, setTick] = useState(0);
  const [pw, setPw] = useState({ a: "", b: "" });
  const [pwMsg, setPwMsg] = useState({ ok: "", err: "" });
  const [busy, setBusy] = useState("");

  useEffect(() => { if (me) setName(me.name); }, [me?.name]);
  useEffect(() => { api.get("/projects").then((l) => setProjects(l.filter((p) => p.my_role))).catch(() => setProjects([])); }, [me?.id]);
  useEffect(() => {
    if (!me) return;
    api.get(`/tasks?${qs({ assignee_id: me.id, sort: "due_date", page_size: 100 })}`)
      .then((r) => setTasks(r.items.filter((t) => t.status !== "done"))).catch(() => setTasks([]));
  }, [me?.id, tick]);

  if (!me) return <p className="muted">Loading…</p>;
  const overdue = (tasks || []).filter(isOverdue).length;

  async function saveName(e) {
    e.preventDefault();
    setNameMsg({ ok: "", err: "" }); setBusy("name");
    try { await api.put("/me", { name }); await refreshMe(); setNameMsg({ ok: "Name saved.", err: "" }); }
    catch (err) { setNameMsg({ ok: "", err: err.message }); } finally { setBusy(""); }
  }
  async function savePassword(e) {
    e.preventDefault();
    setPwMsg({ ok: "", err: "" });
    if (pw.a.length < 6) return setPwMsg({ ok: "", err: "Use at least 6 characters." });
    if (pw.a !== pw.b) return setPwMsg({ ok: "", err: "The two passwords do not match." });
    setBusy("pw");
    const { error } = await supabase.auth.updateUser({ password: pw.a });
    setBusy("");
    if (error) return setPwMsg({ ok: "", err: error.message });
    setPw({ a: "", b: "" }); setPwMsg({ ok: "Password changed.", err: "" });
  }

  return (
    <>
      <div className="page-head"><h1>My profile</h1><span className="sub">Your details, projects and tasks</span></div>
      <div className="grid g2">
        <div className="card">
          <div className="row" style={{ marginBottom: 12 }}><Avatar name={me.name} /><div><b>{me.name}</b><div className="small muted">{me.is_pm ? "Project manager" : "Team member"}</div></div></div>
          <form onSubmit={saveName} className="grid">
            <label>Name<input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} required /></label>
            <label>Email<input value={me.email} disabled /></label>
            <p className="small muted" style={{ margin: 0 }}>Your email is your login, so it cannot be changed here.</p>
            <ErrorText error={nameMsg.err} />{nameMsg.ok && <p className="ok-text" style={{ margin: 0 }}>{nameMsg.ok}</p>}
            <div><button className="btn primary" disabled={busy === "name" || !name.trim() || name.trim() === me.name}>Save name</button></div>
          </form>
        </div>

        <div className="card">
          <h2>Change password</h2>
          <form onSubmit={savePassword} className="grid">
            <label>New password<input type="password" autoComplete="new-password" value={pw.a} onChange={(e) => setPw({ ...pw, a: e.target.value })} /></label>
            <label>Confirm new password<input type="password" autoComplete="new-password" value={pw.b} onChange={(e) => setPw({ ...pw, b: e.target.value })} /></label>
            <ErrorText error={pwMsg.err} />{pwMsg.ok && <p className="ok-text" style={{ margin: 0 }}>{pwMsg.ok}</p>}
            <div><button className="btn primary" disabled={busy === "pw" || !pw.a}>Change password</button></div>
            <p className="small muted" style={{ margin: 0 }}>Forgot it and cannot sign in? Use “Forgot password?” on the sign-in page.</p>
          </form>
        </div>

        <div className="card">
          <h2>My projects {projects && <span className="small muted">({projects.length})</span>}</h2>
          {projects === null ? <Empty>Loading…</Empty> : projects.length === 0 ? <Empty>You are not on any project yet.</Empty> : projects.map((p) => (
            <div key={p.id} className="agenda-item"><span className="bar" style={{ background: accent(p.name) }} />
              <div><Link to={`/projects/${p.id}`}><b>{p.name}</b></Link><div className="small muted">PM {p.owner_name || "—"}</div></div>
              <span className="row"><HealthDot health={p.health} /><RoleTag role={p.my_role} /></span></div>))}
        </div>

        <div className="card">
          <h2>My open tasks {tasks && <span className="small muted">({tasks.length}{overdue ? ` · ${overdue} overdue` : ""})</span>}</h2>
          {tasks === null ? <Empty>Loading…</Empty> : tasks.length === 0 ? <Empty>Nothing assigned to you.</Empty> : tasks.slice(0, 10).map((t) => (
            <div key={t.id} className="agenda-item" onClick={() => setOpen(t.id)} role="button"><span className="bar" style={{ background: STATUS_COLOR[t.status] }} />
              <div><div style={{ fontWeight: 600 }}>{t.title}</div><div className="small muted">{t.project_name}</div></div>
              <span className="row"><span className={`small ${isOverdue(t) ? "overdue" : "muted"}`}>{t.due_date ? fmtDate(t.due_date) : "No due date"}</span><StatusPill status={t.status} /></span></div>))}
          {tasks && tasks.length > 10 && <p className="small muted">Showing 10 of {tasks.length}. Open a project and tick “My tasks” to see them all.</p>}
        </div>
      </div>
      {open && <TaskOpener taskId={open} onClose={() => setOpen(null)} onChanged={() => setTick((t) => t + 1)} />}
    </>
  );
}
