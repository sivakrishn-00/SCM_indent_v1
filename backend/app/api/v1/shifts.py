from typing import List, Any, Optional
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, status

def get_india_now():
    return datetime.now(timezone(timedelta(hours=5, minutes=30))).replace(tzinfo=None)

def to_india_time(dt: Optional[datetime]) -> str:
    if not dt:
        return ""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    india_tz = timezone(timedelta(hours=5, minutes=30))
    return dt.astimezone(india_tz).strftime("%Y-%m-%d %H:%M:%S")

from sqlalchemy.orm import Session
from app.api import deps
from app.models.user import User
from app.models.vehicle import Vehicle
from app.models.shift import ShiftLog, ShiftType
from app.models.drug import DrugMaster
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
    
    tz = timezone(timedelta(hours=5, minutes=30))
    now_dt = datetime.now(tz)
    today = now_dt.date()
    today_str = today.strftime("%Y-%m-%d")
    
    # 4. Roster validation
    roster_entry = None
    if shift_type:
        roster_entry = db.query(ShiftRoster).filter(
            ShiftRoster.employee_code == user.username,
            ShiftRoster.shift_date == today,
            ShiftRoster.shift_type == shift_type,
            ShiftRoster.status != "cancelled"
        ).first()

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
            detail=f"You are rostered for {assigned_label} today. Access to {requested_label} is forbidden."
        )
        
    # 5. Handover validation and next-shift activation
    needs_handover_activation = False
    if roster_entry.shift_type == "shift_2":
        shift1_rostered = db.query(ShiftRoster).filter(
            ShiftRoster.shift_date == today,
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
                    ShiftLog.date >= datetime.combine(today, datetime.min.time()),
                    ShiftLog.date <= datetime.combine(today, datetime.max.time()),
                    ShiftLog.is_draft == False
                ).first()
                if not shift1_finalized:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Please finalize and submit your Shift 1 (Morning) consumption log first before proceeding to Shift 2."
                    )

    state = db.query(UserShiftState).filter(
        UserShiftState.user_id == user.id,
        UserShiftState.shift_date == today_str
    ).first()
    
    if needs_handover_activation:
        if not state or state.status != "active":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are rostered for the next shift (Shift 2). Access is view-only until the current shift operator hands over to you."
            )

    if state and state.status == "handed_over":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Your shift has been completed/handed over. Only view access is permitted."
        )

# Schema for shift log input
class ShiftLogCreate(BaseModel):
    vehicle_id: int
    consumable_id: int
    opening_balance: float
    received_quantity: float
    consumed_quantity: float
    closing_balance: float
    remarks: str = ""

class ShiftConsumptionItem(BaseModel):
    drug_id: int
    consumed_qty: float = 0.0
    received_qty: float = 0.0
    sent_back_qty: float = 0.0

class ShiftBatchLogCreate(BaseModel):
    project: str
    office_name: str
    shift_type: str
    items: List[ShiftConsumptionItem]
    remarks: str = ""
    is_draft: bool = False

@router.post("/shifts/log")
def log_shift(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    shift_in: ShiftLogCreate
) -> Any:
    """
    Create a new shift log entry.
    """
    check_operator_shift_active(db, current_user)
        
    db_shift = ShiftLog(
        vehicle_id=shift_in.vehicle_id,
        consumable_id=shift_in.consumable_id,
        operator_id=current_user.id,
        opening_balance=shift_in.opening_balance,
        received_qty=shift_in.received_quantity,
        consumed_qty=shift_in.consumed_quantity,
        closing_balance=shift_in.closing_balance,
        discrepancy_reason=shift_in.remarks,
        shift_type=ShiftType.SHIFT_1,
        date=get_india_now(),
        created_at=get_india_now()
    )
    db.add(db_shift)
    db.commit()
    db.refresh(db_shift)
    return {"message": "Shift logged successfully", "id": db_shift.id}


@router.post("/shifts/batch-log")
def log_shift_batch(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    shift_in: ShiftBatchLogCreate
) -> Any:
    """
    Create or update batch shift log entries (as draft or final submission) and update drug stocks if finalizing.
    """
    check_operator_shift_active(db, current_user, shift_type=shift_in.shift_type)
        
    from sqlalchemy import func
    
    logged_shifts = []
    st = ShiftType.SHIFT_1 if shift_in.shift_type == "shift_1" else ShiftType.SHIFT_2
    
    now_time = get_india_now()
    for item in shift_in.items:
        drug = db.query(DrugMaster).filter(DrugMaster.id == item.drug_id).first()
        if not drug:
            raise HTTPException(status_code=404, detail=f"Material with ID {item.drug_id} not found.")
            
        # Calculate opening balance specific to the project and office name from OfficeInventory:
        from app.models.office_inventory import OfficeInventory
        current_stock = db.query(func.sum(OfficeInventory.quantity)).filter(
            OfficeInventory.drug_id == item.drug_id,
            OfficeInventory.project == shift_in.project,
            OfficeInventory.office_name == shift_in.office_name
        ).scalar() or 0.0
        
        # Get active transit stock for this operator and drug:
        from app.models.transit_inventory import TransitInventory
        transit_item = db.query(TransitInventory).filter(
            TransitInventory.operator_id == current_user.id,
            TransitInventory.drug_id == item.drug_id,
            TransitInventory.status == "active"
        ).first()
        
        transit_stock = transit_item.quantity if transit_item else 0.0
        transit_drawn = transit_item.drawn_qty if transit_item else 0.0

        # ── Office (Store/Room) calculations ──
        # current_stock already includes indent received_qty at dispatch time
        # So: office_ob = current_stock - item.received_qty (undo indent receipt to get true OB)
        office_ob = max(0.0, current_stock - item.received_qty)
        office_received = item.received_qty   # from indent dispatch
        office_sent_back = item.sent_back_qty  # returned from bag to office
        office_drawn = transit_drawn           # drawn from office to transit bag
        office_closing = max(0.0, office_ob + office_received + office_sent_back - office_drawn)

        # ── Transit Bag calculations ──
        # bag_ob = what was already in the bag before this shift (carried over)
        # bag_received = what was drawn from office this shift
        bag_ob = max(0.0, transit_stock - transit_drawn)
        bag_received = transit_drawn
        bag_sent_back = item.sent_back_qty  # sent back from bag to office
        bag_consumed = item.consumed_qty
        bag_closing = max(0.0, bag_ob + bag_received - bag_sent_back - bag_consumed)

        # Legacy flat columns (for backward compat with reports)
        opening_balance = office_ob
        received_qty = office_received
        sent_back_qty = item.sent_back_qty
        consumed_qty = item.consumed_qty
        closing_balance = office_closing
        
        # Check if an existing draft log exists for this operator/project/office/shift/drug
        existing_draft = db.query(ShiftLog).filter(
            ShiftLog.operator_id == current_user.id,
            ShiftLog.drug_id == item.drug_id,
            ShiftLog.project == shift_in.project,
            ShiftLog.office_name == shift_in.office_name,
            ShiftLog.shift_type == st,
            ShiftLog.is_draft == True
        ).first()

        if existing_draft:
            existing_draft.opening_balance = opening_balance
            existing_draft.received_qty = received_qty
            existing_draft.sent_back_qty = sent_back_qty
            existing_draft.consumed_qty = consumed_qty
            existing_draft.closing_balance = closing_balance
            existing_draft.drawn_qty = office_drawn
            existing_draft.bag_ob = bag_ob
            existing_draft.bag_received = bag_received
            existing_draft.bag_sent_back = bag_sent_back
            existing_draft.bag_consumed = bag_consumed
            existing_draft.bag_closing = bag_closing
            existing_draft.discrepancy_reason = shift_in.remarks
            existing_draft.is_draft = shift_in.is_draft
            existing_draft.date = now_time
            existing_draft.created_at = now_time
            db_shift = existing_draft
        else:
            db_shift = ShiftLog(
                operator_id=current_user.id,
                drug_id=item.drug_id,
                opening_balance=opening_balance,
                received_qty=received_qty,
                sent_back_qty=sent_back_qty,
                consumed_qty=consumed_qty,
                closing_balance=closing_balance,
                drawn_qty=office_drawn,
                bag_ob=bag_ob,
                bag_received=bag_received,
                bag_sent_back=bag_sent_back,
                bag_consumed=bag_consumed,
                bag_closing=bag_closing,
                project=shift_in.project,
                office_name=shift_in.office_name,
                shift_type=st,
                discrepancy_reason=shift_in.remarks,
                is_draft=shift_in.is_draft,
                date=now_time,
                created_at=now_time
            )
            db.add(db_shift)
            
        if not shift_in.is_draft:
            # Deduct consumed + sent_back from transit bag first, then office
            remaining_to_deduct = consumed_qty + sent_back_qty
            
            # Try to deduct from active TransitInventory first
            from app.models.transit_inventory import TransitInventory
            transit_item = db.query(TransitInventory).filter(
                TransitInventory.operator_id == current_user.id,
                TransitInventory.drug_id == item.drug_id,
                TransitInventory.status == "active"
            ).first()
            
            if transit_item and transit_item.quantity > 0:
                deduct_amount = min(transit_item.quantity, remaining_to_deduct)
                transit_item.quantity -= deduct_amount
                remaining_to_deduct -= deduct_amount
                if transit_item.quantity <= 0:
                    transit_item.status = "returned"
            
            if remaining_to_deduct > 0:
                local_batches = db.query(OfficeInventory).filter(
                    OfficeInventory.project == shift_in.project,
                    OfficeInventory.office_name == shift_in.office_name,
                    OfficeInventory.drug_id == item.drug_id,
                    OfficeInventory.quantity > 0
                ).order_by(OfficeInventory.id.asc()).all()
                
                for lb in local_batches:
                    if remaining_to_deduct <= 0:
                        break
                    deduct_amount = min(lb.quantity, remaining_to_deduct)
                    lb.quantity = max(0.0, lb.quantity - deduct_amount)
                    remaining_to_deduct -= deduct_amount
            
            # Return sent_back_qty to office inventory (bag -> office store)
            if sent_back_qty > 0:
                office_stock = db.query(OfficeInventory).filter(
                    OfficeInventory.project == shift_in.project,
                    OfficeInventory.office_name == shift_in.office_name,
                    OfficeInventory.drug_id == item.drug_id
                ).first()
                
                if office_stock:
                    office_stock.quantity += sent_back_qty
                else:
                    # Create new office inventory record for returned stock
                    new_office = OfficeInventory(
                        project=shift_in.project,
                        office_name=shift_in.office_name,
                        drug_id=item.drug_id,
                        item_code=drug.item_code,
                        item_name=drug.item_name,
                        quantity=sent_back_qty,
                        opening_stock=0.0
                    )
                    db.add(new_office)
                
            # Log audit entry for local consumption
            from app.models.audit_log import AuditLog
            audit = AuditLog(
                user=current_user.username,
                action="CONSUME_STOCK",
                module="OFFICE_INVENTORY",
                description=f"Consumed {consumed_qty}, Sent Back {sent_back_qty} units of drug {drug.item_name} at office {shift_in.office_name}",
                status="SUCCESS",
                project=shift_in.project
            )
            db.add(audit)
            
        logged_shifts.append(db_shift)
        
    db.commit()
    msg = "Saved consumption draft successfully." if shift_in.is_draft else f"Successfully logged consumption for {len(logged_shifts)} items."
    return {"message": msg}


@router.get("/shifts/drafts")
def get_shift_drafts(
    project: str,
    office_name: str,
    shift_type: str,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """
    Get all active draft shift log entries for the current operator, project, office, and shift.
    Also auto-calculates received, sent back, and damaged quantities from today's dispatched indents.
    """
    st = ShiftType.SHIFT_1 if shift_type == "shift_1" else ShiftType.SHIFT_2
    
    # 1. Fetch active draft entries for this operator / shift
    drafts = db.query(ShiftLog).filter(
        ShiftLog.operator_id == current_user.id,
        ShiftLog.project == project,
        ShiftLog.office_name == office_name,
        ShiftLog.shift_type == st,
        ShiftLog.is_draft == True
    ).all()
    
    # 2. Compute today's aggregates from dispatched indents
    from app.models.indent import Indent, IndentStatus
    from datetime import date, time, timedelta
    
    tz = timezone(timedelta(hours=5, minutes=30))
    today_ist = datetime.now(tz).date()
    start_of_day_ist = datetime.combine(today_ist, time.min)
    end_of_day_ist = datetime.combine(today_ist, time.max)
    
    # Indents updated_at contains UTC timestamps (naive in db)
    # Subtract 5.5 hours from IST bounds to get the UTC bounds
    start_of_day = start_of_day_ist - timedelta(hours=5, minutes=30)
    end_of_day = end_of_day_ist - timedelta(hours=5, minutes=30)
    
    indents = db.query(Indent).filter(
        Indent.project == project,
        Indent.office_name == office_name,
        Indent.status.in_([IndentStatus.DISPATCHED, IndentStatus.RECEIVED]),
        Indent.updated_at >= start_of_day,
        Indent.updated_at <= end_of_day
    ).all()
    
    aggregates = {}
    current_time_ist = datetime.now(tz)
    current_active_shift = "shift_1" if current_time_ist.hour < 14 else "shift_2"
    
    # Check if this operator is rostered for general shift today
    from app.models.roster import ShiftRoster
    general_roster = db.query(ShiftRoster).filter(
        ShiftRoster.employee_code == current_user.username,
        ShiftRoster.shift_date == today_ist,
        ShiftRoster.shift_type == "general",
        ShiftRoster.status != "cancelled"
    ).first()
    if general_roster:
        current_active_shift = "general"

    for ind in indents:
        if not ind.drug_id:
            continue
            
        # Convert indent updated_at to IST
        ind_utc = ind.updated_at.replace(tzinfo=timezone.utc) if ind.updated_at.tzinfo is None else ind.updated_at
        ind_ist = ind_utc.astimezone(tz)
        
        # Partition based on status
        if ind.status == IndentStatus.RECEIVED:
            # Already received. Partition based on the time it was received/acknowledged
            indent_shift = "shift_1" if ind_ist.hour < 14 else "shift_2"
        else:
            # Pending dispatch. Matches the current active shift
            indent_shift = current_active_shift
            
        # Filter based on requested shift_type
        if shift_type != indent_shift:
            continue

        # Pivot the drug_id to the specific dispatched batch record ID since the stock is recorded under it.
        d_id = ind.drug_id
        if ind.dispatched_batch_no:
            from app.models.drug import DrugMaster
            drug_item = db.query(DrugMaster).filter(DrugMaster.id == ind.drug_id).first()
            if drug_item:
                batch_record = db.query(DrugMaster).filter(
                    DrugMaster.item_code == drug_item.item_code,
                    DrugMaster.project == project,
                    DrugMaster.batch_number == ind.dispatched_batch_no,
                    DrugMaster.is_active == True
                ).first()
                if batch_record:
                    d_id = batch_record.id
                    
        if d_id not in aggregates:
            aggregates[d_id] = {"received": 0.0, "sent_back": 0.0}
            
        qty = ind.dispatched_qty or ind.requested_qty or 0.0
        remarks = (ind.remarks or "").lower()
        
        # Determine classification
        if "return" in remarks or "send back" in remarks or "sent back" in remarks or "damage" in remarks or "wasted" in remarks or "waste" in remarks or qty < 0:
            aggregates[d_id]["sent_back"] += abs(qty)
        else:
            aggregates[d_id]["received"] += qty
            
    # Hash of draft details
    draft_dict = {d.drug_id: d for d in drafts}
    
    # Combined items response
    items = {}
    
    # First, list all drugs that have active dispatch transactions today
    for d_id, aggs in aggregates.items():
        draft_item = draft_dict.get(d_id)
        consumed = draft_item.consumed_qty if draft_item else 0.0
        items[d_id] = {
            "consumed_qty": consumed,
            "received_qty": aggs["received"],
            "sent_back_qty": aggs["sent_back"]
        }
        
    # Second, add any other items that are in drafts but not in today's indents
    for d_id, d in draft_dict.items():
        if d_id not in items:
            items[d_id] = {
                "consumed_qty": d.consumed_qty,
                "received_qty": d.received_qty,
                "sent_back_qty": d.sent_back_qty
            }
            
    remarks = drafts[0].discrepancy_reason if (drafts and drafts[0].discrepancy_reason) else ""
    
    return {
        "items": items,
        "remarks": remarks
    }


@router.get("/shifts/report")
def get_shift_report(
    project: str = None,
    office_name: str = None,
    start_date: str = None,
    end_date: str = None,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """
    Get finalized shift log consumption reports filtered by project, office, and date range.
    """
    query = db.query(ShiftLog).filter(
        ShiftLog.is_draft == False,
        (ShiftLog.consumed_qty > 0) | (ShiftLog.sent_back_qty > 0) | (ShiftLog.received_qty > 0)
    )
    
    if str(current_user.role).lower() != "admin" and current_user.username != "admin":
        query = query.filter(ShiftLog.operator_id == current_user.id)
        if current_user.project:
            project = current_user.project
            
    if project:
        query = query.filter(ShiftLog.project == project)
    if office_name and office_name not in ["Whole Project", "all", "ALL"]:
        query = query.filter(ShiftLog.office_name == office_name)
        
    if start_date:
        try:
            start_dt = datetime.strptime(start_date, "%Y-%m-%d")
            query = query.filter(ShiftLog.date >= start_dt)
        except ValueError:
            pass
    if end_date:
        try:
            end_dt = datetime.strptime(end_date + " 23:59:59", "%Y-%m-%d %H:%M:%S")
            query = query.filter(ShiftLog.date <= end_dt)
        except ValueError:
            pass
            
    from app.api.v1.utils import get_hierarchy_maps
    emp_code_to_details, _, _ = get_hierarchy_maps()
    
    logs = query.order_by(ShiftLog.date.desc()).all()
    
    result = []
    for log in logs:
        drug = db.query(DrugMaster).filter(DrugMaster.id == log.drug_id).first()
        operator = db.query(User).filter(User.id == log.operator_id).first()
        vehicle = db.query(Vehicle).filter(Vehicle.id == log.vehicle_id).first() if log.vehicle_id else None
        
        usr_details = emp_code_to_details.get(operator.username) if operator else None
        usr_name = usr_details.get("name") if usr_details else None
        role_title = (operator.role or 'operator').replace('_', ' ').title() if operator else 'Operator'
        disp_name = f"{usr_name} ({role_title})" if usr_name else (f"{operator.username} ({role_title})" if operator else "N/A")
        
        result.append({
            "id": log.id,
            "date": log.date.strftime("%Y-%m-%d %H:%M:%S") if log.date else to_india_time(log.created_at),
            "shift_type": log.shift_type,
            "vehicle_number": vehicle.vehicle_number if vehicle else "N/A",
            "project": log.project,
            "office_name": log.office_name,
            "item_name": drug.item_name if drug else "N/A",
            "item_code": drug.item_code if drug else "N/A",
            "item_group": drug.item_group if drug else "N/A",
            "batch_number": drug.batch_number if drug else "N/A",
            "expiry_date": drug.expiry_date if drug else "N/A",
            "manufacturing_date": drug.manufacturing_date if drug else "N/A",
            "opening_balance": log.opening_balance,
            "received_qty": log.received_qty,
            "sent_back_qty": log.sent_back_qty,
            "consumed_qty": log.consumed_qty,
            "closing_balance": log.closing_balance,
            "drawn_qty": log.drawn_qty,
            "bag_ob": log.bag_ob,
            "bag_received": log.bag_received,
            "bag_sent_back": log.bag_sent_back,
            "bag_consumed": log.bag_consumed,
            "bag_closing": log.bag_closing,
            "remarks": log.discrepancy_reason or "",
            "logged_by": disp_name,
            "logged_by_username": operator.username if operator else "N/A",
            "unit_mrp": drug.unit_mrp if drug else 0.0
        })
    return result
