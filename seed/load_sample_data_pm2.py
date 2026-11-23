"""Load sample_data_pm2.json into the project tracker API as a second PM.

Log in as the NEW PM account first (Swagger /login, or the app) to get that
account's access token. Data is created under whichever user the token
belongs to, so use the new PM's token, not the old one.

Usage (run from the folder containing sample_data_pm2.json):
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

API_URL = os.getenv("API_URL", "http://localhost:8000")
TOKEN = os.getenv("TOKEN", "")
DRY_RUN = "--dry-run" in sys.argv
DATA_FILE = "sample_data_pm2.json"

# Same value mappings as the first seed script.
TASK_STATUS = {
    "To Do": "todo",
    "In Progress": "in_progress",
    "Pending Review": "pending_review",
    "Done": "done",
}
PRIORITY = {"High": "high", "Medium": "medium", "Low": "low"}


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


def main():
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
        body = {
            "project_id": project_ids[m["project_id"]],
            "title": m["title"],
            "meeting_date": m["date"],
            "attendees": ", ".join(m["attendees"]),
            "transcript": m["transcript"],
            "summary_rows": [
                {"no": r["no"], "topic": r["topic"],
                 "details": r["details"], "action_items": r["action_items"]}
                for r in m["summary"]
            ],
            "next_actions": [r["action_items"] for r in m["summary"]],
        }
        post("/meetings", body)
        print(f"  Created meeting: {m['title']}")

    print("Done.")


if __name__ == "__main__":
    main()
