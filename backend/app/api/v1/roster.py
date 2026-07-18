from typing import List, Any, Optional
from datetime import datetime, date, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Query, File, UploadFile, Form
from sqlalchemy.orm import Session
from sqlalchemy import and_
from pydantic import BaseModel
from app.api import deps
from app.models.user import User
from app.models.roster import ShiftRoster
from app.models.audit_log import AuditLog

router = APIRouter()


# ─── Schemas ────────────────────────────────────────────────

class RosterAssignment(BaseModel):
    employee_code: str
    employee_name: str = ""
    dates: List[str]  # ["2026-07-14", "2026-07-15"]
    shift_type: str   # "shift_1", "shift_2", "off", "general"
    start_time: str = ""
    end_time: str = ""


class RosterBulkCreate(BaseModel):
    project: str
    office_name: str
    assignments: List[RosterAssignment]
    remarks: str = ""


class RosterUpdate(BaseModel):
    shift_type: str = None
    start_time: str = None
    end_time: str = None
    status: str = None
    remarks: str = None


class RosterSwap(BaseModel):
    roster_id_1: int
    roster_id_2: int


# ─── Helpers ────────────────────────────────────────────────

def _check_roster_admin(current_user: User):
    """Only admin, project_manager, supervisor, or manager-like roles can manage rosters."""
    role_lower = str(current_user.role).lower()
    if current_user.username == "admin" or role_lower == "admin":
        return True
    manager_keywords = ["manager", "supervisor", "pm", "de", "oe", "coordinator", "lead"]
    if any(kw in role_lower for kw in manager_keywords):
        return True
    return False


def _parse_date(date_str: str) -> date:
    try:
        return datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid date format: '{date_str}'. Use YYYY-MM-DD.")


# ─── 1. Bulk Create Roster ────────────────────────────────────

@router.post("/roster/bulk-create")
def bulk_create_roster(
    payload: RosterBulkCreate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """
    Bulk create shift roster entries.
    Creates roster entries for multiple employees across multiple dates.
    Skips duplicate assignments silently to allow re-runs.
    """
    if not _check_roster_admin(current_user):
        raise HTTPException(status_code=403, detail="Only admin/supervisor/manager roles can manage rosters.")

    from app.api.v1.utils import get_hierarchy_maps
    emp_code_to_details, _, _ = get_hierarchy_maps()

    created_count = 0
    skipped_count = 0

    assigned_in_payload = set()

    for assignment in payload.assignments:
        for date_str in assignment.dates:
            shift_date = _parse_date(date_str)
            if shift_date < date.today():
                raise HTTPException(status_code=400, detail=f"Cannot assign shift to past date: {date_str}")

            # Resolve target office name dynamically if payload.office_name is 'all'
            resolved_office = payload.office_name
            if resolved_office == "all":
                emp_details = emp_code_to_details.get(assignment.employee_code, {})
                emp_office = emp_details.get("office_name")
                if emp_office and emp_office != "N/A":
                    resolved_office = emp_office

            # Check if this operator is already assigned to this exact shift (allow re-runs/duplicates of SAME person)
            existing = db.query(ShiftRoster).filter(
                ShiftRoster.employee_code == assignment.employee_code,
                ShiftRoster.shift_date == shift_date,
                ShiftRoster.shift_type == assignment.shift_type,
                ShiftRoster.project == payload.project
            ).first()

            if assignment.shift_type != "off":
                emp_role = emp_code_to_details.get(assignment.employee_code, {}).get("role", "OPERATOR")

                # Check if we already scheduled another employee with the same role in this call
                payload_key = (payload.project, resolved_office, shift_date, assignment.shift_type, emp_role)
                if payload_key in assigned_in_payload:
                    shift_label = "Shift 1 (Morning)" if assignment.shift_type == "shift_1" else ("General Shift" if assignment.shift_type == "general" else "Shift 2 (Evening)")
                    raise HTTPException(
                        status_code=400,
                        detail=f"Cannot assign shift: Multiple employees with the role '{emp_role}' are being assigned to {shift_label} on {date_str} at {resolved_office} in this request."
                    )

                # Check database for existing active conflict (different employee code, same role)
                active_shifts = db.query(ShiftRoster).filter(
                    ShiftRoster.project == payload.project,
                    ShiftRoster.office_name == resolved_office,
                    ShiftRoster.shift_date == shift_date,
                    ShiftRoster.shift_type == assignment.shift_type,
                    ShiftRoster.employee_code != assignment.employee_code,
                    ShiftRoster.status != "cancelled"
                ).all()

                conflict = None
                for active_shift in active_shifts:
                    other_emp_role = emp_code_to_details.get(active_shift.employee_code, {}).get("role", "OPERATOR")
                    if other_emp_role == emp_role:
                        conflict = active_shift
                        break

                if conflict:
                    shift_label = "Shift 1 (Morning)" if assignment.shift_type == "shift_1" else ("General Shift" if assignment.shift_type == "general" else "Shift 2 (Evening)")
                    raise HTTPException(
                        status_code=400,
                        detail=f"Cannot assign shift: {conflict.employee_name} ({conflict.employee_code}) is already assigned to {shift_label} on {date_str} at {resolved_office} with the role '{emp_role}'."
                    )
                
                # Add to payload tracking set
                assigned_in_payload.add(payload_key)

            if existing:
                # Update if it was cancelled, else skip
                if existing.status == "cancelled":
                    existing.status = "scheduled"
                    existing.office_name = resolved_office
                    existing.employee_name = assignment.employee_name or existing.employee_name
                    existing.start_time = assignment.start_time or existing.start_time
                    existing.end_time = assignment.end_time or existing.end_time
                    existing.remarks = payload.remarks or existing.remarks
                    existing.created_by = current_user.username
                    created_count += 1
                else:
                    skipped_count += 1
                continue

            entry = ShiftRoster(
                project=payload.project,
                office_name=resolved_office,
                employee_code=assignment.employee_code,
                employee_name=assignment.employee_name,
                shift_date=shift_date,
                shift_type=assignment.shift_type,
                start_time=assignment.start_time or None,
                end_time=assignment.end_time or None,
                status="scheduled",
                created_by=current_user.username,
                remarks=payload.remarks or None
            )
            db.add(entry)
            created_count += 1

    db.commit()

    # Audit
    audit = AuditLog(
        user=current_user.username,
        action="CREATE_ROSTER",
        module="SHIFT_MANAGEMENT",
        description=f"Bulk created {created_count} roster entries for project '{payload.project}', office '{payload.office_name}'. {skipped_count} skipped (duplicates).",
        status="SUCCESS",
        project=payload.project
    )
    db.add(audit)
    db.commit()

    return {
        "message": f"Successfully created {created_count} roster entries. {skipped_count} skipped (already exist).",
        "created": created_count,
        "skipped": skipped_count
    }


# ─── 2. Get Roster (Weekly Grid) ────────────────────────────────

@router.get("/roster")
def get_roster(
    project: str = Query(...),
    office_name: str = Query(""),
    start_date: str = Query(...),
    end_date: str = Query(...),
    search: str = Query(""),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """
    Get roster entries for a project/office within a date range.
    Returns data structured for a weekly grid view.
    """
    sd = _parse_date(start_date)
    ed = _parse_date(end_date)

    query = db.query(ShiftRoster).filter(
        ShiftRoster.project == project,
        ShiftRoster.shift_date >= sd,
        ShiftRoster.shift_date <= ed,
        ShiftRoster.status != "cancelled"
    )

    if office_name and office_name not in ["all", "ALL", "Whole Project"]:
        query = query.filter(ShiftRoster.office_name == office_name)

    if search:
        search_term = f"%{search.lower()}%"
        query = query.filter(
            (ShiftRoster.employee_code.ilike(search_term)) |
            (ShiftRoster.employee_name.ilike(search_term))
        )

    entries = query.order_by(ShiftRoster.employee_code, ShiftRoster.shift_date).all()

    # Group by employee for grid view
    employees = {}
    for entry in entries:
        code = entry.employee_code
        if code not in employees:
            employees[code] = {
                "employee_code": code,
                "employee_name": entry.employee_name or code,
                "office_name": entry.office_name,
                "shifts": {}
            }
        date_key = entry.shift_date.strftime("%Y-%m-%d")
        employees[code]["shifts"][date_key] = {
            "id": entry.id,
            "shift_type": entry.shift_type,
            "start_time": entry.start_time or "",
            "end_time": entry.end_time or "",
            "status": entry.status,
            "remarks": entry.remarks or ""
        }

    return {
        "start_date": start_date,
        "end_date": end_date,
        "project": project,
        "office_name": office_name,
        "employees": list(employees.values())
    }


# ─── 3. Update Roster Entry ────────────────────────────────

@router.put("/roster/{roster_id}")
def update_roster_entry(
    roster_id: int,
    payload: RosterUpdate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """Update a single roster entry (change shift type, time, status, remarks)."""
    if not _check_roster_admin(current_user):
        raise HTTPException(status_code=403, detail="Only admin/supervisor/manager roles can manage rosters.")

    entry = db.query(ShiftRoster).filter(ShiftRoster.id == roster_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Roster entry not found.")

    if entry.shift_date < date.today():
        raise HTTPException(status_code=400, detail="Past roster shifts cannot be modified.")

    # Track changes for audit logging
    changes = []
    
    target_shift_type = payload.shift_type if payload.shift_type is not None else entry.shift_type
    target_status = payload.status if payload.status is not None else entry.status

    # Validate conflicts on shift updates
    if (payload.shift_type is not None or payload.status is not None) and target_status != "cancelled" and target_shift_type != "off":
        from app.api.v1.utils import get_hierarchy_maps
        emp_code_to_details, _, _ = get_hierarchy_maps()
        emp_role = emp_code_to_details.get(entry.employee_code, {}).get("role", "OPERATOR")

        active_shifts = db.query(ShiftRoster).filter(
            ShiftRoster.project == entry.project,
            ShiftRoster.office_name == entry.office_name,
            ShiftRoster.shift_date == entry.shift_date,
            ShiftRoster.shift_type == target_shift_type,
            ShiftRoster.employee_code != entry.employee_code,
            ShiftRoster.status != "cancelled"
        ).all()

        conflict = None
        for active_shift in active_shifts:
            other_emp_role = emp_code_to_details.get(active_shift.employee_code, {}).get("role", "OPERATOR")
            if other_emp_role == emp_role:
                conflict = active_shift
                break

        if conflict:
            shift_label = "Shift 1 (Morning)" if target_shift_type == "shift_1" else ("General Shift" if target_shift_type == "general" else "Shift 2 (Evening)")
            raise HTTPException(
                status_code=400,
                detail=f"Cannot update shift: {conflict.employee_name} ({conflict.employee_code}) is already assigned to {shift_label} on {entry.shift_date} at {entry.office_name} with the role '{emp_role}'."
            )

    if payload.shift_type is not None and payload.shift_type != entry.shift_type:
        changes.append(f"shift_type: '{entry.shift_type}' -> '{payload.shift_type}'")
        entry.shift_type = payload.shift_type
    if payload.start_time is not None and payload.start_time != entry.start_time:
        changes.append(f"start_time: '{entry.start_time}' -> '{payload.start_time}'")
        entry.start_time = payload.start_time
    if payload.end_time is not None and payload.end_time != entry.end_time:
        changes.append(f"end_time: '{entry.end_time}' -> '{payload.end_time}'")
        entry.end_time = payload.end_time
    if payload.status is not None and payload.status != entry.status:
        changes.append(f"status: '{entry.status}' -> '{payload.status}'")
        entry.status = payload.status
    if payload.remarks is not None and payload.remarks != entry.remarks:
        changes.append(f"remarks: '{entry.remarks}' -> '{payload.remarks}'")
        entry.remarks = payload.remarks

    db.commit()
    db.refresh(entry)

    change_desc = ", ".join(changes) if changes else "no fields changed"
    audit = AuditLog(
        user=current_user.username,
        action="UPDATE_ROSTER",
        module="SHIFT_MANAGEMENT",
        description=f"Updated roster entry #{roster_id} for {entry.employee_name} ({entry.employee_code}) on {entry.shift_date}. Changes: {change_desc}.",
        status="SUCCESS",
        project=entry.project
    )
    db.add(audit)
    db.commit()

    return {"message": f"Roster entry #{roster_id} updated successfully."}


# ─── 4. Delete (Cancel) Roster Entry ────────────────────────────

@router.delete("/roster/{roster_id}")
def delete_roster_entry(
    roster_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """Cancel/soft-delete a roster entry."""
    if not _check_roster_admin(current_user):
        raise HTTPException(status_code=403, detail="Only admin/supervisor/manager roles can manage rosters.")

    entry = db.query(ShiftRoster).filter(ShiftRoster.id == roster_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Roster entry not found.")

    if entry.shift_date < date.today():
        raise HTTPException(status_code=400, detail="Past roster shifts cannot be cancelled or deleted.")

    entry.status = "cancelled"
    db.commit()

    audit = AuditLog(
        user=current_user.username,
        action="CANCEL_ROSTER",
        module="SHIFT_MANAGEMENT",
        description=f"Cancelled roster entry #{roster_id} for {entry.employee_code} on {entry.shift_date}.",
        status="SUCCESS",
        project=entry.project
    )
    db.add(audit)
    db.commit()

    return {"message": f"Roster entry #{roster_id} cancelled."}


# ─── 5. Swap Shifts ────────────────────────────────────────

@router.post("/roster/swap")
def swap_roster_shifts(
    payload: RosterSwap,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """Swap shift assignments between two roster entries."""
    if not _check_roster_admin(current_user):
        raise HTTPException(status_code=403, detail="Only admin/supervisor/manager roles can manage rosters.")

    entry1 = db.query(ShiftRoster).filter(ShiftRoster.id == payload.roster_id_1).first()
    entry2 = db.query(ShiftRoster).filter(ShiftRoster.id == payload.roster_id_2).first()

    if not entry1 or not entry2:
        raise HTTPException(status_code=404, detail="One or both roster entries not found.")

    if entry1.shift_date < date.today() or entry2.shift_date < date.today():
        raise HTTPException(status_code=400, detail="Cannot swap shifts that are in the past.")

    # Record details for audit log before swapping
    e1_code, e1_name, e1_shift, e1_date = entry1.employee_code, entry1.employee_name, entry1.shift_type, entry1.shift_date
    e2_code, e2_name, e2_shift, e2_date = entry2.employee_code, entry2.employee_name, entry2.shift_type, entry2.shift_date

    # Swap employee assignments
    entry1.employee_code, entry2.employee_code = entry2.employee_code, entry1.employee_code
    entry1.employee_name, entry2.employee_name = entry2.employee_name, entry1.employee_name

    db.commit()

    audit = AuditLog(
        user=current_user.username,
        action="SWAP_ROSTER",
        module="SHIFT_MANAGEMENT",
        description=f"Swapped roster shift assignments: {e1_name} ({e1_code}) on shift '{e1_shift}' ({e1_date}) swapped with {e2_name} ({e2_code}) on shift '{e2_shift}' ({e2_date}).",
        status="SUCCESS",
        project=entry1.project
    )
    db.add(audit)
    db.commit()

    return {"message": f"Successfully swapped shift between {e1_name} and {e2_name}."}


# ─── 6. Get Employees for Roster (from EMS API) ──────────────

@router.get("/roster/employees")
def get_roster_employees(
    project: str = Query(...),
    office_name: str = Query(""),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """
    Get employees eligible for rostering at a specific project/office.
    Uses the cached EMS API employee data.
    """
    from app.api.v1.users import fetch_all_employees

    employees_data = fetch_all_employees()
    result = []

    for item in employees_data:
        if not isinstance(item, dict):
            continue
        emp = item.get("employee", {})
        pos = item.get("position", {})
        proj = item.get("project", {})
        office = item.get("office", {}) or {}

        proj_name = proj.get("name") if proj else None
        if proj_name != project:
            continue

        office_name_ems = office.get("name", "")

        # If office filter is specified, match it
        if office_name and office_name not in ["all", "ALL"]:
            if office_name_ems != office_name:
                continue

        emp_code = emp.get("employee_code")
        if not emp_code:
            continue

        result.append({
            "employee_code": emp_code,
            "name": emp.get("name", "Unknown"),
            "role": pos.get("role_name", "OPERATOR") if pos else "OPERATOR",
            "office_name": office_name_ems,
            "phone": emp.get("phone", "N/A"),
            "email": emp.get("email", "")
        })

    return sorted(result, key=lambda x: x["name"])


# ─── 7. Get My Shift Today ────────────────────────────────────

@router.get("/roster/my-shift")
def get_my_shift_today(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    tz = timezone(timedelta(hours=5, minutes=30))
    now_dt = datetime.now(tz)
    today = now_dt.date()
    current_hour = now_dt.hour

    entries = db.query(ShiftRoster).filter(
        ShiftRoster.employee_code == current_user.username,
        ShiftRoster.shift_date == today,
        ShiftRoster.status != "cancelled"
    ).all()

    if not entries:
        return {"assigned": False, "message": "No shift assigned for today."}

    # Decide preferred shift type based on hour (14:00 is crossover to shift_2)
    preferred_type = "shift_1" if current_hour < 14 else "shift_2"
    
    # Select preferred shift first, or fallback to the other non-off shift
    entry = next((e for e in entries if e.shift_type == preferred_type), None)
    if not entry:
        entry = next((e for e in entries if e.shift_type != "off"), None)
        
    if not entry:
        return {"assigned": False, "message": "No shift assigned for today."}

    assigned_shift_types = list(set([e.shift_type for e in entries if e.shift_type != "off"]))

    return {
        "assigned": True,
        "id": entry.id,
        "project": entry.project,
        "office_name": entry.office_name,
        "shift_type": entry.shift_type,
        "start_time": entry.start_time or "",
        "end_time": entry.end_time or "",
        "status": entry.status,
        "shift_date": entry.shift_date.strftime("%Y-%m-%d"),
        "remarks": entry.remarks or "",
        "assigned_shifts": assigned_shift_types
    }


@router.get("/roster/incoming-operator")
def get_incoming_operator(
    project: str,
    office_name: str,
    shift_type: str,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """
    Get the scheduled incoming operator for the next shift.
    If current shift is shift_1 (today): next is shift_2 (today) at the same office.
    If current shift is shift_2 (today): next is shift_1 (tomorrow) at the same office.
    """
    tz = timezone(timedelta(hours=5, minutes=30))
    today = datetime.now(tz).date()
    
    c_roster = db.query(ShiftRoster).filter(
        ShiftRoster.employee_code == current_user.username,
        ShiftRoster.shift_date == today,
        ShiftRoster.status != "cancelled"
    ).first()
    if not c_roster:
        yesterday = today - timedelta(days=1)
        c_roster = db.query(ShiftRoster).filter(
            ShiftRoster.employee_code == current_user.username,
            ShiftRoster.shift_date == yesterday,
            ShiftRoster.status != "cancelled"
        ).first()

    base_date = c_roster.shift_date if c_roster else today

    if shift_type == "shift_1":
        next_date = base_date
        next_shift = "shift_2"
    elif shift_type == "shift_2":
        next_date = base_date + timedelta(days=1)
        next_shift = "shift_1"
    elif shift_type == "general":
        next_date = base_date + timedelta(days=1)
        next_shift = "general"
    else:
        next_date = base_date
        next_shift = "shift_2"
        
    entry = db.query(ShiftRoster).filter(
        ShiftRoster.project == project,
        ShiftRoster.office_name == office_name,
        ShiftRoster.shift_date == next_date,
        ShiftRoster.shift_type == next_shift,
        ShiftRoster.status != "cancelled"
    ).first()
    
    if not entry:
        return {"found": False, "message": f"No incoming operator scheduled for {next_shift} on {next_date}."}
        
    return {
        "found": True,
        "employee_code": entry.employee_code,
        "employee_name": entry.employee_name,
        "shift_type": entry.shift_type,
        "shift_date": entry.shift_date.strftime("%Y-%m-%d")
    }


@router.post("/roster/generate-handover-pin")
def generate_handover_pin(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """
    Generate a 6-digit handover OTP/PIN code for the authenticated incoming operator.
    """
    import secrets
    from datetime import datetime, timezone, timedelta
    from app.core.cache import cache_service

    tz = timezone(timedelta(hours=5, minutes=30))
    today = datetime.now(tz).date()
    tomorrow = today + timedelta(days=1)

    # Check if this employee has any rostered assignment today or tomorrow
    roster_entry = db.query(ShiftRoster).filter(
        ShiftRoster.employee_code == current_user.username,
        ShiftRoster.shift_date.in_([today, tomorrow]),
        ShiftRoster.status != "cancelled"
    ).first()

    if not roster_entry:
        raise HTTPException(
            status_code=400,
            detail="You are not scheduled on the daily shift roster for today or tomorrow."
        )

    # Generate a random 6-digit code
    pin = f"{secrets.randbelow(900000) + 100000}"
    
    # Store it in Cache for 5 minutes (300 seconds)
    cache_service.set_otp(current_user.username, pin, ttl=300)

    return {
        "pin": pin,
        "expires_in_seconds": 300,
        "employee_code": current_user.username,
        "employee_name": roster_entry.employee_name or current_user.username
    }


# ─── 8. Import Roster Excel/CSV ───────────────────────────────

@router.post("/roster/bulk-import")
def import_roster(
    project: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """
    Import roster assignments from a CSV or Excel (.xlsx) file.
    Validates same-role conflicts and dynamically resolves office/facility.
    """
    import csv
    import io
    import openpyxl
    from app.api.v1.utils import get_hierarchy_maps

    if not _check_roster_admin(current_user):
        raise HTTPException(status_code=403, detail="Only admin/supervisor/manager roles can manage rosters.")

    filename = file.filename.lower()
    contents = file.file.read()
    
    rows = []
    errors = []

    if filename.endswith(".csv"):
        try:
            decoded = contents.decode("utf-8-sig")
            csv_reader = csv.DictReader(io.StringIO(decoded))
            for idx, row in enumerate(csv_reader, start=2):
                clean_row = {
                    k.strip().lower().replace(" ", "_"): v.strip() if v else "" 
                    for k, v in row.items() if k
                }
                rows.append((idx, clean_row))
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to read CSV file: {str(e)}")

    elif filename.endswith((".xlsx", ".xls")):
        try:
            wb = openpyxl.load_workbook(io.BytesIO(contents), data_only=True)
            sheet = wb.active
            headers = [cell.value for cell in sheet[1]]
            headers_clean = []
            for h in headers:
                if h is not None:
                    headers_clean.append(str(h).strip().lower().replace(" ", "_"))
                else:
                    headers_clean.append("")

            for idx, row_cells in enumerate(sheet.iter_rows(min_row=2, values_only=True), start=2):
                if not any(cell is not None for cell in row_cells):
                    continue
                row_dict = {}
                for h, val in zip(headers_clean, row_cells):
                    if h:
                        if isinstance(val, (datetime, date)):
                            val_str = val.strftime("%Y-%m-%d")
                        elif val is not None:
                            val_str = str(val).strip()
                        else:
                            val_str = ""
                        row_dict[h] = val_str
                rows.append((idx, row_dict))
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to read Excel file: {str(e)}")
    else:
        raise HTTPException(status_code=400, detail="Unsupported file format. Please upload a .csv or .xlsx file.")

    if not rows:
        raise HTTPException(status_code=400, detail="The uploaded file contains no data rows.")

    # Validate template headers
    first_row_idx, first_row = rows[0]
    required_cols = {"employee_code", "shift_date", "shift_type"}
    missing = required_cols - set(first_row.keys())
    if missing:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid file template. Missing required column(s): {', '.join(missing)}."
        )

    emp_code_to_details, _, _ = get_hierarchy_maps()

    assigned_in_payload = set()
    to_create = []
    created_count = 0
    skipped_count = 0

    SHIFT_TYPES_CONFIG = {
        "shift_1": {"defaultStart": "06:00", "defaultEnd": "14:00"},
        "shift_2": {"defaultStart": "14:00", "defaultEnd": "22:00"},
        "general": {"defaultStart": "09:00", "defaultEnd": "18:00"},
        "off": {"defaultStart": None, "defaultEnd": None}
    }

    for row_num, rdata in rows:
        emp_code = rdata.get("employee_code", "").strip()
        date_str = rdata.get("shift_date", "").strip()
        shift_type = rdata.get("shift_type", "").strip().lower()
        office_name_field = rdata.get("office_name", "").strip()
        emp_name = rdata.get("employee_name", "").strip()
        start_time = rdata.get("start_time", "").strip()
        end_time = rdata.get("end_time", "").strip()

        if not emp_code:
            errors.append(f"Row {row_num}: Missing Employee Code.")
            continue
        if not date_str:
            errors.append(f"Row {row_num}: Missing Shift Date.")
            continue
        if not shift_type:
            errors.append(f"Row {row_num}: Missing Shift Type.")
            continue

        # Parse date
        parsed_date = None
        for fmt in ("%Y-%m-%d", "%d-%m-%Y"):
            try:
                parsed_date = datetime.strptime(date_str, fmt).date()
                break
            except ValueError:
                continue

        if not parsed_date:
            errors.append(f"Row {row_num}: Invalid date format '{date_str}'. Use YYYY-MM-DD or DD-MM-YYYY.")
            continue

        if parsed_date < date.today():
            errors.append(f"Row {row_num}: Cannot assign shift to past date: {date_str}.")
            continue

        if shift_type not in SHIFT_TYPES_CONFIG:
            errors.append(f"Row {row_num}: Invalid shift type '{shift_type}'. Permitted values: shift_1, shift_2, general, off.")
            continue

        # Resolve Office
        resolved_office = office_name_field
        emp_details = emp_code_to_details.get(emp_code, {})
        if not resolved_office or resolved_office.lower() == "all":
            emp_office = emp_details.get("office_name")
            if emp_office and emp_office != "N/A":
                resolved_office = emp_office
            else:
                resolved_office = "Default Office"

        # Resolve role
        emp_role = emp_details.get("role", "OPERATOR")
        final_emp_name = emp_name or emp_details.get("name") or "Unknown"

        config = SHIFT_TYPES_CONFIG.get(shift_type, {})
        final_start = start_time or config.get("defaultStart")
        final_end = end_time or config.get("defaultEnd")

        # Conflict validations
        if shift_type != "off":
            payload_key = (project, resolved_office, parsed_date, shift_type, emp_role)
            if payload_key in assigned_in_payload:
                errors.append(
                    f"Row {row_num}: Multiple employees with role '{emp_role}' are assigned to {shift_type} on {date_str} at {resolved_office} in this file."
                )
                continue

            active_shifts = db.query(ShiftRoster).filter(
                ShiftRoster.project == project,
                ShiftRoster.office_name == resolved_office,
                ShiftRoster.shift_date == parsed_date,
                ShiftRoster.shift_type == shift_type,
                ShiftRoster.employee_code != emp_code,
                ShiftRoster.status != "cancelled"
            ).all()

            conflict = None
            for active in active_shifts:
                other_emp_role = emp_code_to_details.get(active.employee_code, {}).get("role", "OPERATOR")
                if other_emp_role == emp_role:
                    conflict = active
                    break

            if conflict:
                errors.append(
                    f"Row {row_num}: {conflict.employee_name} ({conflict.employee_code}) is already assigned to {shift_type} on {date_str} at {resolved_office} with the role '{emp_role}'."
                )
                continue

            assigned_in_payload.add(payload_key)

        existing = db.query(ShiftRoster).filter(
            ShiftRoster.employee_code == emp_code,
            ShiftRoster.shift_date == parsed_date,
            ShiftRoster.shift_type == shift_type,
            ShiftRoster.project == project
        ).first()

        if existing:
            if existing.status == "cancelled":
                existing.status = "scheduled"
                existing.office_name = resolved_office
                existing.employee_name = final_emp_name
                existing.start_time = final_start
                existing.end_time = final_end
                existing.created_by = current_user.username
                created_count += 1
            else:
                skipped_count += 1
        else:
            entry = ShiftRoster(
                project=project,
                office_name=resolved_office,
                employee_code=emp_code,
                employee_name=final_emp_name,
                shift_date=parsed_date,
                shift_type=shift_type,
                start_time=final_start or None,
                end_time=final_end or None,
                status="scheduled",
                created_by=current_user.username,
                remarks="Imported via file upload"
            )
            to_create.append(entry)
            created_count += 1

    if errors:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail={"message": "Validation fails. Please resolve conflicts:", "errors": errors}
        )

    for entry in to_create:
        db.add(entry)
    db.commit()

    audit = AuditLog(
        user=current_user.username,
        action="IMPORT_ROSTER",
        module="SHIFT_MANAGEMENT",
        description=f"Imported roster file: created {created_count} entries, {skipped_count} skipped.",
        status="SUCCESS",
        project=project
    )
    db.add(audit)
    db.commit()

    return {
        "message": f"Roster imported successfully! Created {created_count} entries, {skipped_count} skipped.",
        "created": created_count,
        "skipped": skipped_count
    }

