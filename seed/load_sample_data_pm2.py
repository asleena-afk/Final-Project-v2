"""Load sample_data_pm2.json into the project tracker API as a second PM.

Log in as the NEW PM account first (Swagger /login, or the app) to get that
account's access token. Data is created under whichever user the token
belongs to, so use the new PM's token, not the old one.

Usage (run from the folder containing sample_data_pm2.json):
    Direct database (recommended):
        py load_sample_data_pm2.py your-email@example.com

    Windows PowerShell:
        $env:TOKEN = "paste_new_pm_access_token_here"
        py load_sample_data_pm2.py --dry-run
        py load_sample_data_pm2.py
    macOS:
        export TOKEN="paste_new_pm_access_token_here"
        python3 load_sample_data_pm2.py --dry-run
        python3 load_sample_data_pm2.py

Optional: set API_URL if the backend is not on http://localhost:8000.
Do not commit your token. Running twice creates duplicates.
"""
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

import psycopg
from dotenv import load_dotenv
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

API_URL = os.getenv("API_URL", "http://localhost:8000")
TOKEN = os.getenv("TOKEN", "")
DRY_RUN = "--dry-run" in sys.argv
DATA_FILE = str(Path(__file__).resolve().with_name("sample_data_pm2.json"))
ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT.parent / "backend" / ".env")

# Same value mappings as the first seed script.
TASK_STATUS = {
    "To Do": "todo",
    "In Progress": "in_progress",
    "Pending Review": "pending_review",
    "Done": "done",
}
PRIORITY = {"High": "high", "Medium": "medium", "Low": "low"}


def split_items(text):
    if isinstance(text, list):
        return [item for item in text if item]
    return [
        sentence.strip().rstrip(".") + "."
        for sentence in (text or "").replace("\n", " ").split(". ")
        if sentence.strip()
    ]


def post(path, body):
    if DRY_RUN:
        print(f"[dry run] POST {path}\n{json.dumps(body, indent=2)}\n")
        return {"id": f"dry-{path}"}
    request = urllib.request.Request(
        API_URL + path,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json",
                 "Authorization": f"Bearer {TOKEN}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as error:
        print(f"FAILED POST {path}: HTTP {error.code}")
        print(error.read().decode("utf-8"))
        print("Request body was:")
        print(json.dumps(body, indent=2))
        sys.exit(1)


def get(path):
    request = urllib.request.Request(
        API_URL + path,
        headers={"Authorization": f"Bearer {TOKEN}"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(request) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as error:
        print(f"FAILED GET {path}: HTTP {error.code}")
        print(error.read().decode("utf-8"))
        sys.exit(1)


def load_database(email):
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL is missing. Put it in backend/.env first.")

    data = json.loads(Path(DATA_FILE).read_text(encoding="utf-8"))
    with psycopg.connect(url, row_factory=dict_row) as db:
        db.execute("set search_path to tt2, public")
        row = db.execute(
            "select id from auth.users where lower(email)=lower(%s)",
            (email,),
        ).fetchone()
        if not row:
            sys.exit(f"No account for {email}. Sign up in the app first.")

        uid = row["id"]
        db.execute(
            "insert into profiles (id, name, email) values (%s, split_part(%s,'@',1), %s) "
            "on conflict (id) do nothing",
            (uid, email, email),
        )

        project_ids = {}
        for project in data["projects"]:
            existing = db.execute(
                "select id from projects where owner_id=%s and name=%s",
                (uid, project["name"]),
            ).fetchone()
            if not existing:
                created = db.execute(
                    "insert into projects (owner_id,name,description,status,health,health_note) "
                    "values (%s,%s,%s,'active',%s,%s) returning id",
                    (
                        uid,
                        project["name"],
                        f"Client: {project['client']}. {project['description']}",
                        project["health"].lower(),
                        {
                            "green": "On track.",
                            "amber": "Some risks to watch.",
                            "red": "Blocked, needs attention.",
                        }[project["health"].lower()],
                    ),
                ).fetchone()
                db.execute(
                    "insert into project_members (project_id,user_id,role) values (%s,%s,'PM')",
                    (created["id"], uid),
                )
                project_ids[project["id"]] = created["id"]
                print(f"Created project: {project['name']}")
            else:
                project_ids[project["id"]] = existing["id"]
                print(f"Skipped existing project: {project['name']}")

        meeting_count = 0
        for meeting in data["meetings"]:
            exists = db.execute(
                "select id from meetings where project_id=%s and title=%s",
                (project_ids[meeting["project_id"]], meeting["title"]),
            ).fetchone()
            if exists:
                print(f"Skipped existing meeting: {meeting['title']}")
                continue

            summary_rows = [
                {
                    "no": row["no"],
                    "topic": row["topic"],
                    "details": row["details"],
                    "action_items": split_items(row["action_items"]),
                }
                for row in meeting["summary"]
            ]
            next_actions = [
                item
                for summary_row in summary_rows
                for item in summary_row["action_items"]
            ]
            db.execute(
                "insert into meetings "
                "(project_id,created_by,title,meeting_date,attendees_internal,"
                "attendees_client,transcript,summary_rows,next_actions) "
                "values (%s,%s,%s,%s,%s,'{}',%s,%s,%s)",
                (
                    project_ids[meeting["project_id"]],
                    uid,
                    meeting["title"],
                    meeting["date"],
                    meeting["attendees"],
                    meeting["transcript"],
                    Jsonb(summary_rows),
                    Jsonb(next_actions),
                ),
            )
            meeting_count += 1
            print(f"Created meeting: {meeting['title']}")

        db.commit()
    print(f"Loaded {meeting_count} meeting(s) for {email}.")


def main():
    if len(sys.argv) == 2 and not sys.argv[1].startswith("-"):
        load_database(sys.argv[1])
        return

    if not DRY_RUN and not TOKEN:
        sys.exit("Set the TOKEN environment variable first.")

    with open(DATA_FILE, encoding="utf-8") as file:
        data = json.load(file)

    project_ids = {}
    for p in data["projects"]:
        health = p["health"].lower()
        body = {
            "name": p["name"],
            "description": f"Client: {p['client']}. {p['description']}",
            "status": "active",
            "health": health,
            "health_note": {
                "green": "On track.",
                "amber": "Some risks to watch.",
                "red": "Blocked, needs attention.",
            }[health],
        }
        project_ids[p["id"]] = post("/projects", body)["id"]
        print(f"Created project: {p['name']}")

    for t in data["tasks"]:
        body = {
            "project_id": project_ids[t["project_id"]],
            "title": t["title"],
            "notes": f"Role: {t['role']}",
            "status": TASK_STATUS[t["status"]],
            "priority": PRIORITY[t["priority"]],
            "due_date": t["due_date"],
            "assignee": t["assignee"],
            "is_blocked": t["blocked"],
            "blocker_reason": t["blocker_note"] or None,
        }
        post("/tasks", body)
        print(f"  Created task: {t['title']}")

    for m in data["meetings"]:
        summary_rows = [
            {
                "no": row["no"],
                "topic": row["topic"],
                "details": row["details"],
                "action_items": split_items(row["action_items"]),
            }
            for row in m["summary"]
        ]
        body = {
            "project_id": project_ids[m["project_id"]],
            "title": m["title"],
            "meeting_date": m["date"],
            "attendees_internal": m["attendees"],
            "transcript": m["transcript"],
            "summary_rows": summary_rows,
            "next_actions": [
                action_item
                for row in summary_rows
                for action_item in row["action_items"]
            ],
        }
        post("/meetings", body)
        print(f"  Created meeting: {m['title']}")

    if not DRY_RUN:
        meetings = get("/meetings")
        wanted = {m["title"] for m in data["meetings"]}
        found = {m["title"] for m in meetings if m["title"] in wanted}
        missing = sorted(wanted - found)
        if missing:
            sys.exit("Meetings were not visible after seeding: " + ", ".join(missing))
        print("Verified meetings are visible in the app API.")

    print("Done.")


if __name__ == "__main__":
    main()
