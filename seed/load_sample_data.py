"""Load the demo projects, tasks and meetings straight into the database.

No email, password or token is needed: this script talks to Postgres directly with DATABASE_URL from backend/.env,
the same way the API itself does. It never goes through the API, and the API still refuses anonymous writes.
Run it from your own computer only.

    python seed/load_sample_data.py you@example.com

`you@example.com` is the account you already signed up with. It becomes the PM of the demo projects.
Running it again skips projects that already exist.

The sample people (Amir, Daniel...) are not real accounts yet, so tasks are left unassigned and the intended
person is written in the task notes. Add them on the project's Team tab once they sign up, then assign.
"""
import json
import os
import sys
from pathlib import Path

import psycopg
from dotenv import load_dotenv
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT.parent / "backend" / ".env")

STATUS = {"To Do": "todo", "In Progress": "in_progress", "Pending Review": "pending_review", "Done": "done"}


def split_items(text):
    """The sample file keeps action items as one sentence string; the app wants a list."""
    if isinstance(text, list):
        return [t for t in text if t]
    return [s.strip().rstrip(".") + "." for s in (text or "").replace("\n", " ").split(". ") if s.strip()]


def main(email):
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL is missing. Put it in backend/.env first.")
    data = json.loads((ROOT / "sample_data.json").read_text(encoding="utf-8"))
    with psycopg.connect(url, row_factory=dict_row) as db:
        db.execute("set search_path to tt2, public")
        row = db.execute("select id from auth.users where lower(email)=lower(%s)", (email,)).fetchone()
        if not row:
            sys.exit(f"No account for {email}. Sign up in the app first, then run this again.")
        uid = row["id"]
        db.execute("insert into profiles (id, name, email) values (%s, split_part(%s,'@',1), %s) on conflict (id) do nothing",
                   (uid, email, email))
        pmap, made = {}, {"projects": 0, "tasks": 0, "meetings": 0}
        for p in data["projects"]:
            existing = db.execute("select id from projects where owner_id=%s and name=%s", (uid, p["name"])).fetchone()
            if existing:
                print(f"skip (already there): {p['name']}")
                continue
            desc = p["description"] + (f"\nClient: {p['client']}" if p.get("client") else "")
            r = db.execute("insert into projects (owner_id,name,description,health) values (%s,%s,%s,%s) returning id",
                           (uid, p["name"], desc, p["health"].lower())).fetchone()
            db.execute("insert into project_members (project_id,user_id,role) values (%s,%s,'PM')", (r["id"], uid))
            pmap[p["id"]] = r["id"]; made["projects"] += 1
        for t in data["tasks"]:
            if t["project_id"] not in pmap:
                continue
            blocked = bool(t.get("blocked"))
            note = f"Assignee (not yet on team): {t['assignee']} ({t['role']})" if t.get("assignee") else ""
            db.execute(
                "insert into tasks (project_id,created_by,title,notes,status,priority,due_date,is_blocked,blocker_reason) "
                "values (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                (pmap[t["project_id"]], uid, t["title"], note, STATUS[t["status"]], t["priority"].lower(), t.get("due_date"),
                 blocked, (t.get("blocker_note") or "Blocked") if blocked else None))
            made["tasks"] += 1
        for m in data["meetings"]:
            if m["project_id"] not in pmap:
                continue
            rows = [{"no": r["no"], "topic": r["topic"], "details": r.get("details", ""), "action_items": split_items(r.get("action_items"))}
                    for r in m.get("summary") or []]
            db.execute(
                "insert into meetings (project_id,created_by,title,meeting_date,attendees_internal,attendees_client,transcript,summary_rows,next_actions) "
                "values (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                (pmap[m["project_id"]], uid, m["title"], m.get("date"), m.get("attendees", []), [], m.get("transcript", ""),
                 Jsonb(rows) if rows else None, Jsonb([]) if rows else None))
            made["meetings"] += 1
        db.commit()
    print(f"Loaded {made['projects']} projects, {made['tasks']} tasks, {made['meetings']} meetings for {email}.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Usage: python seed/load_sample_data.py your-email@example.com")
    main(sys.argv[1])
