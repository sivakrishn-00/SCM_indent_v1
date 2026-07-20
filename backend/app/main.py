from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import engine, Base, SessionLocal
from app.api.v1.api import api_router

# Import all models to ensure they are registered on Base.metadata
from app.models.user import User
from app.models.vehicle import Vehicle
from app.models.consumable import Consumable
from app.models.shift import ShiftLog, UserShiftState
from app.models.indent import Indent
from app.models.drug import DrugMaster
from app.models.audit_log import AuditLog
from app.models.project_config import ProjectApprovalConfig
from app.models.permission import RolePermission
from app.models.office_inventory import OfficeInventory
from app.models.transit_inventory import TransitInventory
from app.models.roster import ShiftRoster

# Create tables if they don't exist
#Base.metadata.create_all(bind=engine)

# Try to run SQLite migrations for dispatch columns if they don't exist
try:
    with engine.connect() as conn:
        for col_name, col_type in [
            ("dispatched_qty", "REAL"),
            ("dispatched_batch_no", "TEXT"),
            ("courier_details", "TEXT"),
            ("dispatch_remarks", "TEXT"),
            ("service_area_code", "TEXT")
        ]:
            try:
                # Use text() to satisfy SQLAlchemy 2.0 executable statement requirements
                from sqlalchemy import text
                conn.execute(text(f"ALTER TABLE indents ADD COLUMN {col_name} {col_type}"))
                conn.commit()
            except Exception:
                # Column already exists or other database flavour
                pass
                
        # Migrations for drug_masters table
        for col_name, col_type in [
            ("initial_quantity", "REAL")
        ]:
            try:
                from sqlalchemy import text
                conn.execute(text(f"ALTER TABLE drug_masters ADD COLUMN {col_name} {col_type}"))
                conn.commit()
            except Exception:
                pass

        # Migrations for project_approval_configs table
        for col_name, col_type in [
            ("low_stock_threshold", "INTEGER DEFAULT 10")
        ]:
            try:
                from sqlalchemy import text
                conn.execute(text(f"ALTER TABLE project_approval_configs ADD COLUMN {col_name} {col_type}"))
                conn.commit()
            except Exception:
                pass

        # Backfill initial_quantity to match quantity if it was created as NULL
        try:
            from sqlalchemy import text
            conn.execute(text("UPDATE drug_masters SET initial_quantity = quantity WHERE initial_quantity IS NULL"))
            conn.commit()
        except Exception:
            pass
except Exception as e:
    print(f"Migration error: {e}")

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

# Set up CORS middleware to allow frontend connection
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex="https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include the central API router
app.include_router(api_router, prefix=settings.API_V1_STR)

from fastapi import Request
from fastapi.responses import JSONResponse
import traceback

@app.exception_handler(Exception)
def global_exception_handler(request: Request, exc: Exception):
    print("--- Global Exception Caught ---")
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"message": "Internal Server Error", "detail": str(exc)}
    )

@app.get("/")
def root():
    return {
        "message": f"Welcome to the {settings.PROJECT_NAME} API",
        "docs_url": "/docs"
    }

@app.on_event("startup")
def startup_event():
    db = SessionLocal()
    try:
        if db.query(RolePermission).first() is None:
            defaults = [
                # admin
                {"role": "admin", "page": "overview", "can_view": True, "can_create": True, "can_update": True, "can_delete": True},
                {"role": "admin", "page": "shift", "can_view": True, "can_create": True, "can_update": True, "can_delete": True},
                {"role": "admin", "page": "indents", "can_view": True, "can_create": True, "can_update": True, "can_delete": True},
                {"role": "admin", "page": "masters", "can_view": True, "can_create": True, "can_update": True, "can_delete": True},
                {"role": "admin", "page": "users", "can_view": True, "can_create": True, "can_update": True, "can_delete": True},
                {"role": "admin", "page": "audit", "can_view": True, "can_create": True, "can_update": True, "can_delete": True},
                {"role": "admin", "page": "reports", "can_view": True, "can_create": True, "can_update": True, "can_delete": True},
                # project_manager
                {"role": "project_manager", "page": "overview", "can_view": True, "can_create": True, "can_update": True, "can_delete": True},
                {"role": "project_manager", "page": "shift", "can_view": True, "can_create": True, "can_update": True, "can_delete": True},
                {"role": "project_manager", "page": "indents", "can_view": True, "can_create": True, "can_update": True, "can_delete": True},
                {"role": "project_manager", "page": "reports", "can_view": True, "can_create": True, "can_update": True, "can_delete": True},
                {"role": "project_manager", "page": "masters", "can_view": False, "can_create": False, "can_update": False, "can_delete": False},
                {"role": "project_manager", "page": "users", "can_view": False, "can_create": False, "can_update": False, "can_delete": False},
                {"role": "project_manager", "page": "audit", "can_view": False, "can_create": False, "can_update": False, "can_delete": False},
                # supervisor
                {"role": "supervisor", "page": "overview", "can_view": True, "can_create": True, "can_update": True, "can_delete": True},
                {"role": "supervisor", "page": "shift", "can_view": True, "can_create": True, "can_update": True, "can_delete": True},
                {"role": "supervisor", "page": "indents", "can_view": True, "can_create": True, "can_update": True, "can_delete": True},
                {"role": "supervisor", "page": "reports", "can_view": True, "can_create": True, "can_update": True, "can_delete": True},
                {"role": "supervisor", "page": "masters", "can_view": False, "can_create": False, "can_update": False, "can_delete": False},
                {"role": "supervisor", "page": "users", "can_view": False, "can_create": False, "can_update": False, "can_delete": False},
                {"role": "supervisor", "page": "audit", "can_view": False, "can_create": False, "can_update": False, "can_delete": False},
                # operator
                {"role": "operator", "page": "shift", "can_view": True, "can_create": True, "can_update": True, "can_delete": False},
                {"role": "operator", "page": "indents", "can_view": True, "can_create": True, "can_update": False, "can_delete": False},
                {"role": "operator", "page": "overview", "can_view": False, "can_create": False, "can_update": False, "can_delete": False},
                {"role": "operator", "page": "reports", "can_view": False, "can_create": False, "can_update": False, "can_delete": False},
                {"role": "operator", "page": "masters", "can_view": False, "can_create": False, "can_update": False, "can_delete": False},
                {"role": "operator", "page": "users", "can_view": False, "can_create": False, "can_update": False, "can_delete": False},
                {"role": "operator", "page": "audit", "can_view": False, "can_create": False, "can_update": False, "can_delete": False},
            ]
            for d in defaults:
                db.add(RolePermission(**d))
            db.commit()
    except Exception as e:
        print(f"Error seeding permissions: {e}")
    finally:
        db.close()
