"""PM invitations: new emails get an invite, existing users are added directly, invites turn into memberships at first sign-in."""
import psycopg
import pytest
from app.services import invites
from conftest import TEST_URL, USERS


@pytest.fixture
def sent(monkeypatch):
    calls = []
    monkeypatch.setattr(invites, "send_invite", lambda email, **kw: calls.append(email) or "sent")
    return calls


def test_existing_user_is_added_directly_without_an_invite(world, sent):
    call, pid = world["call"], world["pid"]
    r = call("POST", f"/projects/{pid}/members", "pm", json={"email": USERS["zed"].email, "role": "BA"})
    assert r.status_code == 201 and "pending" not in r.json()
    assert sent == []


def test_new_email_gets_an_invite_and_is_listed_as_pending(world, sent):
    call, pid = world["call"], world["pid"]
    r = call("POST", f"/projects/{pid}/members", "pm", json={"email": "New.Person@Example.com", "role": "Dev"})
    assert r.status_code == 201
    assert r.json()["pending"] is True and r.json()["email_sent"] is True
    assert sent == ["new.person@example.com"]
    pending = call("GET", f"/projects/{pid}/invites", "pm").json()
    assert [(p["email"], p["role"]) for p in pending] == [("new.person@example.com", "Dev")]
    # inviting the same email again changes the role and resends, without a duplicate row
    call("POST", f"/projects/{pid}/members", "pm", json={"email": "new.person@example.com", "role": "QA"})
    pending = call("GET", f"/projects/{pid}/invites", "pm").json()
    assert [(p["email"], p["role"]) for p in pending] == [("new.person@example.com", "QA")]


def test_only_the_pm_can_invite_or_see_invites(world, sent):
    call, pid = world["call"], world["pid"]
    assert call("POST", f"/projects/{pid}/members", "dev", json={"email": "x@example.com", "role": "Dev"}).status_code == 403
    assert call("GET", f"/projects/{pid}/invites", "dev").status_code == 403
    assert call("GET", f"/projects/{pid}/invites").status_code == 401


def test_invite_becomes_membership_at_first_sign_in(world, sent):
    call, pid = world["call"], world["pid"]
    newcomer = "newcomer@example.com"
    call("POST", f"/projects/{pid}/members", "pm", json={"email": newcomer, "role": "Infra"})
    # the invited person signs in for the first time: create the auth user, then call /me as them
    from app.auth import User
    from conftest import _fake_user  # noqa: F401
    USERS["newcomer"] = User(id="00000000-0000-0000-0000-0000000000aa", email=newcomer, name="Newcomer")
    try:
        with psycopg.connect(TEST_URL, autocommit=True) as conn:
            conn.execute("insert into auth.users (id, email) values (%s, %s)", (USERS["newcomer"].id, newcomer))
        me = call("GET", "/me", "newcomer").json()
        assert me["roles"][pid] == "Infra"
        assert call("GET", f"/projects/{pid}/invites", "pm").json() == []
        # and the PM sees them as a member, with the change in the log
        names = [m["name"] for m in call("GET", f"/projects/{pid}/members", "pm").json()]
        assert "Newcomer" in names
    finally:
        USERS.pop("newcomer", None)


def test_pm_can_cancel_an_invite(world, sent):
    call, pid = world["call"], world["pid"]
    call("POST", f"/projects/{pid}/members", "pm", json={"email": "gone@example.com", "role": "QA"})
    inv = call("GET", f"/projects/{pid}/invites", "pm").json()[0]
    assert call("DELETE", f"/projects/{pid}/invites/{inv['id']}", "pm").status_code == 204
    assert call("GET", f"/projects/{pid}/invites", "pm").json() == []


def test_failed_send_leaves_nothing_behind(world, monkeypatch):
    from fastapi import HTTPException
    call, pid = world["call"], world["pid"]

    def boom(email, **kw):
        raise HTTPException(503, "Invitations are not set up yet")
    monkeypatch.setattr(invites, "send_invite", boom)
    r = call("POST", f"/projects/{pid}/members", "pm", json={"email": "late@example.com", "role": "Dev"})
    assert r.status_code == 503
    assert call("GET", f"/projects/{pid}/invites", "pm").json() == []


def test_invite_carries_the_pm_name_project_and_role(world, monkeypatch):
    """The invitation email can say who invited them, to which project, and as what."""
    import httpx
    from app import config
    seen = {}

    class Reply:
        status_code = 200

    def fake_post(url, **kw):
        seen["url"], seen["json"] = url, kw["json"]
        return Reply()

    monkeypatch.setattr(config, "SUPABASE_URL", "https://x.supabase.co")
    monkeypatch.setattr(config, "SUPABASE_SERVICE_ROLE_KEY", "test-key")
    monkeypatch.setattr(httpx, "post", fake_post)
    call, pid = world["call"], world["pid"]
    r = call("POST", f"/projects/{pid}/members", "pm", json={"email": "fresh@example.com", "role": "QA"})
    assert r.status_code == 201 and r.json()["email_sent"] is True
    assert seen["url"].endswith("/auth/v1/invite")
    assert seen["json"] == {"email": "fresh@example.com",
                            "data": {"invited_by": "Pm", "project_name": "Collections Upgrade", "invited_role": "QA"}}
