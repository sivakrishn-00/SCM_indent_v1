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
    from app.models.roster import ShiftRoster
    from datetime import datetime, timezone, timedelta
    
    tz = timezone(timedelta(hours=5, minutes=30))
    today = datetime.now(tz).date()
    today_str = today.strftime("%Y-%m-%d")
    
    shift_status = "active"
    
    # Check if user is exempt (Admin or Warehouse)
    is_exempt = False
    if current_user.username == "admin" or str(current_user.role).lower() == "admin":
        is_exempt = True
    else:
        from app.api.v1.utils import get_hierarchy_maps
        emp_code_to_details, _, _ = get_hierarchy_maps()
        user_details = emp_code_to_details.get(current_user.username)
        if user_details:
            office = user_details.get("office_name", "").lower()
            office_loc = user_details.get("office_location", "").lower()
            if "central ware house" in office or "central warehouse" in office or "central ware house" in office_loc or "central warehouse" in office_loc:
                is_exempt = True

    if not is_exempt:
        # Check if they are classified as an operator
        role_lower = str(current_user.role).lower()
        is_operator = "operator" in role_lower or "pilot" in role_lower or "paravet" in role_lower
        
        if is_operator:
            # Check if they have active roster entries for today
            roster_entries = db.query(ShiftRoster).filter(
                ShiftRoster.employee_code == current_user.username,
                ShiftRoster.shift_date == today,
                ShiftRoster.status != "cancelled"
            ).all()
            
            roster_entries = [e for e in roster_entries if e.shift_type != "off"]
            
            if not roster_entries:
                shift_status = "view_only"
            else:
                preferred_type = "shift_1" if datetime.now(tz).hour < 14 else "shift_2"
                roster_entry = next((e for e in roster_entries if e.shift_type == preferred_type), None)
                if not roster_entry:
                    roster_entry = roster_entries[0]

                needs_handover_activation = False
                is_double_shift_pending = False
                if roster_entry.shift_type == "shift_2":
                    shift1_rostered = db.query(ShiftRoster).filter(
                        ShiftRoster.shift_date == today,
                        ShiftRoster.shift_type == "shift_1",
                        ShiftRoster.status != "cancelled"
                    ).first()
                    if shift1_rostered:
                        if shift1_rostered.employee_code != current_user.username:
                            needs_handover_activation = True
                        else:
                            # Same operator doing double shift. Ensure Shift 1 consumption logs are finalized first.
                            from app.models.shift import ShiftLog
                            shift1_finalized = db.query(ShiftLog).filter(
                                ShiftLog.operator_id == current_user.id,
                                ShiftLog.shift_type == "shift_1",
                                ShiftLog.date >= datetime.combine(today, datetime.min.time()),
                                ShiftLog.date <= datetime.combine(today, datetime.max.time()),
                                ShiftLog.is_draft == False
                            ).first()
                            if not shift1_finalized:
                                is_double_shift_pending = True

                # They have an active roster entry. Let's check handover status.
                shift_state = db.query(UserShiftState).filter(
                    UserShiftState.user_id == current_user.id,
                    UserShiftState.shift_date == today_str
                ).first()

                if shift_state and shift_state.status == "handed_over":
                    shift_status = "handed_over"
                elif needs_handover_activation:
                    if not shift_state or shift_state.status != "active":
                        shift_status = "view_only"
                elif is_double_shift_pending:
                    shift_status = "pending_first_shift"
            
    return {
        "hierarchy": hierarchy,
        "configs": configs,
        "projects": projects,
        "permissions": serialized_permissions,
        "shift_status": shift_status
    }


