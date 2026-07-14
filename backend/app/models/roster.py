from sqlalchemy import Column, Integer, String, Date, DateTime, Index, UniqueConstraint
from datetime import datetime, timezone
from app.core.database import Base


class ShiftRoster(Base):
    __tablename__ = "shift_rosters"

    id = Column(Integer, primary_key=True, index=True)

    # Assignment
    project = Column(String(100), nullable=False, index=True)
    office_name = Column(String(255), nullable=False, index=True)
    employee_code = Column(String(50), nullable=False, index=True)
    employee_name = Column(String(255), nullable=True)

    # Schedule
    shift_date = Column(Date, nullable=False, index=True)
    shift_type = Column(String(20), nullable=False)  # "shift_1", "shift_2", "off", "general"
    start_time = Column(String(10), nullable=True)    # "06:00", "14:00"
    end_time = Column(String(10), nullable=True)      # "14:00", "22:00"

    # Lifecycle
    status = Column(String(30), default="scheduled", index=True)
    # Values: scheduled, active, completed, cancelled

    # Metadata
    created_by = Column(String(50), nullable=False)
    remarks = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index('ix_roster_lookup', 'employee_code', 'shift_date', 'project'),
        UniqueConstraint('employee_code', 'shift_date', 'shift_type', 'project',
                         name='uq_roster_assignment'),
    )
