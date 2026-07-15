from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.sql import func
from app.core.database import Base

class APISetting(Base):
    __tablename__ = "api_settings"

    id = Column(Integer, primary_key=True, index=True)
    api_identifier = Column(String(100), unique=True, index=True, nullable=False) # e.g. 'bavya_ems_api'
    display_name = Column(String(150), nullable=False)                            # e.g. 'BAVYA EMS API'
    base_url = Column(String(255), nullable=False)
    
    # Supported: 'api_key_header', 'bearer_token', 'basic_auth', 'oauth2', 'none'
    auth_type = Column(String(50), default="api_key_header", nullable=False)
    
    # Encrypted JSON payload storing variables specific to the auth_type:
    # e.g., {"header_name": "X-api-key", "api_key": "..."}
    encrypted_auth_data = Column(String(1000), nullable=True)
    
    is_active = Column(Boolean, default=True, nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), default=func.now())
