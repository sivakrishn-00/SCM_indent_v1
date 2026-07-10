from sqlalchemy import Column, Integer, String, Float
from app.core.database import Base

class Consumable(Base):
    __tablename__ = "consumables"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, index=True, nullable=False)  # e.g., Diesel, Engine Oil
    unit = Column(String(20), nullable=False)  # e.g., Liters, Kgs
    current_price = Column(Float, default=0.0)
    description = Column(String(255), nullable=True)
