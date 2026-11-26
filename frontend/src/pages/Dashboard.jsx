import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { AlertOctagon, AlarmClock, CheckCircle2, ChevronDown, FolderKanban, ListTodo } from "lucide-react";
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
  const [scope, setScope] = useState("all");
  const [scopeOpen, setScopeOpen] = useState(false);
  const activeScope = signedIn ? scope : "all";
  const load = useCallback(() => {
    setError("");
    return api.get(`/dashboard?scope=${activeScope}`).then(setD).catch((e) => setError(e.message));
  }, [activeScope]);
  useEffect(() => {
    setD(null);
    load();
    const unsubscribe = subscribeTaskChanges(load);
    return unsubscribe;
  }, [me?.id, load]);

  if (error) return <ErrorText error={error} />;
  if (!d) return <p className="muted">Loading…</p>;
  const projectLabel = activeScope === "all" ? "All Projects" : "My Projects";
  const scopeLabel = { all: "All Projects", my_projects: "My Projects", my_tasks: "My Tasks" }[activeScope];
  const donut = STATUSES.map(([v, l]) => ({ name: l, value: d.tasks_by_status[v], color: STATUS_COLOR[v] })).filter((x) => x.value > 0);
  const tiles = [
    ["kpi-1", d.kpis.total_projects, projectLabel, FolderKanban], ["kpi-2", d.kpis.open_tasks, "Open tasks", ListTodo],
    ["kpi-3", d.kpis.blocked, "Blocked", AlertOctagon], ["kpi-4", d.kpis.overdue, "Overdue", AlarmClock], ["kpi-5", d.kpis.due_soon, "Due in 7 days", CheckCircle2],
  ];
  return (
    <>
      <div className="page-head"><h1>Dashboard</h1><span className="sub">{me ? `Hello, ${me.name}` : "Viewing read-only"}</span><span className="grow" />
        {signedIn && (
          <div
            className="dashboard-scope"
            onMouseEnter={() => setScopeOpen(true)}
            onMouseLeave={() => setScopeOpen(false)}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) setScopeOpen(false);
            }}
          >
            <button
              type="button"
              className="btn"
              aria-haspopup="menu"
              aria-expanded={scopeOpen}
              onClick={() => setScopeOpen(true)}
              onFocus={() => setScopeOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setScopeOpen(false);
              }}
            >
              {scopeLabel} <ChevronDown size={15} />
            </button>
            {scopeOpen && (
              <div className="dashboard-scope-menu" role="menu">
                {[
                  ["all", "All Projects"],
                  ["my_projects", "My Projects"],
                  ["my_tasks", "My Tasks"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="menuitem"
                    className={`dashboard-scope-option${scope === value ? " active" : ""}`}
                    onClick={() => {
                      setScope(value);
                      setScopeOpen(false);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {!me && <div className="banner">You can look around freely. <Link to="/login">Sign in</Link> if you are on a project team and want to make changes.</div>}
      <div className="kpis">{tiles.map(([c, n, l, Icon]) => <div key={l} className={`kpi ${c}`}><div><div className="n">{n}</div><div className="l">{l}</div></div><Icon size={40} /></div>)}</div>
      <div className="grid g-side">
        <div className="grid">
          <div className="card">
            <h2>{activeScope === "my_tasks" ? "My tasks by status" : "Tasks by status"}</h2>
            {donut.length === 0 ? <Empty>No tasks yet.</Empty> : (
              <div className="row gap wrap">
                <div style={{ width: 200, height: 200 }}><ResponsiveContainer><PieChart><Pie data={donut} dataKey="value" innerRadius={55} outerRadius={85} paddingAngle={2}>{donut.map((x) => <Cell key={x.name} fill={x.color} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div>
                <div style={{ display: "grid", gap: 8 }}>{donut.map((x) => <div key={x.name} className="row"><span className="nav-dot" style={{ background: x.color }} /> {x.name} <b>{x.value}</b></div>)}</div>
              </div>
            )}
          </div>
          <div className="card">
            <h2>{projectLabel}</h2>
            {d.projects.length === 0 ? <Empty>{activeScope === "my_tasks" ? "No tasks are assigned to you yet." : activeScope === "my_projects" ? "You are not on any project yet." : "No projects yet."}</Empty> : (
              <div className="table-wrap"><table>
                <thead><tr><th>Project</th><th>PM</th><th>Health</th><th style={{ width: "28%" }}>Progress</th><th>Blocked</th><th>Overdue</th></tr></thead>
                <tbody>{d.projects.map((p) => (
                  <tr key={p.id}>
                    <td><Link to={`/projects/${p.id}`} className="row"><span className="nav-dot" style={{ background: accent(p.name) }} /><b>{p.name}</b></Link></td>
                    <td>{p.owner_name || "—"}</td><td><HealthDot health={p.health} /></td>
                    <td><Progress {...p} /><div className="small muted">{p.done}/{p.total} done · {p.progress_pct}%</div></td>
                    <td className={p.blocked ? "err" : ""}>{p.blocked}</td><td className={p.overdue ? "err" : ""}>{p.overdue}</td>
                  </tr>))}</tbody></table></div>
            )}
          </div>
        </div>
        <Agenda onOpen={setOpen} scope={activeScope} />
      </div>
      {open && <TaskOpener taskId={open} onClose={() => setOpen(null)} onChanged={load} />}
    </>
  );
}
