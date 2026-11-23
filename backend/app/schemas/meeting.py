from datetime import date
from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints, field_validator
from uuid import UUID

Person = Annotated[str, StringConstraints(strip_whitespace=True, max_length=80)]


class SummaryRow(BaseModel):
    no: int
    topic: str = Field(max_length=200)
    details: str = ""
    action_items: list[str] = []


def _clean_names(values: list[str]) -> list[str]:
    return [v.strip() for v in values if v and v.strip()]


class MeetingIn(BaseModel):
    project_id: UUID
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
    meeting_date: date | None = None
    meeting_time: str | None = Field(default=None, max_length=60)
    location: str | None = Field(default=None, max_length=120)
    attendees_internal: list[Person] = Field(default=[], max_length=40)
    attendees_client: list[Person] = Field(default=[], max_length=40)
    # None on update means "keep the transcript as it is" (the editor does not load it until asked).
    transcript: str | None = Field(default=None, max_length=200_000)
    summary_rows: list[SummaryRow] | None = Field(default=None, max_length=50)
    next_actions: list[str] | None = Field(default=None, max_length=50)

    @field_validator("attendees_internal", "attendees_client")
    @classmethod
    def drop_blank_names(cls, v):
        return _clean_names(v)


class SummaryResult(BaseModel):
    rows: list[SummaryRow] = Field(max_length=50)
    next_actions: list[str] = []
