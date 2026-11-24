import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { AlertOctagon, AlarmClock, CheckCircle2, FolderKanban, ListTodo } from "lucide-react";
import Agenda from "../components/Agenda";
import TaskOpener from "../components/TaskOpener";
import { Empty, ErrorText, HealthDot, Progress } from "../components/Bits";
import { api, subscribeTaskChanges } from "../api";
import { STATUSES, STATUS_COLOR, accent } from "../constants";
import { useSession } from "../session";

export default function Dashboard() {
  const { me, signedIn } = useSession();
  const [d, setD] = useState(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(null);
  const [mineOnly, setMineOnly] = useState(false);
  const load = () => api.get("/dashboard").then(setD).catch((e) => setError(e.message));
  useEffect(() => {
    load();
    const unsubscribe = subscribeTaskChanges(load);
    return unsubscribe;
  }, [me?.id]);

  if (error) return <ErrorText error={error} />;
  if (!d) return <p className="muted">Loading…</p>;
  // "My projects" narrows the cards, the chart and the table to projects I am on.
  const on = mineOnly && signedIn;
  const ps = on ? d.projects.filter((p) => p.my_role) : d.projects;
  const sum = (key) => ps.reduce((n, p) => n + p[key], 0);
  const k = on
    ? { total_projects: ps.length, open_tasks: sum("total") - sum("done"), blocked: sum("blocked"), overdue: sum("overdue"), due_soon: sum("due_soon") }
    : d.kpis;
  const byStatus = on ? Object.fromEntries(STATUSES.map(([v]) => [v, sum(v)])) : d.tasks_by_status;
  const donut = STATUSES.map(([v, l]) => ({ name: l, value: byStatus[v], color: STATUS_COLOR[v] })).filter((x) => x.value > 0);
  const tiles = [
    ["kpi-1", k.total_projects, "Projects", FolderKanban], ["kpi-2", k.open_tasks, "Open tasks", ListTodo],
    ["kpi-3", k.blocked, "Blocked", AlertOctagon], ["kpi-4", k.overdue, "Overdue", AlarmClock], ["kpi-5", k.due_soon, "Due in 7 days", CheckCircle2],
  ];
  return (
    <>
      <div className="page-head"><h1>Dashboard</h1><span className="sub">{me ? `Hello, ${me.name}` : "Viewing read-only"}</span><span className="grow" />
        {signedIn && <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} style={{ width: "auto" }} /> My projects</label>}</div>
      {!me && <div className="banner">You can look around freely. <Link to="/login">Sign in</Link> if you are on a project team and want to make changes.</div>}
      <div className="kpis">{tiles.map(([c, n, l, Icon]) => <div key={l} className={`kpi ${c}`}><div><div className="n">{n}</div><div className="l">{l}</div></div><Icon size={40} /></div>)}</div>
      <div className="grid g-side">
        <div className="grid">
          <div className="card">
            <h2>Tasks by status</h2>
            {donut.length === 0 ? <Empty>No tasks yet.</Empty> : (
              <div className="row gap wrap">
                <div style={{ width: 200, height: 200 }}><ResponsiveContainer><PieChart><Pie data={donut} dataKey="value" innerRadius={55} outerRadius={85} paddingAngle={2}>{donut.map((x) => <Cell key={x.name} fill={x.color} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div>
                <div style={{ display: "grid", gap: 8 }}>{donut.map((x) => <div key={x.name} className="row"><span className="nav-dot" style={{ background: x.color }} /> {x.name} <b>{x.value}</b></div>)}</div>
              </div>
            )}
          </div>
          <div className="card">
            <h2>Projects</h2>
            {ps.length === 0 ? <Empty>{on ? "You are not on any project yet." : "No projects yet."}</Empty> : (
              <div className="table-wrap"><table>
                <thead><tr><th>Project</th><th>PM</th><th>Health</th><th style={{ width: "28%" }}>Progress</th><th>Blocked</th><th>Overdue</th></tr></thead>
                <tbody>{ps.map((p) => (
                  <tr key={p.id}>
                    <td><Link to={`/projects/${p.id}`} className="row"><span className="nav-dot" style={{ background: accent(p.name) }} /><b>{p.name}</b></Link></td>
                    <td>{p.owner_name || "—"}</td><td><HealthDot health={p.health} /></td>
                    <td><Progress {...p} /><div className="small muted">{p.done}/{p.total} done · {p.progress_pct}%</div></td>
                    <td className={p.blocked ? "err" : ""}>{p.blocked}</td><td className={p.overdue ? "err" : ""}>{p.overdue}</td>
                  </tr>))}</tbody></table></div>
            )}
          </div>
        </div>
        <Agenda onOpen={setOpen} myProjectsOnly={on} />
      </div>
      {open && <TaskOpener taskId={open} onClose={() => setOpen(null)} onChanged={load} />}
    </>
  );
}
