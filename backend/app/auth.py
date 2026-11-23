import time
from dataclasses import dataclass

import httpx
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from app import config

bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class User:
    id: str
    email: str
    name: str


_CACHE: dict[str, tuple[float, User]] = {}
_TTL = 30  # seconds; keeps a page that fires several requests from calling Supabase every time


def _display_name(data: dict) -> str:
    meta = data.get("user_metadata") or {}
    name = (meta.get("full_name") or meta.get("name") or "").strip()
    if not name:
        name = (data.get("email") or "user").split("@")[0]
    return name[:80]


def _verify(token: str) -> User:
    """Ask Supabase Auth who the token belongs to. Decoding a token alone would not prove it is genuine."""
    hit = _CACHE.get(token)
    if hit and hit[0] > time.monotonic():
        return hit[1]
    try:
        r = httpx.get(
            f"{config.SUPABASE_URL}/auth/v1/user",
            headers={"Authorization": f"Bearer {token}", "apikey": config.SUPABASE_PUBLISHABLE_KEY},
            timeout=10,
        )
    except httpx.HTTPError:
        raise HTTPException(503, "Auth service unreachable")
    if r.status_code != 200:
        raise HTTPException(401, "Invalid or expired token")
    data = r.json()
    user = User(id=data["id"], email=(data.get("email") or "").lower(), name=_display_name(data))
    if len(_CACHE) > 500:
        _CACHE.clear()
    _CACHE[token] = (time.monotonic() + _TTL, user)
    return user


def optional_user(creds: HTTPAuthorizationCredentials | None = Depends(bearer)) -> User | None:
    """Visitors have no token and get None. A token that is present but bad is still a 401."""
    if creds is None:
        return None
    return _verify(creds.credentials)


def require_user(user: User | None = Depends(optional_user)) -> User:
    if user is None:
        raise HTTPException(401, "Sign in to continue")
    return user
