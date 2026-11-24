"""Activity log helper. Called inside the same transaction as the change it records."""
import json
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from psycopg.types.json import Jsonb
from app.auth import User


def _plain(v):
    if isinstance(v, (date, datetime)):
        return v.isoformat()
    if isinstance(v, (UUID, Decimal)):
        return float(v) if isinstance(v, Decimal) else str(v)
    return v


def diff(old: dict, new: dict, fields) -> dict:
    """{field: [old, new]} for the fields whose value actually changed."""
    out = {}
    for f in fields:
        a, b = _plain(old.get(f)), _plain(new.get(f))
        if a != b:
            out[f] = [a, b]
    return out


def log(db, project_id, user: User, action: str, entity: str, *, entity_id=None, label=None,
        changes: dict | None = None, task_id=None):
    db.execute(
        "insert into activity_log (project_id,task_id,actor_id,actor_name,action,entity,entity_id,entity_label,changes) "
        "values (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        (str(project_id), str(task_id) if task_id else None, user.id, user.name, action, entity,
         str(entity_id) if entity_id else None, (label or "")[:200] or None,
         Jsonb(json.loads(json.dumps(changes, default=_plain))) if changes else None),
    )


def ensure_profile(db, user: User) -> dict:
    """Make sure the signed-in user has a profile row (needed to be a member). Never overwrites a chosen name."""
    db.execute(
        "insert into profiles (id,email,name) values (%s,%s,%s) "
        "on conflict (id) do update set email=excluded.email, updated_at=now()",
        (user.id, user.email, user.name),
    )
    return db.execute("select * from profiles where id=%s", (user.id,)).fetchone()


def claim_invites(db, user: User, profile: dict) -> None:
    """Turn invitations sent to this email into real memberships. Runs on GET /me, so it happens at first sign-in."""
    rows = db.execute("select id, project_id, role from pending_invites where lower(email)=%s", (user.email.lower(),)).fetchall()
    for r in rows:
        db.execute("insert into project_members (project_id,user_id,role) values (%s,%s,%s) on conflict do nothing",
                   (r["project_id"], user.id, r["role"]))
        log(db, r["project_id"], user, "member_added", "member", entity_id=user.id, label=profile["name"],
            changes={"role": [None, r["role"]]})
        db.execute("delete from pending_invites where id=%s", (r["id"],))
