"""No database needed: parsing, stage mapping, Excel layout, request validation."""
import io
from datetime import date

import pytest
from docx import Document
from fastapi.testclient import TestClient
from openpyxl import load_workbook
from pydantic import ValidationError

from app.main import app
from app.schemas.meeting import MeetingIn
from app.schemas.task import TaskCreate, TaskPatch
from app.services.excel import build_mom
from app.services.stages import STAGES, status_for_stage
from app.services.transcript_parser import UnsupportedFile, parse_transcript


def test_health_is_open():
    assert TestClient(app).get("/health").json() == {"ok": True}


def test_stage_mapping():
    assert len(STAGES) == 11
    assert "PENDING DEV ASSIGNMENT" in STAGES and "Pending Dev Assignment & Sprint Planning" not in STAGES
    assert status_for_stage("CLOSED", "todo") == "done"
    assert status_for_stage("TEST FAILED", "todo") == "in_progress"
    assert status_for_stage("FOR TESTING", "todo") == "pending_review"
    assert status_for_stage("PENDING DEV ASSIGNMENT", "done") == "todo"
    assert status_for_stage(None, "in_progress") == "in_progress"


def test_task_validation():
    pid = "6f1c2d3e-0000-4000-8000-000000000001"
    with pytest.raises(ValidationError):
        TaskCreate(project_id=pid, title="   ", due_date="2026-12-01")
    with pytest.raises(ValidationError):
        TaskCreate(project_id=pid, title="x", estimate_hrs=-1, due_date="2026-12-01")
    with pytest.raises(ValidationError):
        TaskCreate(project_id=pid, title="x", ticket_stage="MADE UP", due_date="2026-12-01")
    with pytest.raises(ValidationError):
        TaskPatch(project_id=pid)  # a task cannot be moved to another project
    assert TaskCreate(project_id=pid, title="  padded  ", due_date="2026-12-01").title == "padded"


def test_meeting_attendee_lists_are_cleaned():
    m = MeetingIn(project_id="6f1c2d3e-0000-4000-8000-000000000001", title="x",
                  attendees_internal=["A", " ", " B "], attendees_client=[])
    assert m.attendees_internal == ["A", "B"] and m.transcript is None


def test_docx_timestamps_removed():
    d = Document(); d.add_paragraph("0:05\nHello team"); d.add_paragraph("1:12\nLet us start")
    buf = io.BytesIO(); d.save(buf)
    assert parse_transcript("a.docx", buf.getvalue()) == "Hello team\nLet us start"


def test_vtt_srt_txt_and_unsupported():
    vtt = "WEBVTT\n\n1\n00:00:01.000 --> 00:00:03.000\n<v Aisha>Morning all</v>\n\n00:00:04.000 --> 00:00:06.000\nplain line\n"
    assert parse_transcript("a.vtt", vtt.encode()) == "Aisha: Morning all\nplain line"
    assert parse_transcript("a.srt", b"1\n00:00:01,000 --> 00:00:02,000\nHi there\n") == "Hi there"
    assert parse_transcript("a.txt", b"  plain  ") == "plain"
    with pytest.raises(UnsupportedFile):
        parse_transcript("a.pdf", b"x")


def test_excel_layout_with_internal_and_client_attendees():
    m = {"title": "Weekly update", "meeting_date": date(2025, 7, 9), "meeting_time": "2.30pm", "location": "Teams",
         "attendees_internal": ["Asleena", "Amir"], "attendees_client": ["Sara"],
         "summary_rows": [{"no": 1, "topic": "UAT", "details": "1. Dates", "action_items": ["Send plan"]}],
         "next_actions": ["Confirm UAT date"]}
    ws = load_workbook(io.BytesIO(build_mom(m))).active
    assert ws["A1"].value == "Weekly update"
    assert ws["A6"].value == "Attendees" and ws["B6"].value == "Internal: Asleena, Amir\nClient: Sara"
    assert [c.value for c in ws[8]][:4] == ["No.", "Topic", "Details", "Action Items"]
    assert ws["D9"].value == "- Send plan"
    assert ws["A11"].value == "Next action:" and ws["B12"].value == "Confirm UAT date"


def test_excel_leaves_out_an_empty_client_line():
    m = {"title": "T", "meeting_date": None, "attendees_internal": ["A"], "attendees_client": [],
         "summary_rows": [], "next_actions": []}
    assert load_workbook(io.BytesIO(build_mom(m))).active["B6"].value == "Internal: A"


def test_due_date_is_required_on_a_new_task():
    with pytest.raises(ValidationError):
        TaskCreate(project_id="6f1c2d3e-0000-4000-8000-000000000001", title="No due date")
