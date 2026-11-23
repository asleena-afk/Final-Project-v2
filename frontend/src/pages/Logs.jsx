import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Avatar, Empty, ErrorText } from "../components/Bits";
import { api, qs } from "../api";
import { STATUS_LABEL } from "../constants";
import { fmtDateTime } from "../util";

const FIELD = { assignee_id: "assignee", due_date: "due date", is_blocked: "blocked flag", blocker_reason: "blocker reason", ticket_stage: "ticket stage", ticket_ref: "ticket ref", estimate_hrs: "estimate", meeting_id: "meeting" };
const show = (f, v) => (v == null || v === "" ? "empty" : f === "status" ? STATUS_LABEL[v] || v : f === "is_blocked" ? (v ? "yes" : "no") : String(v).length > 40 ? `${String(v).slice(0, 40)}…` : String(v));

export function describeChange(h) {
  const what = h.entity_label ? `“${h.entity_label}”` : h.entity;
  const verb = { created: "created", deleted: "moved to trash", restored: "restored", purged: "permanently deleted", member_added: "added to the team", member_removed: "removed from the team", role_changed: "changed the role of" }[h.action];
  if (h.action === "updated") {
    const parts = Object.entries(h.changes || {}).map(([f, v]) => `${FIELD[f] || f}: ${show(f, v?.[0])} → ${show(f, v?.[1])}`);
    return `updated ${h.entity} ${what}${parts.length ? ` (${parts.join("; ")})` : ""}`;
  }
  if (h.action === "role_changed") {
    const r = h.changes?.role;
    return `changed the role of ${what}${r ? ` (${r[0]} → ${r[1]})` : ""}`;
  }
  return `${verb || h.action} ${h.entity === "member" ? "" : h.entity + " "}${what}`.replace("  ", " ");
}

export default function Logs() {
  const [data, setData] = useState({ items: [], total: 0 });
  const [projects, setProjects] = useState([]);
  const [f, setF] = useState({ project_id: "", entity: "", action: "" });
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const size = 25;

  useEffect(() => { api.get("/projects").then((p) => setProjects(p.filter((x) => x.my_role))).catch(() => {}); }, []);
  useEffect(() => {
    api.get(`/logs?${qs({ ...f, page, page_size: size })}`).then(setData).catch((e) => setError(e.message));
  }, [f, page]);
  const set = (k, v) => { setPage(1); setF((p) => ({ ...p, [k]: v })); };
  const pages = Math.max(1, Math.ceil(data.total / size));

  return (
    <>
      <div className="page-head"><h1>Logs</h1><span className="sub">Who created, edited or deleted what, on your projects</span></div>
      <div className="filters">
        <select value={f.project_id} onChange={(e) => set("project_id", e.target.value)}><option value="">All my projects</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <select value={f.entity} onChange={(e) => set("entity", e.target.value)}><option value="">Everything</option><option value="task">Tasks</option><option value="project">Projects</option><option value="member">Team</option></select>
        <select value={f.action} onChange={(e) => set("action", e.target.value)}><option value="">Any action</option>{["created", "updated", "deleted", "restored", "purged", "member_added", "member_removed", "role_changed"].map((a) => <option key={a} value={a}>{a.replace("_", " ")}</option>)}</select>
      </div>
      <ErrorText error={error} />
      <div className="card">
        {data.items.length === 0 ? <Empty>No activity yet.</Empty> : (
          <ul className="timeline" style={{ gap: 14 }}>
            {data.items.map((h) => (
              <li key={h.id} style={{ gridTemplateColumns: "34px 1fr" }}>
                <Avatar name={h.actor_name || "?"} />
                <div><b>{h.actor_name || "Someone"}</b> {describeChange(h)}
                  <div className="small muted">{fmtDateTime(h.created_at)} · <Link to={`/projects/${h.project_id}`}>{h.project_name}</Link></div></div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="pager"><span className="muted">{data.total} entries</span>
        <button className="btn sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button>
        <span>Page {page} of {pages}</span>
        <button className="btn sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button></div>
    </>
  );
}
