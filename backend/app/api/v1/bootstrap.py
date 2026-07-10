from typing import Any
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.api import deps
from app.models.user import User

from app.api.v1.projects import get_projects, get_project_configs
from app.api.v1.users import get_my_hierarchy, get_all_permissions

router = APIRouter()

@router.get("/bootstrap")
def get_bootstrap(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """
    Unified bootstrap endpoint to load essential user metadata, roles, and project configurations
    in a single HTTP request. Transactional data (indents, drugs, shifts, vehicles, etc.) is loaded
    lazily to optimize the initial page load time.
    """
    # 1. Fetch user hierarchy details
    hierarchy = get_my_hierarchy(db=db, current_user=current_user)
    
    # 2. Get project configs
    configs = get_project_configs(db=db, current_user=current_user)
    
    # 3. Get projects list
    projects = get_projects(db=db, current_user=current_user)
    
    # 4. Fetch permissions list
    permissions = get_all_permissions(db=db, current_user=current_user)
    serialized_permissions = [
        {
            "id": p.id,
            "role": p.role,
            "page": p.page,
            "can_view": p.can_view,
            "can_create": p.can_create,
            "can_update": p.can_update,
            "can_delete": p.can_delete,
            "project": p.project
        }
        for p in permissions
    ]
    
    # 5. Check user shift status for today's date
    from app.models.shift import UserShiftState
    from datetime import datetime, timezone, timedelta
    
    tz = timezone(timedelta(hours=5, minutes=30))
    today_str = datetime.now(tz).strftime("%Y-%m-%d")
    
    shift_state = db.query(UserShiftState).filter(
        UserShiftState.user_id == current_user.id,
        UserShiftState.shift_date == today_str
    ).first()
    
    shift_status = "active"
    if shift_state and shift_state.status == "handed_over":
        shift_status = "view_only"
    
    return {
        "hierarchy": hierarchy,
        "configs": configs,
        "projects": projects,
        "permissions": serialized_permissions,
        "shift_status": shift_status
    }

