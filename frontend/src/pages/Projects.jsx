import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import ProjectForm from "../components/ProjectForm";
import { Empty, ErrorText, HealthDot, RoleTag } from "../components/Bits";
import { api } from "../api";
import { accent } from "../constants";
import { useSession } from "../session";

export default function Projects() {
  const { me, signedIn } = useSession();
  const [list, setList] = useState(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [pm, setPm] = useState("");
  const [mineOnly, setMineOnly] = useState(false);
  const nav = useNavigate();
  useEffect(() => { api.get("/projects").then(setList).catch((e) => setError(e.message)); }, [me?.id]);
  // PMs that own at least one project, by id so two people with the same name stay separate.
  const pms = useMemo(() => {
    const seen = new Map();
    (list || []).forEach((p) => { if (p.owner_id && !seen.has(p.owner_id)) seen.set(p.owner_id, p.owner_name || "Unnamed PM"); });
    return [...seen].sort((a, b) => a[1].localeCompare(b[1]));
  }, [list]);
  const shown = (list || []).filter((p) => (!pm || p.owner_id === pm) && (!mineOnly || p.my_role));
  const filtered = Boolean(pm) || mineOnly;
  return (
    <>
      <div className="page-head"><h1>All Projects</h1><span className="grow" />
        {signedIn && <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} style={{ width: "auto" }} /> My projects</label>}
        {pms.length > 1 && <select style={{ width: "auto" }} value={pm} onChange={(e) => setPm(e.target.value)} aria-label="Filter by PM"><option value="">All PMs</option>{pms.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>}
        {signedIn && me?.can_create_project && <button className="btn primary" onClick={() => setCreating(true)}><Plus size={16} /> New project</button>}</div>
      <ErrorText error={error} />
      {list && list.length > 0 && filtered && <p className="small muted">{shown.length} of {list.length} projects</p>}
      {list && list.length > 0 && shown.length === 0 && <div className="card"><Empty>No projects match this filter.</Empty></div>}
      {list && list.length === 0 && <div className="card"><Empty>No projects yet.{me?.can_create_project ? " Create the first one." : " Sign in as a project manager to create one."}</Empty></div>}
      <div className="grid g3">
        {shown.map((p) => (
          <Link key={p.id} to={`/projects/${p.id}`} className="card" style={{ borderTop: `5px solid ${accent(p.name)}`, color: "inherit", textDecoration: "none" }}>
            <div className="row"><h3 className="grow" style={{ fontSize: 16 }}>{p.name}</h3>{p.my_role && <RoleTag role={p.my_role} />}</div>
            <p className="muted" style={{ minHeight: 38 }}>{p.description || "No description"}</p>
            <div className="row"><HealthDot health={p.health} /><span className="small muted">{p.member_count} member{p.member_count === 1 ? "" : "s"} · PM {p.owner_name || "—"}</span></div>
          </Link>
        ))}
      </div>
      {creating && <ProjectForm onClose={() => setCreating(false)} onSaved={(p) => nav(`/projects/${p.id}`)} />}
    </>
  );
}
