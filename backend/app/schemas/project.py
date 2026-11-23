from typing import Literal
from pydantic import BaseModel, Field, StringConstraints
from typing import Annotated

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]


class ProjectIn(BaseModel):
    name: Name
    description: str = Field(default="", max_length=5000)
    status: Literal["active", "on_hold", "done"] = "active"
    health: Literal["green", "amber", "red"] = "green"
    health_note: str | None = Field(default=None, max_length=300)


class MemberIn(BaseModel):
    email: str = Field(min_length=3, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    role: Literal["BA", "Dev", "QA", "Infra"]


class MemberRole(BaseModel):
    role: Literal["BA", "Dev", "QA", "Infra"]


class ProfileIn(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
