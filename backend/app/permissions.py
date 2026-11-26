"""Who may do what. Every route calls these instead of repeating the rules.

Visitor (no token)     read dashboard, projects, tasks, team, calendar. Nothing else.
Member (BA/Dev/QA/Infra) + add tasks; on a task assigned to them: status, blocker, notes, ticket stage.
Task creator            delete and restore their own tasks.
PM (project owner)     everything, including meetings, members, delete/restore/purge.
"""
from uuid import UUID

from fastapi import HTTPException
from app.auth import User

ROLES = ("PM", "BA", "Dev", "QA", "Infra")
ASSIGNABLE_ROLES = ("BA", "Dev", "QA", "Infra")  # PM is always the project owner
# What a member may change on a task that is assigned to them.
MEMBER_TASK_FIELDS = {"status", "is_blocked", "blocker_reason", "notes", "ticket_stage"}


def as_uuid(value, what: str = "Record") -> str:
    """Validate an id in Python so a bad one is a clean 404, not a database error that aborts the transaction."""
    try:
        return str(UUID(str(value)))
    except (ValueError, AttributeError):
        raise HTTPException(404, f"{what} not found")


def get_project(db, project_id) -> dict:
    row = db.execute("select * from projects where id=%s", (as_uuid(project_id, "Project"),)).fetchone()
    if row is None:
        raise HTTPException(404, "Project not found")
    return row


def role_of(db, project_id, user: User | None) -> str | None:
    if user is None:
        return None
    row = db.execute(
        "select role from project_members where project_id=%s and user_id=%s", (str(project_id), user.id)
    ).fetchone()
    return row["role"] if row else None


def roles_for(db, user: User | None) -> dict[str, str]:
    """{project_id: role} for everything the user belongs to, in one query."""
    if user is None:
        return {}
    rows = db.execute("select project_id, role from project_members where user_id=%s", (user.id,)).fetchall()
    return {str(r["project_id"]): r["role"] for r in rows}


def require_member(db, project_id, user: User | None) -> str:
    if user is None:
        raise HTTPException(401, "Sign in to continue")
    role = role_of(db, project_id, user)
    if role is None:
        raise HTTPException(403, "Only members of this project can do that")
    return role


def require_pm(db, project_id, user: User | None) -> dict:
    """Returns the project row, so callers do not load it twice."""
    if user is None:
        raise HTTPException(401, "Sign in to continue")
    project = get_project(db, project_id)
    if str(project["owner_id"]) != user.id:
        raise HTTPException(403, "Only the project manager can do that")
    return project


def require_task_creator_or_pm(db, task: dict, user: User | None) -> None:
    if user is None:
        raise HTTPException(401, "Sign in to continue")
    project = get_project(db, task["project_id"])
    if str(project["owner_id"]) == user.id:
        return
    require_member(db, project["id"], user)
    if str(task["created_by"]) != user.id:
        raise HTTPException(403, "Only the task creator or project manager can do that")


def task_perms(role: str | None, task: dict, user: User | None) -> dict:
    """What the viewer may do with one task. The UI uses this to show or hide buttons."""
    is_pm = role == "PM"
    mine = user is not None and task.get("assignee_id") is not None and str(task["assignee_id"]) == user.id
    creator = user is not None and role is not None and str(task["created_by"]) == user.id
    return {
        "edit_all": is_pm,
        "edit_status": is_pm or (role is not None and mine),
        "delete": is_pm or creator,
    }
