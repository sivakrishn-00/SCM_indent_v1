from typing import List, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.api import deps
from app.models.user import User
from app.models.office_inventory import OfficeInventory
from app.models.drug import DrugMaster
from pydantic import BaseModel

router = APIRouter()

class OfficeInventoryResponse(BaseModel):
    id: int
    project: str
    office_name: str
    drug_id: int
    item_code: Optional[str] = None
    item_name: Optional[str] = None
    batch_number: Optional[str] = None
    quantity: float
    opening_stock: float
    manufacturing_date: Optional[str] = None
    expiry_date: Optional[str] = None

class OfficeInventoryItem(BaseModel):
    drug_id: int
    opening_stock: float
    batch_number: Optional[str] = None
    expiry_date: Optional[str] = None
    manufacturing_date: Optional[str] = None

class OfficeInventoryInitialize(BaseModel):
    project: str
    office_name: str
    items: List[OfficeInventoryItem]

@router.get("/office-inventory", response_model=List[OfficeInventoryResponse])
def get_office_inventory(
    project: Optional[str] = None,
    office_name: Optional[str] = None,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """
    Get all local stock records for the user's project and office.
    """
    # Resolve project & office for non-admin users
    is_admin = current_user.username == "admin" or str(current_user.role).lower() == "admin"
    
    proj_query = project
    off_query = office_name
    
    if not is_admin:
        proj_query = current_user.project
        from app.api.v1.utils import get_hierarchy_maps
        emp_code_to_details, _, _ = get_hierarchy_maps()
        emp_details = emp_code_to_details.get(current_user.username)
        if emp_details:
            off_query = emp_details.get("office_name") or emp_details.get("office_location")
            
    query = db.query(OfficeInventory, DrugMaster.manufacturing_date, DrugMaster.expiry_date).join(
        DrugMaster, OfficeInventory.drug_id == DrugMaster.id
    )
    if proj_query:
        query = query.filter(OfficeInventory.project == proj_query)
    if off_query:
        query = query.filter(OfficeInventory.office_name == off_query)
        
    results = []
    for inv, mfg, exp in query.all():
        results.append({
            "id": inv.id,
            "project": inv.project,
            "office_name": inv.office_name,
            "drug_id": inv.drug_id,
            "item_code": inv.item_code,
            "item_name": inv.item_name,
            "batch_number": inv.batch_number,
            "quantity": inv.quantity,
            "opening_stock": inv.opening_stock,
            "manufacturing_date": mfg,
            "expiry_date": exp
        })
    return results


@router.post("/office-inventory/initialize")
def initialize_office_inventory(
    payload: OfficeInventoryInitialize,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """
    One-time task to initialize local storehouse opening stock for the Paravet/Initiator.
    """
    from app.models.audit_log import AuditLog
    
    created_count = 0
    updated_count = 0
    
    for item in payload.items:
        base_drug = db.query(DrugMaster).filter(DrugMaster.id == item.drug_id).first()
        if not base_drug:
            continue
            
        b_no = item.batch_number or base_drug.batch_number or "N/A"
        exp_date = item.expiry_date or base_drug.expiry_date
        mfg_date = item.manufacturing_date or base_drug.manufacturing_date
        
        # Ensure a DrugMaster batch row exists
        target_drug = db.query(DrugMaster).filter(
            DrugMaster.item_code == base_drug.item_code,
            DrugMaster.project == payload.project,
            DrugMaster.batch_number == b_no
        ).first()
        
        if not target_drug:
            target_drug = DrugMaster(
                item_code=base_drug.item_code,
                item_name=base_drug.item_name,
                uom=base_drug.uom,
                unit_mrp=base_drug.unit_mrp,
                hsn_code=base_drug.hsn_code,
                item_group=base_drug.item_group,
                batch_number=b_no,
                expiry_date=exp_date,
                manufacturing_date=mfg_date,
                quantity=0.0,
                initial_quantity=0.0,
                project=payload.project,
                is_active=True
            )
            db.add(target_drug)
            db.flush()
            
        local_inv = db.query(OfficeInventory).filter(
            OfficeInventory.project == payload.project,
            OfficeInventory.office_name == payload.office_name,
            OfficeInventory.drug_id == target_drug.id,
            OfficeInventory.batch_number == b_no
        ).first()
        
        if not local_inv:
            local_inv = OfficeInventory(
                project=payload.project,
                office_name=payload.office_name,
                drug_id=target_drug.id,
                item_code=target_drug.item_code,
                item_name=target_drug.item_name,
                batch_number=b_no,
                quantity=item.opening_stock,
                opening_stock=item.opening_stock
            )
            db.add(local_inv)
            created_count += 1
        else:
            local_inv.opening_stock = item.opening_stock
            local_inv.quantity = item.opening_stock
            updated_count += 1
            
        audit = AuditLog(
            user=current_user.username,
            action="INITIALIZE_OFFICE_STOCK",
            module="OFFICE_INVENTORY",
            description=f"Initialized opening stock for local store: {target_drug.item_name} = {item.opening_stock} (Batch: {b_no}) at office {payload.office_name}",
            status="SUCCESS",
            project=payload.project
        )
        db.add(audit)
        
    db.commit()
    return {
        "message": f"Successfully initialized local stock. Created {created_count} new and updated {updated_count} existing records.",
        "created": created_count,
        "updated": updated_count
    }
