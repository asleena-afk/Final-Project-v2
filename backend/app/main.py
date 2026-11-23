from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app import config
from app.routers import calendar, dashboard, logs, me, meetings, projects, tasks, team, transcripts

app = FastAPI(title="Task Meeting Tracker v2 API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

for module in (me, dashboard, projects, tasks, team, logs, calendar, meetings, transcripts):
    app.include_router(module.router)


@app.get("/health")
def health():
    return {"ok": True}
