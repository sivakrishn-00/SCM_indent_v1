from typing import List, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.api import deps
from app.models.user import User
from app.models.vehicle import Vehicle
from app.models.consumable import Consumable
from app.models.project_config import ProjectApprovalConfig
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
        
    offices_set = {}
    for item in employees_data:
        if not isinstance(item, dict):
            continue
        proj = item.get("project", {}) or {}
        if proj.get("name") == project_name:
            office = item.get("office", {}) or {}
            if office.get("level") == "FACILITATE":
                office_name = office.get("name")
                if office_name and office_name not in offices_set:
                    geo = office.get("geo_location", {}) or {}
                    mandal = geo.get("mandal") or ""
                    district = geo.get("district") or ""
                    loc_parts = [p for p in [mandal, district] if p]
                    location = ", ".join(loc_parts) if loc_parts else "N/A"
                    
                    offices_set[office_name] = {
                        "id": office.get("id"),
                        "name": office_name,
                        "level": office.get("level"),
                        "location": location
                    }
                    
    return sorted(list(offices_set.values()), key=lambda o: o["name"])

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
