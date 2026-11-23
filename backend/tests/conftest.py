"""Database tests run against a SCRATCH Postgres, never your Supabase project (they empty the tables).

    createdb tt2test ; psql tt2test -c "create schema auth; create table auth.users (id uuid primary key, email text);"
    psql tt2test -f backend/schema.sql
    TEST_DATABASE_URL=postgresql://localhost/tt2test pytest

Without TEST_DATABASE_URL the database tests are skipped.
"""
import os
from uuid import uuid4

import psycopg
import pytest
from fastapi import Request
from fastapi.testclient import TestClient

TEST_URL = os.environ.get("TEST_DATABASE_URL")
if TEST_URL:
    assert "test" in TEST_URL.lower(), "TEST_DATABASE_URL must point at a scratch database with 'test' in its name"
    os.environ["DATABASE_URL"] = TEST_URL
    os.environ["PM_EMAILS"] = "pm@example.com"

from app import auth  # noqa: E402
from app.auth import User  # noqa: E402
from app.main import app  # noqa: E402

USERS = {n: User(id=str(uuid4()), email=f"{n}@example.com", name=n.title()) for n in ("pm", "dev", "qa", "zed")}


def _fake_user(request: Request):
    who = request.headers.get("x-test-user")
    return USERS[who] if who else None


@pytest.fixture
def db_required():
    if not TEST_URL:
        pytest.skip("set TEST_DATABASE_URL to run the database tests")


@pytest.fixture
def api(db_required):
    app.dependency_overrides[auth.optional_user] = _fake_user
    with psycopg.connect(TEST_URL, autocommit=True) as conn:
        conn.execute("truncate auth.users cascade")
        for u in USERS.values():
            conn.execute("insert into auth.users (id, email) values (%s, %s)", (u.id, u.email))
    client = TestClient(app)

    def call(method, path, who=None, **kw):
        headers = {"x-test-user": who} if who else {}
        return client.request(method, path, headers=headers, **kw)

    yield call
    app.dependency_overrides.clear()


@pytest.fixture
def world(api):
    """PM owns a project; dev (Dev) and qa (QA) are members; zed has an account but is not a member."""
    for who in USERS:
        assert api("GET", "/me", who).status_code == 200  # creates each profile
    resp = api("POST", "/projects", "pm", json={"name": "Collections Upgrade"})
    assert resp.status_code == 201, resp.text
    pid = resp.json()["id"]
    for who, role in (("dev", "Dev"), ("qa", "QA")):
        r = api("POST", f"/projects/{pid}/members", "pm", json={"email": USERS[who].email, "role": role})
        assert r.status_code == 201, r.text
    return {"pid": pid, "call": api}