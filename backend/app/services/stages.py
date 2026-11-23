"""Ticket stage -> main task status. One place to edit the mapping."""

STAGE_TO_STATUS = {
    "NEW / CLARIFICATION": "todo",
    "FOR DEVELOPMENT": "todo",
    "PENDING DEV ASSIGNMENT": "todo",
    "DEVELOPMENT IN PROGRESS": "in_progress",
    "FOR CODE MERGE & DEPLOYMENT": "in_progress",
    "TEST FAILED": "in_progress",
    "FOR TESTING": "pending_review",
    "FOR UAT DEPLOYMENT": "pending_review",
    "UAT FIXPACK": "pending_review",
    "FOR PROD DEPLOYMENT": "pending_review",
    "CLOSED": "done",
}

STAGES = list(STAGE_TO_STATUS)


def status_for_stage(stage: str | None, current: str) -> str:
    """A stage sets the status; no stage leaves the status as it is."""
    return STAGE_TO_STATUS[stage] if stage else current
