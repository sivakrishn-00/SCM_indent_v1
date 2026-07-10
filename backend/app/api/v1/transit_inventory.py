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
    Propose hand over of remaining transit stock to an incoming user on the same project/location.
    """
    from app.models.user import User as UserModel
    from app.models.shift import UserShiftState
    from datetime import datetime, timezone, timedelta
    
    tz = timezone(timedelta(hours=5, minutes=30))
    today_str = datetime.now(tz).strftime("%Y-%m-%d")
    
    # Block if already handed over
    existing_state = db.query(UserShiftState).filter(
        UserShiftState.user_id == current_user.id,
        UserShiftState.shift_date == today_str
    ).first()
    if existing_state and existing_state.status == "handed_over":
        raise HTTPException(
            status_code=400,
            detail="Your shift has been completed/handed over. Only view access is permitted."
        )
    
    recipient = db.query(UserModel).filter(UserModel.username == payload.recipient_username).first()
    if not recipient:
        raise HTTPException(status_code=404, detail=f"Operator '{payload.recipient_username}' not found.")
        
    my_active_stock = db.query(TransitInventory).filter(
        TransitInventory.operator_id == current_user.id,
        TransitInventory.status == "active",
        TransitInventory.quantity > 0
    ).all()
    
    if not my_active_stock:
        raise HTTPException(status_code=400, detail="You have no active transit medicines to hand over.")
        
    # Mark user's shift status as handed_over for today
    if existing_state:
        existing_state.status = "handed_over"
    else:
        new_state = UserShiftState(
            user_id=current_user.id,
            project=current_user.project,
            office_name=my_active_stock[0].office_name if my_active_stock else current_user.project,
            shift_date=today_str,
            status="handed_over"
        )
        db.add(new_state)
        
    for item in my_active_stock:
        item.status = "pending_handover"
        item.handed_over_to_id = recipient.id
        
    from app.models.audit_log import AuditLog
    audit = AuditLog(
        user=current_user.username,
        action="PROPOSE_HANDOVER",
        module="TRANSIT_INVENTORY",
        description=f"Proposed transit inventory handover of {len(my_active_stock)} items to '{payload.recipient_username}'",
        status="SUCCESS",
        project=current_user.project
    )
    db.add(audit)
    db.commit()
    return {"message": f"Successfully proposed stock handover to '{payload.recipient_username}'."}


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
    today_str = datetime.now(tz).strftime("%Y-%m-%d")
    
    # 1. Update/Create recipient (current user) state to "active"
    recipient_state = db.query(UserShiftState).filter(
        UserShiftState.user_id == current_user.id,
        UserShiftState.shift_date == today_str
    ).first()
    if recipient_state:
        recipient_state.status = "active"
    else:
        new_recipient_state = UserShiftState(
            user_id=current_user.id,
            project=current_user.project,
            office_name=handovers[0].office_name if handovers else current_user.project,
            shift_date=today_str,
            status="active"
        )
        db.add(new_recipient_state)
        
    # 2. Update/Create sender (previous operator) state to "handed_over"
    if sender:
        sender_state = db.query(UserShiftState).filter(
            UserShiftState.user_id == sender.id,
            UserShiftState.shift_date == today_str
        ).first()
        if sender_state:
            sender_state.status = "handed_over"
        else:
            new_sender_state = UserShiftState(
                user_id=sender.id,
                project=sender.project,
                office_name=handovers[0].office_name if handovers else sender.project,
                shift_date=today_str,
                status="handed_over"
            )
            db.add(new_sender_state)

    for item in handovers:
        item.operator_id = current_user.id
        item.handed_over_to_id = None
        item.status = "active"
        
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
    from app.models.shift import UserShiftState
    from datetime import datetime, timezone, timedelta
    tz = timezone(timedelta(hours=5, minutes=30))
    today_str = datetime.now(tz).strftime("%Y-%m-%d")
    
    # Check if shift has been completed/handed over
    state = db.query(UserShiftState).filter(
        UserShiftState.user_id == current_user.id,
        UserShiftState.shift_date == today_str
    ).first()
    if state and state.status == "handed_over":
        raise HTTPException(
            status_code=400,
            detail="Your shift has been completed/handed over. Only view access is permitted."
        )
        
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
                status="active"
            )
            db.add(transit_item)
        else:
            transit_item.quantity += item.quantity
            
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
    from app.models.shift import UserShiftState
    from datetime import datetime, timezone, timedelta
    tz = timezone(timedelta(hours=5, minutes=30))
    today_str = datetime.now(tz).strftime("%Y-%m-%d")
    
    # Check if shift has been completed/handed over
    state = db.query(UserShiftState).filter(
        UserShiftState.user_id == current_user.id,
        UserShiftState.shift_date == today_str
    ).first()
    if state and state.status == "handed_over":
        raise HTTPException(
            status_code=400,
            detail="Your shift has been completed/handed over. Only view access is permitted."
        )
        
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
