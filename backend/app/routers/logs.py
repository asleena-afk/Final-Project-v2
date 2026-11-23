from fastapi import APIRouter, Depends, Query
from app.auth import User, require_user
from app.db import get_db
from app.permissions import as_uuid, get_project, require_member

router = APIRouter(prefix="/logs", tags=["logs"])


@router.get("")
def list_logs(
    project_id: str | None = None,
    entity: str | None = Query(None, pattern="^(task|project|member)$"),
    action: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    user: User = Depends(require_user),
    db=Depends(get_db),
):
    """Activity history. Signed-in project members see the logs of the projects they belong to."""
    where, args = ["l.project_id in (select project_id from project_members where user_id=%s)"], [user.id]
    if project_id:
        project = get_project(db, project_id)
        require_member(db, project["id"], user)
        where.append("l.project_id=%s"); args.append(as_uuid(project_id, "Project"))
    if entity:
        where.append("l.entity=%s"); args.append(entity)
    if action:
        where.append("l.action=%s"); args.append(action)
    clause = " and ".join(where)
    total = db.execute(f"select count(*) as n from activity_log l where {clause}", args).fetchone()["n"]
    rows = db.execute(
        "select l.id, l.project_id, p.name as project_name, l.task_id, l.action, l.entity, l.entity_id, "
        "l.entity_label, l.changes, l.created_at, coalesce(a.name, l.actor_name) as actor_name "
        "from activity_log l join projects p on p.id=l.project_id left join profiles a on a.id=l.actor_id "
        f"where {clause} order by l.created_at desc, l.id desc limit %s offset %s",
        [*args, page_size, (page - 1) * page_size],
    ).fetchall()
    return {"items": rows, "total": total, "page": page, "page_size": page_size}
