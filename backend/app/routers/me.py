from fastapi import APIRouter, Depends
from app import config
from app.activity import claim_invites, ensure_profile
from app.auth import User, require_user
from app.db import get_db
from app.permissions import roles_for
from app.schemas.project import ProfileIn

router = APIRouter(tags=["me"])


def _me(db, user: User, profile: dict) -> dict:
    roles = roles_for(db, user)
    return {
        "id": user.id,
        "email": user.email,
        "name": profile["name"],
        "roles": roles,
        "is_pm": "PM" in roles.values(),
        "can_create_project": (not config.PM_EMAILS) or user.email in config.PM_EMAILS,
    }


@router.get("/me")
def me(user: User = Depends(require_user), db=Depends(get_db)):
    """Call this after sign-in: it also creates the profile so a PM can add this person by email."""
    profile = ensure_profile(db, user)
    claim_invites(db, user, profile)  # invited by a PM? you are added to those projects now
    return _me(db, user, profile)


@router.put("/me")
def update_me(body: ProfileIn, user: User = Depends(require_user), db=Depends(get_db)):
    ensure_profile(db, user)
    profile = db.execute(
        "update profiles set name=%s, updated_at=now() where id=%s returning *", (body.name, user.id)
    ).fetchone()
    return _me(db, user, profile)
