"""Invite someone by email through Supabase Auth. They get a link, set a password, and land in the app."""
import httpx
from fastapi import HTTPException
from app import config


def send_invite(email: str) -> str:
    """Returns "sent" (new account, email on its way) or "exists" (they already have a login).

    Needs SUPABASE_SERVICE_ROLE_KEY in the backend .env.
    """
    if not config.SUPABASE_URL or not config.SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(503, "Invitations are not set up yet: add SUPABASE_SERVICE_ROLE_KEY to backend/.env")
    key = config.SUPABASE_SERVICE_ROLE_KEY
    try:
        r = httpx.post(
            f"{config.SUPABASE_URL}/auth/v1/invite",
            params={"redirect_to": f"{config.APP_URL}/reset-password"},
            headers={"apikey": key, "Authorization": f"Bearer {key}"},
            json={"email": email},
            timeout=15,
        )
    except httpx.HTTPError:
        raise HTTPException(503, "Could not reach the sign-in service to send the invitation")
    if r.status_code in (200, 201):
        return "sent"
    detail = ""
    try:
        body = r.json()
        detail = f"{body.get('error_code', '')} {body.get('msg') or body.get('message') or ''}".lower()
    except ValueError:
        pass
    if r.status_code in (400, 422) and ("exists" in detail or "already" in detail or "registered" in detail):
        return "exists"
    raise HTTPException(502, "The invitation email could not be sent. Check the Supabase email settings and try again.")
