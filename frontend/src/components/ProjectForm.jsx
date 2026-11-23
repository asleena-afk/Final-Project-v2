import { useState } from "react";
import Modal from "./Modal";
import { ErrorText } from "./Bits";
import { api } from "../api";
import { HEALTHS, PROJECT_STATUSES } from "../constants";

export default function ProjectForm({ project, onSaved, onClose }) {
  const [f, setF] = useState({ name: "", description: "", status: "active", health: "green", health_note: "", ...(project || {}) });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  async function save(e) {
    e.preventDefault();
    if (!f.name.trim()) return setError("Name is required");
    setBusy(true);
    const body = { name: f.name, description: f.description || "", status: f.status, health: f.health, health_note: f.health_note || null };
    try { onSaved(project ? await api.put(`/projects/${project.id}`, body) : await api.post("/projects", body)); }
    catch (err) { setError(err.message); setBusy(false); }
  }
  return (
    <Modal title={project ? "Edit project" : "New project"} onClose={onClose}>
      <form onSubmit={save} className="form-grid">
        <label className="span2">Name<input value={f.name} maxLength={120} onChange={(e) => set("name", e.target.value)} autoFocus /></label>
        <label className="span2">Description<textarea value={f.description || ""} onChange={(e) => set("description", e.target.value)} /></label>
        <label>Status<select value={f.status} onChange={(e) => set("status", e.target.value)}>{PROJECT_STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label>Health (you set this)<select value={f.health} onChange={(e) => set("health", e.target.value)}>{HEALTHS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="span2">Health note<input value={f.health_note || ""} maxLength={300} onChange={(e) => set("health_note", e.target.value)} /></label>
        <div className="span2"><ErrorText error={error} /></div>
        <div className="modal-actions span2" style={{ marginTop: 0 }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy}>Save</button>
        </div>
      </form>
    </Modal>
  );
}
