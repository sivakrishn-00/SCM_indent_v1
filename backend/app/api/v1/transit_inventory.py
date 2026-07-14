from typing import List, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.api import deps
from app.models.user import User
from app.models.transit_inventory import TransitInventory
from app.models.office_inventory import OfficeInventory
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

# Transit Inventory Schema Definitions
class TransitDrawItem(BaseModel):
    drug_id: int
    quantity: float
    scanned_batch_number: Optional[str] = None
    override_reason: Optional[str] = None

class TransitDrawPayload(BaseModel):
    project: str
    office_name: str
    items: List[TransitDrawItem]

class TransitReturnItem(BaseModel):
    drug_id: int
    quantity: float

class TransitReturnPayload(BaseModel):
    project: str
    office_name: str
    items: List[TransitReturnItem]

class TransitHandoverRequest(BaseModel):
    recipient_username: str
    pin: Optional[str] = None

@router.get("/transit-inventory/current")
def get_current_transit_inventory(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """
    Get items currently loaded in the user's transit/vehicle bag.
    """
    items = db.query(TransitInventory).filter(
        TransitInventory.operator_id == current_user.id,
        TransitInventory.status == "active",
        TransitInventory.quantity > 0
    ).all()
    
    return [
        {
            "id": h.id,
            "drug_id": h.drug_id,
            "item_code": h.item_code,
            "item_name": h.item_name,
            "batch_number": h.batch_number,
            "quantity": h.quantity,
            "drawn_qty": h.drawn_qty,
            "is_drawn_this_shift": h.drawn_qty > 0,
            "expiry_date": str(h.expiry_date) if h.expiry_date else None,
            "status": h.status,
            "created_at": h.created_at.isoformat() if h.created_at else None
        }
        for h in items
    ]


@router.get("/transit-inventory/handovers/pending")
def get_pending_handovers(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """
    Check if there is a stock handover pending confirmation for the current user.
    """
    from app.models.user import User as UserModel
    
    handovers = db.query(TransitInventory).filter(
        TransitInventory.handed_over_to_id == current_user.id,
        TransitInventory.status == "pending_handover"
    ).all()
    
    if not handovers:
        return []
        
    # Group items by sender for better display
    first_item = handovers[0]
    sender = db.query(UserModel).filter(UserModel.id == first_item.operator_id).first()
    sender_name = sender.username if sender else "Previous Operator"
    
    return {
        "sender_username": sender_name,
        "items": [
            {
                "id": h.id,
                "drug_id": h.drug_id,
                "item_code": h.item_code,
                "item_name": h.item_name,
                "batch_number": h.batch_number,
                "quantity": h.quantity,
                "expiry_date": h.expiry_date
            }
            for h in handovers
        ]
    }


@router.get("/transit-inventory/handovers/proposed/pending")
def get_proposed_handovers_pending(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """
    Check if the current user has proposed a stock handover that is still pending.
    """
    handovers = db.query(TransitInventory).filter(
        TransitInventory.operator_id == current_user.id,
        TransitInventory.status == "pending_handover"
    ).all()
    
    return [
        {
            "id": h.id,
            "drug_id": h.drug_id,
            "item_code": h.item_code,
            "item_name": h.item_name,
            "batch_number": h.batch_number,
            "quantity": h.quantity,
            "expiry_date": str(h.expiry_date) if h.expiry_date else None
        }
        for h in handovers
    ]


@router.post("/transit-inventory/handover/start")
def propose_handover(
    payload: TransitHandoverRequest,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """
    Propose and immediately complete stock handover of remaining transit stock to an incoming user
    authorized via a 6-digit Takeover PIN.
    """
    from app.models.user import User as UserModel
    from app.models.shift import UserShiftState
    from datetime import datetime, timezone, timedelta
    from app.core.cache import cache_service
    
    check_operator_shift_active(db, current_user)
    
    tz = timezone(timedelta(hours=5, minutes=30))
    today = datetime.now(tz).date()
    today_str = today.strftime("%Y-%m-%d")
    
    # Determine current user's roster date using the same fallback logic
    from app.models.roster import ShiftRoster
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

    c_roster_date = c_roster.shift_date if c_roster else today
    c_roster_date_str = c_roster_date.strftime("%Y-%m-%d")

    existing_state = db.query(UserShiftState).filter(
        UserShiftState.user_id == current_user.id,
        UserShiftState.shift_date == c_roster_date_str
    ).first()
    
    recipient = db.query(UserModel).filter(UserModel.username == payload.recipient_username).first()
    if not recipient:
        raise HTTPException(status_code=404, detail=f"Operator '{payload.recipient_username}' not found.")
        
    my_active_stock = db.query(TransitInventory).filter(
        TransitInventory.operator_id == current_user.id,
        TransitInventory.status == "active",
        TransitInventory.quantity > 0
    ).all()
    


    # Validate Takeover PIN
    if not payload.pin:
        raise HTTPException(status_code=400, detail="Takeover verification PIN is required to propose handover.")

    cache_data = cache_service.get_otp(payload.recipient_username)
    if not cache_data:
        raise HTTPException(
            status_code=400,
            detail="Takeover authorization PIN has expired or is invalid. Please ask the incoming operator to generate a new PIN."
        )

    stored_pin = cache_data.get("pin")
    attempts = cache_data.get("attempts", 0)

    if stored_pin != payload.pin:
        attempts += 1
        if attempts >= 3:
            cache_service.delete_otp(payload.recipient_username)
            raise HTTPException(
                status_code=400,
                detail="Too many incorrect PIN attempts. Handover authorization cancelled. Please generate a new PIN."
            )
        else:
            cache_data["attempts"] = attempts
            cache_service.update_otp(payload.recipient_username, cache_data, ttl=300)
            raise HTTPException(
                status_code=400,
                detail=f"Incorrect takeover PIN. {3 - attempts} attempts remaining."
            )

    # 1. Update/Create finishing operator (current user) state to "handed_over"
    if existing_state:
        existing_state.status = "handed_over"
    else:
        new_state = UserShiftState(
            user_id=current_user.id,
            project=current_user.project,
            office_name=my_active_stock[0].office_name if my_active_stock else current_user.project,
            shift_date=c_roster_date_str,
            status="handed_over"
        )
        db.add(new_state)
        
    # 2. Update/Create incoming operator (recipient) state to "active"
    # Find recipient's roster date (either today or tomorrow)
    recipient_roster = db.query(ShiftRoster).filter(
        ShiftRoster.employee_code == recipient.username,
        ShiftRoster.shift_date.in_([today, today + timedelta(days=1)]),
        ShiftRoster.status != "cancelled"
    ).order_by(ShiftRoster.shift_date.asc()).first()
    
    recipient_date_str = recipient_roster.shift_date.strftime("%Y-%m-%d") if recipient_roster else today_str

    recipient_state = db.query(UserShiftState).filter(
        UserShiftState.user_id == recipient.id,
        UserShiftState.shift_date == recipient_date_str
    ).first()
    if recipient_state:
        recipient_state.status = "active"
    else:
        new_recipient_state = UserShiftState(
            user_id=recipient.id,
            project=recipient.project,
            office_name=my_active_stock[0].office_name if my_active_stock else recipient.project,
            shift_date=recipient_date_str,
            status="active"
        )
        db.add(new_recipient_state)

    # 3. Direct transfer of transit items (atomic acceptance)
    for item in my_active_stock:
        item.operator_id = recipient.id
        item.handed_over_to_id = None
        item.status = "active"
        item.drawn_qty = 0.0

    # Evict key from cache
    cache_service.delete_otp(payload.recipient_username)

    from app.models.audit_log import AuditLog
    audit = AuditLog(
        user=current_user.username,
        action="COMPLETE_HANDOVER_WITH_PIN",
        module="TRANSIT_INVENTORY",
        description=f"Completed transit stock handover of {len(my_active_stock)} items to '{payload.recipient_username}' using Takeover PIN.",
        status="SUCCESS",
        project=current_user.project
    )
    db.add(audit)
    db.commit()
    return {"message": f"Successfully completed stock handover to '{payload.recipient_username}'."}


@router.post("/transit-inventory/handover/accept")
def accept_handover(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """
    Accept handed over stock from the previous operator.
    """
    from app.models.audit_log import AuditLog
    
    handovers = db.query(TransitInventory).filter(
        TransitInventory.handed_over_to_id == current_user.id,
        TransitInventory.status == "pending_handover"
    ).all()
    
    if not handovers:
        return {"message": "No pending handovers found."}
        
    from app.models.user import User as UserModel
    sender = db.query(UserModel).filter(UserModel.id == handovers[0].operator_id).first() if handovers else None
    sender_name = sender.username if sender else "Previous Operator"

    # Save user shift states in database
    from app.models.shift import UserShiftState
    from datetime import datetime, timezone, timedelta
    tz = timezone(timedelta(hours=5, minutes=30))
    today = datetime.now(tz).date()
    today_str = today.strftime("%Y-%m-%d")
    
    # Find current user's roster date
    from app.models.roster import ShiftRoster
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

    c_roster_date = c_roster.shift_date if c_roster else today
    c_roster_date_str = c_roster_date.strftime("%Y-%m-%d")

    # 1. Update/Create recipient (current user) state to "active"
    recipient_state = db.query(UserShiftState).filter(
        UserShiftState.user_id == current_user.id,
        UserShiftState.shift_date == c_roster_date_str
    ).first()
    if recipient_state:
        recipient_state.status = "active"
    else:
        new_recipient_state = UserShiftState(
            user_id=current_user.id,
            project=current_user.project,
            office_name=handovers[0].office_name if handovers else current_user.project,
            shift_date=c_roster_date_str,
            status="active"
        )
        db.add(new_recipient_state)
        
    # 2. Update/Create sender (previous operator) state to "handed_over"
    if sender:
        s_roster = db.query(ShiftRoster).filter(
            ShiftRoster.employee_code == sender.username,
            ShiftRoster.shift_date == today,
            ShiftRoster.status != "cancelled"
        ).first()
        if not s_roster:
            yesterday = today - timedelta(days=1)
            s_roster = db.query(ShiftRoster).filter(
                ShiftRoster.employee_code == sender.username,
                ShiftRoster.shift_date == yesterday,
                ShiftRoster.status != "cancelled"
            ).first()
            
        s_roster_date_str = s_roster.shift_date.strftime("%Y-%m-%d") if s_roster else today_str

        sender_state = db.query(UserShiftState).filter(
            UserShiftState.user_id == sender.id,
            UserShiftState.shift_date == s_roster_date_str
        ).first()
        if sender_state:
            sender_state.status = "handed_over"
        else:
            new_sender_state = UserShiftState(
                user_id=sender.id,
                project=sender.project,
                office_name=handovers[0].office_name if handovers else sender.project,
                shift_date=s_roster_date_str,
                status="handed_over"
            )
            db.add(new_sender_state)

    for item in handovers:
        item.operator_id = current_user.id
        item.handed_over_to_id = None
        item.status = "active"
        item.drawn_qty = 0.0
        
    db.commit()
    
    audit = AuditLog(
        user=current_user.username,
        action="ACCEPT_HANDOVER",
        module="TRANSIT_INVENTORY",
        description=f"Accepted transit inventory handover of {len(handovers)} medicine batches from '{sender_name}'",
        status="SUCCESS",
        project=current_user.project
    )
    db.add(audit)
    db.commit()
    
    return {"message": f"Successfully accepted {len(handovers)} transit items into your bag."}


@router.post("/transit-inventory/draw")
def draw_transit_stock(
    payload: TransitDrawPayload,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """
    Draw stock from local Office/Facility Store into Operator Transit Bag. Enforces FEFO batch picking.
    """
    check_operator_shift_active(db, current_user)
        
    from app.models.audit_log import AuditLog
    
    drawn_items = []
    
    for item in payload.items:
        office_inv = db.query(OfficeInventory).filter(
            OfficeInventory.drug_id == item.drug_id,
            OfficeInventory.project == payload.project,
            OfficeInventory.office_name == payload.office_name
        ).first()
        
        if not office_inv or office_inv.quantity < item.quantity:
            raise HTTPException(
                status_code=400, 
                detail=f"Insufficient local store quantity for item {item.drug_id}."
            )
            
        drug_data = db.query(DrugMaster).filter(DrugMaster.id == item.drug_id).first()
        if not drug_data:
            continue
            
        # 1. FEFO Validation
        # Find the oldest batch in office inventory with positive quantity for this item code
        earliest_inv = db.query(OfficeInventory).join(
            DrugMaster, OfficeInventory.drug_id == DrugMaster.id
        ).filter(
            OfficeInventory.project == payload.project,
            OfficeInventory.office_name == payload.office_name,
            DrugMaster.item_code == drug_data.item_code,
            OfficeInventory.quantity > 0
        ).order_by(DrugMaster.expiry_date.asc()).first()
        
        if earliest_inv:
            earliest_drug = db.query(DrugMaster).filter(DrugMaster.id == earliest_inv.drug_id).first()
            # If user did not pick the oldest batch and did not provide an override reason, reject
            if earliest_drug and earliest_drug.batch_number != drug_data.batch_number and not item.override_reason:
                raise HTTPException(
                    status_code=422,
                    detail={
                        "error_type": "FEFO_VIOLATION",
                        "message": f"Expiry warning: Batch '{earliest_drug.batch_number}' expires first (Expiry: {earliest_drug.expiry_date}). Please pick this batch instead.",
                        "fefo_batch_number": earliest_drug.batch_number,
                        "fefo_expiry_date": earliest_drug.expiry_date,
                        "scanned_batch": drug_data.batch_number
                    }
                )
                
            # If override reason was provided, log it to the audit log
            if earliest_drug and earliest_drug.batch_number != drug_data.batch_number and item.override_reason:
                audit_ovr = AuditLog(
                    user=current_user.username,
                    action="FEFO_OVERRIDE",
                    module="TRANSIT_INVENTORY",
                    description=f"FEFO override for {drug_data.item_name}. Picked batch {drug_data.batch_number} instead of {earliest_drug.batch_number}. Reason: {item.override_reason}",
                    status="WARNING",
                    project=payload.project
                )
                db.add(audit_ovr)

        # 2. Verify batch code if barcode scan is required and provided
        if item.scanned_batch_number == "MANUAL_BYPASS":
            if not item.override_reason or not item.override_reason.strip():
                raise HTTPException(
                    status_code=400,
                    detail=f"Bypass remarks are required for manual drawing of '{drug_data.item_name}'."
                )
            audit_manual = AuditLog(
                user=current_user.username,
                action="MANUAL_BYPASS_DRAW",
                module="TRANSIT_INVENTORY",
                description=f"Manual draw bypass for {drug_data.item_name} (Batch: {drug_data.batch_number}). Reason: {item.override_reason}",
                status="WARNING",
                project=payload.project
            )
            db.add(audit_manual)
        elif item.scanned_batch_number and item.scanned_batch_number != office_inv.batch_number:
            raise HTTPException(
                status_code=400,
                detail=f"Barcode mismatch. Scanned '{item.scanned_batch_number}' but inventory shows '{office_inv.batch_number}'."
            )
            
        # 3. Deduct from OfficeInventory
        office_inv.quantity -= item.quantity
        
        # 4. Add to TransitInventory
        transit_item = db.query(TransitInventory).filter(
            TransitInventory.operator_id == current_user.id,
            TransitInventory.drug_id == item.drug_id,
            TransitInventory.status == "active"
        ).first()
        
        if not transit_item:
            transit_item = TransitInventory(
                operator_id=current_user.id,
                project=payload.project,
                office_name=payload.office_name,
                drug_id=item.drug_id,
                item_code=drug_data.item_code,
                item_name=drug_data.item_name,
                batch_number=drug_data.batch_number,
                expiry_date=drug_data.expiry_date,
                quantity=item.quantity,
                drawn_qty=item.quantity,
                status="active"
            )
            db.add(transit_item)
        else:
            transit_item.quantity += item.quantity
            transit_item.drawn_qty += item.quantity
            
        drawn_items.append(transit_item)
        
    db.commit()
    
    # Audit log
    audit = AuditLog(
        user=current_user.username,
        action="DRAW_TRANSIT_STOCK",
        module="TRANSIT_INVENTORY",
        description=f"Loaded {len(payload.items)} items from Office Store into active vehicle transit.",
        status="SUCCESS",
        project=payload.project
    )
    db.add(audit)
    db.commit()
    
    return {"message": "Successfully drew stock to Transit bag."}


@router.post("/transit-inventory/return")
def return_transit_stock(
    payload: TransitReturnPayload,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """
    Return active transit stock back to the local Office/Facility Store.
    """
    check_operator_shift_active(db, current_user)
        
    from app.models.audit_log import AuditLog
    
    for item in payload.items:
        # Deduct from transit
        transit_item = db.query(TransitInventory).filter(
            TransitInventory.operator_id == current_user.id,
            TransitInventory.drug_id == item.drug_id,
            TransitInventory.status == "active"
        ).first()
        
        if not transit_item or transit_item.quantity < item.quantity:
            raise HTTPException(
                status_code=400,
                detail=f"You do not have enough transit balance of drug {item.drug_id} to return."
            )
            
        transit_item.quantity -= item.quantity
        if transit_item.quantity <= 0:
            transit_item.status = "returned"
            
        # Add back to office inventory
        office_inv = db.query(OfficeInventory).filter(
            OfficeInventory.drug_id == item.drug_id,
            OfficeInventory.project == payload.project,
            OfficeInventory.office_name == payload.office_name
        ).first()
        
        if office_inv:
            office_inv.quantity += item.quantity
        else:
            # Recreate row if missing
            d = db.query(DrugMaster).filter(DrugMaster.id == item.drug_id).first()
            office_inv = OfficeInventory(
                project=payload.project,
                office_name=payload.office_name,
                drug_id=item.drug_id,
                item_code=d.item_code if d else None,
                item_name=d.item_name if d else None,
                batch_number=d.batch_number if d else None,
                quantity=item.quantity,
                opening_stock=0.0
            )
            db.add(office_inv)
            
    db.commit()
    
    # Audit log
    audit = AuditLog(
        user=current_user.username,
        action="RETURN_TRANSIT_STOCK",
        module="TRANSIT_INVENTORY",
        description=f"Returned {len(payload.items)} leftover transit items back to Office Box Store.",
        status="SUCCESS",
        project=payload.project
    )
    db.add(audit)
    db.commit()
    
    return {"message": "Successfully returned transit inventory."}
