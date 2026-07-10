from fastapi import APIRouter
from app.api.v1 import (
    auth, users, audit, projects, indents, shifts, drugs, 
    office_inventory, transit_inventory, bootstrap
)

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(audit.router, prefix="/audit", tags=["audit"])
api_router.include_router(bootstrap.router, tags=["bootstrap"])
api_router.include_router(projects.router, tags=["projects"])
api_router.include_router(indents.router, tags=["indents"])
api_router.include_router(shifts.router, tags=["shifts"])
api_router.include_router(drugs.router, tags=["drugs"])
api_router.include_router(office_inventory.router, tags=["office_inventory"])
api_router.include_router(transit_inventory.router, tags=["transit_inventory"])

