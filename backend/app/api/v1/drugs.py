from typing import List, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.api import deps
from app.models.user import User
from app.models.drug import DrugMaster
from pydantic import BaseModel

router = APIRouter()

class DrugCreate(BaseModel):
    item_code: str
    item_name: str
    description: str = ""
    hsn_code: str = ""
    item_group: str = ""
    quantity: float = 0.0
    initial_quantity: Optional[float] = None
    uom: str = ""
    unit_mrp: float = 0.0
    batch_number: str = ""
    expiry_date: str = ""
    manufacturing_date: str = ""
    supplier: str = ""
    project: str
    is_active: bool = True

class DrugUpdate(BaseModel):
    item_code: str
    item_name: str
    description: str = ""
    hsn_code: str = ""
    item_group: str = ""
    quantity: float = 0.0
    initial_quantity: Optional[float] = None
    uom: str = ""
    unit_mrp: float = 0.0
    batch_number: str = ""
    expiry_date: str = ""
    manufacturing_date: str = ""
    supplier: str = ""
    project: str
    is_active: bool = True

class DrugRefill(BaseModel):
    item_code: str
    project: str
    batch_number: str
    refill_quantity: float
    unit_mrp: Optional[float] = None
    expiry_date: Optional[str] = None
    manufacturing_date: Optional[str] = None
    supplier: Optional[str] = None



def drug_to_dict(d: DrugMaster) -> dict:
    return {
        "id": d.id,
        "item_code": d.item_code,
        "item_name": d.item_name,
        "description": d.description or "",
        "hsn_code": d.hsn_code or "",
        "item_group": d.item_group or "",
        "quantity": d.quantity or 0.0,
        "initial_quantity": d.initial_quantity or 0.0,
        "uom": d.uom or "",
        "unit_mrp": d.unit_mrp or 0.0,
        "batch_number": d.batch_number or "",
        "expiry_date": d.expiry_date or "",
        "manufacturing_date": d.manufacturing_date or "",
        "supplier": d.supplier or "",
        "project": d.project,
        "is_active": d.is_active
    }

@router.get("/drugs")
def get_drugs(
    project: str = None, 
    office_name: str = None, 
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """
    Get all drugs, optionally filtered by project. If office_name is provided, computes office-specific stock.
    """
    from sqlalchemy import func
    
    is_admin = current_user.username == "admin" or str(current_user.role).lower() == "admin"
    
    # Resolve if warehouse user to allow querying search project masters for dispatching
    is_warehouse_user = False
    from app.api.v1.utils import get_hierarchy_maps
    emp_code_to_details, _, _ = get_hierarchy_maps()
    user_details = emp_code_to_details.get(current_user.username)
    if user_details:
        office = user_details.get("office_name", "").lower()
        office_loc = user_details.get("office_location", "").lower()
        if "central ware house" in office or "central warehouse" in office or "central ware house" in office_loc or "central warehouse" in office_loc:
            is_warehouse_user = True
            
    if not is_admin and not is_warehouse_user and current_user.project:
        project = current_user.project
        
    query = db.query(DrugMaster)
    if project:
        query = query.filter(DrugMaster.project == project)
    drugs = query.all()
    
    result = []
    for d in drugs:
        d_dict = drug_to_dict(d)
        if project and office_name:
            from app.models.office_inventory import OfficeInventory
            office_stock = db.query(func.sum(OfficeInventory.quantity)).filter(
                OfficeInventory.drug_id == d.id,
                OfficeInventory.project == project,
                OfficeInventory.office_name == office_name
            ).scalar() or 0.0
            d_dict["quantity"] = office_stock
        result.append(d_dict)
        
    return result

@router.post("/drugs")
def create_drug(
    drug_in: DrugCreate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """
    Create or refill a drug master record. If the combination of item_code, project,
    and batch_number exists, it will refill it. Otherwise, it will create a new entry.
    """
    existing = db.query(DrugMaster).filter(
        DrugMaster.item_code == drug_in.item_code,
        DrugMaster.project == drug_in.project,
        DrugMaster.batch_number == drug_in.batch_number
    ).first()
    
    qty = drug_in.quantity if drug_in.quantity is not None else 0.0
    
    if existing:
        old_qty = existing.quantity or 0.0
        existing.quantity = old_qty + qty
        existing.initial_quantity = (existing.initial_quantity or 0.0) + qty
        
        if drug_in.unit_mrp is not None:
            existing.unit_mrp = drug_in.unit_mrp
        if drug_in.expiry_date:
            existing.expiry_date = drug_in.expiry_date
        if drug_in.manufacturing_date:
            existing.manufacturing_date = drug_in.manufacturing_date
        if drug_in.supplier:
            existing.supplier = drug_in.supplier
        if drug_in.item_name:
            existing.item_name = drug_in.item_name
            
        db_drug = existing
        was_created = False
    else:
        db_drug = DrugMaster(**drug_in.dict())
        if db_drug.initial_quantity is None:
            db_drug.initial_quantity = db_drug.quantity
        db.add(db_drug)
        was_created = True
        
    from app.models.audit_log import AuditLog
    desc = (
        f"Refilled stock for {db_drug.item_name} (Code: {db_drug.item_code}) adding {qty} "
        f"units to existing batch '{db_drug.batch_number}'." if not was_created else
        f"Created drug record: {db_drug.item_name} (Code: {db_drug.item_code}, Batch: {db_drug.batch_number}) starting Qty {qty}"
    )
    db_log = AuditLog(
        user=current_user.username,
        action="REFILL_STOCK" if not was_created else "UPLOAD_STOCK",
        module="MASTERS",
        description=desc,
        status="SUCCESS",
        project=db_drug.project
    )
    db.add(db_log)
    db.commit()
    db.refresh(db_drug)
    return drug_to_dict(db_drug)

@router.put("/drugs/{drug_id}")
def update_drug(
    drug_id: int,
    drug_in: DrugUpdate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """
    Update a drug master record.
    """
    db_drug = db.query(DrugMaster).filter(DrugMaster.id == drug_id).first()
    if not db_drug:
        raise HTTPException(status_code=404, detail="Drug not found")
    
    old_qty = db_drug.quantity or 0.0
    new_qty = drug_in.quantity or 0.0
    
    for field, val in drug_in.dict().items():
        if field == "initial_quantity" and val is not None:
            db_drug.initial_quantity = val
        else:
            setattr(db_drug, field, val)
            
    # Handle refill updates to initial_quantity
    if new_qty > old_qty:
        diff = new_qty - old_qty
        db_drug.initial_quantity = (db_drug.initial_quantity or 0.0) + diff
    elif db_drug.initial_quantity is None:
        db_drug.initial_quantity = db_drug.quantity
        
    # Audit log creation
    from app.models.audit_log import AuditLog
    qty_desc = ""
    if new_qty != old_qty:
        qty_desc = f" (Refilled/Changed stock from {old_qty} to {new_qty})"
    db_log = AuditLog(
        user=current_user.username,
        action="UPDATE_STOCK",
        module="MASTERS",
        description=f"Updated drug record: {db_drug.item_name} (Code: {db_drug.item_code}, Batch: {db_drug.batch_number}){qty_desc}",
        status="SUCCESS",
        project=db_drug.project
    )
    db.add(db_log)
    
    db.commit()
    db.refresh(db_drug)
    return drug_to_dict(db_drug)

@router.delete("/drugs/{drug_id}")
def delete_drug(
    drug_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """
    Delete a drug master record.
    """
    db_drug = db.query(DrugMaster).filter(DrugMaster.id == drug_id).first()
    if not db_drug:
        raise HTTPException(status_code=404, detail="Drug not found")
    
    db.delete(db_drug)
    db.commit()
    return {"message": "Drug deleted successfully"}

@router.post("/drugs/bulk")
def bulk_upload_drugs(
    drugs_in: List[DrugCreate],
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """
    Bulk upload drug master records. Returns success and failure counts.
    """
    success_count = 0
    failed_count = 0
    errors = []
    
    for idx, drug_data in enumerate(drugs_in):
        try:
            existing_batch = db.query(DrugMaster).filter(
                DrugMaster.item_code == drug_data.item_code,
                DrugMaster.project == drug_data.project,
                DrugMaster.batch_number == drug_data.batch_number
            ).first()
            
            qty = drug_data.quantity if drug_data.quantity is not None else 0.0
            
            if existing_batch:
                old_qty = existing_batch.quantity or 0.0
                existing_batch.quantity = old_qty + qty
                existing_batch.initial_quantity = (existing_batch.initial_quantity or 0.0) + qty
                
                if drug_data.unit_mrp is not None:
                    existing_batch.unit_mrp = drug_data.unit_mrp
                if drug_data.expiry_date:
                    existing_batch.expiry_date = drug_data.expiry_date
                if drug_data.manufacturing_date:
                    existing_batch.manufacturing_date = drug_data.manufacturing_date
                if drug_data.supplier:
                    existing_batch.supplier = drug_data.supplier
                if drug_data.item_name:
                    existing_batch.item_name = drug_data.item_name
                    
                db_drug = existing_batch
                was_created = False
            else:
                initial_qty = drug_data.initial_quantity if (hasattr(drug_data, 'initial_quantity') and drug_data.initial_quantity is not None) else qty
                db_drug = DrugMaster(
                    item_code=(drug_data.item_code or "")[:100],
                    item_name=(drug_data.item_name or "")[:255],
                    description=(drug_data.description or "")[:500],
                    hsn_code=(drug_data.hsn_code or "")[:50],
                    item_group=(drug_data.item_group or "")[:100],
                    quantity=qty,
                    initial_quantity=initial_qty,
                    uom=(drug_data.uom or "")[:50],
                    unit_mrp=drug_data.unit_mrp if drug_data.unit_mrp is not None else 0.0,
                    batch_number=(drug_data.batch_number or "")[:100],
                    expiry_date=(drug_data.expiry_date or "")[:100],
                    manufacturing_date=(drug_data.manufacturing_date or "")[:100],
                    supplier=(drug_data.supplier or "")[:255],
                    project=(drug_data.project or "")[:100],
                    is_active=drug_data.is_active if drug_data.is_active is not None else True
                )
                db.add(db_drug)
                was_created = True
                
            from app.models.audit_log import AuditLog
            desc = (
                f"Bulk refilled stock for {db_drug.item_name} (Code: {db_drug.item_code}) adding {qty} "
                f"units to existing batch '{db_drug.batch_number}'." if not was_created else
                f"Bulk imported drug details: {db_drug.item_name} (Code: {db_drug.item_code}, Batch: {db_drug.batch_number}) starting Qty {qty}"
            )
            db_log = AuditLog(
                user=current_user.username,
                action="REFILL_STOCK" if not was_created else "UPLOAD_STOCK",
                module="MASTERS",
                description=desc,
                status="SUCCESS",
                project=db_drug.project
            )
            db.add(db_log)
            
            db.commit()
            success_count += 1
        except Exception as e:
            db.rollback()
            failed_count += 1
            errors.append({
                "index": idx,
                "item_code": drug_data.item_code,
                "reason": str(e)
            })
            
    # Post general bulk-level audit log entry upon completion
    if success_count > 0:
        from app.models.audit_log import AuditLog
        proj_val = drugs_in[0].project if len(drugs_in) > 0 else None
        db_log = AuditLog(
            user=current_user.username,
            action="BULK_UPLOAD_STOCK",
            module="MASTERS",
            description=f"Successfully bulk uploaded {success_count} drug stock records ({failed_count} errors)",
            status="SUCCESS",
            project=proj_val
        )
        db.add(db_log)
        db.commit()
            
    return {
        "success_count": success_count,
        "failed_count": failed_count,
        "errors": errors
    }

@router.post("/drugs/refill")
def refill_drug(
    refill_in: DrugRefill,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """
    Refill inventory. If the combination of item_code, project, and batch_number exists,
    it refills (adds to) the existing stock. Otherwise, it creates a new batch entry under the same item code.
    """
    existing_batch = db.query(DrugMaster).filter(
        DrugMaster.item_code == refill_in.item_code,
        DrugMaster.project == refill_in.project,
        DrugMaster.batch_number == refill_in.batch_number
    ).first()
    
    if existing_batch:
        old_qty = existing_batch.quantity or 0.0
        refill_qty = refill_in.refill_quantity
        existing_batch.quantity = old_qty + refill_qty
        existing_batch.initial_quantity = (existing_batch.initial_quantity or 0.0) + refill_qty
        
        if refill_in.unit_mrp is not None:
            existing_batch.unit_mrp = refill_in.unit_mrp
        if refill_in.expiry_date:
            existing_batch.expiry_date = refill_in.expiry_date
        if refill_in.manufacturing_date:
            existing_batch.manufacturing_date = refill_in.manufacturing_date
        if refill_in.supplier:
            existing_batch.supplier = refill_in.supplier
            
        db_drug = existing_batch
        was_created = False
    else:
        base_item = db.query(DrugMaster).filter(
            DrugMaster.item_code == refill_in.item_code,
            DrugMaster.project == refill_in.project
        ).first()
        
        if not base_item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Base drug master for item code {refill_in.item_code} not found in project {refill_in.project}."
            )
            
        db_drug = DrugMaster(
            item_code=base_item.item_code,
            item_name=base_item.item_name,
            description=base_item.description,
            hsn_code=base_item.hsn_code,
            item_group=base_item.item_group,
            uom=base_item.uom,
            quantity=refill_in.refill_quantity,
            initial_quantity=refill_in.refill_quantity,
            unit_mrp=refill_in.unit_mrp if refill_in.unit_mrp is not None else base_item.unit_mrp,
            batch_number=refill_in.batch_number,
            expiry_date=refill_in.expiry_date if refill_in.expiry_date else base_item.expiry_date,
            manufacturing_date=refill_in.manufacturing_date if refill_in.manufacturing_date else base_item.manufacturing_date,
            supplier=refill_in.supplier if refill_in.supplier else base_item.supplier,
            project=refill_in.project,
            is_active=True
        )
        db.add(db_drug)
        was_created = True

    from app.models.audit_log import AuditLog
    desc = (
        f"Refilled stock for {db_drug.item_name} (Code: {db_drug.item_code}) adding {refill_in.refill_quantity} "
        f"units to existing batch '{db_drug.batch_number}'." if not was_created else
        f"Created new batch '{db_drug.batch_number}' for {db_drug.item_name} (Code: {db_drug.item_code}) "
        f"during refill with {refill_in.refill_quantity} units."
    )
    db_log = AuditLog(
        user=current_user.username,
        action="REFILL_STOCK",
        module="MASTERS",
        description=desc,
        status="SUCCESS",
        project=db_drug.project
    )
    db.add(db_log)
    
    db.commit()
    db.refresh(db_drug)
    return drug_to_dict(db_drug)

