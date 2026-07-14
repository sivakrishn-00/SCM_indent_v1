from sqlalchemy import Column, Integer, Float, String, DateTime, ForeignKey, Enum, Boolean
import enum
from datetime import datetime, timezone
from app.core.database import Base

class ShiftType(str, enum.Enum):
    SHIFT_1 = "shift_1"
    SHIFT_2 = "shift_2"

class ShiftLog(Base):
    __tablename__ = "shift_logs"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    shift_type = Column(Enum(ShiftType), nullable=False)
    
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=True)
    consumable_id = Column(Integer, ForeignKey("consumables.id"), nullable=True)
    drug_id = Column(Integer, ForeignKey("drug_masters.id"), nullable=True)
    operator_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    opening_balance = Column(Float, nullable=False, default=0.0)
    received_qty = Column(Float, nullable=False, default=0.0)
    sent_back_qty = Column(Float, nullable=False, default=0.0)
    consumed_qty = Column(Float, nullable=False, default=0.0)
    closing_balance = Column(Float, nullable=False, default=0.0)  # opening + received - sent_back - consumed
    drawn_qty = Column(Float, nullable=False, default=0.0)  # qty drawn from office to transit bag
    
    # Transit Bag columns (explicit, no guessing)
    bag_ob = Column(Float, nullable=False, default=0.0)
    bag_received = Column(Float, nullable=False, default=0.0)
    bag_sent_back = Column(Float, nullable=False, default=0.0)
    bag_consumed = Column(Float, nullable=False, default=0.0)
    bag_closing = Column(Float, nullable=False, default=0.0)
    
    project = Column(String(100), nullable=True)
    office_name = Column(String(255), nullable=True)
    discrepancy_reason = Column(String(255), nullable=True)
    is_draft = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class UserShiftState(Base):
    __tablename__ = "user_shift_states"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    project = Column(String(100), nullable=True)
    office_name = Column(String(255), nullable=True)
    shift_date = Column(String(50), nullable=False, index=True)  # Format: "YYYY-MM-DD"
    status = Column(String(50), default="active", nullable=False)  # "active", "handed_over"
    
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
