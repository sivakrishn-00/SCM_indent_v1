import json
import time
from threading import Lock
from typing import List, Tuple, Set, Dict
from app.api.v1.users import fetch_all_employees
from app.models.project_config import ProjectApprovalConfig

_hierarchy_cache = None
_precomputed_paths_cache = {}
_cache_lock = Lock()
_cache_timestamp = 0.0
CACHE_TTL = 300.0  # 5 minutes in seconds

def get_hierarchy_maps() -> Tuple[Dict[str, dict], Dict[str, str], Set[str]]:
    """
    Fetch all employees and construct:
    - emp_code_to_details: code -> {name, role, project, employee_id}
    - parent_map: code -> manager_code
    - has_subordinates_set: set of manager codes
    Uses thread-safe in-memory caching with a 5-minute TTL to optimize performance.
    """
    global _hierarchy_cache, _cache_timestamp, _precomputed_paths_cache
    current_time = time.time()
    
    with _cache_lock:
        if _hierarchy_cache is not None and (current_time - _cache_timestamp) < CACHE_TTL:
            return _hierarchy_cache

    try:
        employees = fetch_all_employees()
    except Exception:
        employees = []

    # Map employee_id to employee_code first
    id_to_code = {}
    for item in employees:
        if not isinstance(item, dict):
            continue
        emp = item.get("employee", {})
        code = emp.get("employee_code")
        emp_id = emp.get("id")
        if code and emp_id:
            id_to_code[emp_id] = code

    emp_code_to_details = {}
    parent_map = {}
    has_subordinates_set = set()

    for item in employees:
        if not isinstance(item, dict):
            continue
        emp = item.get("employee", {})
        pos = item.get("position", {})
        proj = item.get("project", {})
        office = item.get("office", {}) or {}
        geo = office.get("geo_location", {}) or {}

        code = emp.get("employee_code")
        if not code:
            continue

        role = pos.get("role_name") or "OPERATOR"
        project_name = proj.get("name") if proj else None

        mandal = geo.get("mandal") or ""
        district = geo.get("district") or ""
        loc_parts = [p for p in [mandal, district] if p]
        office_location = ", ".join(loc_parts) if loc_parts else "N/A"

        emp_code_to_details[code] = {
            "name": emp.get("name", "Unknown"),
            "role": role,
            "project": project_name,
            "id": emp.get("id"),
            "office_name": office.get("name", "N/A"),
            "office_location": office_location,
            "email": emp.get("email") or f"{code}@bit-indent.local",
            "phone": emp.get("phone", "N/A")
        }

        # Build parents
        reporting_to_list = pos.get("reporting_to") or []
        for parent_pos in reporting_to_list:
            parent_id = parent_pos.get("employee_id")
            if parent_id and parent_id in id_to_code:
                parent_code = id_to_code[parent_id]
                parent_map[code] = parent_code
                has_subordinates_set.add(parent_code)
                break # Single manager support for chain

    # Pre-computation of materialized paths (Point 3)
    precomputed = {}
    for code in emp_code_to_details:
        path = []
        curr = code
        visited = {curr}
        
        # Self node
        det = emp_code_to_details[curr]
        path.append({
            "employee_code": curr,
            "name": det.get("name", curr),
            "role": det.get("role", "OPERATOR")
        })
        
        while curr in parent_map:
            parent = parent_map[curr]
            if parent in visited:
                break
            visited.add(parent)
            parent_det = emp_code_to_details.get(parent) or {}
            path.append({
                "employee_code": parent,
                "name": parent_det.get("name", parent),
                "role": parent_det.get("role", "OPERATOR")
            })
            curr = parent
        precomputed[code] = path

    res = (emp_code_to_details, parent_map, has_subordinates_set)
    with _cache_lock:
        _hierarchy_cache = res
        _precomputed_paths_cache = precomputed
        _cache_timestamp = time.time()
    return res

def get_precomputed_path(username: str) -> List[dict]:
    """
    Get precomputed materialized path list for an employee.
    Runs in absolute O(1) constant time, utilizing the background precomputed tree.
    """
    global _precomputed_paths_cache
    if not _precomputed_paths_cache:
        get_hierarchy_maps()
    return _precomputed_paths_cache.get(username, [])
