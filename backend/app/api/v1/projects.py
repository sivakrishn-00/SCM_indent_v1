from typing import List, Any, Optional
from datetime import datetime, date, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from app.api import deps
from app.models.user import User
from app.models.vehicle import Vehicle
from app.models.consumable import Consumable
from app.models.project_config import ProjectApprovalConfig, ProjectShiftMapping, ProjectCalendarConfig, ProjectHoliday
from app.api.v1.utils import get_hierarchy_maps
from pydantic import BaseModel

router = APIRouter()

class ProjectConfigSave(BaseModel):
    project_name: str
    skip_roles: str = ""
    stop_role: str = None
    low_stock_threshold: int = 10

@router.get("/projects", response_model=List[str])
def get_projects(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """
    Get all unique projects active in the system, combining local database projects
    and external projects fetched from the BAVYA EMS API.
    """
    is_admin = current_user.username == "admin" or str(current_user.role).lower() == "admin"
    if not is_admin and current_user.project:
        return [current_user.project]
    vehicle_projects = db.query(Vehicle.project).distinct().all()
    user_projects = db.query(User.project).distinct().all()
    
    projects = set()
    for (vp,) in vehicle_projects:
        if vp:
            projects.add(vp)
    for (up,) in user_projects:
        if up:
            projects.add(up)
            
    # Include projects from BAVYA EMS API
    try:
        from app.api.v1.users import fetch_all_employees
        employees_data = fetch_all_employees()
        for item in employees_data:
            if isinstance(item, dict):
                proj = item.get("project")
                if proj and isinstance(proj, dict):
                    proj_name = proj.get("name")
                    if proj_name:
                         projects.add(proj_name)
    except Exception:
        pass
            
    return sorted(list(projects))


@router.get("/vehicles")
def get_vehicles(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """
    Get all vehicles in the database.
    """
    is_admin = current_user.username == "admin" or str(current_user.role).lower() == "admin"
    query = db.query(Vehicle)
    if not is_admin and current_user.project:
        query = query.filter(Vehicle.project == current_user.project)
    vehicles = query.all()
    return [
        {
            "id": v.id,
            "vehicle_number": v.vehicle_number,
            "vehicle_type": v.vehicle_type,
            "project": v.project,
            "is_active": v.is_active
        }
        for v in vehicles
    ]

@router.get("/consumables")
def get_consumables(db: Session = Depends(deps.get_db)) -> Any:
    """
    Get all consumables in the database.
    """
    consumables = db.query(Consumable).all()
    return [
        {
            "id": c.id,
            "name": c.name,
            "unit": c.unit,
            "current_price": c.current_price,
            "description": c.description
        }
        for c in consumables
    ]

@router.get("/projects/{project_name}/offices")
def get_project_offices(
    project_name: str,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """
    Get all unique offices where level is 'FACILITATE' for a specific project
    by fetching from BAVYA EMS API.
    """
    is_admin = current_user.username == "admin" or str(current_user.role).lower() == "admin"
    if not is_admin and current_user.project and project_name != current_user.project:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to view offices of this project."
        )
    try:
        from app.api.v1.users import fetch_all_employees
        employees_data = fetch_all_employees()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch employee/office data: {str(e)}")
        
    subordinate_emp_codes = set()
    if not is_admin:
        # Get active local users for the project in local database
        active_local_usernames = set()
        active_users = db.query(User).filter(
            User.project == project_name,
            User.is_active == True
        ).all()
        for u in active_users:
            active_local_usernames.add(u.username)

        from app.api.v1.utils import get_hierarchy_maps
        _, parent_map, _ = get_hierarchy_maps()

        def is_subordinate(emp_code: str, manager_code: str) -> bool:
            curr = emp_code
            visited = set()
            while curr in parent_map:
                parent = parent_map[curr]
                if parent == manager_code:
                    return True
                if parent in visited:
                    break
                visited.add(parent)
                curr = parent
            return False

        # Add the logged-in user themselves
        subordinate_emp_codes.add(current_user.username)
        # Find all employees reporting to the logged-in user who are active in the local DB
        for item in employees_data:
            if isinstance(item, dict):
                emp = item.get("employee", {}) or {}
                emp_code = emp.get("employee_code")
                if emp_code and emp_code in active_local_usernames:
                    if is_subordinate(emp_code, current_user.username):
                        subordinate_emp_codes.add(emp_code)

    offices_set = {}
    fallback_offices_set = {}
    for item in employees_data:
        if not isinstance(item, dict):
            continue
        proj = item.get("project", {}) or {}
        if proj.get("name") == project_name:
            emp = item.get("employee", {}) or {}
            emp_code = emp.get("employee_code")
            if not is_admin and emp_code not in subordinate_emp_codes:
                continue

            office = item.get("office", {}) or {}
            office_name = office.get("name")
            if not office_name:
                continue
                
            level = office.get("level", "")
            geo = office.get("geo_location", {}) or {}
            mandal = geo.get("mandal") or ""
            district = geo.get("district") or ""
            loc_parts = [p for p in [mandal, district] if p]
            location = ", ".join(loc_parts) if loc_parts else "N/A"
            
            office_data = {
                "id": office.get("id"),
                "name": office_name,
                "level": level,
                "location": location
            }
            
            level_upper = str(level).strip().upper()
            if level_upper in ("FACILITATE", "BRANCH OFFICE"):
                if office_name not in offices_set:
                    offices_set[office_name] = office_data
            else:
                if office_name not in fallback_offices_set:
                    fallback_offices_set[office_name] = office_data
                    
    result_offices = offices_set if offices_set else fallback_offices_set
    return sorted(list(result_offices.values()), key=lambda o: o["name"])


@router.get("/projects/configs")
def get_project_configs(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """
    Retrieve project approval configs.
    """
    is_admin = current_user.username == "admin" or str(current_user.role).lower() == "admin"
    query = db.query(ProjectApprovalConfig)
    if not is_admin and current_user.project:
        query = query.filter(ProjectApprovalConfig.project_name == current_user.project)
    configs = query.all()
    return [
        {
            "id": c.id,
            "project_name": c.project_name,
            "skip_roles": c.skip_roles,
            "stop_role": c.stop_role,
            "low_stock_threshold": getattr(c, 'low_stock_threshold', 10)
        }
        for c in configs
    ]

@router.post("/projects/configs")
def save_project_config(
    config_in: ProjectConfigSave,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """
    Create or update project approval configs (admin only).
    """
    if str(current_user.role).lower() != "admin" and current_user.username != "admin":
        raise HTTPException(status_code=403, detail="Admin permissions required.")
        
    config = db.query(ProjectApprovalConfig).filter(
        ProjectApprovalConfig.project_name == config_in.project_name
    ).first()
    
    if not config:
        config = ProjectApprovalConfig(
            project_name=config_in.project_name,
            skip_roles=config_in.skip_roles,
            stop_role=config_in.stop_role,
            low_stock_threshold=config_in.low_stock_threshold
        )
        db.add(config)
    else:
        config.skip_roles = config_in.skip_roles
        config.stop_role = config_in.stop_role
        config.low_stock_threshold = config_in.low_stock_threshold
        
    db.commit()
    db.refresh(config)
    return {"message": "Project flow configuration saved successfully", "project": config.project_name}

@router.get("/projects/{project_name}/hierarchy-preview")
def get_project_hierarchy_preview(
    project_name: str,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """
    Find a leaf node in the specified project, trace its reporting chain,
    and return the nodes in the chain along with their mapped roles.
    """
    is_admin = current_user.username == "admin" or str(current_user.role).lower() == "admin"
    if not is_admin and current_user.project:
        project_name = current_user.project
        
    emp_code_to_details, parent_map, has_subordinates_set = get_hierarchy_maps()
    
    # Find employees in this project
    proj_employees = []
    for code, details in emp_code_to_details.items():
        if details.get("project") == project_name:
            proj_employees.append(code)
            
    if not proj_employees:
        # Fallback to any employees in this project or general hierarchy
        proj_employees = list(emp_code_to_details.keys())
        
    # Find a leaf node (one not in has_subordinates_set)
    leaf_code = None
    # 1. Prefer a leaf node that has a manager configured
    for code in proj_employees:
        if code not in has_subordinates_set and code in parent_map:
            leaf_code = code
            break
            
    # 2. Fallback to any leaf node if none with a manager are found
    if not leaf_code:
        for code in proj_employees:
            if code not in has_subordinates_set:
                leaf_code = code
                break
            
    if not leaf_code and proj_employees:
        leaf_code = proj_employees[0]
        
    if not leaf_code:
        # Return default hardcoded preview if no employees at all
        return {
            "project_name": project_name,
            "chain": [
                {"employee_code": "OPERATOR", "name": "Operator Node", "role": "OPERATOR"},
                {"employee_code": "SUPERVISOR", "name": "Supervisor Node", "role": "SUPERVISOR"},
                {"employee_code": "PROJECT_MANAGER", "name": "Project Manager Node", "role": "PROJECT_MANAGER"},
                {"employee_code": "ADMIN", "name": "Admin Node", "role": "ADMIN"}
            ]
        }
        
    # Trace chain
    chain = []
    # Include leaf node as initiator (index 0)
    leaf_details = emp_code_to_details.get(leaf_code) or {}
    leaf_role = leaf_details.get("role", "OPERATOR")
    
    chain.append({
        "employee_code": leaf_code,
        "name": leaf_details.get("name", "Leaf Operator"),
        "role": leaf_role
    })
    
    curr = leaf_code
    visited = {curr}
    while curr in parent_map:
        parent = parent_map[curr]
        if parent in visited:
            break
        visited.add(parent)
        
        parent_details = emp_code_to_details.get(parent) or {}
        parent_role = parent_details.get("role", "Manager")
        
        chain.append({
            "employee_code": parent,
            "name": parent_details.get("name", "Manager"),
            "role": parent_role
        })
        curr = parent
        
    return {
        "project_name": project_name,
        "chain": chain
    }

class ProjectShiftMappingSchema(BaseModel):
    shift_type: str
    label: str
    default_start: Optional[str] = None
    default_end: Optional[str] = None
    is_active: bool = True

class SaveProjectShiftsPayload(BaseModel):
    shifts: List[ProjectShiftMappingSchema]

class CalendarConfigSchema(BaseModel):
    weekoff_days: str

class HolidaySaveSchema(BaseModel):
    holiday_date: str
    description: Optional[str] = None

def _calculate_working_days(project_name: str, start_dt: date, end_dt: date, db: Session) -> dict:
    total_days = (end_dt - start_dt).days + 1
    
    cfg = db.query(ProjectCalendarConfig).filter(ProjectCalendarConfig.project_name == project_name).first()
    weekoff_names = [w.strip().lower() for w in (cfg.weekoff_days.split(",") if cfg else ["Sunday"]) if w.strip()]
    
    holidays = db.query(ProjectHoliday).filter(
        ProjectHoliday.project_name == project_name,
        ProjectHoliday.holiday_date >= start_dt,
        ProjectHoliday.holiday_date <= end_dt
    ).all()
    holiday_dates = {h.holiday_date for h in holidays}
    
    weekoff_count = 0
    holiday_count = 0
    working_days = 0
    
    current = start_dt
    while current <= end_dt:
        day_name = current.strftime("%A").lower()
        
        if day_name in weekoff_names:
            weekoff_count += 1
        elif current in holiday_dates:
            holiday_count += 1
        else:
            working_days += 1
            
        current += timedelta(days=1)
        
    return {
        "total_days": total_days,
        "weekoffs_count": weekoff_count,
        "holidays_count": holiday_count,
        "working_days": working_days,
        "start_date": start_dt.strftime("%Y-%m-%d"),
        "end_date": end_dt.strftime("%Y-%m-%d")
    }

@router.get("/projects/{project_name}/shifts")
def get_project_shifts(
    project_name: str,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    mappings = db.query(ProjectShiftMapping).filter(
        ProjectShiftMapping.project_name == project_name,
        ProjectShiftMapping.is_active == True
    ).all()
    
    if not mappings:
        defaults = [
            {"shift_type": "shift_1", "label": "Shift 1 (Morning)", "default_start": "06:00", "default_end": "14:00", "is_active": True},
            {"shift_type": "shift_2", "label": "Shift 2 (Evening)", "default_start": "14:00", "default_end": "22:00", "is_active": True},
            {"shift_type": "shift_3", "label": "Shift 3 (Night)", "default_start": "22:00", "default_end": "06:00", "is_active": True},
            {"shift_type": "general", "label": "General Shift", "default_start": "09:00", "default_end": "18:00", "is_active": True},
            {"shift_type": "off", "label": "Weekly Off", "default_start": "", "default_end": "", "is_active": True},
        ]
        return defaults
        
    return [
        {
            "project_name": m.project_name,
            "shift_type": m.shift_type,
            "label": m.label,
            "default_start": m.default_start or "",
            "default_end": m.default_end or "",
            "is_active": m.is_active
        }
        for m in mappings
    ]

@router.post("/projects/{project_name}/shifts")
def save_project_shifts(
    project_name: str,
    payload: SaveProjectShiftsPayload,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    if str(current_user.role).lower() != "admin" and current_user.username != "admin":
        raise HTTPException(status_code=403, detail="Admin permissions required.")
        
    db.query(ProjectShiftMapping).filter(ProjectShiftMapping.project_name == project_name).delete()
    
    for s in payload.shifts:
        mapping = ProjectShiftMapping(
            project_name=project_name,
            shift_type=s.shift_type,
            label=s.label,
            default_start=s.default_start or None,
            default_end=s.default_end or None,
            is_active=s.is_active
        )
        db.add(mapping)
        
    db.commit()
    return {"message": "Project shifts mapping configured successfully."}

@router.get("/projects/{project_name}/calendar")
def get_project_calendar(
    project_name: str,
    month: Optional[str] = None,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    cfg = db.query(ProjectCalendarConfig).filter(ProjectCalendarConfig.project_name == project_name).first()
    weekoffs = cfg.weekoff_days if cfg else "Sunday"
    
    holidays_query = db.query(ProjectHoliday).filter(ProjectHoliday.project_name == project_name)
    
    if month:
        try:
            start_date_str = f"{month}-01"
            start_dt = datetime.strptime(start_date_str, "%Y-%m-%d").date()
            if start_dt.month == 12:
                end_dt = date(start_dt.year + 1, 1, 1) - timedelta(days=1)
            else:
                end_dt = date(start_dt.year, start_dt.month + 1, 1) - timedelta(days=1)
            holidays_query = holidays_query.filter(
                ProjectHoliday.holiday_date >= start_dt,
                ProjectHoliday.holiday_date <= end_dt
            )
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid month format. Use YYYY-MM.")
            
    holidays = holidays_query.order_by(ProjectHoliday.holiday_date.asc()).all()
    
    working_days_summary = None
    if month:
        start_date_str = f"{month}-01"
        start_dt = datetime.strptime(start_date_str, "%Y-%m-%d").date()
        if start_dt.month == 12:
            end_dt = date(start_dt.year + 1, 1, 1) - timedelta(days=1)
        else:
            end_dt = date(start_dt.year, start_dt.month + 1, 1) - timedelta(days=1)
            
        working_days_summary = _calculate_working_days(project_name, start_dt, end_dt, db)

    return {
        "project_name": project_name,
        "weekoff_days": weekoffs,
        "holidays": [
            {
                "id": h.id,
                "holiday_date": h.holiday_date.strftime("%Y-%m-%d"),
                "description": h.description
            }
            for h in holidays
        ],
        "working_days_summary": working_days_summary
    }

@router.post("/projects/{project_name}/calendar/settings")
def save_calendar_settings(
    project_name: str,
    payload: CalendarConfigSchema,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    if str(current_user.role).lower() != "admin" and current_user.username != "admin":
        raise HTTPException(status_code=403, detail="Admin permissions required.")
        
    cfg = db.query(ProjectCalendarConfig).filter(ProjectCalendarConfig.project_name == project_name).first()
    if not cfg:
        cfg = ProjectCalendarConfig(
            project_name=project_name,
            weekoff_days=payload.weekoff_days
        )
        db.add(cfg)
    else:
        cfg.weekoff_days = payload.weekoff_days
        
    db.commit()
    return {"message": "Calendar settings saved successfully."}

@router.post("/projects/{project_name}/calendar/holidays")
def add_project_holiday(
    project_name: str,
    payload: HolidaySaveSchema,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    if str(current_user.role).lower() != "admin" and current_user.username != "admin":
        raise HTTPException(status_code=403, detail="Admin permissions required.")
        
    try:
        h_date = datetime.strptime(payload.holiday_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")
        
    existing = db.query(ProjectHoliday).filter(
        ProjectHoliday.project_name == project_name,
        ProjectHoliday.holiday_date == h_date
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Holiday date already configured for this project.")
        
    holiday = ProjectHoliday(
        project_name=project_name,
        holiday_date=h_date,
        description=payload.description
    )
    db.add(holiday)
    db.commit()
    return {"message": "Holiday added successfully."}

@router.delete("/projects/{project_name}/calendar/holidays/{holiday_id}")
def delete_project_holiday(
    project_name: str,
    holiday_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    if str(current_user.role).lower() != "admin" and current_user.username != "admin":
        raise HTTPException(status_code=403, detail="Admin permissions required.")
        
    holiday = db.query(ProjectHoliday).filter(
        ProjectHoliday.id == holiday_id,
        ProjectHoliday.project_name == project_name
    ).first()
    if not holiday:
        raise HTTPException(status_code=404, detail="Holiday not found.")
        
    db.delete(holiday)
    db.commit()
    return {"message": "Holiday deleted successfully."}

@router.get("/projects/{project_name}/working-days")
def get_working_days(
    project_name: str,
    start_date: str = Query(...),
    end_date: str = Query(...),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    try:
        sd = datetime.strptime(start_date, "%Y-%m-%d").date()
        ed = datetime.strptime(end_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")
        
    if sd > ed:
        raise HTTPException(status_code=400, detail="start_date cannot be after end_date.")
        
    summary = _calculate_working_days(project_name, sd, ed, db)
    return summary
