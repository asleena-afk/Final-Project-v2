import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import TaskOpener from "../components/TaskOpener";
import { ErrorText } from "../components/Bits";
import { PersonCard } from "./ProjectPage";
import { api } from "../api";
import { useSession } from "../session";

// Everyone on any project with their roles and progress. Read-only here; the PM manages members on each project's Team tab.
export default function Team() {
  const { me } = useSession();
  const [people, setPeople] = useState(null);
  const [projects, setProjects] = useState([]);
  const [pid, setPid] = useState("");
  const [open, setOpen] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { api.get("/projects").then(setProjects).catch(() => {}); }, []);
  useEffect(() => { api.get(`/team${pid ? `?project_id=${pid}` : ""}`).then(setPeople).catch((e) => setError(e.message)); }, [pid, me?.id]);
  const mine = projects.filter((p) => p.my_role === "PM");
  return (
    <>
      <div className="page-head"><h1>Team</h1><span className="sub">Roles, tasks and progress. Only the project manager can change them.</span><span className="grow" />
        <select style={{ width: "auto" }} value={pid} onChange={(e) => setPid(e.target.value)}><option value="">All projects</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      {mine.length > 0 && <div className="banner">To add people or change roles, open your project and use its <b>Team</b> tab: {mine.map((p) => <Link key={p.id} to={`/projects/${p.id}?tab=team`} style={{ marginLeft: 8 }}>{p.name}</Link>)}</div>}
      <ErrorText error={error} />
      <div className="grid g2">{(people || []).map((p) => <PersonCard key={p.user_id} p={p} onOpenTask={setOpen} />)}</div>
      {people && people.length === 0 && <p className="muted">No team members yet.</p>}
      {open && <TaskOpener taskId={open} onClose={() => setOpen(null)} onChanged={() => setPid((x) => x)} />}
    </>
  );
}
