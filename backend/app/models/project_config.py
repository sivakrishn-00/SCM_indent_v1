from sqlalchemy import Column, Integer, String
from app.core.database import Base

class ProjectApprovalConfig(Base):
    __tablename__ = "project_approval_configs"

    id = Column(Integer, primary_key=True, index=True)
    project_name = Column(String(100), unique=True, index=True, nullable=False)
    skip_roles = Column(String(255), default="", nullable=False)   # Comma-separated list of roles to skip (e.g. "SUPERVISOR,SPH")
    stop_role = Column(String(100), default=None, nullable=True)    # The role at which approval terminates
    low_stock_threshold = Column(Integer, default=10, nullable=False)
