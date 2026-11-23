import io
import re

TIMESTAMP_LINE = re.compile(r"^\d{1,2}:\d{2}(:\d{2})?([.,]\d{1,3})?$")
CUE_TIME = re.compile(r"\d{1,2}:\d{2}(:\d{2})?[.,]\d{3}\s*-->\s*\d{1,2}:\d{2}(:\d{2})?[.,]\d{3}")
VOICE_TAG = re.compile(r"<v\s+([^>]+)>(.*?)(</v>)?$")
ANY_TAG = re.compile(r"<[^>]+>")

SUPPORTED = (".docx", ".vtt", ".srt", ".txt")


class UnsupportedFile(Exception):
    pass


def _decode(data: bytes) -> str:
    for enc in ("utf-8-sig", "utf-16"):
        try:
            return data.decode(enc)
        except UnicodeError:
            continue
    return data.decode("latin-1")


def _clean_lines(lines: list[str]) -> str:
    out = [ln.strip() for ln in lines]
    text = "\n".join(out)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def parse_docx(data: bytes) -> str:
    from docx import Document

    doc = Document(io.BytesIO(data))
    lines: list[str] = []
    for p in doc.paragraphs:
        for ln in p.text.split("\n"):
            if ln.strip() and not TIMESTAMP_LINE.match(ln.strip()):
                lines.append(ln)
    return _clean_lines(lines)


def parse_cues(raw: str) -> str:
    """Shared reader for .vtt and .srt: drop headers, cue numbers and times, keep speaker names."""
    lines: list[str] = []
    for ln in raw.splitlines():
        s = ln.strip()
        if not s or s.upper().startswith(("WEBVTT", "NOTE", "STYLE")) or s.isdigit() or CUE_TIME.search(s):
            continue
        m = VOICE_TAG.match(s)
        s = f"{m.group(1).strip()}: {ANY_TAG.sub('', m.group(2)).strip()}" if m else ANY_TAG.sub("", s)
        if s:
            lines.append(s)
    return _clean_lines(lines)


def parse_transcript(filename: str, data: bytes) -> str:
    name = filename.lower()
    if name.endswith(".docx"):
        return parse_docx(data)
    if name.endswith((".vtt", ".srt")):
        return parse_cues(_decode(data))
    if name.endswith(".txt"):
        return _decode(data).strip()
    raise UnsupportedFile(filename)
