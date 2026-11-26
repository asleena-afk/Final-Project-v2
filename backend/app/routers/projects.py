from fastapi import APIRouter, Depends, HTTPException, Response
from app import config
from app.activity import diff, ensure_profile, log
from app.auth import User, optional_user, require_user
from app.db import get_db
from app.services import invites
from app.permissions import (ASSIGNABLE_ROLES, get_project, require_pm, role_of, roles_for)
from app.schemas.project import MemberIn, MemberRole, ProjectIn

router = APIRouter(prefix="/projects", tags=["projects"])

PROJECT_FIELDS = ("name", "description", "status", "health", "health_note")


def _present(project: dict, role: str | None) -> dict:
    return {**project, "my_role": role, "can_edit": role == "PM"}


@router.get("")
def list_projects(user: User | None = Depends(optional_user), db=Depends(get_db)):
    """Public: visitors can see every project, read-only."""
    rows = db.execute(
        "select p.*, o.name as owner_name, "
        "(select count(*) from project_members mm where mm.project_id=p.id) as member_count "
        "from projects p left join profiles o on o.id=p.owner_id order by p.created_at desc"
    ).fetchall()
    roles = roles_for(db, user)
    return [_present(r, roles.get(str(r["id"]))) for r in rows]


@router.post("", status_code=201)
def create_project(body: ProjectIn, user: User = Depends(require_user), db=Depends(get_db)):
    if config.PM_EMAILS and user.email not in config.PM_EMAILS:
        raise HTTPException(403, "Only project managers can create projects")
    ensure_profile(db, user)
    project = db.execute(
        "insert into projects (owner_id,name,description,status,health,health_note) "
        "values (%s,%s,%s,%s,%s,%s) returning *",
        (user.id, body.name, body.description, body.status, body.health, body.health_note),
    ).fetchone()
    db.execute("insert into project_members (project_id,user_id,role) values (%s,%s,'PM')", (project["id"], user.id))
    log(db, project["id"], user, "created", "project", entity_id=project["id"], label=project["name"])
    return _present(project, "PM")


@router.get("/{pid}")
def get_one(pid: str, user: User | None = Depends(optional_user), db=Depends(get_db)):
    project = get_project(db, pid)
    owner = db.execute("select name from profiles where id=%s", (project["owner_id"],)).fetchone()
    project["owner_name"] = owner["name"] if owner else None
    return _present(project, role_of(db, project["id"], user))


@router.put("/{pid}")
def update_project(pid: str, body: ProjectIn, user: User = Depends(require_user), db=Depends(get_db)):
    old = require_pm(db, pid, user)
    new = db.execute(
        "update projects set name=%s,description=%s,status=%s,health=%s,health_note=%s,updated_at=now() "
        "where id=%s returning *",
        (body.name, body.description, body.status, body.health, body.health_note, old["id"]),
    ).fetchone()
    changes = diff(old, new, PROJECT_FIELDS)
    if changes:
        log(db, new["id"], user, "updated", "project", entity_id=new["id"], label=new["name"], changes=changes)
    return _present(new, "PM")


@router.delete("/{pid}", status_code=204)
def delete_project(pid: str, user: User = Depends(require_user), db=Depends(get_db)):
    """Permanent. Tasks, meetings, members and the activity log of this project go with it."""
    project = require_pm(db, pid, user)
    db.execute("delete from projects where id=%s", (project["id"],))
    return Response(status_code=204)


# ------------------------------------------------------------------ members
@router.get("/{pid}/members")
def list_members(pid: str, user: User | None = Depends(optional_user), db=Depends(get_db)):
    """Public list for the assignee dropdown. Emails are shown to the PM only."""
    project = get_project(db, pid)
    is_pm = user is not None and str(project["owner_id"]) == user.id
    rows = db.execute(
        "select m.user_id, m.role, m.added_at, p.name, p.email from project_members m "
        "join profiles p on p.id=m.user_id where m.project_id=%s "
        "order by (m.role='PM') desc, lower(p.name)",
        (project["id"],),
    ).fetchall()
    return [{"user_id": r["user_id"], "name": r["name"], "role": r["role"], "added_at": r["added_at"],
             "email": r["email"] if is_pm else None} for r in rows]


@router.post("/{pid}/members", status_code=201)
def add_member(pid: str, body: MemberIn, user: User = Depends(require_user), db=Depends(get_db)):
    project = require_pm(db, pid, user)
    person = db.execute("select * from profiles where lower(email)=%s", (body.email.strip().lower(),)).fetchone()
    if person is None:
        # No profile yet: invite them. They are added to the project when they first sign in (see claim_invites).
        email = body.email.strip().lower()
        # Save first: if sending fails, the error rolls this row back, so nothing is left half done.
        db.execute(
            "insert into pending_invites (project_id,email,role,invited_by) values (%s,%s,%s,%s) "
            "on conflict (project_id, lower(email)) do update set role=excluded.role",
            (project["id"], email, body.role, user.id))
        pm = db.execute("select name from profiles where id=%s", (user.id,)).fetchone()
        status = invites.send_invite(  # sending again to the same email works as a resend
            email, inviter=(pm["name"] if pm else user.name), project=project["name"], role=body.role)
        return {"pending": True, "email": email, "role": body.role, "email_sent": status == "sent"}
    if db.execute("select 1 from project_members where project_id=%s and user_id=%s",
                  (project["id"], person["id"])).fetchone():
        raise HTTPException(409, "Already a member of this project")
    db.execute("insert into project_members (project_id,user_id,role) values (%s,%s,%s)",
               (project["id"], person["id"], body.role))
    log(db, project["id"], user, "member_added", "member", entity_id=person["id"], label=person["name"],
        changes={"role": [None, body.role]})
    return {"user_id": person["id"], "name": person["name"], "role": body.role, "email": person["email"]}


def _member_or_404(db, project_id, member_id):
    row = db.execute(
        "select m.*, p.name from project_members m join profiles p on p.id=m.user_id "
        "where m.project_id=%s and m.user_id=%s", (project_id, member_id)).fetchone()
    if row is None:
        raise HTTPException(404, "Member not found")
    if row["role"] == "PM":
        raise HTTPException(422, "The project manager cannot be changed or removed")
    return row


@router.put("/{pid}/members/{member_id}")
def change_role(pid: str, member_id: str, body: MemberRole, user: User = Depends(require_user), db=Depends(get_db)):
    from app.permissions import as_uuid
    project = require_pm(db, pid, user)
    member = _member_or_404(db, project["id"], as_uuid(member_id, "Member"))
    if member["role"] != body.role:
        db.execute("update project_members set role=%s where project_id=%s and user_id=%s",
                   (body.role, project["id"], member["user_id"]))
        log(db, project["id"], user, "role_changed", "member", entity_id=member["user_id"], label=member["name"],
            changes={"role": [member["role"], body.role]})
    return {"user_id": member["user_id"], "name": member["name"], "role": body.role}


@router.delete("/{pid}/members/{member_id}", status_code=204)
def remove_member(pid: str, member_id: str, user: User = Depends(require_user), db=Depends(get_db)):
    from app.permissions import as_uuid
    project = require_pm(db, pid, user)
    member = _member_or_404(db, project["id"], as_uuid(member_id, "Member"))
    n = db.execute("select count(*) as n from tasks where project_id=%s and assignee_id=%s and deleted_at is null",
                   (project["id"], member["user_id"])).fetchone()["n"]
    # The database clears assignee_id on their tasks (composite foreign key) when this row goes.
    db.execute("delete from project_members where project_id=%s and user_id=%s", (project["id"], member["user_id"]))
    log(db, project["id"], user, "member_removed", "member", entity_id=member["user_id"], label=member["name"],
        changes={"role": [member["role"], None], "tasks_unassigned": [0, n]} if n else {"role": [member["role"], None]})
    return Response(status_code=204)


# ------------------------------------------------------------------ pending invites (PM only)
@router.get("/{pid}/invites")
def list_invites(pid: str, user: User = Depends(require_user), db=Depends(get_db)):
    project = require_pm(db, pid, user)
    return db.execute("select id, email, role, created_at from pending_invites where project_id=%s order by created_at",
                      (project["id"],)).fetchall()


@router.delete("/{pid}/invites/{invite_id}", status_code=204)
def cancel_invite(pid: str, invite_id: str, user: User = Depends(require_user), db=Depends(get_db)):
    from app.permissions import as_uuid
    project = require_pm(db, pid, user)
    db.execute("delete from pending_invites where id=%s and project_id=%s", (as_uuid(invite_id, "Invite"), project["id"]))
    return Response(status_code=204)
