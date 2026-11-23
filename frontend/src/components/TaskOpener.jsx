import { useEffect, useState } from "react";
import TaskDrawer from "./TaskDrawer";
import TaskForm from "./TaskForm";
import { api } from "../api";

// Opens a task from anywhere (dashboard, calendar, team, project): details drawer, edit form, delete and restore.
export default function TaskOpener({ taskId, onClose, onChanged }) {
  const [edit, setEdit] = useState(null);
  const [members, setMembers] = useState(null);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => { setEdit(null); setMembers(null); }, [taskId]);
  async function startEdit(task) {
    try { setMembers(await api.get(`/projects/${task.project_id}/members`)); setEdit(task); }
    catch (e) { setError(e.message); }
  }
  async function del(task) {
    if (!window.confirm(`Move “${task.title}” to the trash? The project manager can restore it.`)) return;
    try { await api.del(`/tasks/${task.id}`); onChanged?.(); onClose(); } catch (e) { setError(e.message); }
  }
  async function restore(task) {
    try { await api.post(`/tasks/${task.id}/restore`); onChanged?.(); setVersion((v) => v + 1); } catch (e) { setError(e.message); }
  }
  return (
    <>
      <TaskDrawer key={`${taskId}-${version}`} taskId={taskId} onClose={onClose} onEdit={startEdit} onDelete={del} onRestore={restore} />
      {error && <div className="toast" onClick={() => setError("")}>{error}</div>}
      {edit && members && (
        <TaskForm projectId={edit.project_id} members={members} task={edit} onClose={() => setEdit(null)}
          onSaved={() => { setEdit(null); setVersion((v) => v + 1); onChanged?.(); }} />
      )}
    </>
  );
}
