from sqlalchemy import Boolean, Column, Integer, String, Enum, DateTime
import enum
from app.core.database import Base

class UserRole(str, enum.Enum):
    ADMIN = "admin"
    PROJECT_MANAGER = "project_manager"
    SUPERVISOR = "supervisor"
    OPERATOR = "operator"

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(50), default="operator", nullable=False)
    is_active = Column(Boolean(), default=True)
    project = Column(String(100), nullable=True)  # Associated project from HCM API
    first_login = Column(Boolean(), default=True, nullable=False)
    otp_code = Column(String(10), nullable=True)
    otp_expiry = Column(DateTime, nullable=True)
