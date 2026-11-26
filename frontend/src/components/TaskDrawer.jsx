import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Pencil, RotateCcw, Trash2, X } from "lucide-react";
import { Avatar, PriorityPill, RoleTag, StatusPill } from "./Bits";
import { api } from "../api";
import { useSession } from "../session";
import { fmtDate, fmtDateTime, isOverdue } from "../util";
import { describeChange } from "../pages/Logs";

const NotApplicable = () => <em>NA</em>;

// Details of one task, with its history for signed-in members. Opened from tables, boards, the calendar and the team page.
export default function TaskDrawer({ taskId, onClose, onEdit, onDelete, onRestore }) {
  const { signedIn } = useSession();
  const [task, setTask] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    setTask(null); setError("");
    api.get(`/tasks/${taskId}`).then(setTask).catch((e) => setError(e.message));
    if (signedIn) api.get(`/tasks/${taskId}/history`).then(setHistory).catch(() => setHistory([]));
  }, [taskId, signedIn]);

  return (
    <div className="drawer-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer">
        <div className="row"><h2 className="grow" style={{ margin: 0 }}>{task?.title || "Task"}</h2><button className="btn ghost" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
        {error && <p className="err">{error}</p>}
        {task && (
          <>
            <div className="row wrap"><StatusPill status={task.status} /><PriorityPill priority={task.priority} />
              {task.is_blocked && <span className="pill blocked">Blocked</span>}{task.deleted_at && <span className="pill blocked">In trash</span>}</div>
            {task.is_blocked && <div className="banner warn">Blocker: {task.blocker_reason}</div>}
            <dl className="dl">
              <dt>Project</dt><dd><Link to={`/projects/${task.project_id}`} onClick={onClose}>{task.project_name}</Link></dd>
              <dt>Assignee</dt><dd>{task.assignee_name ? <span className="row"><Avatar name={task.assignee_name} /> {task.assignee_name} {task.assignee_role && <RoleTag role={task.assignee_role} />}</span> : <NotApplicable />}</dd>
              <dt>Due</dt><dd className={isOverdue(task) ? "overdue" : ""}>{task.due_date ? <>{fmtDate(task.due_date)}{isOverdue(task) && " (overdue)"}</> : <NotApplicable />}</dd>
              <dt>Ticket stage</dt><dd>{task.ticket_stage || <NotApplicable />}</dd>
              <dt>Ticket ref</dt><dd>{task.ticket_ref || <NotApplicable />}</dd>
              <dt>Module</dt><dd>{task.module || <NotApplicable />}</dd>
              <dt>Estimate</dt><dd>{task.estimate_hrs != null ? `${task.estimate_hrs} h` : <NotApplicable />}</dd>
              <dt>Notes</dt><dd style={{ whiteSpace: "pre-wrap" }}>{task.notes ? task.notes : <NotApplicable />}</dd>
            </dl>
            <div className="row wrap">
              {!task.deleted_at && (task.perms.edit_all || task.perms.edit_status) && <button className="btn" onClick={() => onEdit(task)}><Pencil size={15} /> {task.perms.edit_all ? "Edit" : "Update my task"}</button>}
              {!task.deleted_at && task.perms.delete && <button className="btn danger" onClick={() => onDelete(task)}><Trash2 size={15} /> Delete</button>}
              {task.deleted_at && task.perms.delete && <button className="btn" onClick={() => onRestore(task)}><RotateCcw size={15} /> Restore</button>}
            </div>
            {!signedIn && <p className="hint">You are viewing read-only. <Link to="/login">Sign in</Link> to see history and make changes if you are on this project.</p>}
            {history.length > 0 && (
              <div><h2>History</h2>
                <ul className="timeline">
                  {history.map((h) => (
                    <li key={h.id}><span className="pt" /><div><b>{h.actor_name || "Someone"}</b> {describeChange(h)}<div className="small muted">{fmtDateTime(h.created_at)}</div></div></li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
