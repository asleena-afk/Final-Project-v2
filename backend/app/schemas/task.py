from datetime import date
from typing import Annotated, Literal, get_args
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from app.services.stages import STAGES

Stage = Literal[
    "NEW / CLARIFICATION",
    "FOR DEVELOPMENT",
    "PENDING DEV ASSIGNMENT",
    "DEVELOPMENT IN PROGRESS",
    "FOR CODE MERGE & DEPLOYMENT",
    "TEST FAILED",
    "FOR TESTING",
    "FOR UAT DEPLOYMENT",
    "UAT FIXPACK",
    "FOR PROD DEPLOYMENT",
    "CLOSED",
]
assert set(get_args(Stage)) == set(STAGES), "Stage in task.py is out of sync with stages.py"

Status = Literal["todo", "in_progress", "pending_review", "done"]
Priority = Literal["high", "medium", "low"]
Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]


class TaskCreate(BaseModel):
    """Any project member may add a task. The server fills in who created it."""
    project_id: UUID
    meeting_id: UUID | None = None
    meeting_action_item: str | None = Field(default=None, max_length=5000)
    title: Title
    notes: str = Field(default="", max_length=5000)
    status: Status = "todo"
    priority: Priority = "medium"
    due_date: date
    due_time: str | None = Field(default=None, max_length=20)
    assignee_id: UUID | None = None
    is_blocked: bool = False
    blocker_reason: str | None = Field(default=None, max_length=300)
    ticket_ref: str | None = Field(default=None, max_length=40)
    module: str | None = Field(default=None, max_length=60)
    estimate_hrs: float | None = Field(default=None, ge=0)
    ticket_stage: Stage | None = None


class TaskPatch(BaseModel):
    """Partial update: send only the fields that change. project_id cannot be changed."""
    model_config = ConfigDict(extra="forbid")

    meeting_id: UUID | None = None
    title: Title | None = None
    notes: str | None = Field(default=None, max_length=5000)
    status: Status | None = None
    priority: Priority | None = None
    due_date: date | None = None
    due_time: str | None = None
    assignee_id: UUID | None = None
    is_blocked: bool | None = None
    blocker_reason: str | None = Field(default=None, max_length=300)
    ticket_ref: str | None = Field(default=None, max_length=40)
    module: str | None = Field(default=None, max_length=60)
    estimate_hrs: float | None = Field(default=None, ge=0)
    ticket_stage: Stage | None = None

