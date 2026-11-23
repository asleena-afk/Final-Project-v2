import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Download, FileUp, Plus, Sparkles, Trash2, X } from "lucide-react";
import { ErrorText } from "../components/Bits";
import { api } from "../api";

function NameList({ label, names, onChange }) {
  const set = (i, v) => onChange(names.map((n, j) => (j === i ? v : n)));
  return (
    <div className="name-list"><div className="sec-title">{label}</div>
      {names.map((n, i) => (
        <div className="row" key={i}><input value={n} placeholder="Name" onChange={(e) => set(i, e.target.value)} />
          <button type="button" className="btn sm ghost" aria-label="Remove" onClick={() => onChange(names.filter((_, j) => j !== i))}><X size={14} /></button></div>
      ))}
      <button type="button" className="btn sm" style={{ justifySelf: "start" }} onClick={() => onChange([...names, ""])}><Plus size={14} /> Add name</button>
    </div>
  );
}

export default function MeetingDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const fileRef = useRef(null);
  const [m, setM] = useState(null);
  const [f, setF] = useState(null);
  const [transcript, setTranscript] = useState(null); // null = untouched, the server keeps what it has
  const [showTx, setShowTx] = useState(false);
  const [txChars, setTxChars] = useState(0);
  const [members, setMembers] = useState([]);
  const [picked, setPicked] = useState({});
  const [assign, setAssign] = useState({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const apply = (row) => {
    setM(row); setTxChars(row.transcript_chars || 0);
    setF({ project_id: row.project_id, title: row.title, meeting_date: row.meeting_date || "", meeting_time: row.meeting_time || "", location: row.location || "",
      attendees_internal: row.attendees_internal || [], attendees_client: row.attendees_client || [] });
    api.get(`/projects/${row.project_id}/members`).then(setMembers).catch(() => {});
  };
  useEffect(() => { api.get(`/meetings/${id}`).then(apply).catch((e) => setError(e.message)); }, [id]);

  if (error && !m) return <><ErrorText error={error} /><Link to="/meetings">Back to meetings</Link></>;
  if (!m) return <p className="muted">Loading…</p>;
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const body = () => ({ ...f, meeting_date: f.meeting_date || null, meeting_time: f.meeting_time || null, location: f.location || null, transcript });

  async function run(label, fn) {
    setBusy(label); setError(""); setInfo("");
    try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(""); }
  }
  const save = () => run("save", async () => { apply(await api.put(`/meetings/${id}`, body())); setTranscript(null); setInfo("Saved."); });
  const loadTx = () => run("tx", async () => { if (transcript === null) { const r = await api.get(`/meetings/${id}/transcript`); setTranscript(r.text); } setShowTx(true); });
  const upload = (file) => file && run("upload", async () => {
    const form = new FormData(); form.append("file", file);
    const r = await api.upload("/transcripts/parse", form);
    setTranscript(r.text); setTxChars(r.characters); setShowTx(true); setInfo(`Loaded ${r.characters.toLocaleString()} characters. Press Save to keep it.`);
  });
  const summarize = () => run("sum", async () => {
    apply(await api.put(`/meetings/${id}`, body())); setTranscript(null);
    apply(await api.post(`/meetings/${id}/summarize`)); setInfo("Summary ready.");
  });
  const remove = () => window.confirm("Delete this meeting? Tasks already created from it stay.") && run("del", async () => { await api.del(`/meetings/${id}`); nav("/meetings"); });
  const makeTasks = () => run("tasks", async () => {
    const chosen = Object.entries(picked).filter(([, v]) => v).map(([k]) => k);
    for (const key of chosen) {
      const [title, assignee] = key.split("||");
      await api.post("/tasks", { project_id: m.project_id, meeting_id: m.id, title: title.slice(0, 160), assignee_id: assignee || null });
    }
    setPicked({}); apply(await api.get(`/meetings/${id}`)); setInfo(`${chosen.length} task(s) created.`);
  });

  const actions = (m.summary_rows || []).flatMap((r) => (r.action_items || []).map((a) => ({ text: a, topic: r.topic })))
    .concat((m.next_actions || []).map((a) => ({ text: a, topic: "Next action" })));

  return (
    <>
      <div className="page-head"><h1>{m.title}</h1><span className="sub"><Link to="/meetings">Meetings</Link> · {m.project_name}</span><span className="grow" />
        <button className="btn danger" onClick={remove}><Trash2 size={15} /> Delete</button><button className="btn primary" disabled={busy === "save"} onClick={save}>Save</button></div>
      <ErrorText error={error} />{info && <p className="ok-text">{info}</p>}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-grid">
          <label className="span2">Title<input value={f.title} onChange={(e) => set("title", e.target.value)} /></label>
          <label>Date<input type="date" value={f.meeting_date} onChange={(e) => set("meeting_date", e.target.value)} /></label>
          <label>Time<input value={f.meeting_time} placeholder="e.g. 2.30pm" onChange={(e) => set("meeting_time", e.target.value)} /></label>
          <label className="span2">Location<input value={f.location} onChange={(e) => set("location", e.target.value)} /></label>
          <NameList label="Internal attendees" names={f.attendees_internal} onChange={(v) => set("attendees_internal", v)} />
          <NameList label="Client attendees" names={f.attendees_client} onChange={(v) => set("attendees_client", v)} />
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row wrap"><h2 style={{ margin: 0 }} className="grow">Transcript</h2>
          <input ref={fileRef} type="file" hidden accept=".docx,.vtt,.srt,.txt" onChange={(e) => { upload(e.target.files[0]); e.target.value = ""; }} />
          <button className="btn" onClick={() => fileRef.current.click()} disabled={busy === "upload"}><FileUp size={15} /> Upload file</button>
          <button className="btn primary" disabled={!!busy || !txChars} onClick={summarize}><Sparkles size={15} /> {busy === "sum" ? "Summarising…" : "Summarise with AI"}</button></div>
        {!showTx ? (
          <p className="muted" style={{ marginBottom: 0 }}>{txChars ? `${txChars.toLocaleString()} characters` : "No transcript yet. Upload a .docx, .vtt, .srt or .txt file, or paste text."}{" "}
            <button className="btn sm" onClick={txChars ? loadTx : () => { setTranscript(""); setShowTx(true); }}>{txChars ? "Show transcript" : "Paste text"}</button></p>
        ) : (
          <>
            <textarea style={{ minHeight: 220, marginTop: 10 }} value={transcript ?? ""} onChange={(e) => { setTranscript(e.target.value); setTxChars(e.target.value.length); }} />
            <div className="row" style={{ marginTop: 8 }}><span className="small muted">{(transcript || "").length.toLocaleString()} characters · press Save to keep changes</span><span className="grow" /><button className="btn sm" onClick={() => setShowTx(false)}>Hide transcript</button></div>
          </>
        )}
      </div>

      {m.summary_rows && (
        <div className="card">
          <div className="row"><h2 className="grow" style={{ margin: 0 }}>Summary</h2><button className="btn" onClick={() => api.download(`/meetings/${id}/export`, "meeting-summary.xlsx").catch((e) => setError(e.message))}><Download size={15} /> Download Excel</button></div>
          <div className="table-wrap"><table><thead><tr><th>No.</th><th>Topic</th><th>Details</th><th>Action items</th></tr></thead>
            <tbody>{m.summary_rows.map((r) => <tr key={r.no}><td>{r.no}</td><td><b>{r.topic}</b></td><td style={{ whiteSpace: "pre-wrap" }}>{r.details}</td><td>{(r.action_items || []).map((a, i) => <div key={i}>• {a}</div>)}</td></tr>)}</tbody></table></div>
          {actions.length > 0 && (
            <>
              <h2 style={{ marginTop: 16 }}>Turn action items into tasks</h2>
              {actions.map((a, i) => {
                const key = `${a.text}||${assign[i] || ""}`;
                return (
                  <div key={i} className="row" style={{ marginBottom: 6 }}>
                    <input type="checkbox" checked={!!picked[key]} onChange={(e) => setPicked((p) => ({ ...p, [key]: e.target.checked }))} aria-label={a.text} />
                    <span className="grow">{a.text} <span className="small muted">({a.topic})</span></span>
                    <select style={{ width: 190 }} value={assign[i] || ""} onChange={(e) => { setPicked((p) => { const n = { ...p }; delete n[key]; return n; }); setAssign((s) => ({ ...s, [i]: e.target.value })); }}>
                      <option value="">Unassigned</option>{members.map((x) => <option key={x.user_id} value={x.user_id}>{x.name} ({x.role})</option>)}</select>
                  </div>
                );
              })}
              <button className="btn primary" disabled={busy === "tasks" || !Object.values(picked).some(Boolean)} onClick={makeTasks}>Create selected tasks</button>
            </>
          )}
        </div>
      )}
    </>
  );
}
