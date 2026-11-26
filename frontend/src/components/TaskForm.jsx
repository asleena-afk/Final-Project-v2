import { useEffect, useState } from "react";
import Modal from "./Modal";
import { ErrorText } from "./Bits";
import { api } from "../api";
import { PRIORITIES, STAGES, STAGE_TO_STATUS, STATUSES } from "../constants";
import { useSession } from "../session";
import { changed } from "../util";

const FIELDS = ["title", "notes", "status", "priority", "due_date", "due_time", "assignee_id", "is_blocked", "blocker_reason",
  "ticket_ref", "module", "estimate_hrs", "ticket_stage"];
const MEMBER_FIELDS = ["status", "is_blocked", "blocker_reason", "notes", "ticket_stage"];

// Create (any member) or edit. A member editing a task assigned to them can only touch the MEMBER_FIELDS.
export default function TaskForm({ projectId, members, task, initial, meetingId, meetingActionItem, projectOptions, onProjectChange, onSaved, onClose }) {
  const { me } = useSession();
  const editing = Boolean(task);
  const full = !editing || task.perms.edit_all;
  const [f, setF] = useState(() => ({
    title: "", notes: "", status: "todo", priority: "medium", due_date: "", due_time: "", assignee_id: "", is_blocked: false,
    blocker_reason: "", ticket_ref: "", module: "", estimate_hrs: "", ticket_stage: "",
    ...Object.fromEntries(Object.entries({ ...(initial || {}), ...(task || {}) }).filter(([k]) => FIELDS.includes(k)).map(([k, v]) => [k, v ?? ""])),
  }));
  const [assigneeTouched, setAssigneeTouched] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const can = (k) => full || MEMBER_FIELDS.includes(k);
  const stageSet = Boolean(f.ticket_stage);
  const onStage = (v) => setF((p) => ({ ...p, ticket_stage: v, status: v ? STAGE_TO_STATUS[v] : p.status }));

  useEffect(() => {
    if (editing || initial?.assignee_id || f.assignee_id || assigneeTouched || !me?.id) return;
    if (members.some((member) => member.user_id === me.id)) set("assignee_id", me.id);
  }, [assigneeTouched, editing, f.assignee_id, initial?.assignee_id, me?.id, members]);

  async function save(e) {
    e.preventDefault();
    setError("");
    if (!f.title.trim()) return setError("Title is required");
    if ((!editing || full) && !f.due_date) return setError("Due date is required");
    if (f.is_blocked && !f.blocker_reason.trim()) return setError("A blocked task needs a reason");
    setBusy(true);
    try {
      const body = { ...f, estimate_hrs: f.estimate_hrs === "" ? null : Number(f.estimate_hrs) };
      let saved;
      if (editing) {
        const diff = changed(task, body, FIELDS.filter(can));
        if (!Object.keys(diff).length) return onClose();
        if (diff.is_blocked === false) diff.blocker_reason = null;
        saved = await api.patch(`/tasks/${task.id}`, diff);
      } else {
        const clean = Object.fromEntries(Object.entries(body).map(([k, v]) => [k, v === "" ? null : v]));
        const createBody = { ...clean, notes: f.notes, project_id: projectId, ...(meetingId ? { meeting_id: meetingId } : {}) };
        if (meetingId && meetingActionItem && f.title.trim() !== (initial?.title || "").trim()) {
          createBody.meeting_action_item = meetingActionItem;
        }
        saved = await api.post("/tasks", createBody);
      }
      onSaved(saved);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <Modal title={editing ? (full ? "Edit task" : "Update my task") : "Add task"} onClose={onClose}>
      <form onSubmit={save}>
        {!full && <p className="hint">This task is assigned to you. You can change its status, ticket stage, blocker and notes. The project manager edits everything else.</p>}
        <div className="form-grid">
          {!editing && projectOptions?.length > 1 && (
            <label className="span2">Project
              <select value={projectId} onChange={(e) => onProjectChange?.(e.target.value)}>
                {projectOptions.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
            </label>
          )}
          <label className="span2">Title<input value={f.title} disabled={!can("title")} maxLength={160} onChange={(e) => set("title", e.target.value)} autoFocus /></label>
          <label>Assignee
            <select value={f.assignee_id} disabled={!can("assignee_id")} onChange={(e) => { setAssigneeTouched(true); set("assignee_id", e.target.value); }}>
              <option value="">Unassigned</option>
              {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.name} ({m.role})</option>)}
            </select>
          </label>
          <label>Due date<input type="date" value={f.due_date || ""} disabled={!can("due_date")} required={!editing || full} onChange={(e) => set("due_date", e.target.value)} /></label>
          <label>Due time<input type="time" value={f.due_time || ""} disabled={!can("due_time")} onChange={(e) => set("due_time", e.target.value)} /></label>
          <label>Ticket stage
            <select value={f.ticket_stage} disabled={!can("ticket_stage")} onChange={(e) => onStage(e.target.value)}>
              <option value="">— none —</option>{STAGES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label>Status {stageSet && <span className="hint">(set by ticket stage)</span>}
            <select value={f.status} disabled={!can("status") || stageSet} onChange={(e) => set("status", e.target.value)}>
              {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label>Priority
            <select value={f.priority} disabled={!can("priority")} onChange={(e) => set("priority", e.target.value)}>
              {PRIORITIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label>Ticket ref<input value={f.ticket_ref} disabled={!can("ticket_ref")} maxLength={40} onChange={(e) => set("ticket_ref", e.target.value)} placeholder="e.g. #12345" /></label>
          <label>Module<input value={f.module} disabled={!can("module")} maxLength={60} onChange={(e) => set("module", e.target.value)} /></label>
          <label>Estimate (hours)<input type="number" min="0" step="0.5" value={f.estimate_hrs} disabled={!can("estimate_hrs")} onChange={(e) => set("estimate_hrs", e.target.value)} /></label>
          <label className="inline" style={{ alignSelf: "end" }}>
            <input type="checkbox" checked={f.is_blocked} onChange={(e) => set("is_blocked", e.target.checked)} /> Blocked
          </label>
          {f.is_blocked && <label className="span2">Blocker reason<input value={f.blocker_reason} maxLength={300} onChange={(e) => set("blocker_reason", e.target.value)} /></label>}
          <label className="span2">Notes<textarea value={f.notes} maxLength={5000} onChange={(e) => set("notes", e.target.value)} /></label>
        </div>
        <ErrorText error={error} />
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </Modal>
  );
}
