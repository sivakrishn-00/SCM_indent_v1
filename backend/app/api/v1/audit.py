from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Any, Optional
from pydantic import BaseModel
from app.api import deps
from app.models.user import User
from app.models.audit_log import AuditLog

router = APIRouter()

class AuditLogSchema(BaseModel):
    id: int
    timestamp: str
    user: str
    action: str
    module: str
    description: str
    status: str
    project: Optional[str] = None

    class Config:
        from_attributes = True

class AuditLogCreateSchema(BaseModel):
    action: str
    module: str
    description: str
    status: str = "SUCCESS"
    project: Optional[str] = None

@router.get("/logs", response_model=List[AuditLogSchema])
def get_audit_logs(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """
    Get all audit logs from the database, sorted newest first.
    """
    logs = db.query(AuditLog).order_by(AuditLog.timestamp.desc()).all()
    result = []
    for log in logs:
        result.append(AuditLogSchema(
            id=log.id,
            timestamp=log.timestamp.strftime("%Y-%m-%d %H:%M:%S"),
            user=log.user,
            action=log.action,
            module=log.module,
            description=log.description,
            status=log.status,
            project=log.project
        ))
    return result

@router.post("/logs", response_model=AuditLogSchema)
def create_audit_log(
    payload: AuditLogCreateSchema,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """
    Create a new audit log entry.
    """
    db_log = AuditLog(
        user=current_user.username,
        action=payload.action,
        module=payload.module,
        description=payload.description,
        status=payload.status,
        project=payload.project
    )
    db.add(db_log)
    db.commit()
    db.refresh(db_log)
    return AuditLogSchema(
        id=db_log.id,
        timestamp=db_log.timestamp.strftime("%Y-%m-%d %H:%M:%S"),
        user=db_log.user,
        action=db_log.action,
        module=db_log.module,
        description=db_log.description,
        status=db_log.status,
        project=db_log.project
    )
