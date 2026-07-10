from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from datetime import datetime, timezone
from app.core.database import Base

class OfficeInventory(Base):
    __tablename__ = "office_inventories"

    id = Column(Integer, primary_key=True, index=True)
    project = Column(String(100), index=True, nullable=False)
    office_name = Column(String(255), index=True, nullable=False)
    drug_id = Column(Integer, ForeignKey("drug_masters.id"), nullable=False)
    
    item_code = Column(String(100), nullable=True)
    item_name = Column(String(255), nullable=True)
    batch_number = Column(String(100), nullable=True)
    
    quantity = Column(Float, default=0.0)       # Current stock inside this office
    opening_stock = Column(Float, default=0.0)  # Opening stock (entered manually as a one-time task)
    
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
