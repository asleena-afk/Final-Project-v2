import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { BarChart3, CalendarDays, FolderKanban, History, LayoutDashboard, LogIn, LogOut, NotebookText, Users } from "lucide-react";
import Logo from "./Logo";
import { Avatar } from "./Bits";
import { useSession } from "../session";
import { api } from "../api";
import { accent } from "../constants";

export default function Layout() {
  const { signedIn, me, signOut } = useSession();
  const [projects, setProjects] = useState([]);
  const [agenda, setAgenda] = useState(null);
  const isPm = me?.is_pm;
  const myProjects = signedIn ? projects.filter((project) => project.my_role) : [];

  useEffect(() => { api.get("/projects").then(setProjects).catch(() => {}); }, [signedIn, me?.id]);
  useEffect(() => {
    if (!signedIn) return setAgenda(null);
    api.get("/agenda?scope=mine&days=1").then(setAgenda).catch(() => {});
  }, [signedIn]);
  const dueNow = agenda ? agenda.overdue.length + agenda.due_today.length : 0;
  const link = (to, Icon, label, extra) => (
    <NavLink to={to} className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
      <Icon size={18} /> {label} {extra}
    </NavLink>
  );

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="logo"><Logo /> Task Meeting Tracker</div>
        {link("/", LayoutDashboard, "Dashboard")}
        {link("/calendar", CalendarDays, "Calendar", dueNow > 0 && <span className="nav-badge" title="Due today or overdue">{dueNow}</span>)}
        {link("/projects", FolderKanban, "All Projects")}
        {link("/team", Users, "Team")}
        {isPm && link("/meetings", NotebookText, "Meetings")}
        {signedIn && link("/logs", History, "Logs")}
        {link("/reports", BarChart3, "Reports")}
        <div className="nav-group">My Projects</div>
        {myProjects.map((p) => (
          <NavLink key={p.id} to={`/projects/${p.id}`} className={({ isActive }) => `nav-link sidebar-project-title${isActive ? " active" : ""}`}>
            <span className="nav-dot" style={{ background: accent(p.name) }} /> <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
          </NavLink>
        ))}
        {signedIn && myProjects.length === 0 && <span className="small" style={{ padding: "4px 10px" }}>No projects yet</span>}
        <div className="side-foot">
          {signedIn ? (
            <>
              <NavLink to="/profile" className="row profile-link" title="My profile"><Avatar name={me?.name || "?"} /><div><div style={{ color: "#fff", fontWeight: 600 }}>{me?.name || "Signed in"}</div><div className="small">{isPm ? "Project manager" : "Team member"} · My profile</div></div></NavLink>
              <button className="btn" onClick={signOut}><LogOut size={16} /> Sign out</button>
            </>
          ) : (
            <NavLink to="/login" className="btn"><LogIn size={16} /> Sign in to edit</NavLink>
          )}
        </div>
      </aside>
      <main className="main"><Outlet /></main>
    </div>
  );
}
