from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from datetime import datetime, timezone
from app.core.database import Base

class TransitInventory(Base):
    __tablename__ = "transit_inventories"

    id = Column(Integer, primary_key=True, index=True)
    operator_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    project = Column(String(100), index=True, nullable=False)
    office_name = Column(String(255), index=True, nullable=False)
    drug_id = Column(Integer, ForeignKey("drug_masters.id"), nullable=False)
    
    item_code = Column(String(100), nullable=True)
    item_name = Column(String(255), nullable=True)
    batch_number = Column(String(100), nullable=True)
    expiry_date = Column(String(100), nullable=True)
    
    quantity = Column(Float, default=0.0)
    drawn_qty = Column(Float, default=0.0, nullable=False)
    status = Column(String(50), default="active") # "active", "pending_handover", "handed_over", "returned"
    handed_over_to_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
