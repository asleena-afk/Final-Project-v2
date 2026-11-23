import { useState } from "react";
import Modal from "./Modal";
import { ErrorText } from "./Bits";
import { api } from "../api";
import { ASSIGNABLE_ROLES } from "../constants";

// PM adds someone by email. The person must have signed up first.
export default function MemberModal({ projectId, onSaved, onClose }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("Dev");
  const [error, setError] = useState("");
  async function save(e) {
    e.preventDefault();
    try { await api.post(`/projects/${projectId}/members`, { email: email.trim(), role }); onSaved(); }
    catch (err) { setError(err.message.includes("not found") ? "No account with that email yet. Ask them to sign up first, then add them." : err.message); }
  }
  return (
    <Modal title="Add team member" onClose={onClose}>
      <form onSubmit={save} className="grid">
        <label>Email they signed up with<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required /></label>
        <label>Role<select value={role} onChange={(e) => setRole(e.target.value)}>{ASSIGNABLE_ROLES.map((r) => <option key={r}>{r}</option>)}</select></label>
        <ErrorText error={error} />
        <div className="modal-actions"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary">Add</button></div>
      </form>
    </Modal>
  );
}
