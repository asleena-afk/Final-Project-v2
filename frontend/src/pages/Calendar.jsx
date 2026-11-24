import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, NotebookText } from "lucide-react";
import TaskOpener from "../components/TaskOpener";
import TaskForm from "../components/TaskForm";
import { Empty, ErrorText, StatusPill } from "../components/Bits";
import { api } from "../api";
import { STATUS_COLOR } from "../constants";
import { useSession } from "../session";
import { fmtDay, todayISO } from "../util";

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function MeetingRow({ m }) {
  return (
    <div className="agenda-item"><span className="bar" style={{ background: "#7c3aed" }} />
      <div><Link to={`/meetings/${m.id}`}><NotebookText size={14} style={{ verticalAlign: -2 }} /> {m.title}</Link>
        <div className="small muted">{m.project_name}{m.meeting_time ? ` · ${m.meeting_time}` : ""}</div></div><span /></div>
  );
}

function TaskRow({ t, onOpen }) {
  return (
    <div className="agenda-item" onClick={() => onOpen(t.id)}><span className="bar" style={{ background: STATUS_COLOR[t.status] }} />
      <div><div style={{ fontWeight: 600 }}>{t.title}</div><div className="small muted">{t.project_name}{t.assignee_name ? ` · ${t.assignee_name}` : ""}</div></div><StatusPill status={t.status} /></div>
  );
}

export default function Calendar() {
  const { signedIn, me } = useSession();
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [view, setView] = useState("monthly");
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [scope, setScope] = useState("mine");
  const [data, setData] = useState({ tasks: [], meetings: [] });
  const [sel, setSel] = useState(todayISO());
  const [open, setOpen] = useState(null);
  const [adding, setAdding] = useState(null);
  const [projectOptions, setProjectOptions] = useState([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [projectMembers, setProjectMembers] = useState([]);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const effective = signedIn ? scope : "all";

  const days = useMemo(() => {
    if (view === "weekly") {
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        return d;
      });
    }
    const first = new Date(month);
    const lead = (first.getDay() + 6) % 7; // Monday first
    const start = new Date(first); start.setDate(1 - lead);
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  }, [month, view, weekStart]);

  useEffect(() => {
    api.get(`/calendar?start=${iso(days[0])}&end=${iso(days[days.length - 1])}&scope=${effective}`).then(setData).catch((e) => setError(e.message));
  }, [days, effective, tick, me?.id]);
  useEffect(() => {
    api.get("/projects").then((projects) => {
      const mine = projects.filter((project) => project.my_role);
      setProjectOptions(mine);
      setSelectedProject((current) => current || mine[0]?.id || "");
    }).catch(() => {});
  }, [me?.id, signedIn]);
  useEffect(() => {
    if (!selectedProject) return setProjectMembers([]);
    api.get(`/projects/${selectedProject}/members`).then(setProjectMembers).catch(() => setProjectMembers([]));
  }, [selectedProject]);

  const [weekData, setWeekData] = useState({ tasks: [], meetings: [] });
  const weekDays = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday of this week
    return Array.from({ length: 7 }, (_, i) => { const x = new Date(d); x.setDate(d.getDate() + i); return iso(x); });
  }, []);
  useEffect(() => {
    api.get(`/calendar?start=${weekDays[0]}&end=${weekDays[6]}&scope=${effective}`).then(setWeekData).catch(() => {});
  }, [weekDays, effective, tick, me?.id]);

  const by = (list, key) => list.reduce((m, x) => { const k = String(x[key]).slice(0, 10); (m[k] ||= []).push(x); return m; }, {});
  const tasksBy = by(data.tasks, "due_date"), meetsBy = by(data.meetings, "meeting_date");
  const weekTasks = by(weekData.tasks, "due_date"), weekMeets = by(weekData.meetings, "meeting_date");
  const today = todayISO();
  const dayTasks = tasksBy[sel] || [], dayMeets = meetsBy[sel] || [];
  const move = (n) => {
    if (view === "weekly") {
      setWeekStart((current) => {
        const next = new Date(current);
        next.setDate(current.getDate() + (n * 7));
        return next;
      });
    } else {
      setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
    }
  };
  const goToday = () => {
    const d = new Date();
    setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    d.setHours(0, 0, 0, 0);
    setWeekStart(d);
    setSel(todayISO());
  };

  return (
    <>
      <div className="page-head"><h1>Calendar</h1><span className="sub">Task deadlines{me?.is_pm ? " and your meetings" : ""}</span><span className="grow" />
        <select style={{ width: "auto" }} value={view} onChange={(e) => setView(e.target.value)} aria-label="Calendar view"><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select>
        {signedIn && <select style={{ width: "auto" }} value={scope} onChange={(e) => setScope(e.target.value)}><option value="mine">My tasks</option><option value="all">Everyone's tasks</option></select>}</div>
      <ErrorText error={error} />
      <div className="grid g-side">
        <div className="card">
          <div className="row" style={{ marginBottom: 10 }}>
            <button className="btn sm" onClick={() => move(-1)} aria-label={`Previous ${view === "weekly" ? "week" : "month"}`}><ChevronLeft size={16} /></button>
            <h2 className="grow right" style={{ margin: 0, textAlign: "center" }}>
              {view === "weekly"
                ? `${days[0].toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${days[6].toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
                : month.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
            </h2>
            <button className="btn sm" onClick={() => move(1)} aria-label={`Next ${view === "weekly" ? "week" : "month"}`}><ChevronRight size={16} /></button>
            <button className="btn sm" onClick={goToday}>Today</button>
          </div>
          <div className="cal">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="cal-h">{d}</div>)}
            {days.map((d) => {
              const k = iso(d), ts = tasksBy[k] || [], ms = meetsBy[k] || [];
              return (
                <div key={k} className={`cal-day${view === "weekly" ? " cal-day-week" : ""}${view === "monthly" && d.getMonth() !== month.getMonth() ? " out" : ""}${k === today ? " today" : ""}${k === sel ? " sel" : ""}`} onClick={() => setSel(k)}>
                  <div className="calendar-day-head">
                    <div className="d">{d.getDate()}</div>
                    {signedIn && projectOptions.length > 0 && (
                      <button
                        type="button"
                        className="calendar-add-task"
                        title={`Add task on ${k}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSel(k);
                          setAdding({ date: k, time: "09:00" });
                        }}
                      >+</button>
                    )}
                  </div>
                  {ms.map((m) => <span key={m.id} className="chip cal-event-full" style={{ background: "#7c3aed" }}>{m.title}{m.meeting_time ? ` · ${m.meeting_time}` : ""}</span>)}
                  {ts.map((t) => <span key={t.id} className="chip cal-event-full" style={{ background: STATUS_COLOR[t.status] }}>{t.due_time ? `${t.due_time} · ` : ""}{t.title}{t.assignee_name ? ` · ${t.assignee_name}` : ""}</span>)}
                </div>
              );
            })}
          </div>
        </div>
        <div className="card side-split">
          <div className="half">
            <h2>{fmtDay(sel)}{sel === today && " · Today"}</h2>
            {dayTasks.length + dayMeets.length === 0 && <Empty>Nothing scheduled.</Empty>}
            {dayMeets.map((m) => <MeetingRow key={m.id} m={m} />)}
            {dayTasks.map((t) => <TaskRow key={t.id} t={t} onOpen={setOpen} />)}
          </div>
          <div className="half">
            <h2>This week <span className="small muted">{fmtDay(weekDays[0])} – {fmtDay(weekDays[6])}</span></h2>
            {weekDays.every((k) => !(weekTasks[k] || []).length && !(weekMeets[k] || []).length) && <Empty>Nothing due this week.</Empty>}
            {weekDays.map((k) => {
              const ts = weekTasks[k] || [], ms = weekMeets[k] || [];
              if (!ts.length && !ms.length) return null;
              return (
                <div key={k}>
                  <div className={`sec-title${k === today ? " today-title" : ""}`} onClick={() => setSel(k)} style={{ cursor: "pointer" }}>{fmtDay(k)}{k === today && " · Today"}</div>
                  {ms.map((m) => <MeetingRow key={m.id} m={m} />)}
                  {ts.map((t) => <TaskRow key={t.id} t={t} onOpen={setOpen} />)}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {open && <TaskOpener taskId={open} onClose={() => setOpen(null)} onChanged={() => setTick((t) => t + 1)} />}
      {adding && selectedProject && (
        <TaskForm
          projectId={selectedProject}
          members={projectMembers}
          initial={{ due_date: adding.date, due_time: adding.time }}
          projectOptions={projectOptions}
          onProjectChange={setSelectedProject}
          onClose={() => setAdding(null)}
          onSaved={() => { setAdding(null); setTick((tickValue) => tickValue + 1); }}
        />
      )}
    </>
  );
}
