import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { AlertOctagon, AlarmClock, CheckCircle2, ChevronDown, FolderKanban, ListTodo } from "lucide-react";
import Agenda from "../components/Agenda";
import Modal from "../components/Modal";
import TaskOpener from "../components/TaskOpener";
import { Avatar, Empty, ErrorText, HealthDot, PriorityPill, Progress, StatusPill } from "../components/Bits";
import { api, qs, subscribeTaskChanges } from "../api";
import { STATUSES, STATUS_COLOR, accent } from "../constants";
import { useSession } from "../session";
import { fmtDate, isOverdue } from "../util";

export default function Dashboard() {
  const { me, signedIn } = useSession();
  const [d, setD] = useState(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(null);
  const [taskId, setTaskId] = useState(null);
  const [showOpenTasks, setShowOpenTasks] = useState(false);
  const [openTasks, setOpenTasks] = useState(null);
  const [openTasksError, setOpenTasksError] = useState("");
  const [openTasksPage, setOpenTasksPage] = useState(1);
  const [showAttention, setShowAttention] = useState(false);
  const [attentionTasks, setAttentionTasks] = useState(null);
  const [attentionError, setAttentionError] = useState("");
  const [attentionPage, setAttentionPage] = useState(1);
  const [scope, setScope] = useState("all");
  const [scopeOpen, setScopeOpen] = useState(false);
  const activeScope = signedIn ? scope : "all";
  const load = useCallback(() => {
    setError("");
    return api.get(`/dashboard?scope=${activeScope}`).then(setD).catch((e) => setError(e.message));
  }, [activeScope]);
  const loadOpenTasks = useCallback(() => {
    setOpenTasksError("");
    return api.get(`/tasks?${qs({
      scope: activeScope,
      open_only: true,
      sort: "due_date",
      page: openTasksPage,
      page_size: 10,
    })}`).then(setOpenTasks).catch((e) => setOpenTasksError(e.message));
  }, [activeScope, openTasksPage]);
  const loadAttention = useCallback(() => {
    setAttentionError("");
    return api.get(`/tasks?${qs({
      scope: activeScope,
      blocked: true,
      sort: "due_date",
      page: attentionPage,
      page_size: 10,
    })}`).then(setAttentionTasks).catch((e) => setAttentionError(e.message));
  }, [activeScope, attentionPage]);
  useEffect(() => {
    setD(null);
    load();
    const unsubscribe = subscribeTaskChanges(load);
    return unsubscribe;
  }, [me?.id, load]);
  useEffect(() => {
    if (!showOpenTasks) return;
    setOpenTasks(null);
    loadOpenTasks();
    return subscribeTaskChanges(loadOpenTasks);
  }, [showOpenTasks, loadOpenTasks]);
  useEffect(() => {
    if (!showAttention) return;
    setAttentionTasks(null);
    loadAttention();
    return subscribeTaskChanges(loadAttention);
  }, [showAttention, loadAttention]);

  if (error) return <ErrorText error={error} />;
  if (!d) return <p className="muted">Loading…</p>;
  const projectLabel = activeScope === "all" ? "All Projects" : "My Projects";
  const scopeLabel = { all: "All Projects", my_projects: "My Projects", my_tasks: "My Tasks" }[activeScope];
  const donut = STATUSES.map(([v, l]) => ({ name: l, value: d.tasks_by_status[v], color: STATUS_COLOR[v] })).filter((x) => x.value > 0);
  const tiles = [
    { color: "kpi-1", value: d.kpis.total_projects, label: projectLabel, Icon: FolderKanban },
    { color: "kpi-2", value: d.kpis.open_tasks, label: "Open tasks", Icon: ListTodo, onClick: () => setShowOpenTasks((shown) => !shown) },
    { color: "kpi-3", value: d.kpis.blocked, label: "Blocked", Icon: AlertOctagon, onClick: () => setShowAttention(true) },
    { color: "kpi-4", value: d.kpis.overdue, label: "Overdue", Icon: AlarmClock },
    { color: "kpi-5", value: d.kpis.due_soon, label: "Due in 7 days", Icon: CheckCircle2 },
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
                      setOpenTasksPage(1);
                      setAttentionPage(1);
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
      <div className="kpis">{tiles.map(({ color, value, label, Icon, onClick }) => {
        const content = <><div><div className="n">{value}</div><div className="l">{label}</div></div><Icon size={40} /></>;
        return onClick
          ? <button
            key={label}
            type="button"
            onClick={onClick}
            aria-haspopup={label === "Blocked" ? "dialog" : undefined}
            aria-expanded={label === "Blocked" ? showAttention : showOpenTasks}
            className={`kpi ${color} dashboard-kpi-interactive`}
          >{content}</button>
          : <div key={label} className={`kpi ${color}`}>{content}</div>;
      })}</div>
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
      {showOpenTasks && (
        <OpenTasksCard
          scope={activeScope}
          data={openTasks}
          error={openTasksError}
          page={openTasksPage}
          onPageChange={setOpenTasksPage}
          onOpenTask={setTaskId}
        />
      )}
      {showAttention && (
        <Modal title="NEEDS ATTENTION" titleClassName="attention-title" onClose={() => setShowAttention(false)} wide>
          <p className="attention-message"><AlertOctagon size={18} aria-hidden="true" /> Blocked tasks in {scopeLabel.toLowerCase()}.</p>
          <ErrorText error={attentionError} />
          {!attentionTasks ? !attentionError && <p className="muted">Loading blocked tasks…</p> : attentionTasks.items.length === 0 ? <Empty>No blocked tasks in this view.</Empty> : (
            <>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Project</th><th>Task</th><th>Assignee</th><th>Status</th><th>Blocker</th></tr></thead>
                  <tbody>{attentionTasks.items.map((task) => (
                    <tr key={task.id}>
                      <td><Link to={`/projects/${task.project_id}`}>{task.project_name}</Link></td>
                      <td><button type="button" className="tasktitle task-list-title" onClick={() => { setShowAttention(false); setTaskId(task.id); }}>{task.title}</button></td>
                      <td>{task.assignee_name || <span className="muted">Unassigned</span>}</td>
                      <td><StatusPill status={task.status} /></td>
                      <td>{task.blocker_reason}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <div className="pager">
                <span className="muted">{attentionTasks.total} blocked tasks</span>
                <button className="btn sm" disabled={attentionPage <= 1} onClick={() => setAttentionPage(attentionPage - 1)}>Prev</button>
                <span>Page {attentionPage} of {Math.max(1, Math.ceil(attentionTasks.total / 10))}</span>
                <button className="btn sm" disabled={attentionPage >= Math.ceil(attentionTasks.total / 10)} onClick={() => setAttentionPage(attentionPage + 1)}>Next</button>
              </div>
            </>
          )}
        </Modal>
      )}
      {open && <TaskOpener taskId={open} onClose={() => setOpen(null)} onChanged={load} />}
      {taskId && <TaskOpener taskId={taskId} onClose={() => setTaskId(null)} onChanged={loadOpenTasks} />}
    </>
  );
}

function OpenTasksCard({ scope, data, error, page, onPageChange, onOpenTask }) {
  const title = scope === "my_tasks" ? "My open tasks" : scope === "my_projects" ? "Open tasks in my projects" : "Open tasks";
  const pages = data ? Math.max(1, Math.ceil(data.total / 10)) : 1;
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h2>{title}</h2>
      <ErrorText error={error} />
      {!data ? !error && <p className="muted">Loading tasks…</p> : data.items.length === 0 ? <Empty>No open tasks in this view.</Empty> : (
        <>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Project</th><th>Task</th><th>Assignee</th><th>Status</th><th>Priority</th><th>Due</th></tr></thead>
              <tbody>{data.items.map((task) => (
                <tr key={task.id}>
                  <td><Link to={`/projects/${task.project_id}`}>{task.project_name}</Link></td>
                  <td>
                    <button type="button" className="tasktitle task-list-title" onClick={() => onOpenTask(task.id)}>{task.title}</button>
                    {task.is_blocked && <span className="pill blocked" style={{ marginLeft: 6 }}>Blocked</span>}
                  </td>
                  <td>{task.assignee_name ? <span className="row"><Avatar name={task.assignee_name} /> {task.assignee_name}</span> : <span className="muted">Unassigned</span>}</td>
                  <td><StatusPill status={task.status} /></td>
                  <td><PriorityPill priority={task.priority} /></td>
                  <td className={isOverdue(task) ? "overdue" : ""}>{fmtDate(task.due_date)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div className="pager">
            <span className="muted">{data.total} open tasks</span>
            <button className="btn sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Prev</button>
            <span>Page {page} of {pages}</span>
            <button className="btn sm" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>Next</button>
          </div>
        </>
      )}
    </div>
  );
}
