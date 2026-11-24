import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDownUp, Mail, Plus } from "lucide-react";
import TaskOpener from "../components/TaskOpener";
import MemberModal from "../components/MemberModal";
import { Avatar, ErrorText, Progress, RoleTag } from "../components/Bits";
import { api } from "../api";
import { useSession } from "../session";
import { fmtDate } from "../util";

// Everyone on any project with their roles and progress. PMs can add members here and manage roles on each project's Team tab.
export default function Team() {
  const { me } = useSession();
  const [people, setPeople] = useState(null);
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [pid, setPid] = useState("");
  const [memberId, setMemberId] = useState("");
  const [open, setOpen] = useState(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [sort, setSort] = useState({ by: "project", desc: false });
  const [addingMember, setAddingMember] = useState(false);
  useEffect(() => { api.get("/projects").then(setProjects).catch(() => {}); }, []);
  useEffect(() => {
    api.get(`/team${pid ? `?project_id=${pid}` : ""}`).then(setPeople).catch((e) => setError(e.message));
  }, [pid, me?.id]);
  useEffect(() => {
    api.get("/tasks?page_size=500").then((data) => setTasks(data.items || [])).catch((e) => setError(e.message));
  }, []);
  const visibleProjects = pid ? projects.filter((project) => project.id === pid) : projects;
  const managedProjects = projects.filter((project) => project.my_role === "PM");

  const projectRows = visibleProjects.flatMap((project) =>
    (people || []).flatMap((person) => {
      if (memberId && person.user_id !== memberId) return [];
      const membership = person.roles.find((role) => role.project_id === project.id);
      if (!membership) return [];
      const projectTasks = tasks.filter((task) =>
        task.project_id === project.id && task.assignee_id === person.user_id
      );
      const done = projectTasks.filter((task) => task.status === "done").length;
      const inProgress = projectTasks.filter((task) => task.status === "in_progress").length;
      const pendingReview = projectTasks.filter((task) => task.status === "pending_review").length;
      const total = projectTasks.length;
      return [{
        project,
        person,
        role: membership.role,
        projectTasks,
        total,
        done,
        inProgress,
        pendingReview,
        progress: total ? Math.round(done * 100 / total) : 0,
      }];
    })
  );

  const sortedProjectRows = [...projectRows].sort((a, b) => {
    const text = (value) => String(value ?? "").toLowerCase();
    const values = {
      project: [text(a.project.name), text(b.project.name)],
      member: [text(a.person.name), text(b.person.name)],
      role: [text(a.role), text(b.role)],
      tasks: [a.total, b.total],
      due_date: [
        a.projectTasks.length ? a.projectTasks.map((task) => task.due_date || "").sort()[0] : "",
        b.projectTasks.length ? b.projectTasks.map((task) => task.due_date || "").sort()[0] : "",
      ],
      progress: [a.progress, b.progress],
    };
    const [left, right] = values[sort.by];
    const comparison = typeof left === "number"
      ? left - right
      : left.localeCompare(right);
    return sort.desc ? -comparison : comparison;
  });

  const sortHeader = (by, label) => (
    <th
      className="sort"
      onClick={() => setSort((current) => ({
        by,
        desc: current.by === by ? !current.desc : false,
      }))}
    >
      {label} {sort.by === by && <ArrowDownUp size={12} />}
    </th>
  );

  const sendMessage = (person) => {
    setInfo(`Chat with ${person.name} is coming soon.`);
  };

  return (
    <>
      <div className="page-head"><h1>Team</h1><span className="sub">Roles, tasks and progress. Only the project manager can change them.</span><span className="grow" />
        <select
          style={{ width: "auto" }}
          value={pid}
          onChange={(e) => {
            const nextPid = e.target.value;
            setPid(nextPid);
            if (!nextPid) setMemberId("");
          }}
        >
          <option value="">All Projects</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <ErrorText error={error} />
      {info && <p className="ok-text">{info}</p>}

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="row" style={{ marginBottom: 12 }}>
            <h2 className="grow" style={{ margin: 0 }}>Team members</h2>
            {me?.is_pm && (
              <button
                className="btn primary"
                disabled={!managedProjects.length}
                onClick={() => setAddingMember(true)}
              >
                <Plus size={15} /> Add member
              </button>
            )}
          </div>
          {(people || []).length === 0 ? (
            <p className="muted" style={{ marginBottom: 0 }}>No team members yet.</p>
          ) : (
            <div className="row wrap" style={{ gap: 12 }}>
              {(people || []).map((person) => (
                <div key={person.user_id} className="team-member-card">
                  <Avatar name={person.name} large />
                  <button
                    type="button"
                    className="tasktitle"
                    style={{ border: 0, background: "none", padding: 0, fontWeight: 700 }}
                    onClick={() => setMemberId(person.user_id)}
                  >
                    {person.name}
                  </button>
                  <button
                    className="btn sm"
                    title={`Message ${person.name}`}
                    onClick={() => sendMessage(person)}
                  >
                    <Mail size={14} /> Send message
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card table-wrap">
          <div className="row" style={{ marginBottom: 12 }}>
            <h2 className="grow" style={{ margin: 0 }}>Project team and progress</h2>
            {memberId && (
              <button className="btn sm" onClick={() => setMemberId("")}>Show all members</button>
            )}
          </div>
          {projectRows.length === 0 ? (
            <p className="muted" style={{ marginBottom: 0 }}>No project team members match this view.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  {sortHeader("project", "Project")}
                  {sortHeader("member", "Team member")}
                  {sortHeader("role", "Role")}
                  {sortHeader("tasks", "Tasks")}
                  {sortHeader("due_date", "Due date")}
                  {sortHeader("progress", "Progress")}
                </tr>
              </thead>
              <tbody>
                {sortedProjectRows.map(({ project, person, role, projectTasks, total, done, inProgress, pendingReview, progress }) => (
                  <tr key={`${project.id}-${person.user_id}`}>
                    <td><Link to={`/projects/${project.id}`}>{project.name}</Link></td>
                    <td>
                      <div className="team-member-table-name">
                        <Avatar name={person.name} />
                        <button
                          type="button"
                          className="tasktitle"
                          style={{ border: 0, background: "none", padding: 0, fontWeight: 400 }}
                          onClick={() => setMemberId(person.user_id)}
                        >
                          {person.name}
                        </button>
                      </div>
                    </td>
                    <td><RoleTag role={role} /></td>
                    <td>
                      {total === 0 ? (
                        "No tasks"
                      ) : (
                        <div style={{ display: "grid", gap: 4 }}>
                          {projectTasks.map((task) => (
                            <button
                              key={task.id}
                              type="button"
                              className="team-task-title"
                              onClick={() => setOpen(task.id)}
                            >
                              <span className="team-task-number">-</span>
                              <span>{task.title}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                    <td>
                      {total === 0 ? (
                        "—"
                      ) : (
                        <div style={{ display: "grid", gap: 4 }}>
                          {projectTasks.map((task) => (
                            <button
                              key={task.id}
                              type="button"
                              className="team-task-due"
                              onClick={() => setOpen(task.id)}
                            >
                              {fmtDate(task.due_date)}
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={{ minWidth: 180 }}>
                      <div className="row" style={{ gap: 8 }}>
                        <div className="grow"><Progress done={done} in_progress={inProgress} pending_review={pendingReview} total={total} /></div>
                        <span className="small" style={{ width: 38, textAlign: "right" }}>{progress}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      {open && <TaskOpener taskId={open} onClose={() => setOpen(null)} onChanged={() => setPid((x) => x)} />}
        {addingMember && (
          <MemberModal
            projectId={managedProjects.some((project) => project.id === pid) ? pid : ""}
            projects={managedProjects}
            onClose={() => setAddingMember(false)}
            onSaved={() => {
              setAddingMember(false);
              api.get(`/team${pid ? `?project_id=${pid}` : ""}`)
                .then(setPeople)
                .catch((e) => setError(e.message));
            }}
          />
        )}
    </>
  );
}
