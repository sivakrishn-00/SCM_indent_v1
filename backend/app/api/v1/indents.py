import json
import random
from typing import List, Any, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.api import deps
from app.models.user import User
from app.models.vehicle import Vehicle
from app.models.indent import Indent, IndentStatus
from app.models.project_config import ProjectApprovalConfig
from app.api.v1.utils import get_hierarchy_maps
from pydantic import BaseModel

router = APIRouter()

def check_operator_shift_active(db: Session, user: User, shift_type: Optional[str] = None):
    # 1. Exempt Admin
    if user.username == "admin" or str(user.role).lower() == "admin":
        return

    # 2. Exempt Warehouse roles
    from app.api.v1.utils import get_hierarchy_maps
    emp_code_to_details, _, _ = get_hierarchy_maps()
    user_details = emp_code_to_details.get(user.username)
    if user_details:
        office = user_details.get("office_name", "").lower()
        office_loc = user_details.get("office_location", "").lower()
        if "central ware house" in office or "central warehouse" in office or "central ware house" in office_loc or "central warehouse" in office_loc:
            return  # Exempt warehouse users

    # 3. Only apply roster restriction to operators/pilots/paravets
    role_lower = str(user.role).lower()
    is_operator = "operator" in role_lower or "pilot" in role_lower or "paravet" in role_lower
    if not is_operator:
        return
        
    from app.models.roster import ShiftRoster
    from app.models.shift import UserShiftState
    from datetime import datetime, timezone, timedelta
    
    tz = timezone(timedelta(hours=5, minutes=30))
    now_dt = datetime.now(tz)
    today = now_dt.date()
    
    # 4. Roster validation
    roster_entry = None
    roster_date = today
    if shift_type:
        roster_entry = db.query(ShiftRoster).filter(
            ShiftRoster.employee_code == user.username,
            ShiftRoster.shift_date == today,
            ShiftRoster.shift_type == shift_type,
            ShiftRoster.status != "cancelled"
        ).first()
        
        # Fallback to yesterday
        if not roster_entry:
            yesterday = today - timedelta(days=1)
            yesterday_entry = db.query(ShiftRoster).filter(
                ShiftRoster.employee_code == user.username,
                ShiftRoster.shift_date == yesterday,
                ShiftRoster.shift_type == shift_type,
                ShiftRoster.status != "cancelled"
            ).first()
            if yesterday_entry:
                yesterday_state = db.query(UserShiftState).filter(
                    UserShiftState.user_id == user.id,
                    UserShiftState.shift_date == yesterday.strftime("%Y-%m-%d")
                ).first()
                if not yesterday_state or yesterday_state.status != "handed_over":
                    roster_entry = yesterday_entry
                    roster_date = yesterday

    if not roster_entry:
        roster_entries = db.query(ShiftRoster).filter(
            ShiftRoster.employee_code == user.username,
            ShiftRoster.shift_date == today,
            ShiftRoster.status != "cancelled"
        ).all()
        roster_entries = [e for e in roster_entries if e.shift_type != "off"]
        
        if roster_entries:
            preferred_type = "shift_1" if now_dt.hour < 14 else "shift_2"
            roster_entry = next((e for e in roster_entries if e.shift_type == preferred_type), None)
            if not roster_entry:
                roster_entry = roster_entries[0]
            roster_date = today
        else:
            # Fallback to yesterday
            yesterday = today - timedelta(days=1)
            yesterday_entries = db.query(ShiftRoster).filter(
                ShiftRoster.employee_code == user.username,
                ShiftRoster.shift_date == yesterday,
                ShiftRoster.status != "cancelled"
            ).all()
            yesterday_entries = [e for e in yesterday_entries if e.shift_type != "off"]
            if yesterday_entries:
                yesterday_state = db.query(UserShiftState).filter(
                    UserShiftState.user_id == user.id,
                    UserShiftState.shift_date == yesterday.strftime("%Y-%m-%d")
                ).first()
                if not yesterday_state or yesterday_state.status != "handed_over":
                    roster_entry = yesterday_entries[0]
                    roster_date = yesterday
    
    if not roster_entry:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No shift assigned to you in the roster today. Access is view-only."
        )
        
    # Enforce shift type matching
    if shift_type and roster_entry.shift_type != shift_type:
        assigned_label = "Shift 1 (Morning)" if roster_entry.shift_type == "shift_1" else "Shift 2 (Evening)"
        requested_label = "Shift 1 (Morning)" if shift_type == "shift_1" else "Shift 2 (Evening)"
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"You are rostered for {assigned_label} on {roster_date.strftime('%Y-%m-%d')}. Access to {requested_label} is forbidden."
        )
        
    # 5. Handover validation and next-shift activation
    roster_date_str = roster_date.strftime("%Y-%m-%d")
    needs_handover_activation = False
    
    if roster_entry.shift_type == "shift_2":
        shift1_rostered = db.query(ShiftRoster).filter(
            ShiftRoster.shift_date == roster_date,
            ShiftRoster.shift_type == "shift_1",
            ShiftRoster.status != "cancelled"
        ).first()
        if shift1_rostered:
            if shift1_rostered.employee_code != user.username:
                needs_handover_activation = True
            else:
                # Same operator doing double shift. Ensure Shift 1 consumption logs are finalized first.
                from app.models.shift import ShiftLog
                shift1_finalized = db.query(ShiftLog).filter(
                    ShiftLog.operator_id == user.id,
                    ShiftLog.shift_type == "shift_1",
                    ShiftLog.date >= datetime.combine(roster_date, datetime.min.time()),
                    ShiftLog.date <= datetime.combine(roster_date, datetime.max.time()),
                    ShiftLog.is_draft == False
                ).first()
                if not shift1_finalized:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Please finalize and submit your Shift 1 (Morning) consumption log first before proceeding to Shift 2."
                    )
    elif roster_entry.shift_type == "general":
        # Check if there was a general shift rostered yesterday with a different employee
        yesterday_roster_date = roster_date - timedelta(days=1)
        prev_rostered = db.query(ShiftRoster).filter(
            ShiftRoster.project == roster_entry.project,
            ShiftRoster.office_name == roster_entry.office_name,
            ShiftRoster.shift_date == yesterday_roster_date,
            ShiftRoster.shift_type == "general",
            ShiftRoster.status != "cancelled"
        ).first()
        if prev_rostered and prev_rostered.employee_code != user.username:
            needs_handover_activation = True

    state = db.query(UserShiftState).filter(
        UserShiftState.user_id == user.id,
        UserShiftState.shift_date == roster_date_str
    ).first()
    
    if needs_handover_activation:
        if not state or state.status != "active":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"You are rostered for the next shift ({roster_entry.shift_type}). Access is view-only until the current shift operator hands over to you."
            )

    if state and state.status == "handed_over":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Your shift on {roster_date_str} has been completed/handed over. Only view access is permitted."
        )

class IndentCreate(BaseModel):
    vehicle_id: int
    consumable_id: Optional[int] = None
    drug_id: Optional[int] = None
    requested_qty: float
    remarks: str = ""

class IndentBatchItem(BaseModel):
    drug_id: Optional[int] = None
    consumable_id: Optional[int] = None
    requested_qty: float

class IndentBatchCreate(BaseModel):
    project: str
    office_name: str
    items: List[IndentBatchItem]
    remarks: str = ""

class DispatchPayload(BaseModel):
    dispatched_qty: Optional[float] = None
    dispatched_batch_no: Optional[str] = None
    courier_details: Optional[str] = None
    dispatch_remarks: Optional[str] = None
    service_area_code: Optional[str] = None

@router.get("/indents")
def get_indents(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """
    Get all indents with joined vehicle, consumable, and drug information, including workflow details.
    Filtered dynamically based on user role and chain membership.
    """
    from app.models.drug import DrugMaster
    from app.models.consumable import Consumable
    
    is_admin = current_user.username == "admin" or str(current_user.role).lower() == "admin"
    
    emp_code_to_details, parent_map, has_subordinates_set = get_hierarchy_maps()
    user_details = emp_code_to_details.get(current_user.username) or {}
    office = str(user_details.get("office_name", "")).lower()
    office_loc = str(user_details.get("office_location", "")).lower()
    
    is_warehouse_user = (
        "central ware house" in office or 
        "central warehouse" in office or 
        "central ware house" in office_loc or 
        "central warehouse" in office_loc
    )
    
    query = db.query(Indent)
    
    if is_admin or is_warehouse_user:
        # Admins and Warehouse view all requests
        pass
    else:
        # Check config and hierarchy to see if user is part of any approval chain or if they initiated it
        user_code = current_user.username
        
        # User is either the initiator (requested_by_id) OR their code is currently the active approver
        # OR they are in the approval chain list. Let's query all, then filter in Python
        pass
        
    indents = query.all()
    
    # Enrich and filter
    result = []
    for indent in indents:
        # Filter logic:
        # If user is admin/warehouse -> return
        # If user is initiator -> return
        # If user is in chain -> return
        chain_list = json.loads(indent.approval_chain) if indent.approval_chain else []
        
        if not is_admin and not is_warehouse_user:
            is_initiator = indent.requested_by_id == current_user.id
            is_approver = indent.current_approver_code == current_user.username
            is_in_chain = current_user.username in chain_list
            
            if not (is_initiator or is_approver or is_in_chain):
                continue
                
        # Resolve names
        initiator = db.query(User).filter(User.id == indent.requested_by_id).first()
        approver = db.query(User).filter(User.id == indent.approved_by_id).first()
        vehicle = db.query(Vehicle).filter(Vehicle.id == indent.vehicle_id).first() if indent.vehicle_id else None
        consumable = db.query(Consumable).filter(Consumable.id == indent.consumable_id).first() if indent.consumable_id else None
        drug = db.query(DrugMaster).filter(DrugMaster.id == indent.drug_id).first() if indent.drug_id else None
        
        # Resolve current approver name
        current_approver_name = "N/A"
        if indent.current_approver_code:
            app_details = emp_code_to_details.get(indent.current_approver_code)
            current_approver_name = app_details.get("name") if app_details else indent.current_approver_code
            
        # Resolve initiator role and chain roles
        requested_by_role = "INITIATOR"
        if initiator:
            init_details = emp_code_to_details.get(initiator.username)
            if init_details and init_details.get("role"):
                requested_by_role = init_details["role"]

        chain_roles = []
        for code in chain_list:
            app_details = emp_code_to_details.get(code)
            chain_roles.append(app_details.get("role") if app_details else "OFFICER")

        result.append({
            "id": indent.id,
            "vehicle_number": vehicle.vehicle_number if vehicle else "N/A",
            "vehicle_type": vehicle.vehicle_type if vehicle else "N/A",
            "office_name": indent.office_name or (vehicle.office_name if vehicle else "N/A"),
            "project": indent.project or (vehicle.project if vehicle else "N/A"),
            "item_name": drug.item_name if drug else (consumable.name if consumable else "N/A"),
            "item_code": drug.item_code if drug else "N/A",
            "item_group": drug.item_group if drug else "N/A",
            "requested_qty": indent.requested_qty,
            "dispatched_qty": indent.dispatched_qty,
            "dispatched_batch_no": indent.dispatched_batch_no or "",
            "courier_details": indent.courier_details or "",
            "dispatch_remarks": indent.dispatch_remarks or "",
            "service_area_code": indent.service_area_code or "",
            "status": indent.status,
            "requested_by": initiator.username if initiator else "N/A",
            "requested_by_fullname": emp_code_to_details.get(initiator.username, {}).get("name", initiator.username) if initiator else "N/A",
            "requested_by_role": requested_by_role,
            "approved_by": approver.username if approver else "N/A",
            "current_approver_code": indent.current_approver_code or "",
            "current_approver_name": current_approver_name,
            "approval_chain": chain_list,
            "approval_chain_roles": chain_roles,
            "current_chain_index": indent.current_chain_index,
            "remarks": indent.remarks,
            "batch_number": indent.batch_number or "N/A",
            "created_at": indent.created_at.strftime("%Y-%m-%d %H:%M:%S") if indent.created_at else "",
            "updated_at": indent.updated_at.strftime("%Y-%m-%d %H:%M:%S") if indent.updated_at else ""
        })
        
    return sorted(result, key=lambda x: x["id"], reverse=True)


@router.post("/indents")
def create_indent(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    indent_in: IndentCreate
) -> Any:
    """
    Raise a new indent request. Only leaf-node employees (no subordinates) can call this.
    """
    check_operator_shift_active(db, current_user)
    emp_code_to_details, parent_map, has_subordinates_set = get_hierarchy_maps()
    
    # 1. Enforce leaf-node validation (Managers cannot raise indents)
    username = current_user.username
    if username in has_subordinates_set and username != "admin":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only subordinates (leaf nodes with no children) can raise indent requests."
        )

    user_details = emp_code_to_details.get(username) or {}
    user_role = str(current_user.role or user_details.get("role", "")).lower()
    office = str(user_details.get("office_name", "")).lower()
    office_loc = str(user_details.get("office_location", "")).lower()
    is_warehouse_user = (
        "central ware house" in office or 
        "central warehouse" in office or 
        "central ware house" in office_loc or 
        "central warehouse" in office_loc
    )
    is_admin = username == "admin" or user_role == "admin"
    if not is_admin and (is_warehouse_user or "manager" in user_role or "warehouse" in user_role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Warehouse users and managers are not permitted to raise indents."
        )

    # 2. Get user's project (either from user record or vehicle)
    vehicle = db.query(Vehicle).filter(Vehicle.id == indent_in.vehicle_id).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
        
    project_name = current_user.project or vehicle.project or "Global"
    
    # 3. Retrieve Project Configuration
    config = db.query(ProjectApprovalConfig).filter(ProjectApprovalConfig.project_name == project_name).first()
    
    skip_roles = []
    stop_role = None
    if config:
        if config.skip_roles:
            skip_roles = [r.strip().lower() for r in config.skip_roles.split(",") if r.strip()]
        if config.stop_role:
            stop_role = config.stop_role.strip().lower()

    # 4. Traverse parent hierarchy to build approval chain
    full_chain = []
    curr = username
    visited = {curr}
    while curr in parent_map:
        parent = parent_map[curr]
        if parent in visited:
            break
        visited.add(parent)
        full_chain.append(parent)
        curr = parent

    # 5. Filter hierarchy based on config (skips and stops)
    filtered_chain = []
    for parent_code in full_chain:
        details = emp_code_to_details.get(parent_code)
        if not details:
            parent_role = ""
        else:
            parent_role = details["role"].strip().lower()
            
        # Check skip role
        if parent_role in skip_roles:
            continue
            
        filtered_chain.append(parent_code)
        
        # Check early stop role
        if stop_role and parent_role == stop_role:
            break

    # 6. Create Indent
    db_indent = Indent(
        vehicle_id=indent_in.vehicle_id,
        consumable_id=indent_in.consumable_id,
        drug_id=indent_in.drug_id,
        requested_qty=indent_in.requested_qty,
        requested_by_id=current_user.id,
        remarks=indent_in.remarks,
        approval_chain=json.dumps(filtered_chain),
        current_chain_index=0
    )
    
    if not filtered_chain:
        # Auto-approved if chain is empty
        db_indent.status = IndentStatus.APPROVED
        db_indent.current_approver_code = None
    else:
        db_indent.status = IndentStatus.PENDING
        db_indent.current_approver_code = filtered_chain[0]
        
    db.add(db_indent)
    db.commit()
    db.refresh(db_indent)
    
    return {"message": "Indent raised successfully", "indent_id": db_indent.id, "status": db_indent.status}


@router.post("/indents/batch")
def create_indent_batch(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    batch_in: IndentBatchCreate
) -> Any:
    """
    Raise a batch of indent requests under a specific project and office.
    Only leaf-node employees (no subordinates) can call this.
    """
    check_operator_shift_active(db, current_user)
    emp_code_to_details, parent_map, has_subordinates_set = get_hierarchy_maps()
    
    # Enforce leaf-node validation
    username = current_user.username
    if username in has_subordinates_set and username != "admin":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only subordinates (leaf nodes with no children) can raise indent requests."
        )

    user_details = emp_code_to_details.get(username) or {}
    user_role = str(current_user.role or user_details.get("role", "")).lower()
    office = str(user_details.get("office_name", "")).lower()
    office_loc = str(user_details.get("office_location", "")).lower()
    is_warehouse_user = (
        "central ware house" in office or 
        "central warehouse" in office or 
        "central ware house" in office_loc or 
        "central warehouse" in office_loc
    )
    is_admin = username == "admin" or user_role == "admin"
    if not is_admin and (is_warehouse_user or "manager" in user_role or "warehouse" in user_role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Warehouse users and managers are not permitted to raise indents."
        )

    project_name = current_user.project or batch_in.project or "Global"
    
    # Retrieve Project Configuration
    config = db.query(ProjectApprovalConfig).filter(ProjectApprovalConfig.project_name == project_name).first()
    
    skip_roles = []
    stop_role = None
    if config:
        if config.skip_roles:
            skip_roles = [r.strip().lower() for r in config.skip_roles.split(",") if r.strip()]
        if config.stop_role:
            stop_role = config.stop_role.strip().lower()

    # Traverse parent hierarchy to build approval chain
    full_chain = []
    curr = username
    visited = {curr}
    while curr in parent_map:
        parent = parent_map[curr]
        if parent in visited:
            break
        visited.add(parent)
        full_chain.append(parent)
        curr = parent

    # Filter hierarchy based on config
    filtered_chain = []
    for parent_code in full_chain:
        details = emp_code_to_details.get(parent_code)
        if not details:
            parent_role = ""
        else:
            parent_role = details["role"].strip().lower()
            
        if parent_role in skip_roles:
            continue
            
        filtered_chain.append(parent_code)
        
        if stop_role and parent_role == stop_role:
            break

    batch_number = f"IND-B-{datetime.now().strftime('%Y%m%d%H%M%S')}-{random.randint(1000, 9999)}"

    created_ids = []
    for item in batch_in.items:
        db_indent = Indent(
            vehicle_id=None,
            office_name=batch_in.office_name,
            project=project_name,
            consumable_id=item.consumable_id,
            drug_id=item.drug_id,
            requested_qty=item.requested_qty,
            requested_by_id=current_user.id,
            remarks=batch_in.remarks,
            approval_chain=json.dumps(filtered_chain),
            current_chain_index=0,
            batch_number=batch_number
        )
        
        if not filtered_chain:
            db_indent.status = IndentStatus.APPROVED
            db_indent.current_approver_code = None
        else:
            db_indent.status = IndentStatus.PENDING
            db_indent.current_approver_code = filtered_chain[0]
            
        db.add(db_indent)
        db.commit()
        db.refresh(db_indent)
        created_ids.append(db_indent.id)
        
    return {"message": f"Successfully raised {len(created_ids)} indents", "indent_ids": created_ids, "batch_number": batch_number}


@router.post("/indents/{indent_id}/approve")
def approve_indent(
    indent_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """
    Approve an indent request at the current hierarchical stage.
    """
    indent = db.query(Indent).filter(Indent.id == indent_id).first()
    if not indent:
        raise HTTPException(status_code=404, detail="Indent not found")
    
    if indent.status != IndentStatus.PENDING:
        raise HTTPException(status_code=400, detail="Indent is not pending approval")
        
    # Superadmin can approve any indent directly
    is_admin = str(current_user.role).lower() == "admin" or current_user.username == "admin"
    if not is_admin:
        if (indent.current_approver_code or "").lower() != (current_user.username or "").lower():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not authorized to approve this indent at the current stage."
            )

    chain = json.loads(indent.approval_chain) if indent.approval_chain else []
    
    if is_admin:
        indent.status = IndentStatus.APPROVED
        indent.current_approver_code = None
        indent.approved_by_id = current_user.id
    else:
        # Move to next approver in chain
        next_idx = indent.current_chain_index + 1
        if next_idx >= len(chain):
            # End of chain -> Fully approved
            indent.status = IndentStatus.APPROVED
            indent.current_approver_code = None
            indent.approved_by_id = current_user.id
        else:
            indent.current_chain_index = next_idx
            indent.current_approver_code = chain[next_idx]

    db.commit()
    return {"message": "Indent approved successfully", "status": indent.status}


@router.post("/indents/{indent_id}/reject")
def reject_indent(
    indent_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """
    Reject an indent request.
    """
    indent = db.query(Indent).filter(Indent.id == indent_id).first()
    if not indent:
        raise HTTPException(status_code=404, detail="Indent not found")
        
    if indent.status != IndentStatus.PENDING:
        raise HTTPException(status_code=400, detail="Indent is not pending approval")
        
    is_admin = str(current_user.role).lower() == "admin" or current_user.username == "admin"
    if not is_admin:
        if (indent.current_approver_code or "").lower() != (current_user.username or "").lower():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not authorized to reject this indent at the current stage."
            )

    indent.status = IndentStatus.REJECTED
    indent.current_approver_code = None
    db.commit()
    return {"message": "Indent rejected successfully"}


@router.post("/indents/{indent_id}/dispatch")
def dispatch_indent(
    indent_id: int,
    payload: DispatchPayload = None,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """
    Dispatch an approved indent request. Only users belonging to the Central Warehouse can perform this action.
    Accepts optional dispatch details: dispatched_qty, dispatched_batch_no, courier_details, dispatch_remarks.
    """
    indent = db.query(Indent).filter(Indent.id == indent_id).first()
    if not indent:
        raise HTTPException(status_code=404, detail="Indent not found")
        
    if indent.status != IndentStatus.APPROVED:
        raise HTTPException(status_code=400, detail="Only approved indents can be dispatched.")
        
    # Enforce Central Warehouse check:
    emp_code_to_details, _, _ = get_hierarchy_maps()
    user_details = emp_code_to_details.get(current_user.username)
    
    is_warehouse_user = False
    if current_user.username == "admin" or str(current_user.role).lower() == "admin":
        is_warehouse_user = True
    elif user_details:
        office = user_details.get("office_name", "").lower()
        office_loc = user_details.get("office_location", "").lower()
        if "central ware house" in office or "central warehouse" in office or "central ware house" in office_loc or "central warehouse" in office_loc:
            is_warehouse_user = True
            
    if not is_warehouse_user:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only users belonging to the Central Warehouse can dispatch indents."
        )
    
    # Persist dispatch details
    if payload:
        if payload.dispatched_qty is not None:
            indent.dispatched_qty = payload.dispatched_qty
        else:
            indent.dispatched_qty = indent.requested_qty
        indent.dispatched_batch_no = payload.dispatched_batch_no
        indent.courier_details = payload.courier_details
        indent.dispatch_remarks = payload.dispatch_remarks
        indent.service_area_code = payload.service_area_code
    else:
        indent.dispatched_qty = indent.requested_qty
        
    # Deduct material from DrugMaster stock if it's a drug and has a batch
    if indent.drug_id and payload and payload.dispatched_batch_no:
        from app.models.drug import DrugMaster
        drug_item = db.query(DrugMaster).filter(DrugMaster.id == indent.drug_id).first()
        if drug_item:
            proj = indent.project or "Global"
            batch_record = db.query(DrugMaster).filter(
                DrugMaster.item_code == drug_item.item_code,
                DrugMaster.project == proj,
                DrugMaster.batch_number == payload.dispatched_batch_no,
                DrugMaster.is_active == True
            ).first()
            if batch_record:
                qty_deduct = payload.dispatched_qty if payload.dispatched_qty is not None else indent.requested_qty
                batch_record.quantity = max(0.0, batch_record.quantity - qty_deduct)
                
                # Auto-receive quantity into target office local storehouse inventory
                if indent.office_name:
                    from app.models.office_inventory import OfficeInventory
                    office_stock = db.query(OfficeInventory).filter(
                        OfficeInventory.project == proj,
                        OfficeInventory.office_name == indent.office_name,
                        OfficeInventory.drug_id == batch_record.id,
                        OfficeInventory.batch_number == payload.dispatched_batch_no
                    ).first()
                    
                    if not office_stock:
                        office_stock = OfficeInventory(
                            project=proj,
                            office_name=indent.office_name,
                            drug_id=batch_record.id,
                            item_code=drug_item.item_code,
                            item_name=drug_item.item_name,
                            batch_number=payload.dispatched_batch_no,
                            quantity=qty_deduct,
                            opening_stock=0.0
                        )
                        db.add(office_stock)
                    else:
                        office_stock.quantity += qty_deduct
                
                # Audit log creation for stock deduction
                from app.models.audit_log import AuditLog
                db_log = AuditLog(
                    user=current_user.username,
                    action="DEDUCT_STOCK",
                    module="MASTERS",
                    description=f"Dispatched & deducted {qty_deduct} units from drug {drug_item.item_name} (Code: {drug_item.item_code}, Batch: {payload.dispatched_batch_no}) & added to office {indent.office_name}",
                    status="SUCCESS",
                    project=proj
                )
                db.add(db_log)

    indent.status = IndentStatus.DISPATCHED
    db.commit()
    return {"message": "Indent dispatched successfully", "status": indent.status.value.upper()}


@router.post("/indents/{indent_id}/receive")
def receive_indent(
    indent_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """
    Acknowledge/Receive a dispatched indent request.
    Only the user who raised the indent or an admin can perform this action.
    """
    check_operator_shift_active(db, current_user)
    indent = db.query(Indent).filter(Indent.id == indent_id).first()
    if not indent:
        raise HTTPException(status_code=404, detail="Indent not found")
        
    if indent.status != IndentStatus.DISPATCHED:
        raise HTTPException(status_code=400, detail="Only dispatched indents can be acknowledged.")
        
    is_admin = current_user.username == "admin" or str(current_user.role).lower() == "admin"
    if not is_admin and indent.requested_by_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the initiator of the indent can acknowledge receipt."
        )
        
    indent.status = IndentStatus.RECEIVED
    db.commit()
    return {"message": "Indent acknowledged as received successfully", "status": indent.status.value.upper()}
