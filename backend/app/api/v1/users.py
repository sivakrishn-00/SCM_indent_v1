import requests
import time
import os
import json
from typing import List, Optional
from threading import Lock
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from concurrent.futures import ThreadPoolExecutor

from app.api import deps
from app.models.user import User
from app.models.permission import RolePermission
from app.core.config import settings
from app.core.security import get_password_hash

router = APIRouter()

class EmployeeCodesRequest(BaseModel):
    employee_codes: List[str]

# Thread-safe in-memory cache
_employees_cache = None
_cache_timestamp = 0.0
_cache_lock = Lock()
_bg_fetch_lock = Lock()
_is_fetching = False
_perms_sync_lock = Lock()
CACHE_TTL = 300.0  # 5 minutes in seconds

CACHE_FILE = os.getenv(
    "EMPLOYEES_CACHE_PATH",
    os.path.join(os.path.dirname(__file__), "employees_persistent_cache.json")
)

def _perform_ems_api_fetch() -> List[dict]:
    """Perform the blocking network request to the EMS API."""
    import requests
    from concurrent.futures import ThreadPoolExecutor
    from app.core.database import SessionLocal
    from app.models.api_config import APISetting
    from app.core.crypto import decrypt_auth_config
    
    headers = {}
    auth_params = None
    url = settings.BAVYA_EMS_API_URL

    db = SessionLocal()
    try:
        ems_setting = db.query(APISetting).filter(
            APISetting.api_identifier == "bavya_ems_api",
            APISetting.is_active == True
        ).first()
        if ems_setting:
            url = ems_setting.base_url
            auth_data = decrypt_auth_config(ems_setting.encrypted_auth_data)
            if ems_setting.auth_type == "api_key_header":
                header_name = auth_data.get("header_name", "X-api-key")
                headers[header_name] = auth_data.get("api_key")
            elif ems_setting.auth_type == "bearer_token":
                headers["Authorization"] = f"Bearer {auth_data.get('token')}"
            elif ems_setting.auth_type == "basic_auth":
                from requests.auth import HTTPBasicAuth
                auth_params = HTTPBasicAuth(auth_data.get("username"), auth_data.get("password"))
        else:
            headers = {"X-api-key": settings.BAVYA_EMS_API_KEY}
    except Exception as e:
        print(f"Warning: Database check failed for EMS settings. Falling back to env: {e}")
        headers = {"X-api-key": settings.BAVYA_EMS_API_KEY}
    finally:
        db.close()

    all_results = []
    
    try:
        response = requests.get(url, headers=headers, auth=auth_params, params={"page": 1}, timeout=10)
        if response.status_code != 200:
            raise Exception(f"External EMS API returned status code {response.status_code}.")
            
        data = response.json()
        all_results = data.get("results", [])
        total_count = data.get("count", 0)
        
        page_size = 10
        total_pages = (total_count + page_size - 1) // page_size
        
        if total_pages > 1:
            def fetch_page(page_num):
                try:
                    res = requests.get(url, headers=headers, auth=auth_params, params={"page": page_num}, timeout=10)
                    if res.status_code == 200:
                        return res.json().get("results", [])
                except Exception:
                    pass
                return []

            # Fetch remaining pages concurrently
            with ThreadPoolExecutor(max_workers=25) as executor:
                pages = range(2, total_pages + 1)
                pages_data = executor.map(fetch_page, pages)
                for page_list in pages_data:
                    all_results.extend(page_list)
        return all_results
    except Exception as e:
        raise Exception(f"Failed to connect to external EMS API: {str(e)}")

def fetch_all_employees(force_refresh: bool = False) -> List[dict]:
    """
    Fetch all employees from the paginated external EMS API.
    Uses thread-safe in-memory caching with a 5-minute TTL to ensure O(1) performance.
    Uses a background worker (Stale-While-Revalidate pattern) to perform updates
    asynchronously when cache is expired but available, preventing user request blocking.
    Falls back to a local JSON persistent cache file if the external API is unreachable or fails.
    """
    global _employees_cache, _cache_timestamp, _is_fetching
    import threading
    
    current_time = time.time()
    
    # 1. Try reading from memory cache first if it's hot (not expired)
    with _cache_lock:
        if not force_refresh and _employees_cache is not None and (current_time - _cache_timestamp) < CACHE_TTL:
            return _employees_cache

    # 2. Check if we have some cache (either in-memory or on disk)
    has_cache = False
    cached_val = None
    
    with _cache_lock:
        if _employees_cache is not None:
            has_cache = True
            cached_val = _employees_cache
            
    if not has_cache and os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                cached_data = json.load(f)
            if isinstance(cached_data, list) and len(cached_data) >= 50:
                with _cache_lock:
                    _employees_cache = cached_data
                cached_val = cached_data
                has_cache = True
        except Exception as e:
            print(f"Warning: Failed to read persistent cache file: {e}")

    # 3. If we have cache and force_refresh is False, return it immediately and revalidate in background
    if has_cache and not force_refresh:
        # Trigger background fetch if not already fetching
        should_spawn = False
        with _bg_fetch_lock:
            if not _is_fetching:
                _is_fetching = True
                should_spawn = True
                
        if should_spawn:
            def bg_task():
                global _is_fetching, _employees_cache, _cache_timestamp
                try:
                    fresh_data = _perform_ems_api_fetch()
                    if fresh_data:
                        with _cache_lock:
                            _employees_cache = fresh_data
                            _cache_timestamp = time.time()
                        try:
                            with open(CACHE_FILE, "w", encoding="utf-8") as f:
                                json.dump(fresh_data, f, ensure_ascii=False, indent=2)
                        except Exception as file_err:
                            print(f"Warning: Background save cache failed: {file_err}")
                except Exception as api_err:
                    print(f"Background EMS API revalidation failed: {api_err}")
                    # Expire cache slightly so it attempts recovery shortly
                    with _cache_lock:
                        _cache_timestamp = time.time() - (CACHE_TTL - 60.0) # check again in 1 min
                finally:
                    with _bg_fetch_lock:
                        _is_fetching = False
            
            # Spawn background thread
            threading.Thread(target=bg_task, daemon=True).start()
            
        return cached_val

    # 4. If we don't have cache, or if force_refresh is True, perform sync/blocking fetch
    try:
        fresh_data = _perform_ems_api_fetch()
        with _cache_lock:
            _employees_cache = fresh_data
            _cache_timestamp = current_time
        try:
            with open(CACHE_FILE, "w", encoding="utf-8") as f:
                json.dump(fresh_data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"Warning: Failed to save persistent EMS API cache to file: {e}")
        return fresh_data
    except Exception as api_err:
        # Recover from cache if available on sync failure
        if cached_val is not None:
            print(f"Warning: Blocking EMS API fetch failed ({api_err}). Returning cached data.")
            return cached_val
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"External EMS API is unreachable and no cached data exists. Error: {api_err}"
        )

@router.get("/employees")
def get_employees(
    refresh: bool = Query(False),
    db: Session = Depends(deps.get_db)
):
    """
    Fetch all employees from the BAVYA EMS API (using cache or fetching concurrently)
    and merge their activation status from the local database.
    """
    employees_data = fetch_all_employees(force_refresh=refresh)

    # Fetch all local users to match activation status
    local_users = db.query(User).all()
    local_user_map = {u.username: u for u in local_users}

    result = []
    for item in employees_data:
        if not isinstance(item, dict):
            continue
        emp = item.get("employee", {})
        pos = item.get("position", {})
        proj = item.get("project", {})
        office = item.get("office", {}) or {}
        geo = office.get("geo_location", {}) or {}

        emp_code = emp.get("employee_code")
        if not emp_code:
            continue

        local_user = local_user_map.get(emp_code)
        
        mandal = geo.get("mandal") or ""
        district = geo.get("district") or ""
        loc_parts = [p for p in [mandal, district] if p]
        office_location = ", ".join(loc_parts) if loc_parts else "N/A"

        result.append({
            "employee_code": emp_code,
            "name": emp.get("name", "Unknown"),
            "email": emp.get("email") or f"{emp_code}@bit-indent.local",
            "phone": emp.get("phone", "N/A"),
            "project_name": proj.get("name") if proj else "N/A",
            "role_name": pos.get("role_name") if pos else "OPERATOR",
            "office_name": office.get("name", "N/A"),
            "office_location": office_location,
            "is_active_in_app": local_user.is_active if local_user else False,
            "local_role": local_user.role if local_user else None
        })


    return result

@router.post("/employees/activate")
def activate_employees(payload: EmployeeCodesRequest, db: Session = Depends(deps.get_db)):
    """
    Bulk activate employees as users in the system.
    This creates minimal local database records for them (with default hashed password
    set as their employee_code) so they can log in.
    """
    if not payload.employee_codes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No employee codes provided."
        )

    # Fetch all employees (using cache) to verify their details
    employees_data = fetch_all_employees()

    # Create a lookup map of the external employees
    external_emp_map = {}
    for item in employees_data:
        if not isinstance(item, dict):
            continue
        emp = item.get("employee", {})
        emp_code = emp.get("employee_code")
        if emp_code:
            external_emp_map[emp_code] = item

    activated_count = 0
    for emp_code in payload.employee_codes:
        # Check if user already exists in local DB
        user = db.query(User).filter(User.username == emp_code).first()
        
        if user:
            # If they exist but were inactive, make them active
            if not user.is_active:
                user.is_active = True
            
            # Sync role and project from latest EMS API data
            emp_info = external_emp_map.get(emp_code)
            if emp_info:
                pos = emp_info.get("position", {})
                proj = emp_info.get("project", {})
                user.role = pos.get("role_name", user.role).strip()
                user.project = proj.get("name", user.project)
            activated_count += 1
        else:
            # Get details from external API
            emp_info = external_emp_map.get(emp_code)
            if not emp_info:
                continue # Skip if not found in external API
                
            emp = emp_info.get("employee", {})
            pos = emp_info.get("position", {})
            proj = emp_info.get("project", {})
            
            # Create a new local user with minimal details
            new_user = User(
                username=emp_code,
                email=emp.get("email") or f"{emp_code}@bit-indent.local",
                hashed_password=get_password_hash(emp_code),
                role=pos.get("role_name", "OPERATOR").strip() if pos else "OPERATOR",
                is_active=True,
                project=proj.get("name") if proj else None
            )
            db.add(new_user)
            activated_count += 1

    db.commit()
    return {"message": f"Successfully activated {activated_count} employees as users."}

@router.post("/employees/deactivate")
def deactivate_employees(payload: EmployeeCodesRequest, db: Session = Depends(deps.get_db)):
    """
    Bulk deactivate employees. Removes them from the local database
    so no unnecessary data is stored locally.
    """
    if not payload.employee_codes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No employee codes provided."
        )

    # Delete the users matching the employee codes to save space
    deleted_count = db.query(User).filter(User.username.in_(payload.employee_codes)).delete(synchronize_session=False)
    db.commit()
    
    return {"message": f"Successfully deactivated {deleted_count} users."}

@router.get("/me/hierarchy")
def get_my_hierarchy(
    project: Optional[str] = None,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Return whether the current user is a leaf node, and their manager path.
    """
    is_admin = current_user.username == "admin" or str(current_user.role).lower() == "admin"
    project_param_provided = project is not None
    if not is_admin and current_user.project:
        project = current_user.project
        
    from app.api.v1.utils import get_hierarchy_maps, get_precomputed_path
    emp_code_to_details, parent_map, has_subordinates_set = get_hierarchy_maps()
    
    username = current_user.username
    should_override_username = (username not in emp_code_to_details) or project_param_provided
    
    if project and should_override_username:
        project_employees = [
            code for code, det in emp_code_to_details.items()
            if det.get("project") == project
        ]
        if project_employees:
            leaf_employees = [c for c in project_employees if c not in has_subordinates_set]
            if leaf_employees:
                best_username = leaf_employees[0]
                max_chain_len = -1
                for c_code in leaf_employees:
                    c_len = 0
                    curr_c = c_code
                    visited_c = {curr_c}
                    while curr_c in parent_map:
                        parent_c = parent_map[curr_c]
                        if parent_c in visited_c:
                            break
                        visited_c.add(parent_c)
                        c_len += 1
                        curr_c = parent_c
                    if c_len > max_chain_len:
                        max_chain_len = c_len
                        best_username = c_code
                username = best_username
            else:
                username = project_employees[0]
                
    is_leaf = username not in has_subordinates_set or username == "admin"
    
    # Build manager path with roles and names (precomputed constant time lookup)
    my_details = emp_code_to_details.get(username) or {}
    path = get_precomputed_path(username)
        
    logged_in_det = emp_code_to_details.get(current_user.username) or {}
    logged_in_name = logged_in_det.get("name", current_user.username)

    return {
        "username": username,
        "is_leaf": is_leaf,
        "project": my_details.get("project", None),
        "approval_chain_raw": path,
        "office_name": my_details.get("office_name", "N/A"),
        "office_location": my_details.get("office_location", "N/A"),
        "logged_in_name": logged_in_name,
        "email": logged_in_det.get("email", current_user.email),
        "phone": logged_in_det.get("phone", "N/A")
    }

class PermissionUpdate(BaseModel):
    id: int
    can_view: bool
    can_create: bool
    can_update: bool
    can_delete: bool

@router.get("/permissions/all")
def get_all_permissions(
    project: Optional[str] = None,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Fetch all page permissions, dynamically syncing with all unique roles from the BAVYA EMS API.
    """
    # Enforce project filter for non-admins
    if str(current_user.role).lower() != "admin":
        project = current_user.project
        
    if not project:
        # Default fallback project if none is specified or bound
        project = "AP-1962"

    # 1. Fetch unique roles from external EMS API for this specific project
    ems_roles = set()
    try:
        employees = fetch_all_employees()
        for item in employees:
            if isinstance(item, dict):
                proj = item.get("project")
                proj_name = proj.get("name") if (proj and isinstance(proj, dict)) else None
                if proj_name == project:
                    pos = item.get("position")
                    if pos and isinstance(pos, dict):
                        role_name = pos.get("role_name")
                        if role_name:
                            ems_roles.add(role_name.strip())
    except Exception as e:
        print(f"Error fetching EMS roles during sync: {e}")
        
    # Always ensure admin is present
    ems_roles.add("admin")

    # If the API failed/returned no roles, include default roles
    if len(ems_roles) <= 1:
        ems_roles.add("project_manager")
        ems_roles.add("supervisor")
        ems_roles.add("operator")

    with _perms_sync_lock:
        # 2. Pages configuration
        pages = ["overview", "shift", "indents", "masters", "workflow", "users", "audit", "reports", "inventory"]
        
        # 3. Check existing role permissions
        existing_perms = db.query(RolePermission).filter(RolePermission.project == project).all()
        
        # Automatically clean up any duplicate pages/roles in the database
        seen_keys = set()
        cleaned_perms = []
        db_changed = False
        for p in existing_perms:
            key = (p.role.lower(), p.page.lower())
            if key in seen_keys:
                db.delete(p)
                db_changed = True
            else:
                seen_keys.add(key)
                cleaned_perms.append(p)
                
        if db_changed:
            db.commit()
            existing_perms = db.query(RolePermission).filter(RolePermission.project == project).all()

        existing_pairs = {(p.role.lower(), p.page.lower()) for p in existing_perms}
        
        # 4. Create missing permissions
        new_perms_added = False
        for r in ems_roles:
            for page in pages:
                if (r.lower(), page.lower()) not in existing_pairs:
                    # Default logic for the core roles:
                    can_view = False
                    can_create = False
                    can_update = False
                    can_delete = False
                    
                    # Preset defaults for admin, manager, supervisor, operator roles
                    r_lower = r.lower()
                    if "admin" in r_lower:
                        can_view = True
                        can_create = True
                        can_update = True
                        can_delete = True
                    elif "manager" in r_lower or "pm" in r_lower:
                        if page in ["overview", "shift", "indents", "reports", "inventory"]:
                            can_view = True
                            can_create = True
                            can_update = True
                            can_delete = True
                    elif "supervisor" in r_lower:
                        if page in ["overview", "shift", "indents", "reports", "inventory"]:
                            can_view = True
                            can_create = True
                            can_update = True
                            can_delete = True
                    elif "operator" in r_lower or "pilot" in r_lower or "paravet" in r_lower:
                        if page in ["shift", "indents", "inventory"]:
                            can_view = True
                            can_create = True
                            can_update = (page == "shift")
                    
                    db.add(RolePermission(
                        role=r,
                        page=page,
                        can_view=can_view,
                        can_create=can_create,
                        can_update=can_update,
                        can_delete=can_delete,
                        project=project
                    ))
                    new_perms_added = True
                    
        if new_perms_added:
            db.commit()
            existing_perms = db.query(RolePermission).filter(RolePermission.project == project).all()
            
    # Return only permissions for roles that are relevant to this project
    # Compare role names case-insensitively to match ems_roles set
    ems_roles_lower = {r.lower() for r in ems_roles}
    filtered_perms = [p for p in existing_perms if p.role.lower() in ems_roles_lower]
    return filtered_perms

@router.put("/permissions/batch")
def update_batch_permissions(
    updates: List[PermissionUpdate],
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    if str(current_user.role).lower() != "admin":
        raise HTTPException(status_code=403, detail="Only admins can update permissions.")
    
    for u in updates:
        perm = db.query(RolePermission).filter(RolePermission.id == u.id).first()
        if perm:
            perm.can_view = u.can_view
            perm.can_create = u.can_create
            perm.can_update = u.can_update
            perm.can_delete = u.can_delete
    db.commit()
    return {"message": "Permissions updated successfully."}
