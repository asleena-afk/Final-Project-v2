from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from psycopg.types.json import Jsonb
from app.activity import _plain, diff, log
from app.auth import User, optional_user, require_user
from app.db import get_db
from app.permissions import (MEMBER_TASK_FIELDS, as_uuid, get_project, require_member, require_pm,
                             require_task_creator_or_pm, roles_for, task_perms)
from app.schemas.task import TaskCreate, TaskPatch
from app.services.stages import STAGE_TO_STATUS, status_for_stage

router = APIRouter(prefix="/tasks", tags=["tasks"])

COLS = ["meeting_id", "assignee_id", "title", "notes", "status", "priority", "due_date", "due_time", "is_blocked",
        "blocker_reason", "ticket_ref", "module", "estimate_hrs", "ticket_stage"]
NOT_NULL = {"title", "notes", "status", "priority", "due_date", "is_blocked"}

SELECT = """
select t.*, p.name as project_name, a.name as assignee_name, m.role as assignee_role
from tasks t
join projects p on p.id = t.project_id
left join profiles a on a.id = t.assignee_id
left join project_members m on m.project_id = t.project_id and m.user_id = t.assignee_id
"""

SORTABLE = {
    "due_date": "t.due_date",
    "title": "lower(t.title)",
    "status": "t.status",
    "priority": "case t.priority when 'high' then 1 when 'medium' then 2 else 3 end",
    "assignee": "lower(a.name)",
    "created_at": "t.created_at",
    "updated_at": "t.updated_at",
}


def present(rows: list[dict], db, user: User | None) -> list[dict]:
    """Adds what the viewer may do with each task, so the UI can show or hide buttons."""
    roles = roles_for(db, user)
    return [{**r, "perms": task_perms(roles.get(str(r["project_id"])), r, user)} for r in rows]


def fetch_task(db, tid) -> dict:
    row = db.execute(SELECT + " where t.id=%s", (as_uuid(tid, "Task"),)).fetchone()
    if row is None:
        raise HTTPException(404, "Task not found")
    return row


def normalize(d: dict) -> dict:
    """Rules that apply to every save: blocker needs a reason; a ticket stage decides the status."""
    if d.get("is_blocked"):
        reason = (d.get("blocker_reason") or "").strip()
        if not reason:
            raise HTTPException(422, "A blocked task needs a reason")
        d["blocker_reason"] = reason
    else:
        d["blocker_reason"] = None
    d["status"] = status_for_stage(d.get("ticket_stage"), d["status"])
    for key in ("ticket_ref", "module"):
        d[key] = (d.get(key) or "").strip() or None
    d["notes"] = (d.get("notes") or "").strip()
    return d


def _check_assignee(db, project_id, assignee_id):
    if assignee_id is None:
        return
    ok = db.execute("select 1 from project_members where project_id=%s and user_id=%s",
                    (str(project_id), str(assignee_id))).fetchone()
    if not ok:
        raise HTTPException(422, "The assignee must be a member of this project")


def _check_meeting(db, project_id, meeting_id, role):
    if meeting_id is None:
        return
    if role != "PM":
        raise HTTPException(403, "Only the project manager can link a task to a meeting")
    ok = db.execute("select 1 from meetings where id=%s and project_id=%s", (str(meeting_id), str(project_id))).fetchone()
    if not ok:
        raise HTTPException(422, "That meeting is not in this project")


def _replace_meeting_action_title(db, meeting_id, old_title, new_title, required=False):
    if old_title == new_title:
        return False
    meeting = db.execute(
        "select summary_rows,next_actions from meetings where id=%s", (meeting_id,)
    ).fetchone()
    if meeting is None:
        if required:
            raise HTTPException(409, "The meeting action item is no longer available")
        return False

    old_key = old_title.strip().casefold()
    rows = meeting["summary_rows"]
    next_actions = meeting["next_actions"]
    changed = False
    if rows is not None:
        updated_rows = []
        for row in rows:
            items = row.get("action_items") or []
            updated_items = [
                new_title if item.strip().casefold() == old_key else item
                for item in items
            ]
            changed = changed or updated_items != items
            updated_rows.append({**row, "action_items": updated_items} if updated_items != items else row)
        rows = updated_rows
    if next_actions is not None:
        updated_actions = [
            new_title if item.strip().casefold() == old_key else item
            for item in next_actions
        ]
        changed = changed or updated_actions != next_actions
        next_actions = updated_actions

    if not changed:
        if required:
            raise HTTPException(409, "The meeting action item changed; reload the meeting and try again")
        return False
    db.execute(
        "update meetings set summary_rows=%s,next_actions=%s,updated_at=now() where id=%s",
        (Jsonb(rows) if rows is not None else None,
         Jsonb(next_actions) if next_actions is not None else None, meeting_id),
    )
    return True


# ------------------------------------------------------------------ read (public)
@router.get("")
def list_tasks(
    project_id: str | None = None,
    scope: Literal["all", "my_projects", "my_tasks"] = "all",
    open_only: bool = False,
    status: str | None = None,
    blocked: bool | None = None,
    assignee_id: str | None = None,
    q: str | None = Query(None, max_length=100),
    due_from: date | None = None,
    due_to: date | None = None,
    trash: bool = False,
    sort: str = "created_at",
    desc: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=500),
    user: User | None = Depends(optional_user),
    db=Depends(get_db),
):
    if sort not in SORTABLE:
        raise HTTPException(422, "Cannot sort by that column")
    where, args = [], []
    project = get_project(db, project_id) if project_id else None
    if scope != "all" and user is None:
        raise HTTPException(401, "Sign in to view scoped tasks")
    if trash:
        if project is None:
            raise HTTPException(422, "Trash needs a project_id")
        if user is None:
            raise HTTPException(401, "Sign in to continue")
        if str(project["owner_id"]) != user.id:
            require_member(db, project["id"], user)
            where.append("t.created_by=%s"); args.append(user.id)
        where.append("t.deleted_at is not null")
    else:
        where.append("t.deleted_at is null")
    if project_id:
        where.append("t.project_id=%s"); args.append(as_uuid(project_id, "Project"))
    if scope == "my_projects":
        where.append("t.project_id in (select project_id from project_members where user_id=%s)")
        args.append(user.id)
    elif scope == "my_tasks":
        where.append("t.assignee_id=%s")
        args.append(user.id)
    if open_only:
        where.append("t.status<>'done'")
    if status:
        where.append("t.status=%s"); args.append(status)
    if blocked is not None:
        where.append("t.is_blocked=%s"); args.append(blocked)
    if assignee_id:
        where.append("t.assignee_id=%s"); args.append(as_uuid(assignee_id, "Assignee"))
    if q and q.strip():
        where.append("(t.title ilike %s or t.ticket_ref ilike %s)"); args += [f"%{q.strip()}%"] * 2
    if due_from:
        where.append("t.due_date >= %s"); args.append(due_from)
    if due_to:
        where.append("t.due_date <= %s"); args.append(due_to)
    clause = " and ".join(where)
    total = db.execute(f"select count(*) as n from tasks t where {clause}", args).fetchone()["n"]
    trash_count = None
    if trash:
        trash_count = db.execute(
            "select count(*) as n from tasks where project_id=%s and deleted_at is not null",
            (project["id"],),
        ).fetchone()["n"]
    rows = db.execute(
        f"{SELECT} where {clause} order by {SORTABLE[sort]} {'desc' if desc else 'asc'} nulls last, t.id "
        "limit %s offset %s",
        [*args, page_size, (page - 1) * page_size],
    ).fetchall()
    result = {
        "items": present(rows, db, user),
        "total": total,
        "page": page,
        "page_size": page_size,
    }
    if trash:
        result["trash_count"] = trash_count
    return result


@router.get("/{tid}")
def get_task(tid: str, user: User | None = Depends(optional_user), db=Depends(get_db)):
    task = fetch_task(db, tid)
    if task["deleted_at"] is not None:
        # A creator can access their own deleted task; the PM can access every deleted task.
        try:
            require_task_creator_or_pm(db, task, user)
        except HTTPException:
            raise HTTPException(404, "Task not found")
    return present([task], db, user)[0]


@router.get("/{tid}/history")
def task_history(tid: str, user: User = Depends(require_user), db=Depends(get_db)):
    task = fetch_task(db, tid)
    require_member(db, task["project_id"], user)
    return db.execute(
        "select l.id, l.action, l.entity, l.entity_label, l.changes, l.created_at, coalesce(p.name, l.actor_name) as actor_name "
        "from activity_log l left join profiles p on p.id=l.actor_id where l.task_id=%s "
        "order by l.created_at desc, l.id desc limit 200", (task["id"],)).fetchall()


# ------------------------------------------------------------------ write
@router.post("", status_code=201)
def create_task(body: TaskCreate, user: User = Depends(require_user), db=Depends(get_db)):
    project = get_project(db, body.project_id)
    role = require_member(db, project["id"], user)  # any member may add tasks
    _check_assignee(db, project["id"], body.assignee_id)
    _check_meeting(db, project["id"], body.meeting_id, role)
    if body.meeting_action_item is not None:
        if body.meeting_id is None:
            raise HTTPException(422, "meeting_action_item requires meeting_id")
        _replace_meeting_action_title(
            db, body.meeting_id, body.meeting_action_item, body.title, required=True
        )
    data = normalize(body.model_dump())
    row = db.execute(
        f"insert into tasks (project_id,created_by,{','.join(COLS)}) values (%s,%s,{','.join(['%s'] * len(COLS))}) "
        "returning id",
        [project["id"], user.id, *[data[c] for c in COLS]],
    ).fetchone()
    task = fetch_task(db, row["id"])
    log(db, project["id"], user, "created", "task", entity_id=task["id"], task_id=task["id"], label=task["title"])
    return present([task], db, user)[0]


@router.patch("/{tid}")
def update_task(tid: str, body: TaskPatch, user: User = Depends(require_user), db=Depends(get_db)):
    task = fetch_task(db, tid)
    if task["deleted_at"] is not None:
        raise HTTPException(404, "Task not found")
    pid = task["project_id"]
    role = require_member(db, pid, user)
    patch = body.model_dump(exclude_unset=True)
    if not patch:
        raise HTTPException(422, "Nothing to change")
    bad_null = [k for k in patch if k in NOT_NULL and patch[k] is None]
    if bad_null:
        raise HTTPException(422, f"{', '.join(bad_null)} cannot be empty")

    if role != "PM":
        if task["assignee_id"] is None or str(task["assignee_id"]) != user.id:
            raise HTTPException(403, "You can only update tasks assigned to you")
        blocked = sorted(k for k, v in patch.items()
                         if k not in MEMBER_TASK_FIELDS and _plain(v) != _plain(task.get(k)))
        if blocked:
            raise HTTPException(403, "Only the project manager can change: " + ", ".join(blocked))
        patch = {k: v for k, v in patch.items() if k in MEMBER_TASK_FIELDS}
    else:
        if "assignee_id" in patch:
            _check_assignee(db, pid, patch["assignee_id"])
        if "meeting_id" in patch and patch["meeting_id"] != task["meeting_id"]:
            _check_meeting(db, pid, patch["meeting_id"], role)

    # A ticket stage decides the status. Changing the status by hand while a stage is set would be overridden.
    stage_now = patch.get("ticket_stage", task["ticket_stage"])
    if "status" in patch and "ticket_stage" not in patch and stage_now and STAGE_TO_STATUS[stage_now] != patch["status"]:
        raise HTTPException(422, "This task follows its ticket stage. Change the ticket stage instead.")

    merged = normalize({**{c: task[c] for c in COLS}, **patch})
    changes = diff(task, merged, COLS)
    if changes:
        if "title" in changes and task["meeting_id"]:
            _replace_meeting_action_title(db, task["meeting_id"], task["title"], merged["title"])
        db.execute(
            f"update tasks set {','.join(f'{c}=%s' for c in COLS)}, updated_at=now() where id=%s",
            [*[merged[c] for c in COLS], task["id"]],
        )
        if "assignee_id" in changes:  # show names, not ids, in the history
            names = {r["id"]: r["name"] for r in db.execute(
                "select id,name from profiles where id = any(%s)",
                [[x for x in (task["assignee_id"], merged["assignee_id"]) if x]]).fetchall()}
            old, new = task["assignee_id"], merged["assignee_id"]
            changes["assignee_id"] = [names.get(old), names.get(new)]
        log(db, pid, user, "updated", "task", entity_id=task["id"], task_id=task["id"], label=task["title"],
            changes=changes)
    return present([fetch_task(db, task["id"])], db, user)[0]


@router.delete("/{tid}", status_code=204)
def delete_task(tid: str, user: User = Depends(require_user), db=Depends(get_db)):
    """Soft delete: the creator or project manager can move the task to the trash."""
    task = fetch_task(db, tid)
    require_task_creator_or_pm(db, task, user)
    if task["deleted_at"] is not None:
        raise HTTPException(404, "Task not found")
    db.execute("update tasks set deleted_at=now(), deleted_by=%s, updated_at=now() where id=%s", (user.id, task["id"]))
    log(db, task["project_id"], user, "deleted", "task", entity_id=task["id"], task_id=task["id"], label=task["title"])
    return Response(status_code=204)


@router.post("/{tid}/restore")
def restore_task(tid: str, user: User = Depends(require_user), db=Depends(get_db)):
    task = fetch_task(db, tid)
    require_task_creator_or_pm(db, task, user)
    if task["deleted_at"] is None:
        raise HTTPException(409, "This task is not deleted")
    db.execute("update tasks set deleted_at=null, deleted_by=null, updated_at=now() where id=%s", (task["id"],))
    log(db, task["project_id"], user, "restored", "task", entity_id=task["id"], task_id=task["id"], label=task["title"])
    return present([fetch_task(db, task["id"])], db, user)[0]


@router.delete("/{tid}/purge", status_code=204)
def purge_task(tid: str, user: User = Depends(require_user), db=Depends(get_db)):
    """Permanent. Only the PM, and only for a task that is already in the trash."""
    task = fetch_task(db, tid)
    require_pm(db, task["project_id"], user)
    if task["deleted_at"] is None:
        raise HTTPException(409, "Delete the task first, then remove it permanently from the trash")
    db.execute("delete from tasks where id=%s", (task["id"],))
    log(db, task["project_id"], user, "purged", "task", entity_id=task["id"], task_id=task["id"], label=task["title"])
    return Response(status_code=204)
