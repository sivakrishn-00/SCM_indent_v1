from sqlalchemy import Column, Integer, String, Boolean
from app.core.database import Base

class RolePermission(Base):
    __tablename__ = "role_permissions"

    id = Column(Integer, primary_key=True, index=True)
    role = Column(String(50), index=True, nullable=False)  # admin, project_manager, supervisor, operator
    page = Column(String(50), nullable=False)             # overview, shift, indents, masters, users, audit, reports
    can_view = Column(Boolean, default=False, nullable=False)
    can_create = Column(Boolean, default=False, nullable=False)
    can_update = Column(Boolean, default=False, nullable=False)
    can_delete = Column(Boolean, default=False, nullable=False)
    project = Column(String(50), nullable=True, index=True)
