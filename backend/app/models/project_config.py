from sqlalchemy import Column, Integer, String, Boolean, Date, UniqueConstraint
from app.core.database import Base

class ProjectApprovalConfig(Base):
    __tablename__ = "project_approval_configs"

    id = Column(Integer, primary_key=True, index=True)
    project_name = Column(String(100), unique=True, index=True, nullable=False)
    skip_roles = Column(String(255), default="", nullable=False)   # Comma-separated list of roles to skip (e.g. "SUPERVISOR,SPH")
    stop_role = Column(String(100), default=None, nullable=True)    # The role at which approval terminates
    low_stock_threshold = Column(Integer, default=10, nullable=False)

class ProjectShiftMapping(Base):
    __tablename__ = "project_shift_mappings"

    id = Column(Integer, primary_key=True, index=True)
    project_name = Column(String(100), index=True, nullable=False)
    shift_type = Column(String(50), nullable=False)  # "shift_1", "shift_2", "shift_3", "general", "off"
    label = Column(String(100), nullable=False)       # e.g. "Shift 1 (Morning)"
    default_start = Column(String(10), nullable=True) # e.g. "06:00"
    default_end = Column(String(10), nullable=True)   # e.g. "14:00"
    is_active = Column(Boolean, default=True, nullable=False)

    __table_args__ = (UniqueConstraint("project_name", "shift_type", name="uq_project_shift"),)

class ProjectCalendarConfig(Base):
    __tablename__ = "project_calendar_configs"

    id = Column(Integer, primary_key=True, index=True)
    project_name = Column(String(100), unique=True, index=True, nullable=False)
    weekoff_days = Column(String(255), default="Sunday", nullable=False) # Comma-separated day names e.g., "Sunday" or "Saturday,Sunday"

class ProjectHoliday(Base):
    __tablename__ = "project_holidays"

    id = Column(Integer, primary_key=True, index=True)
    project_name = Column(String(100), index=True, nullable=False)
    holiday_date = Column(Date, nullable=False)
    description = Column(String(255), nullable=True)

    __table_args__ = (UniqueConstraint("project_name", "holiday_date", name="uq_project_holiday_date"),)
