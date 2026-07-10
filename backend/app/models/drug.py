from sqlalchemy import Column, Integer, String, Float, Boolean
from app.core.database import Base

class DrugMaster(Base):
    __tablename__ = "drug_masters"

    id = Column(Integer, primary_key=True, index=True)
    item_code = Column(String(100), index=True, nullable=False)
    item_name = Column(String(255), nullable=False)
    description = Column(String(500), nullable=True)
    hsn_code = Column(String(50), nullable=True)
    item_group = Column(String(100), nullable=True)
    quantity = Column(Float, default=0.0)
    initial_quantity = Column(Float, default=0.0)
    uom = Column(String(50), nullable=True)
    unit_mrp = Column(Float, default=0.0)
    batch_number = Column(String(100), nullable=True)
    expiry_date = Column(String(100), nullable=True)
    manufacturing_date = Column(String(100), nullable=True)
    supplier = Column(String(255), nullable=True)
    project = Column(String(100), index=True, nullable=False)  # Associated project site
    is_active = Column(Boolean, default=True, nullable=False)

