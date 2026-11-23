import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, NotebookText } from "lucide-react";
import TaskOpener from "../components/TaskOpener";
import { Empty, ErrorText, StatusPill } from "../components/Bits";
import { api } from "../api";
import { STATUS_COLOR } from "../constants";
import { useSession } from "../session";
import { fmtDay, todayISO } from "../util";

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function Calendar() {
  const { signedIn, me } = useSession();
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [scope, setScope] = useState("mine");
  const [data, setData] = useState({ tasks: [], meetings: [] });
  const [sel, setSel] = useState(todayISO());
  const [open, setOpen] = useState(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const effective = signedIn ? scope : "all";

  const days = useMemo(() => {
    const first = new Date(month);
    const lead = (first.getDay() + 6) % 7; // Monday first
    const start = new Date(first); start.setDate(1 - lead);
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  }, [month]);

  useEffect(() => {
    api.get(`/calendar?start=${iso(days[0])}&end=${iso(days[41])}&scope=${effective}`).then(setData).catch((e) => setError(e.message));
  }, [days, effective, tick, me?.id]);

  const by = (list, key) => list.reduce((m, x) => { const k = String(x[key]).slice(0, 10); (m[k] ||= []).push(x); return m; }, {});
  const tasksBy = by(data.tasks, "due_date"), meetsBy = by(data.meetings, "meeting_date");
  const today = todayISO();
  const dayTasks = tasksBy[sel] || [], dayMeets = meetsBy[sel] || [];
  const move = (n) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));

  return (
    <>
      <div className="page-head"><h1>Calendar</h1><span className="sub">Task deadlines{me?.is_pm ? " and your meetings" : ""}</span><span className="grow" />
        {signedIn && <select style={{ width: "auto" }} value={scope} onChange={(e) => setScope(e.target.value)}><option value="mine">My tasks</option><option value="all">Everyone's tasks</option></select>}</div>
      <ErrorText error={error} />
      <div className="grid g-side">
        <div className="card">
          <div className="row" style={{ marginBottom: 10 }}>
            <button className="btn sm" onClick={() => move(-1)} aria-label="Previous month"><ChevronLeft size={16} /></button>
            <h2 className="grow right" style={{ margin: 0, textAlign: "center" }}>{month.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</h2>
            <button className="btn sm" onClick={() => move(1)} aria-label="Next month"><ChevronRight size={16} /></button>
            <button className="btn sm" onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); setSel(today); }}>Today</button>
          </div>
          <div className="cal">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="cal-h">{d}</div>)}
            {days.map((d) => {
              const k = iso(d), ts = tasksBy[k] || [], ms = meetsBy[k] || [];
              return (
                <div key={k} className={`cal-day${d.getMonth() !== month.getMonth() ? " out" : ""}${k === today ? " today" : ""}${k === sel ? " sel" : ""}`} onClick={() => setSel(k)}>
                  <div className="d">{d.getDate()}</div>
                  {ms.slice(0, 1).map((m) => <span key={m.id} className="chip" style={{ background: "#7c3aed" }}>{m.title}</span>)}
                  {ts.slice(0, 2).map((t) => <span key={t.id} className="chip" style={{ background: STATUS_COLOR[t.status] }}>{t.title}</span>)}
                  {ts.length + ms.length > 3 && <span className="small muted">+{ts.length + ms.length - 3} more</span>}
                </div>
              );
            })}
          </div>
        </div>
        <div className="card">
          <h2>{fmtDay(sel)}{sel === today && " · Today"}</h2>
          {dayTasks.length + dayMeets.length === 0 && <Empty>Nothing scheduled.</Empty>}
          {dayMeets.map((m) => <div key={m.id} className="agenda-item"><span className="bar" style={{ background: "#7c3aed" }} /><div><Link to={`/meetings/${m.id}`}><NotebookText size={14} style={{ verticalAlign: -2 }} /> {m.title}</Link><div className="small muted">{m.project_name}{m.meeting_time ? ` · ${m.meeting_time}` : ""}</div></div><span /></div>)}
          {dayTasks.map((t) => (
            <div key={t.id} className="agenda-item" onClick={() => setOpen(t.id)}><span className="bar" style={{ background: STATUS_COLOR[t.status] }} />
              <div><div style={{ fontWeight: 600 }}>{t.title}</div><div className="small muted">{t.project_name}{t.assignee_name ? ` · ${t.assignee_name}` : ""}</div></div><StatusPill status={t.status} /></div>
          ))}
        </div>
      </div>
      {open && <TaskOpener taskId={open} onClose={() => setOpen(null)} onChanged={() => setTick((t) => t + 1)} />}
    </>
  );
}
