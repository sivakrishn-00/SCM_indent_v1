from sqlalchemy import Column, Integer, Float, String, DateTime, ForeignKey, Enum
import enum
from datetime import datetime, timezone
from app.core.database import Base

class IndentStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    DISPATCHED = "dispatched"
    RECEIVED = "received"

class Indent(Base):
    __tablename__ = "indents"

    id = Column(Integer, primary_key=True, index=True)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=True)
    office_name = Column(String(100), nullable=True)
    project = Column(String(100), nullable=True)
    consumable_id = Column(Integer, ForeignKey("consumables.id"), nullable=True)
    drug_id = Column(Integer, ForeignKey("drug_masters.id"), nullable=True)
    requested_qty = Column(Float, nullable=False)
    status = Column(Enum(IndentStatus), default=IndentStatus.PENDING, nullable=False)
    
    requested_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    approved_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    # Workflow tracking fields
    current_approver_code = Column(String(50), nullable=True)  # employee code of who needs to approve next
    approval_chain = Column(String(1000), default="[]", nullable=False) # JSON-serialized list of approver codes
    current_chain_index = Column(Integer, default=0, nullable=False)
    
    batch_number = Column(String(100), nullable=True)
    remarks = Column(String(255), nullable=True)
    
    dispatched_qty = Column(Float, nullable=True)
    dispatched_batch_no = Column(String(100), nullable=True)
    courier_details = Column(String(255), nullable=True)
    dispatch_remarks = Column(String(255), nullable=True)
    service_area_code = Column(String(50), nullable=True)
    
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
