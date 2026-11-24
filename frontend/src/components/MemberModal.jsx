import { useState } from "react";
import Modal from "./Modal";
import { ErrorText } from "./Bits";
import { api } from "../api";
import { ASSIGNABLE_ROLES } from "../constants";

// PM can add an existing user or invite a new email address.
export default function MemberModal({ projectId, projects, onSaved, onClose }) {
  const [selectedProjectId, setSelectedProjectId] = useState(projectId || "");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("Dev");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  async function save(e) {
    e.preventDefault();
    if (!selectedProjectId) {
      setError("Select a project");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await api.post(`/projects/${selectedProjectId}/members`, { email: email.trim(), role });
      setResult({ ...response, email: email.trim(), role });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  if (result) {
    const title = result.pending
      ? (result.email_sent ? "Invitation sent" : "Invitation pending")
      : "Member added";
    return (
      <Modal title={title} onClose={onSaved}>
        <p>
          {result.pending
            ? result.email_sent
              ? <>We emailed an invitation to <b>{result.email}</b>. They will join this project as <b>{result.role}</b> when they sign in.</>
              : <><b>{result.email}</b> already has an account, so no email was needed. They will join this project as <b>{result.role}</b> when they sign in.</>
            : <><b>{result.name || result.email}</b> was added to this project as <b>{result.role}</b>.</>}
        </p>
        <div className="modal-actions"><button className="btn primary" onClick={onSaved}>Done</button></div>
      </Modal>
    );
  }
  return (
    <Modal title="Add team member" onClose={onClose}>
      <form onSubmit={save} className="grid">
        <label>Project
          <select value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value)} required>
            <option value="">Select a project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
        </label>
        <label>Email address<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required /></label>
        <label>Role<select value={role} onChange={(e) => setRole(e.target.value)}>{ASSIGNABLE_ROLES.map((r) => <option key={r}>{r}</option>)}</select></label>
        <p className="small muted" style={{ margin: 0 }}>Existing users are added right away. New email addresses receive an invitation.</p>
        <ErrorText error={error} />
        <div className="modal-actions"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? "Please wait…" : "Add / invite"}</button></div>
      </form>
    </Modal>
  );
}
