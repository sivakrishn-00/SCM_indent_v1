from sqlalchemy import Column, Integer, String, Boolean
from app.core.database import Base

class Vehicle(Base):
    __tablename__ = "vehicles"

    id = Column(Integer, primary_key=True, index=True)
    vehicle_number = Column(String(50), unique=True, index=True, nullable=False)
    vehicle_type = Column(String(50), nullable=False)  # e.g., Excavator, Dumper, Tipper
    project = Column(String(100), index=True, nullable=False)  # Associated project/location
    is_active = Column(Boolean(), default=True)
