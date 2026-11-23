from fastapi import APIRouter, Depends
from app.auth import User, optional_user
from app.db import get_db
from app.permissions import as_uuid, get_project

router = APIRouter(prefix="/team", tags=["team"])


@router.get("")
def team(project_id: str | None = None, user: User | None = Depends(optional_user), db=Depends(get_db)):
    """People with their project roles and task progress. Public and read-only.

    A person's task list comes from GET /tasks?assignee_id=. Emails are shown to a PM for people on their projects.
    """
    pid = None
    if project_id:
        pid = as_uuid(project_id, "Project")
        get_project(db, pid)
    f_member = " where m.project_id=%s" if pid else ""
    f_task = " and t.project_id=%s" if pid else ""
    args = [pid] if pid else []

    memberships = db.execute(
        "select m.user_id, m.role, m.project_id, p.name as project_name, p.owner_id "
        f"from project_members m join projects p on p.id=m.project_id{f_member} order by p.name", args).fetchall()
    ids = list({m["user_id"] for m in memberships})
    profiles = {r["id"]: r for r in db.execute(
        "select id, name, email from profiles where id = any(%s)", [ids]).fetchall()} if ids else {}
    stats = {r["assignee_id"]: r for r in db.execute(
        "select t.assignee_id, count(*) as total, "
        "count(*) filter (where t.status='todo') as todo, "
        "count(*) filter (where t.status='in_progress') as in_progress, "
        "count(*) filter (where t.status='pending_review') as pending_review, "
        "count(*) filter (where t.status='done') as done, "
        "count(*) filter (where t.is_blocked and t.status<>'done') as blocked, "
        "count(*) filter (where t.status<>'done' and t.due_date < current_date) as overdue, "
        f"min(t.due_date) filter (where t.status<>'done' and t.due_date >= current_date) as next_due "
        f"from tasks t where t.deleted_at is null and t.assignee_id is not null{f_task} group by t.assignee_id",
        args).fetchall()}

    people: dict = {}
    for m in memberships:
        person = people.setdefault(m["user_id"], {"roles": [], "sees_email": False})
        person["roles"].append({"project_id": m["project_id"], "project_name": m["project_name"], "role": m["role"]})
        if user is not None and str(m["owner_id"]) == user.id:
            person["sees_email"] = True
    out = []
    for uid, person in people.items():
        prof = profiles.get(uid)
        if prof is None:
            continue
        s = stats.get(uid) or {}
        total = s.get("total", 0)
        out.append({
            "user_id": uid, "name": prof["name"],
            "email": prof["email"] if person["sees_email"] else None,
            "roles": person["roles"],
            "total": total, "todo": s.get("todo", 0), "in_progress": s.get("in_progress", 0),
            "pending_review": s.get("pending_review", 0), "done": s.get("done", 0),
            "blocked": s.get("blocked", 0), "overdue": s.get("overdue", 0), "next_due": s.get("next_due"),
            "progress_pct": round(100 * s.get("done", 0) / total) if total else 0,
        })
    out.sort(key=lambda p: (0 if any(r["role"] == "PM" for r in p["roles"]) else 1, p["name"].lower()))
    return out
