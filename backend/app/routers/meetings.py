"""Meetings and transcripts are private to the project manager (the project owner)."""
import io

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import StreamingResponse
from psycopg.types.json import Jsonb
from app.auth import User, require_user
from app.db import get_db
from app.permissions import as_uuid, require_pm
from app.schemas.meeting import MeetingIn
from app.services import excel, summarizer

router = APIRouter(prefix="/meetings", tags=["meetings"])

# Everything except the transcript itself: the editor shows a character count and loads the text on request.
LIGHT = ("m.id, m.project_id, p.name as project_name, m.title, m.meeting_date, m.meeting_time, m.location, "
         "m.attendees_internal, m.attendees_client, m.summary_rows, m.next_actions, m.created_at, m.updated_at, "
         "char_length(m.transcript) as transcript_chars, (m.summary_rows is not null) as summarised, "
         "(select count(*) from tasks t where t.meeting_id=m.id and t.deleted_at is null) as tasks_created")


def _json(v, rows=False):
    if v is None:
        return None
    return Jsonb([r.model_dump() for r in v] if rows else v)


def _owned(db, mid, user: User, light=True) -> dict:
    row = db.execute(
        f"select {LIGHT if light else 'm.*'}, p.owner_id from meetings m join projects p on p.id=m.project_id "
        "where m.id=%s", (as_uuid(mid, "Meeting"),)).fetchone()
    if row is None:
        raise HTTPException(404, "Meeting not found")
    if str(row["owner_id"]) != user.id:
        raise HTTPException(403, "Meetings are private to the project manager")
    row.pop("owner_id", None)
    row["assigned_action_items"] = [
        {
            "title": task["title"],
            "assignee_id": str(task["assignee_id"]),
            "assignee_name": task["assignee_name"],
        }
        for task in db.execute(
            "select t.title, t.assignee_id, p.name as assignee_name "
            "from tasks t left join profiles p on p.id=t.assignee_id "
            "where t.meeting_id=%s and t.assignee_id is not null order by t.created_at",
            (row["id"],),
        ).fetchall()
    ]
    return row


@router.get("")
def list_meetings(project_id: str | None = None, user: User = Depends(require_user), db=Depends(get_db)):
    sql = (f"select {LIGHT} from meetings m join projects p on p.id=m.project_id where p.owner_id=%s")
    args = [user.id]
    if project_id:
        sql += " and m.project_id=%s"; args.append(as_uuid(project_id, "Project"))
    return db.execute(sql + " order by m.meeting_date desc nulls last, m.created_at desc", args).fetchall()


@router.post("", status_code=201)
def create_meeting(body: MeetingIn, user: User = Depends(require_user), db=Depends(get_db)):
    require_pm(db, body.project_id, user)
    row = db.execute(
        "insert into meetings (project_id,created_by,title,meeting_date,meeting_time,location,attendees_internal,"
        "attendees_client,transcript,summary_rows,next_actions) values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) returning id",
        (body.project_id, user.id, body.title, body.meeting_date, body.meeting_time, body.location,
         body.attendees_internal, body.attendees_client, body.transcript or "",
         _json(body.summary_rows, True), _json(body.next_actions)),
    ).fetchone()
    return _owned(db, row["id"], user)


@router.get("/{mid}")
def get_meeting(mid: str, user: User = Depends(require_user), db=Depends(get_db)):
    return _owned(db, mid, user)


@router.get("/{mid}/transcript")
def get_transcript(mid: str, user: User = Depends(require_user), db=Depends(get_db)):
    meeting = _owned(db, mid, user)
    text = db.execute("select transcript from meetings where id=%s", (meeting["id"],)).fetchone()["transcript"]
    return {"text": text, "characters": len(text)}


@router.put("/{mid}")
def update_meeting(mid: str, body: MeetingIn, user: User = Depends(require_user), db=Depends(get_db)):
    """Fields left out (transcript, summary_rows, next_actions) are kept as they are."""
    meeting = _owned(db, mid, user)
    require_pm(db, body.project_id, user)
    db.execute(
        "update meetings set project_id=%s,title=%s,meeting_date=%s,meeting_time=%s,location=%s,"
        "attendees_internal=%s,attendees_client=%s,transcript=coalesce(%s,transcript),"
        "summary_rows=coalesce(%s,summary_rows),next_actions=coalesce(%s,next_actions),updated_at=now() where id=%s",
        (body.project_id, body.title, body.meeting_date, body.meeting_time, body.location,
         body.attendees_internal, body.attendees_client, body.transcript,
         _json(body.summary_rows, True), _json(body.next_actions), meeting["id"]),
    )
    return _owned(db, meeting["id"], user)


@router.delete("/{mid}", status_code=204)
def delete_meeting(mid: str, user: User = Depends(require_user), db=Depends(get_db)):
    meeting = _owned(db, mid, user)
    db.execute("delete from meetings where id=%s", (meeting["id"],))  # tasks stay; meeting_id becomes null
    return Response(status_code=204)


@router.post("/{mid}/summarize")
def summarize(mid: str, user: User = Depends(require_user), db=Depends(get_db)):
    meeting = _owned(db, mid, user)
    text = db.execute("select transcript from meetings where id=%s", (meeting["id"],)).fetchone()["transcript"]
    if not text.strip():
        raise HTTPException(422, "Add a transcript first")
    try:
        result = summarizer.summarize(text)
    except summarizer.AIBusy:
        raise HTTPException(503, "AI is busy, try again")
    except summarizer.AIBadOutput:
        raise HTTPException(502, "AI returned something unreadable, try again")
    db.execute("update meetings set summary_rows=%s,next_actions=%s,updated_at=now() where id=%s",
               (_json(result.rows, True), Jsonb(result.next_actions), meeting["id"]))
    return _owned(db, meeting["id"], user)


@router.get("/{mid}/export")
def export(mid: str, user: User = Depends(require_user), db=Depends(get_db)):
    m = _owned(db, mid, user)
    if m["summary_rows"] is None:
        raise HTTPException(409, "Summarize first")
    return StreamingResponse(
        io.BytesIO(excel.build_mom(m)),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="meeting-summary.xlsx"'},
    )
