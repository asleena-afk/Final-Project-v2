import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowDownUp, KanbanSquare, Pencil, Plus, RotateCcw, Table2, Trash2, Users } from "lucide-react";
import TaskForm from "../components/TaskForm";
import TaskOpener from "../components/TaskOpener";
import ProjectForm from "../components/ProjectForm";
import Modal from "../components/Modal";
import { Avatar, Empty, ErrorText, HealthDot, PriorityPill, Progress, RoleTag, StatusPill } from "../components/Bits";
import { api, qs } from "../api";
import { ASSIGNABLE_ROLES, STATUSES, STATUS_COLOR, accent } from "../constants";
import { fmtDate, isOverdue } from "../util";
import { useSession } from "../session";

export default function ProjectPage() {
  const { id } = useParams();
  const location = useLocation();
  const nav = useNavigate();
  const assignedPerson = location.state?.assignedPerson;
  const { signedIn, me } = useSession();
  const [sp, setSp] = useSearchParams();
  const tab = sp.get("tab") || "table";
  const mine = sp.get("task_scope") === "mine";
  const [project, setProject] = useState(null);
  const [members, setMembers] = useState([]);
  const [trashCount, setTrashCount] = useState(null);
  const [trashSelection, setTrashSelection] = useState([]);
  const [trashActionBusy, setTrashActionBusy] = useState(false);
  const [trashActionError, setTrashActionError] = useState("");
  const [purgeConfirmOpen, setPurgeConfirmOpen] = useState(false);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const [open, setOpen] = useState(null);
  const [adding, setAdding] = useState(false);
  const [editingProject, setEditingProject] = useState(false);
  const refresh = () => setTick((t) => t + 1);
  useEffect(() => {
    setTrashSelection([]);
    setTrashActionError("");
  }, [id]);
  const setMine = (value) => {
    const next = new URLSearchParams(sp);
    if (value) next.set("task_scope", "mine");
    else next.delete("task_scope");
    setSp(next, { state: location.state });
  };

  const loadProject = useCallback(() => {
    api.get(`/projects/${id}`).then(setProject).catch((e) => setError(e.message));
    api.get(`/projects/${id}/members`).then(setMembers).catch(() => {});
  }, [id]);
  useEffect(() => { loadProject(); }, [loadProject, me?.id]);
  useEffect(() => {
    if (!project?.my_role || String(project.id) !== id) {
      setTrashCount(null);
      return;
    }
    api.get(`/tasks?${qs({ project_id: id, trash: true, page_size: 1 })}`)
      .then((r) => setTrashCount(r.trash_count))
      .catch((e) => setError(e.message));
  }, [id, tick, project?.id, project?.my_role]);

  if (error) return <><ErrorText error={error} /><Link to="/projects">Back to projects</Link></>;
  if (!project) return <p className="muted">Loading…</p>;
  const isPm = project.my_role === "PM";
  const isMember = Boolean(project.my_role);
  const c = accent(project.name);
  const setTab = (t) => {
    const next = new URLSearchParams(sp);
    next.set("tab", t);
    setSp(next, { state: location.state });
    if (t !== "trash") setTrashSelection([]);
  };

  async function runTrashAction(action) {
    if (!trashSelection.length || trashActionBusy) return;
    setTrashActionBusy(true);
    setTrashActionError("");
    const failed = [];
    try {
      for (const task of trashSelection) {
        try {
          if (action === "restore") await api.post(`/tasks/${task.id}/restore`);
          else await api.del(`/tasks/${task.id}/purge`);
        } catch (e) {
          failed.push({ task, message: e.message || "Request failed" });
        }
      }
      const succeeded = trashSelection.length - failed.length;
      setTrashSelection(failed.map((failure) => failure.task));
      if (succeeded > 0) refresh();
      if (failed.length) {
        const verb = action === "restore" ? "restored" : "deleted forever";
        setTrashActionError(
          `${succeeded} task${succeeded === 1 ? "" : "s"} ${verb}; ${failed.length} failed. ${failed[0].message}`
        );
      }
    } finally {
      setTrashActionBusy(false);
    }
  }

  const confirmPurge = () => {
    setPurgeConfirmOpen(false);
    runTrashAction("purge");
  };

  async function removeProject() {
    if (!window.confirm(`Delete project “${project.name}” and all its tasks and meetings? This cannot be undone.`)) return;
    try { await api.del(`/projects/${id}`); nav("/projects"); } catch (e) { setError(e.message); }
  }

  return (
    <>
      <div className="project-hero" style={{ background: `linear-gradient(135deg, ${c}, ${c}bb)` }}>
        <div className="grow">
          <h1>{project.name}</h1>
          <div className="project-hero-details">
            <div className="meta">{project.description || "No description"}</div>
            <div>
              <div className="meta">PM: {project.owner_name || "—"}</div>
              {project.health_note && <div className="meta">Health note: {project.health_note}</div>}
              <div className="meta">Status: {project.status || "active"}</div>
            </div>
          </div>
        </div>
        <HealthDot health={project.health} />
        {project.my_role && <RoleTag role={project.my_role} />}
        {isPm && <><button className="btn" onClick={() => setEditingProject(true)}><Pencil size={15} /> Edit</button><button className="btn" onClick={removeProject}><Trash2 size={15} /> Delete</button></>}
        {isMember && <button className="btn" onClick={() => setAdding("task")}><Plus size={15} /> Add task</button>}
      </div>
      {!isMember && <div className="banner">{signedIn ? "You are viewing this project read-only. Ask the project manager to add you to the team." : <>Read-only view. <Link to="/login">Sign in</Link> if you are on this team.</>}</div>}

      <div className="tabs">
        <button className={`tab${tab === "table" ? " active" : ""}`} onClick={() => setTab("table")}><Table2 size={16} /> Table</button>
        <button className={`tab${tab === "board" ? " active" : ""}`} onClick={() => setTab("board")}><KanbanSquare size={16} /> Board</button>
        <button className={`tab${tab === "team" ? " active" : ""}`} onClick={() => setTab("team")}><Users size={16} /> Team ({members.length})</button>
        {isMember && <button className={`tab${tab === "trash" ? " active" : ""}`} onClick={() => setTab("trash")}><Trash2 size={16} /> Trash{trashCount != null && ` (${trashCount})`}</button>}
        {tab === "trash" && isMember && <span className="grow" />}
        {tab === "trash" && isMember && <button className="btn sm" disabled={!trashSelection.length || trashActionBusy} onClick={() => runTrashAction("restore")}><RotateCcw size={14} /> Restore</button>}
        {tab === "trash" && isPm && <button className="btn sm danger" disabled={!trashSelection.length || trashActionBusy} onClick={() => setPurgeConfirmOpen(true)}><Trash2 size={14} /> Delete forever</button>}
      </div>

      {tab === "table" && <TaskTable projectId={id} members={members} tick={tick} onOpen={setOpen} mine={mine && isMember} setMine={isMember ? setMine : null} meId={me?.id} assignedPerson={assignedPerson} />}
      {tab === "board" && <Board projectId={id} tick={tick} onOpen={setOpen} mine={mine && isMember} setMine={isMember ? setMine : null} meId={me?.id} assignedPerson={assignedPerson} />}
      {tab === "team" && <TeamTab project={project} members={members} isPm={isPm} tick={tick} onChange={() => { loadProject(); refresh(); }} onOpenTask={setOpen} />}
      {tab === "trash" && isMember && <Trash projectId={id} tick={tick} isPm={isPm} onOpen={setOpen} selected={trashSelection} onSelectionChange={setTrashSelection} actionError={trashActionError} />}

      {adding === "task" && <TaskForm projectId={id} members={members} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); refresh(); }} />}
      {editingProject && <ProjectForm project={project} onClose={() => setEditingProject(false)} onSaved={(p) => { setEditingProject(false); setProject({ ...project, ...p }); }} />}
      {open && <TaskOpener taskId={open} onClose={() => setOpen(null)} onChanged={refresh} />}
      {purgeConfirmOpen && (
        <Modal title="Confirm permanent deletion" onClose={() => setPurgeConfirmOpen(false)}>
          <p>
            Permanently delete {trashSelection.length} selected task{trashSelection.length === 1 ? "" : "s"}?
            This cannot be undone.
          </p>
          <ul style={{ maxHeight: 220, overflowY: "auto", paddingLeft: 28 }}>
            {trashSelection.map((task) => <li key={task.id}>{task.title}</li>)}
          </ul>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={() => setPurgeConfirmOpen(false)}>Cancel</button>
            <button type="button" className="btn danger" disabled={trashActionBusy || !trashSelection.length} onClick={confirmPurge}>Delete forever</button>
          </div>
        </Modal>
      )}
    </>
  );
}

function TaskScope({ mine, setMine }) {
  if (!setMine) return null;
  return (
    <select aria-label="Task scope" value={mine ? "mine" : "all"} onChange={(e) => setMine(e.target.value === "mine")}>
      <option value="mine">My Tasks</option>
      <option value="all">All</option>
    </select>
  );
}

function TaskTable({ projectId, members, tick, onOpen, mine, setMine, meId, assignedPerson }) {
  const [f, setF] = useState(() => ({ q: "", status: "", assignee_id: assignedPerson?.id || "", blocked: "" }));
  const [sort, setSort] = useState({ by: "created_at", desc: true });
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0 });
  const [error, setError] = useState("");
  const size = 10;
  useEffect(() => {
    const assigneeId = assignedPerson?.id || "";
    setF((current) => current.assignee_id === assigneeId ? current : { ...current, assignee_id: assigneeId });
    setPage(1);
  }, [projectId, assignedPerson?.id]);
  useEffect(() => {
    api.get(`/tasks?${qs({ project_id: projectId, ...f, assignee_id: mine ? meId : f.assignee_id, sort: sort.by, desc: sort.desc, page, page_size: size })}`)
      .then(setData).catch((e) => setError(e.message));
  }, [projectId, f, sort, page, tick, mine, meId]);
  const set = (k, v) => { setPage(1); setF((p) => ({ ...p, [k]: v })); };
  const th = (by, label) => <th className="sort" onClick={() => { setPage(1); setSort((s) => ({ by, desc: s.by === by ? !s.desc : false })); }}>{label} {sort.by === by && <ArrowDownUp size={12} />}</th>;
  const pages = Math.max(1, Math.ceil(data.total / size));
  return (
    <>
      <div className="filters">
        <input placeholder="Search title or ticket…" value={f.q} onChange={(e) => set("q", e.target.value)} />
        <select value={f.status} onChange={(e) => set("status", e.target.value)}><option value="">All statuses</option>{STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <TaskScope mine={mine} setMine={setMine ? (v) => {
          setPage(1);
          if (!v) setF((p) => ({ ...p, assignee_id: "" }));
          setMine(v);
        } : null} />
        <select value={mine ? meId : f.assignee_id} disabled={mine} onChange={(e) => set("assignee_id", e.target.value)}><option value="">Everyone</option>{members.map((m) => <option key={m.user_id} value={m.user_id}>{m.name} ({m.role})</option>)}</select>
        <select value={f.blocked} onChange={(e) => set("blocked", e.target.value)}><option value="">Blocked or not</option><option value="true">Blocked only</option><option value="false">Not blocked</option></select>
      </div>
      <ErrorText error={error} />
      <div className="card table-wrap">
        {data.items.length === 0 ? <Empty>No tasks match.</Empty> : (
          <table>
            <thead><tr>{th("title", "Task")}{th("assignee", "Assignee")}{th("status", "Status")}{th("priority", "Priority")}{th("due_date", "Due")}<th>Ticket</th></tr></thead>
            <tbody>{data.items.map((t) => (
              <tr key={t.id}>
                <td>
                  <span className="tasktitle" onClick={() => onOpen(t.id)}>{t.title}</span>
                  {t.is_blocked && <span className="pill blocked" style={{ marginLeft: 6 }}>Blocked</span>}
                </td>
                <td>{t.assignee_name ? <span className="row"><Avatar name={t.assignee_name} /> {t.assignee_name}</span> : <span className="muted">Unassigned</span>}</td>
                <td><StatusPill status={t.status} /></td><td><PriorityPill priority={t.priority} /></td>
                <td className={isOverdue(t) ? "overdue" : ""}>{fmtDate(t.due_date)}</td>
                <td className="small muted">{t.ticket_ref || ""}{t.ticket_stage ? ` ${t.ticket_stage}` : ""}</td>
              </tr>))}</tbody>
          </table>
        )}
      </div>
      <div className="pager"><span className="muted">{data.total} tasks</span>
        <button className="btn sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button><span>Page {page} of {pages}</span>
        <button className="btn sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button></div>
    </>
  );
}

function Board({ projectId, tick, onOpen, mine, setMine, meId, assignedPerson }) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => { api.get(`/tasks?${qs({ project_id: projectId, sort: "due_date", page_size: 500 })}`).then((r) => setItems(r.items)).catch((e) => setError(e.message)); }, [projectId, tick]);
  const visible = mine
    ? items.filter((t) => t.assignee_id === meId)
    : assignedPerson
      ? items.filter((t) => t.assignee_id === assignedPerson.id)
      : items;
  return (
    <>
      <ErrorText error={error} />
      {setMine && <div className="filters">
        <TaskScope mine={mine} setMine={setMine} />
        {assignedPerson && <span className="small muted">Tasks assigned to {assignedPerson.name}</span>}
      </div>}
      <div className="board">
        {STATUSES.map(([v, l]) => {
          const col = visible.filter((t) => t.status === v);
          return (
            <div key={v} className="col"><h3><span style={{ color: STATUS_COLOR[v] }}>{l}</span><span className="muted">{col.length}</span></h3>
              {col.map((t) => (
                <div key={t.id} className="tcard" style={{ "--c": STATUS_COLOR[v] }}>
                  <span className="tasktitle" onClick={() => onOpen(t.id)}>{t.title}</span>
                  <div className="row wrap"><PriorityPill priority={t.priority} />{t.is_blocked && <span className="pill blocked">Blocked</span>}</div>
                  <div className="row small muted">{t.assignee_name ? <><Avatar name={t.assignee_name} /> {t.assignee_name}</> : "Unassigned"}<span className="grow" /><span className={isOverdue(t) ? "overdue" : ""}>{t.due_date ? fmtDate(t.due_date) : ""}</span></div>
                </div>))}
            </div>
          );
        })}
      </div>
    </>
  );
}

export function PersonCard({ p, projectId, onOpenTask, actions }) {
  const [tasks, setTasks] = useState(null);
  useEffect(() => {
    api.get(`/tasks?${qs({ project_id: projectId, assignee_id: p.user_id, sort: "due_date", page_size: 50 })}`)
      .then((r) => setTasks(r.items))
      .catch(() => setTasks([]));
  }, [projectId, p.user_id]);
  return (
    <div className="card team-card">
      <div className="team-top"><Avatar name={p.name} large /><div className="grow"><h3 style={{ fontSize: 15 }}>{p.name}</h3>
        <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>{p.roles.map((r) => <span key={r.project_id} className="row" style={{ gap: 4 }}><RoleTag role={r.role} /><span className="small muted">{r.project_name}</span></span>)}</div>
        {p.email && <div className="small muted">{p.email}</div>}</div>{actions}</div>
      <Progress {...p} />
      <div className="stat-row"><span><b>{p.done}</b>/{p.total} done ({p.progress_pct}%)</span><span>{p.in_progress} in progress</span><span>{p.pending_review} in review</span>
        {p.blocked > 0 && <span className="err">{p.blocked} blocked</span>}{p.overdue > 0 && <span className="err">{p.overdue} overdue</span>}</div>
      {tasks && (
        <div>
          {tasks.length === 0 ? (
            <div className="small muted">No tasks in this project.</div>
          ) : tasks.map((t) => (
            <div key={t.id} className="agenda-item">
              <span className="bar" style={{ background: STATUS_COLOR[t.status] }} />
              <div>
                <div style={{ fontWeight: 400, color: t.is_blocked ? "var(--danger)" : "inherit" }}>{t.title}</div>
                {t.due_date && <div className="small muted">Due {fmtDate(t.due_date)}</div>}
              </div>
              <StatusPill status={t.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TeamTab({ project, members, isPm, tick, onChange, onOpenTask }) {
  const [people, setPeople] = useState([]);
  const [invites, setInvites] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => { api.get(`/team?project_id=${project.id}`).then(setPeople).catch((e) => setError(e.message)); }, [project.id, tick, members]);
  useEffect(() => {
    if (isPm) api.get(`/projects/${project.id}/invites`).then(setInvites).catch(() => setInvites([]));
  }, [project.id, isPm, tick, members]);
  async function cancelInvite(id) { try { await api.del(`/projects/${project.id}/invites/${id}`); onChange(); } catch (e) { setError(e.message); } }
  const role = (uid) => members.find((m) => m.user_id === uid)?.role;
  async function changeRole(uid, r) { try { await api.put(`/projects/${project.id}/members/${uid}`, { role: r }); onChange(); } catch (e) { setError(e.message); } }
  async function remove(uid, name) {
    if (!window.confirm(`Remove ${name} from this project? Their tasks become unassigned.`)) return;
    try { await api.del(`/projects/${project.id}/members/${uid}`); onChange(); } catch (e) { setError(e.message); }
  }
  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}><span className="grow muted">{isPm ? "You manage this team." : "Team and progress, view only."}</span></div>
      <ErrorText error={error} />
      {isPm && invites.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <h2>Pending invitations</h2>
          {invites.map((i) => (
            <div key={i.id} className="row" style={{ padding: "4px 0" }}>
              <span className="grow">{i.email} <span className="small muted">· {i.role} · waiting for first sign-in</span></span>
              <button className="btn sm" onClick={() => cancelInvite(i.id)}>Cancel</button>
            </div>))}
        </div>)}
      <div className="grid g2">
        {people.map((p) => (
          <PersonCard key={p.user_id} p={p} projectId={project.id} onOpenTask={onOpenTask} actions={isPm && role(p.user_id) !== "PM" && (
            <div className="row">
              <select style={{ width: "auto" }} value={role(p.user_id) || ""} onChange={(e) => changeRole(p.user_id, e.target.value)}>{ASSIGNABLE_ROLES.map((r) => <option key={r}>{r}</option>)}</select>
              <button className="btn sm danger" onClick={() => remove(p.user_id, p.name)} aria-label={`Remove ${p.name}`}><Trash2 size={14} /></button>
            </div>)} />
        ))}
      </div>
    </>
  );
}

function Trash({ projectId, tick, isPm, onOpen, selected, onSelectionChange, actionError }) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => { api.get(`/tasks?${qs({ project_id: projectId, trash: true, page_size: 100 })}`).then((r) => setItems(r.items)).catch((e) => setError(e.message)); }, [projectId, tick]);
  const selectedIds = new Set(selected.map((task) => task.id));
  const allSelected = items.length > 0 && items.every((task) => selectedIds.has(task.id));
  return (
    <div className="card table-wrap">
      <ErrorText error={error || actionError} />
      {items.length === 0 ? <Empty>{isPm ? "The trash is empty." : "You have no deleted tasks in the trash."}</Empty> : (
        <table><thead><tr><th><input type="checkbox" aria-label="Select all tasks in trash" checked={allSelected} onChange={(e) => onSelectionChange(e.target.checked ? items : [])} /></th><th>Task</th><th>Assignee</th><th>Status</th></tr></thead>
          <tbody>{items.map((t) => (
            <tr key={t.id}>
              <td><input type="checkbox" aria-label={`Select ${t.title}`} checked={selectedIds.has(t.id)} onChange={(e) => {
                const checked = e.target.checked;
                onSelectionChange((current) => checked
                  ? current.some((task) => task.id === t.id) ? current : [...current, t]
                  : current.filter((task) => task.id !== t.id));
              }} /></td>
              <td><span className="tasktitle" onClick={() => onOpen(t.id)}>{t.title}</span></td>
              <td>{t.assignee_name || "—"}</td><td><StatusPill status={t.status} /></td>
            </tr>))}</tbody></table>
      )}
    </div>
  );
}
