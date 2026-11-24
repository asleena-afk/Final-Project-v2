"""Calendar and 'my day' agenda. Built from task due dates and meeting dates, so there is nothing extra to store."""
import re
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from app.auth import User, optional_user
from app.db import get_db

router = APIRouter(tags=["calendar"])

TASK_ITEM = """
select t.id, t.project_id, p.name as project_name, t.title, t.due_date, t.due_time, t.status, t.priority, t.is_blocked,
       t.assignee_id, a.name as assignee_name, t.ticket_ref
from tasks t
join projects p on p.id = t.project_id
left join profiles a on a.id = t.assignee_id
where t.deleted_at is null and t.due_date is not null
"""


def _mark(rows, user: User | None):
    for r in rows:
        r["type"] = "task"
        r["is_mine"] = user is not None and r["assignee_id"] is not None and str(r["assignee_id"]) == user.id
    return rows


def _start_minutes(text: str | None) -> int:
    """Minutes since midnight for the start of "2.30pm - 3.30pm" (or "2.30pm"). Unreadable or empty sorts last."""
    m = re.match(r"\s*(\d{1,2})(?:[.:](\d{2}))?\s*([ap]m)", (text or "").lower())
    if not m:
        return 24 * 60
    h, mm, ap = int(m.group(1)) % 12, int(m.group(2) or 0), m.group(3)
    return (h + (12 if ap == "pm" else 0)) * 60 + mm


def _meetings(db, user: User | None, start: date, end: date):
    """Meetings are private to the PM, so only a PM gets them, and only for projects they own."""
    if user is None:
        return []
    rows = db.execute(
        "select m.id, m.project_id, p.name as project_name, m.title, m.meeting_date, m.meeting_time "
        "from meetings m join projects p on p.id=m.project_id "
        "where p.owner_id=%s and m.meeting_date between %s and %s order by m.meeting_date, m.meeting_time",
        (user.id, start, end)).fetchall()
    for r in rows:
        r["type"] = "meeting"
    rows.sort(key=lambda r: (r["meeting_date"], _start_minutes(r.get("meeting_time"))))
    return rows


@router.get("/calendar")
def calendar(
    start: date,
    end: date,
    scope: Literal["mine", "all"] = "all",
    user: User | None = Depends(optional_user),
    db=Depends(get_db),
):
    """Tasks due, and (for a PM) meetings held, between two dates. scope=mine keeps only my tasks."""
    if end < start or (end - start).days > 62:
        raise HTTPException(422, "Ask for at most about two months at a time")
    sql, args = TASK_ITEM + " and t.due_date between %s and %s", [start, end]
    if scope == "mine":
        if user is None:
            return {"tasks": [], "meetings": []}
        sql += " and t.assignee_id=%s"; args.append(user.id)
    tasks = _mark(db.execute(sql + " order by t.due_date, t.priority, t.title", args).fetchall(), user)
    return {"tasks": tasks, "meetings": _meetings(db, user, start, end)}


@router.get("/agenda")
def agenda(
    scope: Literal["mine", "all"] = "mine",
    days: int = Query(14, ge=1, le=60),
    user: User | None = Depends(optional_user),
    db=Depends(get_db),
):
    """The 'Today' card: overdue, due today and coming up, for open tasks. scope=mine is assigned to me."""
    today = db.execute("select current_date as d").fetchone()["d"]
    sql, args = TASK_ITEM + " and t.status <> 'done' and t.due_date <= current_date + %s", [days]
    if scope == "mine":
        if user is None:
            return {"today": today, "overdue": [], "due_today": [], "upcoming": [], "meetings": []}
        sql += " and t.assignee_id=%s"; args.append(user.id)
    rows = _mark(db.execute(sql + " order by t.due_date, t.title limit 300", args).fetchall(), user)
    from datetime import timedelta
    return {
        "today": today,
        "overdue": [r for r in rows if r["due_date"] < today],
        "due_today": [r for r in rows if r["due_date"] == today],
        "upcoming": [r for r in rows if r["due_date"] > today],
        "meetings": _meetings(db, user, today, today + timedelta(days=days)),
    }
