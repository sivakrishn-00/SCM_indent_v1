from sqlalchemy import Column, Integer, String, DateTime
from app.core.database import Base
import datetime

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    user = Column(String(100), nullable=False)
    action = Column(String(100), nullable=False)
    module = Column(String(100), nullable=False)
    description = Column(String(500), nullable=False)
    status = Column(String(50), nullable=False)
    project = Column(String(100), nullable=True)
