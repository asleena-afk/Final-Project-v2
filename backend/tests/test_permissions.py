"""Who can do what, checked through the real routes against a real database."""
import pytest
from conftest import USERS


def new_task(w, who="pm", **extra):
    body = {"project_id": w["pid"], "title": "Write UAT plan", "due_date": "2026-12-01", **extra}
    r = w["call"]("POST", "/tasks", who, json=body)
    assert r.status_code == 201, r.text
    return r.json()


# ---------------------------------------------------------------- visitors
def test_visitor_can_read_public_pages(world):
    call, pid = world["call"], world["pid"]
    new_task(world)
    for path in ("/dashboard", "/projects", f"/projects/{pid}", f"/projects/{pid}/members",
                 f"/tasks?project_id={pid}", "/team", "/calendar?start=2026-11-01&end=2026-11-30", "/agenda?scope=all"):
        assert call("GET", path).status_code == 200, path


def test_visitor_cannot_write_or_see_private_pages(world):
    call, pid = world["call"], world["pid"]
    assert call("POST", "/tasks", json={"project_id": pid, "title": "x", "due_date": "2026-12-01"}).status_code == 401
    assert call("POST", "/projects", json={"name": "x"}).status_code == 401
    for path in ("/logs", "/meetings", "/me"):
        assert call("GET", path).status_code == 401, path


def test_visitor_sees_no_emails(world):
    call, pid = world["call"], world["pid"]
    assert all(m["email"] is None for m in call("GET", f"/projects/{pid}/members").json())
    assert all(p["email"] is None for p in call("GET", "/team").json())
    assert any(m["email"] for m in call("GET", f"/projects/{pid}/members", "pm").json())


def test_bad_ids_are_404_not_500(world):
    call = world["call"]
    assert call("GET", "/projects/not-a-uuid").status_code == 404
    assert call("GET", "/tasks/not-a-uuid").status_code == 404
    assert call("GET", "/tasks?project_id=nope").status_code == 404


# ---------------------------------------------------------------- adding tasks
def test_any_member_can_add_but_outsider_cannot(world):
    call, pid = world["call"], world["pid"]
    assert call("POST", "/tasks", "qa", json={"project_id": pid, "title": "Test plan", "due_date": "2026-12-01"}).status_code == 201
    assert call("POST", "/tasks", "zed", json={"project_id": pid, "title": "Sneaky", "due_date": "2026-12-01"}).status_code == 403


def test_title_rules(world):
    call, pid = world["call"], world["pid"]
    post = lambda t: call("POST", "/tasks", "pm", json={"project_id": pid, "title": t, "due_date": "2026-12-01"}).status_code  # noqa: E731
    assert post("   ") == 422
    assert post("x" * 161) == 422
    assert post("x" * 160) == 201


def test_due_date_is_required_and_cannot_be_cleared(world):
    call, pid = world["call"], world["pid"]
    assert call("POST", "/tasks", "pm", json={"project_id": pid, "title": "No due date"}).status_code == 422
    task = new_task(world)
    assert call("PATCH", f"/tasks/{task['id']}", "pm", json={"due_date": None}).status_code == 422


def test_assignee_must_be_a_member(world):
    call, pid = world["call"], world["pid"]
    zed = USERS["zed"].id
    assert call("POST", "/tasks", "pm", json={
        "project_id": pid, "title": "x", "assignee_id": zed, "due_date": "2026-12-01",
    }).status_code == 422
    t = new_task(world, assignee_id=USERS["dev"].id)
    assert t["assignee_name"] == "Dev" and t["assignee_role"] == "Dev"


# ---------------------------------------------------------------- editing
def test_assigned_member_can_only_change_status_fields(world):
    call = world["call"]
    t = new_task(world, assignee_id=USERS["dev"].id, due_date="2026-12-01")
    url = f"/tasks/{t['id']}"
    ok = call("PATCH", url, "dev", json={"status": "in_progress", "notes": "started", "is_blocked": True,
                                         "blocker_reason": "waiting for client"})
    assert ok.status_code == 200 and ok.json()["status"] == "in_progress" and ok.json()["is_blocked"]
    for field, value in (("title", "Renamed"), ("due_date", "2026-12-31"), ("assignee_id", USERS["qa"].id),
                         ("priority", "high")):
        r = call("PATCH", url, "dev", json={field: value})
        assert r.status_code == 403, field
    # sending an unchanged value for a field they may not edit is not an attempt to change it
    assert call("PATCH", url, "dev", json={"title": "Write UAT plan", "status": "pending_review"}).status_code == 200


def test_member_cannot_edit_someone_elses_task(world):
    call = world["call"]
    t = new_task(world, assignee_id=USERS["dev"].id)
    assert call("PATCH", f"/tasks/{t['id']}", "qa", json={"status": "done"}).status_code == 403
    unassigned = new_task(world)
    assert call("PATCH", f"/tasks/{unassigned['id']}", "dev", json={"status": "done"}).status_code == 403
    assert call("PATCH", f"/tasks/{t['id']}", "zed", json={"status": "done"}).status_code == 403
    assert call("PATCH", f"/tasks/{t['id']}", json={"status": "done"}).status_code == 401


def test_pm_can_edit_everything(world):
    call = world["call"]
    t = new_task(world)
    r = call("PATCH", f"/tasks/{t['id']}", "pm", json={"title": "New title", "priority": "high",
                                                       "assignee_id": USERS["qa"].id, "due_date": "2026-12-24"})
    assert r.status_code == 200 and r.json()["title"] == "New title" and r.json()["assignee_name"] == "Qa"
    assert call("PATCH", f"/tasks/{t['id']}", "pm", json={"assignee_id": None}).json()["assignee_id"] is None
    assert call("PATCH", f"/tasks/{t['id']}", "pm", json={"title": None}).status_code == 422
    assert call("PATCH", f"/tasks/{t['id']}", "pm", json={}).status_code == 422


def test_perms_flags_for_the_ui(world):
    call = world["call"]
    t = new_task(world, assignee_id=USERS["dev"].id)
    perms = lambda who: call("GET", f"/tasks/{t['id']}", who).json()["perms"]  # noqa: E731
    assert perms("pm") == {"edit_all": True, "edit_status": True, "delete": True}
    assert perms("dev") == {"edit_all": False, "edit_status": True, "delete": False}
    assert perms("qa")["edit_status"] is False
    assert perms(None) == {"edit_all": False, "edit_status": False, "delete": False}
    own_task = new_task(world, "dev")
    assert call("GET", f"/tasks/{own_task['id']}", "dev").json()["perms"]["delete"] is True
    assert call("GET", f"/tasks/{own_task['id']}", "qa").json()["perms"]["delete"] is False


def test_blocker_needs_a_reason_and_stage_sets_status(world):
    call = world["call"]
    t = new_task(world)
    url = f"/tasks/{t['id']}"
    assert call("PATCH", url, "pm", json={"is_blocked": True}).status_code == 422
    assert call("PATCH", url, "pm", json={"is_blocked": True, "blocker_reason": "  "}).status_code == 422
    r = call("PATCH", url, "pm", json={"ticket_stage": "FOR TESTING"})
    assert r.json()["status"] == "pending_review"
    assert call("PATCH", url, "pm", json={"status": "todo"}).status_code == 422  # stage decides
    assert call("PATCH", url, "pm", json={"ticket_stage": "CLOSED"}).json()["status"] == "done"
    r = call("PATCH", url, "pm", json={"ticket_stage": None, "status": "todo"})
    assert r.status_code == 200 and r.json()["status"] == "todo"


# ---------------------------------------------------------------- soft delete, trash, purge
def test_soft_delete_restore_and_purge(world):
    call, pid = world["call"], world["pid"]
    t = new_task(world, assignee_id=USERS["dev"].id)
    url = f"/tasks/{t['id']}"
    assert call("DELETE", url, "dev").status_code == 403           # members cannot delete
    assert call("DELETE", url).status_code == 401
    assert call("DELETE", f"{url}/purge", "pm").status_code == 409  # must be in the trash first
    assert call("DELETE", url, "pm").status_code == 204
    assert call("GET", f"/tasks?project_id={pid}").json()["total"] == 0
    assert call("GET", url).status_code == 404 and call("GET", url, "dev").status_code == 404
    assert call("GET", url, "pm").status_code == 200
    assert call("PATCH", url, "pm", json={"notes": "x"}).status_code == 404
    assert call("GET", f"/tasks?project_id={pid}&trash=true", "dev").json()["total"] == 0
    assert call("GET", f"/tasks?project_id={pid}&trash=true", "pm").json()["total"] == 1
    assert call("POST", f"{url}/restore", "dev").status_code == 403
    assert call("POST", f"{url}/restore", "pm").status_code == 200
    assert call("POST", f"{url}/restore", "pm").status_code == 409
    call("DELETE", url, "pm")
    assert call("DELETE", f"{url}/purge", "dev").status_code == 403
    assert call("DELETE", f"{url}/purge", "pm").status_code == 204
    assert call("GET", url, "pm").status_code == 404
    actions = [i["action"] for i in call("GET", f"/logs?project_id={pid}&entity=task", "pm").json()["items"]]
    assert {"created", "deleted", "restored", "purged"} <= set(actions)  # history survives the purge


def test_task_history_includes_entity_for_task_drawer(world):
    call = world["call"]
    t = new_task(world)
    history = call("GET", f"/tasks/{t['id']}/history", "pm").json()
    assert history[0]["entity"] == "task"
    assert history[0]["entity_label"] == t["title"]


def test_creator_can_delete_and_restore_but_only_pm_can_purge(world):
    call = world["call"]
    other = new_task(world)
    assert call("DELETE", f"/tasks/{other['id']}", "pm").status_code == 204
    t = new_task(world, "dev")
    url = f"/tasks/{t['id']}"

    assert call("DELETE", url, "dev").status_code == 204
    trash = call("GET", f"/tasks?project_id={world['pid']}&trash=true", "dev").json()
    assert trash["total"] == 1 and trash["trash_count"] == 2
    assert trash["items"][0]["id"] == t["id"]
    assert call("GET", url, "dev").status_code == 200
    assert call("POST", f"{url}/restore", "qa").status_code == 403
    assert call("POST", f"{url}/restore", "dev").status_code == 200
    assert call("DELETE", url, "dev").status_code == 204
    assert call("DELETE", f"{url}/purge", "dev").status_code == 403
    assert call("DELETE", f"{url}/purge", "pm").status_code == 204
    assert call("DELETE", f"/tasks/{other['id']}/purge", "pm").status_code == 204


def test_deleted_tasks_do_not_count_on_dashboard(world):
    call = world["call"]
    t = new_task(world)
    assert call("GET", "/dashboard").json()["kpis"]["open_tasks"] == 1
    call("DELETE", f"/tasks/{t['id']}", "pm")
    assert call("GET", "/dashboard").json()["kpis"]["open_tasks"] == 0


def test_dashboard_my_tasks_scope_only_counts_assigned_tasks(world):
    call = world["call"]
    new_task(world, assignee_id=USERS["dev"].id, is_blocked=True, due_date="2000-01-01")
    new_task(world, assignee_id=USERS["qa"].id)
    new_task(world)

    assert call("GET", "/dashboard?scope=my_tasks").status_code == 401
    mine = call("GET", "/dashboard?scope=my_tasks", "dev").json()
    assert mine["kpis"] == {
        "total_projects": 1,
        "open_tasks": 1,
        "blocked": 1,
        "overdue": 1,
        "due_soon": 0,
    }
    assert mine["projects"][0]["total"] == 1

    my_projects = call("GET", "/dashboard?scope=my_projects", "dev").json()
    assert my_projects["kpis"]["total_projects"] == 1
    assert my_projects["projects"][0]["total"] == 3


# ---------------------------------------------------------------- members
def test_member_management_is_pm_only(world):
    call, pid = world["call"], world["pid"]
    zed = USERS["zed"].email
    assert call("POST", f"/projects/{pid}/members", "dev", json={"email": zed, "role": "Dev"}).status_code == 403
    # an email with no account is invited instead; without SUPABASE_SERVICE_ROLE_KEY the PM gets a clear "not set up" error
    assert call("POST", f"/projects/{pid}/members", "pm", json={"email": "nobody@example.com", "role": "Dev"}).status_code == 503
    assert call("POST", f"/projects/{pid}/members", "pm", json={"email": USERS["dev"].email, "role": "Dev"}).status_code == 409
    assert call("POST", f"/projects/{pid}/members", "pm", json={"email": zed, "role": "PM"}).status_code == 422
    assert call("POST", f"/projects/{pid}/members", "pm", json={"email": zed, "role": "Infra"}).status_code == 201
    assert call("PUT", f"/projects/{pid}/members/{USERS['zed'].id}", "pm", json={"role": "BA"}).status_code == 200
    assert call("PUT", f"/projects/{pid}/members/{USERS['zed'].id}", "dev", json={"role": "QA"}).status_code == 403
    assert call("PUT", f"/projects/{pid}/members/{USERS['pm'].id}", "pm", json={"role": "Dev"}).status_code == 422
    assert call("DELETE", f"/projects/{pid}/members/{USERS['pm'].id}", "pm").status_code == 422


def test_removing_a_member_unassigns_their_tasks(world):
    call, pid = world["call"], world["pid"]
    t = new_task(world, assignee_id=USERS["dev"].id)
    assert call("DELETE", f"/projects/{pid}/members/{USERS['dev'].id}", "pm").status_code == 204
    after = call("GET", f"/tasks/{t['id']}").json()
    assert after["assignee_id"] is None and after["title"] == "Write UAT plan"
    assert call("POST", "/tasks", "dev", json={"project_id": pid, "title": "x", "due_date": "2026-12-01"}).status_code == 403


def test_only_allowed_emails_can_create_projects(api, monkeypatch):
    from app import config
    for who in ("pm", "zed"):
        api("GET", "/me", who)
    monkeypatch.setattr(config, "PM_EMAILS", {USERS["pm"].email})
    assert api("POST", "/projects", "zed", json={"name": "Mine"}).status_code == 403
    assert api("POST", "/projects", "pm", json={"name": "Mine"}).status_code == 201
    assert api("GET", "/me", "zed").json()["can_create_project"] is False


def test_only_pm_edits_or_deletes_project(world):
    call, pid = world["call"], world["pid"]
    assert call("PUT", f"/projects/{pid}", "dev", json={"name": "Hacked"}).status_code == 403
    assert call("DELETE", f"/projects/{pid}", "dev").status_code == 403
    assert call("PUT", f"/projects/{pid}", "pm", json={"name": "Renamed", "health": "amber"}).json()["health"] == "amber"
    new_task(world)
    assert call("DELETE", f"/projects/{pid}", "pm").status_code == 204
    assert call("GET", f"/projects/{pid}").status_code == 404


# ---------------------------------------------------------------- activity log
def test_log_records_who_changed_what(world):
    call, pid = world["call"], world["pid"]
    t = new_task(world, assignee_id=USERS["dev"].id)
    call("PATCH", f"/tasks/{t['id']}", "dev", json={"status": "in_progress"})
    call("PATCH", f"/tasks/{t['id']}", "pm", json={"assignee_id": USERS["qa"].id})
    items = call("GET", f"/logs?project_id={pid}&entity=task", "qa").json()["items"]
    updates = [i for i in items if i["action"] == "updated"]
    status_change = next(i for i in updates if "status" in i["changes"])
    assert status_change["actor_name"] == "Dev" and status_change["changes"]["status"] == ["todo", "in_progress"]
    assert next(i for i in updates if "assignee_id" in i["changes"])["changes"]["assignee_id"] == ["Dev", "Qa"]
    history = call("GET", f"/tasks/{t['id']}/history", "dev").json()
    assert [h["action"] for h in history] == ["updated", "updated", "created"]


def test_logs_are_for_members_only(world):
    call, pid = world["call"], world["pid"]
    new_task(world)
    assert call("GET", "/logs", "zed").json()["total"] == 0           # sees nothing from this project
    assert call("GET", f"/logs?project_id={pid}", "zed").status_code == 403
    assert call("GET", "/logs", "dev").json()["total"] > 0
    t = new_task(world)
    assert call("GET", f"/tasks/{t['id']}/history", "zed").status_code == 403
    assert call("GET", f"/tasks/{t['id']}/history").status_code == 401


# ---------------------------------------------------------------- team
def test_team_progress_and_email_visibility(world):
    call, pid = world["call"], world["pid"]
    a = new_task(world, assignee_id=USERS["dev"].id, due_date="2000-01-01")  # overdue
    b = new_task(world, assignee_id=USERS["dev"].id)
    call("PATCH", f"/tasks/{b['id']}", "pm", json={"ticket_stage": "CLOSED"})
    dev = next(p for p in call("GET", f"/team?project_id={pid}").json() if p["name"] == "Dev")
    assert (dev["total"], dev["done"], dev["progress_pct"], dev["overdue"]) == (2, 1, 50, 1)
    assert dev["roles"][0]["role"] == "Dev" and dev["email"] is None
    assert next(p for p in call("GET", "/team", "pm").json() if p["name"] == "Dev")["email"] == USERS["dev"].email
    assert next(p for p in call("GET", "/team", "qa").json() if p["name"] == "Dev")["email"] is None
    assert call("GET", f"/tasks?assignee_id={USERS['dev'].id}&page_size=50").json()["total"] == 2


# ---------------------------------------------------------------- meetings (PM only)
def test_meetings_private_to_pm_with_collapsed_transcript(world):
    call, pid = world["call"], world["pid"]
    body = {"project_id": pid, "title": "Sprint planning", "meeting_date": "2026-11-20",
            "attendees_internal": ["Asleena", " Amir ", ""], "attendees_client": ["Sara"], "transcript": "Hello team"}
    m = call("POST", "/meetings", "pm", json=body)
    assert m.status_code == 201, m.text
    m = m.json()
    assert "transcript" not in m and m["transcript_chars"] == 10
    assert m["attendees_internal"] == ["Asleena", "Amir"] and m["attendees_client"] == ["Sara"]
    url = f"/meetings/{m['id']}"
    assert call("GET", f"{url}/transcript", "pm").json()["text"] == "Hello team"
    for who, code in (("dev", 403), ("zed", 403), (None, 401)):
        assert call("GET", url, who).status_code == code
        assert call("GET", f"{url}/transcript", who).status_code == code
        assert call("POST", "/meetings", who, json=body).status_code == code
    assert call("GET", "/meetings", "dev").json() == []
    # saving the form without the transcript keeps it
    upd = {**body, "title": "Sprint planning 2", "attendees_client": []}
    r = call("PUT", url, "pm", json=upd)
    assert r.json()["title"] == "Sprint planning 2" and r.json()["transcript_chars"] == 10
    assert call("GET", f"{url}/export", "pm").status_code == 409
    rows = [{"no": 1, "topic": "UAT", "details": "1. Dates", "action_items": ["Send plan"]}]
    assert call("PUT", url, "pm", json={**upd, "summary_rows": rows, "next_actions": ["Confirm date"]}).status_code == 200
    ex = call("GET", f"{url}/export", "pm")
    assert ex.status_code == 200 and ex.content[:2] == b"PK"
    assert call("DELETE", url, "dev").status_code == 403
    assert call("DELETE", url, "pm").status_code == 204


def test_meeting_resummarize_replaces_existing_summary(world, monkeypatch):
    from app.routers import meetings
    from app.schemas.meeting import SummaryResult, SummaryRow

    call, pid = world["call"], world["pid"]
    meeting = call("POST", "/meetings", "pm", json={
        "project_id": pid, "title": "Kickoff", "transcript": "Discuss delivery dates",
    }).json()
    calls = []

    results = iter([
        SummaryResult(
            rows=[SummaryRow(no=1, topic="Schedule", details="", action_items=["Confirm date"])],
            next_actions=["Follow up"],
        ),
        SummaryResult(
            rows=[SummaryRow(no=1, topic="Review", details="", action_items=["Book review"])],
            next_actions=["Schedule review"],
        ),
    ])

    def summarize(transcript):
        calls.append(transcript)
        return next(results)

    monkeypatch.setattr(meetings.summarizer, "summarize", summarize)
    url = f"/meetings/{meeting['id']}/summarize"
    first = call("POST", url, "pm")
    second = call("POST", url, "pm")
    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["summary_rows"][0]["action_items"] == ["Book review"]
    assert second.json()["next_actions"] == ["Schedule review"]
    assert calls == ["Discuss delivery dates", "Discuss delivery dates"]


def test_only_pm_links_tasks_to_meetings(world):
    call, pid = world["call"], world["pid"]
    m = call("POST", "/meetings", "pm", json={"project_id": pid, "title": "Kickoff"}).json()
    assigned = call("POST", "/tasks", "pm", json={
        "project_id": pid, "title": "Action", "meeting_id": m["id"], "assignee_id": USERS["dev"].id,
        "due_date": "2026-12-01",
    })
    assert assigned.status_code == 201
    assert call("POST", "/tasks", "pm", json={
        "project_id": pid, "title": "Unassigned action", "meeting_id": m["id"], "due_date": "2026-12-01",
    }).status_code == 201
    assert call("POST", "/tasks", "dev", json={
        "project_id": pid, "title": "Action", "meeting_id": m["id"], "due_date": "2026-12-01",
    }).status_code == 403
    other = call("POST", "/projects", "pm", json={"name": "Other"}).json()["id"]
    assert call("POST", "/tasks", "pm", json={
        "project_id": other, "title": "x", "meeting_id": m["id"], "due_date": "2026-12-01",
    }).status_code == 422
    detail = call("GET", f"/meetings/{m['id']}", "pm").json()
    assert detail["assigned_action_items"] == [{
        "title": "Action", "assignee_id": str(USERS["dev"].id), "assignee_name": "Dev",
    }]
    assert call("GET", "/meetings", "pm").json()[0]["tasks_created"] == 2


def test_linked_task_title_updates_meeting_action_item(world):
    call, pid = world["call"], world["pid"]
    meeting = call("POST", "/meetings", "pm", json={"project_id": pid, "title": "Kickoff"}).json()
    action = "Confirm delivery date"
    rows = [{"no": 1, "topic": "Schedule", "details": "", "action_items": [action]}]
    saved = call("PUT", f"/meetings/{meeting['id']}", "pm", json={
        "project_id": pid, "title": "Kickoff", "summary_rows": rows, "next_actions": [action],
    })
    assert saved.status_code == 200

    created = call("POST", "/tasks", "pm", json={
        "project_id": pid, "meeting_id": meeting["id"], "meeting_action_item": action,
        "title": "Agree on launch date", "assignee_id": USERS["dev"].id, "due_date": "2026-12-01",
    })
    assert created.status_code == 201, created.text
    detail = call("GET", f"/meetings/{meeting['id']}", "pm").json()
    assert detail["summary_rows"][0]["action_items"] == ["Agree on launch date"]
    assert detail["next_actions"] == ["Agree on launch date"]

    updated = call("PATCH", f"/tasks/{created.json()['id']}", "pm", json={"title": "Set launch date"})
    assert updated.status_code == 200
    detail = call("GET", f"/meetings/{meeting['id']}", "pm").json()
    assert detail["summary_rows"][0]["action_items"] == ["Set launch date"]
    assert detail["next_actions"] == ["Set launch date"]


def test_transcript_upload_is_pm_only(world):
    call = world["call"]
    files = {"file": ("t.txt", b"Hello there")}
    assert call("POST", "/transcripts/parse", "pm", files=files).json()["text"] == "Hello there"
    assert call("POST", "/transcripts/parse", "dev", files={"file": ("t.txt", b"x")}).status_code == 403
    assert call("POST", "/transcripts/parse", "pm", files={"file": ("t.pdf", b"x")}).status_code == 415


# ---------------------------------------------------------------- calendar
def test_agenda_and_calendar(world):
    call, pid = world["call"], world["pid"]
    today = call("GET", "/agenda?scope=all").json()["today"]
    new_task(world, assignee_id=USERS["dev"].id, title="Due today", due_date=today)
    new_task(world, assignee_id=USERS["dev"].id, title="Overdue", due_date="2000-01-01")
    new_task(world, assignee_id=USERS["qa"].id, title="Someone else's", due_date=today)
    mine = call("GET", "/agenda?scope=mine", "dev").json()
    assert [t["title"] for t in mine["due_today"]] == ["Due today"]
    assert [t["title"] for t in mine["overdue"]] == ["Overdue"] and mine["due_today"][0]["is_mine"]
    assert len(call("GET", "/agenda?scope=all").json()["due_today"]) == 2
    assert call("GET", "/agenda?scope=mine").json()["due_today"] == []   # visitor has no "mine"
    call("POST", "/meetings", "pm", json={"project_id": pid, "title": "Standup", "meeting_date": today})
    cal = lambda who: call("GET", f"/calendar?start={today}&end={today}", who).json()  # noqa: E731
    assert len(cal("pm")["meetings"]) == 1 and cal("dev")["meetings"] == [] and cal(None)["meetings"] == []
    assert len(cal(None)["tasks"]) == 2  # "Due today" + "Someone else's"
    assert call("GET", "/calendar?start=2026-01-01&end=2026-12-31").status_code == 422


def test_done_tasks_leave_the_agenda(world):
    call = world["call"]
    today = call("GET", "/agenda?scope=all").json()["today"]
    t = new_task(world, assignee_id=USERS["dev"].id, due_date=today)
    call("PATCH", f"/tasks/{t['id']}", "dev", json={"status": "done"})
    assert call("GET", "/agenda?scope=mine", "dev").json()["due_today"] == []
    assert len(call("GET", f"/calendar?start={today}&end={today}", "dev").json()["tasks"]) == 1


def test_list_filters_sort_and_paging(world):
    call, pid = world["call"], world["pid"]
    for i, pr in enumerate(("low", "high", "medium")):
        new_task(world, title=f"T{i}", priority=pr)
    r = call("GET", f"/tasks?project_id={pid}&sort=priority&page_size=2").json()
    assert [t["priority"] for t in r["items"]] == ["high", "medium"] and r["total"] == 3
    assert call("GET", f"/tasks?project_id={pid}&sort=bogus").status_code == 422
    assert call("GET", f"/tasks?project_id={pid}&q=t1").json()["total"] == 1
