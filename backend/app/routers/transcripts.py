from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from app.auth import User, require_user
from app.db import get_db
from app.services.transcript_parser import SUPPORTED, UnsupportedFile, parse_transcript

router = APIRouter(prefix="/transcripts", tags=["transcripts"])
MAX_BYTES = 2 * 1024 * 1024
MAX_CHARS = 200_000


@router.post("/parse")
async def parse(file: UploadFile = File(...), user: User = Depends(require_user), db=Depends(get_db)):
    """Read an uploaded file and return its text. Nothing is stored. Project managers only."""
    if not db.execute("select 1 from projects where owner_id=%s limit 1", (user.id,)).fetchone():
        raise HTTPException(403, "Meetings are private to the project manager")
    if not (file.filename or "").lower().endswith(SUPPORTED):
        raise HTTPException(415, "File type not supported. Use .docx, .vtt, .srt or .txt")
    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "File is over 2 MB")
    try:
        text = parse_transcript(file.filename, data)
    except UnsupportedFile:
        raise HTTPException(415, "File type not supported")
    except Exception:
        raise HTTPException(422, "Could not read that file")
    if len(text) > MAX_CHARS:
        raise HTTPException(422, "Transcript is over 200,000 characters")
    return {"text": text, "characters": len(text)}
