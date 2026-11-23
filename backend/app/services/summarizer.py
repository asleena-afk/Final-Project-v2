import json
import os
import time

from pydantic import ValidationError
from app.schemas.meeting import SummaryResult

# Supports comma-separated GEMINI_MODELS, falling back to GEMINI_MODEL or default
_raw_models = os.getenv("GEMINI_MODELS") or os.getenv("GEMINI_MODEL") or "gemini-3.5-flash-lite,gemini-3.8-flash"
MODELS = [m.strip() for m in _raw_models.split(",") if m.strip()]

PROMPT = """You write minutes of meeting (MOM) from a transcript.
Return JSON only, in this shape:
{"rows":[{"no":1,"topic":"...","details":"...","action_items":["..."]}],"next_actions":["..."]}
Rules:
- One row per topic discussed, in the order discussed, at most 50 rows.
- "details" is plain text: numbered points, with "- " sub-points on new lines.
- "action_items" are things someone must do, written as short tasks. Use [] when there are none.
- "next_actions" are the 3 to 8 key follow-ups for the whole meeting.
- Use only what the transcript says. Do not invent names, dates or decisions.
- Write in the same language as the transcript.

Transcript:
"""

RETRY_CODES = (429, 500, 503)
ATTEMPTS_PER_MODEL = 2


class AIBusy(Exception):
    pass


class AIBadOutput(Exception):
    pass


def summarize(transcript: str) -> SummaryResult:
    from google import genai
    from google.genai import errors, types

    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY", ""))
    resp = None
    last_busy_err = None

    for model_name in MODELS:
        for attempt in range(ATTEMPTS_PER_MODEL):
            try:
                resp = client.models.generate_content(
                    model=model_name,
                    contents=PROMPT + transcript,
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        temperature=0.2,
                    ),
                )
                break
            except errors.APIError as e:
                code = getattr(e, "code", None)
                print(f"GEMINI ERROR ({model_name}):", code, getattr(e, "message", e), "attempt", attempt + 1)
                if code in RETRY_CODES:
                    last_busy_err = e
                    if attempt < ATTEMPTS_PER_MODEL - 1:
                        time.sleep(2 * (attempt + 1))  # waits 2s before retrying same model
                        continue
                    break  # move on to the next model in MODELS
                raise
        if resp is not None:
            break

    if resp is None:
        raise AIBusy() from last_busy_err

    try:
        result = SummaryResult.model_validate(json.loads(resp.text))
    except (ValueError, ValidationError) as e:
        raise AIBadOutput() from e
    for i, row in enumerate(result.rows, 1):
        row.no = i
    return result
