import io
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill, Border, Side


def _attendees(meeting: dict) -> str:
    """Two lines: Internal and Client. A line is left out when it has no names."""
    lines = []
    for label, key in (("Internal", "attendees_internal"), ("Client", "attendees_client")):
        names = [n for n in (meeting.get(key) or []) if n]
        if names:
            lines.append(f"{label}: {', '.join(names)}")
    return "\n".join(lines)


def build_mom(meeting: dict) -> bytes:
    """Excel in the MOM layout: title, header lines, 4-column table, numbered Next action list."""
    wb = Workbook()
    ws = wb.active
    ws.title = (meeting["title"] or "MOM")[:31].translate({ord(c): " " for c in r"[]:*?/\\"})
    bold = Font(bold=True)
    thin = Side(style="thin")
    box = Border(left=thin, right=thin, top=thin, bottom=thin)
    wrap = Alignment(wrap_text=True, vertical="top")

    ws["A1"] = meeting["title"]; ws["A1"].font = Font(bold=True, size=14)
    d = meeting.get("meeting_date")
    for r, (label, val) in enumerate(
        [("Date", d.strftime("%d %B %Y") if d else ""), ("Time", meeting.get("meeting_time") or ""),
         ("Location", meeting.get("location") or ""), ("Attendees", _attendees(meeting))], start=3):
        ws.cell(r, 1, label).font = bold
        ws.cell(r, 2, val).alignment = wrap
        ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=4)
    ws.row_dimensions[6].height = 32  # Internal and Client on two lines

    head = 8
    for c, h in enumerate(["No.", "Topic", "Details", "Action Items"], 1):
        cell = ws.cell(head, c, h)
        cell.font = bold; cell.border = box
        cell.fill = PatternFill("solid", fgColor="D9D9D9")
    r = head
    for row in meeting["summary_rows"] or []:
        r += 1
        vals = [row["no"], row["topic"], row.get("details", ""), "\n".join(f"- {a}" for a in row.get("action_items", []))]
        for c, v in enumerate(vals, 1):
            cell = ws.cell(r, c, v); cell.alignment = wrap; cell.border = box

    r += 2
    ws.cell(r, 1, "Next action:").font = bold
    for i, a in enumerate(meeting["next_actions"] or [], 1):
        r += 1
        ws.cell(r, 1, i)
        ws.cell(r, 2, a).alignment = wrap
        ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=4)

    for col, width in zip("ABCD", (8, 28, 70, 50)):
        ws.column_dimensions[col].width = width
    buf = io.BytesIO(); wb.save(buf)
    return buf.getvalue()
