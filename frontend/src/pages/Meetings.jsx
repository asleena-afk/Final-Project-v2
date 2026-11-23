import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import Modal from "../components/Modal";
import { Empty, ErrorText } from "../components/Bits";
import { api } from "../api";
import { fmtDate } from "../util";

export default function Meetings() {
  const nav = useNavigate();
  const [list, setList] = useState(null);
  const [projects, setProjects] = useState([]);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [pid, setPid] = useState("");
  const [title, setTitle] = useState("");
  useEffect(() => {
    api.get("/meetings").then(setList).catch((e) => setError(e.message));
    api.get("/projects").then((p) => { const mine = p.filter((x) => x.my_role === "PM"); setProjects(mine); setPid(mine[0]?.id || ""); }).catch(() => {});
  }, []);
  async function create(e) {
    e.preventDefault();
    try { const m = await api.post("/meetings", { project_id: pid, title }); nav(`/meetings/${m.id}`); } catch (err) { setError(err.message); }
  }
  return (
    <>
      <div className="page-head"><h1>Meetings</h1><span className="sub">Private to you as project manager</span><span className="grow" />
        <button className="btn primary" disabled={!projects.length} onClick={() => setCreating(true)}><Plus size={16} /> New meeting</button></div>
      <ErrorText error={error} />
      <div className="card table-wrap">
        {list && list.length === 0 ? <Empty>No meetings yet.</Empty> : (
          <table><thead><tr><th>Meeting</th><th>Project</th><th>Date</th><th>Transcript</th><th>Summary</th><th>Tasks</th></tr></thead>
            <tbody>{(list || []).map((m) => (
              <tr key={m.id}><td><Link to={`/meetings/${m.id}`}><b>{m.title}</b></Link></td><td>{m.project_name}</td><td>{fmtDate(m.meeting_date)}</td>
                <td>{m.transcript_chars ? `${m.transcript_chars.toLocaleString()} chars` : "—"}</td><td>{m.summarised ? "Ready" : "—"}</td><td>{m.tasks_created}</td></tr>))}</tbody></table>
        )}
      </div>
      {creating && (
        <Modal title="New meeting" onClose={() => setCreating(false)}>
          <form onSubmit={create} className="grid">
            <label>Project<select value={pid} onChange={(e) => setPid(e.target.value)}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label>Title<input value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus /></label>
            <div className="modal-actions"><button type="button" className="btn" onClick={() => setCreating(false)}>Cancel</button><button className="btn primary">Create</button></div>
          </form>
        </Modal>
      )}
    </>
  );
}
