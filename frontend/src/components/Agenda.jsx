import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarClock, NotebookText } from "lucide-react";
import { Empty } from "./Bits";
import { api, subscribeTaskChanges } from "../api";
import { useSession } from "../session";
import { STATUS_COLOR } from "../constants";
import { fmtDay } from "../util";

function Item({ t, onOpen }) {
  return (
    <div className="agenda-item" onClick={() => onOpen(t.id)} role="button">
      <span className="bar" style={{ background: STATUS_COLOR[t.status] }} />
      <div><div style={{ fontWeight: 600 }}>{t.title}{t.is_blocked && <span className="pill blocked" style={{ marginLeft: 6 }}>Blocked</span>}</div>
        <div className="small muted">{t.project_name}{t.assignee_name ? ` · ${t.assignee_name}` : ""}</div></div>
      <span className="small muted">{fmtDay(t.due_date)}</span>
    </div>
  );
}

// The "Today" card: my overdue, due-today and upcoming tasks (everyone's when not signed in). Click a task to open it.
export default function Agenda({ onOpen, days = 14, scope = "all" }) {
  const { signedIn } = useSession();
  const [a, setA] = useState(null);
  const effective = !signedIn ? "all" : scope === "my_tasks" ? "mine" : scope;
  useEffect(() => {
    const load = () => api.get(`/agenda?scope=${effective}&days=${days}`).then(setA).catch(() => setA(null));
    load();
    const unsubscribe = subscribeTaskChanges(load);
    return unsubscribe;
  }, [effective, days]);
  if (!a) return <div className="card"><h2>Today</h2><Empty>Loading…</Empty></div>;
  const none = !a.overdue.length && !a.due_today.length && !a.upcoming.length;
  return (
    <div className="card">
      <div className="row"><h2 className="grow" style={{ margin: 0 }}><CalendarClock size={16} style={{ verticalAlign: -3 }} /> {effective === "mine" ? "My day" : "Today"} · {fmtDay(a.today)}</h2></div>
      {none && <Empty>Nothing due in the next {days} days.</Empty>}
      {a.overdue.length > 0 && <><div className="sec-title err"><AlertTriangle size={15} /> Overdue ({a.overdue.length})</div>{a.overdue.map((t) => <Item key={t.id} t={t} onOpen={onOpen} />)}</>}
      {a.due_today.length > 0 && <><div className="sec-title">Due today ({a.due_today.length})</div>{a.due_today.map((t) => <Item key={t.id} t={t} onOpen={onOpen} />)}</>}
      {a.upcoming.length > 0 && <><div className="sec-title">Coming up</div>{a.upcoming.slice(0, 6).map((t) => <Item key={t.id} t={t} onOpen={onOpen} />)}</>}
      {a.meetings?.length > 0 && <><div className="sec-title"><NotebookText size={15} /> Meetings</div>{a.meetings.map((m) => <div key={m.id} className="agenda-item"><span className="bar" style={{ background: "#7c3aed" }} /><Link to={`/meetings/${m.id}`}>{m.title}</Link><span className="small muted">{fmtDay(m.meeting_date)}</span></div>)}</>}
      <div style={{ marginTop: 10 }}><Link to="/calendar" className="small">Open calendar →</Link></div>
    </div>
  );
}
