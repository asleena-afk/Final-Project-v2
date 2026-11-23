import { useEffect, useState } from "react";
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
  const nav = useNavigate();
  useEffect(() => { api.get("/projects").then(setList).catch((e) => setError(e.message)); }, [me?.id]);
  return (
    <>
      <div className="page-head"><h1>Projects</h1><span className="grow" />
        {signedIn && me?.can_create_project && <button className="btn primary" onClick={() => setCreating(true)}><Plus size={16} /> New project</button>}</div>
      <ErrorText error={error} />
      {list && list.length === 0 && <div className="card"><Empty>No projects yet.{me?.can_create_project ? " Create the first one." : " Sign in as a project manager to create one."}</Empty></div>}
      <div className="grid g3">
        {(list || []).map((p) => (
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
