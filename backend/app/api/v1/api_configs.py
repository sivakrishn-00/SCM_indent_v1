import requests
from typing import List, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.api import deps
from app.models.user import User
from app.models.api_config import APISetting
from app.core.crypto import encrypt_auth_config, decrypt_auth_config

router = APIRouter()

class APISettingSave(BaseModel):
    api_identifier: str
    display_name: str
    base_url: str
    auth_type: str                  # 'api_key_header', 'bearer_token', 'basic_auth', 'oauth2', 'none'
    auth_data: dict                 # JSON containing auth keys like 'api_key', 'token', 'username', 'password'
    is_active: bool = True

class APISettingResponse(BaseModel):
    id: int
    api_identifier: str
    display_name: str
    base_url: str
    auth_type: str
    auth_data: dict                 # Masked auth_data
    is_active: bool
    
    class Config:
        from_attributes = True

class APISettingTest(BaseModel):
    base_url: str
    auth_type: str
    auth_data: dict

def mask_sensitive_data(auth_type: str, auth_data: dict) -> dict:
    """Masks secret values in auth dict to prevent leakage to inspect tools."""
    masked = auth_data.copy()
    if auth_type == "api_key_header":
        if "api_key" in masked and masked["api_key"]:
            masked["api_key"] = "********"
    elif auth_type == "bearer_token":
        if "token" in masked and masked["token"]:
            masked["token"] = "********"
    elif auth_type == "basic_auth":
        if "password" in masked and masked["password"]:
            masked["password"] = "********"
    return masked

@router.get("/api-configs", response_model=List[APISettingResponse])
def get_api_configs(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """Retrieve all API integrations config list (Admin only)."""
    if str(current_user.role).lower() != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can manage API integration settings."
        )
    
    configs = db.query(APISetting).all()
    response_list = []
    
    # Ensure there is always a default row in db to prevent empty screen on first view
    found_ems = False
    for c in configs:
        if c.api_identifier == "bavya_ems_api":
            found_ems = True
            
    if not found_ems:
        # Create default record from environment settings
        from app.core.config import settings
        default_ems = APISetting(
            api_identifier="bavya_ems_api",
            display_name="BAVYA EMS Employee API",
            base_url=settings.BAVYA_EMS_API_URL or "http://localhost:8000/api/employees",
            auth_type="api_key_header",
            encrypted_auth_data=encrypt_auth_config({
                "header_name": "X-api-key",
                "api_key": settings.BAVYA_EMS_API_KEY or ""
            }),
            is_active=True
        )
        db.add(default_ems)
        db.commit()
        db.refresh(default_ems)
        configs.append(default_ems)

    for c in configs:
        raw_auth = decrypt_auth_config(c.encrypted_auth_data)
        masked_auth = mask_sensitive_data(c.auth_type, raw_auth)
        
        response_list.append(APISettingResponse(
            id=c.id,
            api_identifier=c.api_identifier,
            display_name=c.display_name,
            base_url=c.base_url,
            auth_type=c.auth_type,
            auth_data=masked_auth,
            is_active=c.is_active
        ))
        
    return response_list

@router.post("/api-configs", response_model=APISettingResponse)
def create_api_config(
    payload: APISettingSave,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """Create a new API integration config (Admin only)."""
    if str(current_user.role).lower() != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can manage API integration settings."
        )
        
    config = db.query(APISetting).filter(APISetting.api_identifier == payload.api_identifier).first()
    if config:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"API identifier '{payload.api_identifier}' already exists."
        )
        
    encrypted_payload_data = encrypt_auth_config(payload.auth_data)
    
    config = APISetting(
        api_identifier=payload.api_identifier,
        display_name=payload.display_name,
        base_url=payload.base_url,
        auth_type=payload.auth_type,
        encrypted_auth_data=encrypted_payload_data,
        is_active=payload.is_active
    )
    db.add(config)
    db.commit()
    db.refresh(config)
    
    raw_auth = decrypt_auth_config(config.encrypted_auth_data)
    masked_auth = mask_sensitive_data(config.auth_type, raw_auth)
    
    return APISettingResponse(
        id=config.id,
        api_identifier=config.api_identifier,
        display_name=config.display_name,
        base_url=config.base_url,
        auth_type=config.auth_type,
        auth_data=masked_auth,
        is_active=config.is_active
    )

@router.put("/api-configs/{api_identifier}", response_model=APISettingResponse)
def save_api_config(
    api_identifier: str,
    payload: APISettingSave,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """Save or update API configuration block (Admin only)."""
    if str(current_user.role).lower() != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can manage API integration settings."
        )
        
    config = db.query(APISetting).filter(APISetting.api_identifier == api_identifier).first()
    
    # Process payload auth data and merge with existing secrets if masked values received
    new_auth = payload.auth_data.copy()
    existing_auth = {}
    
    if config:
        existing_auth = decrypt_auth_config(config.encrypted_auth_data)
        
    # Handle password/key merging for masked values
    if payload.auth_type == "api_key_header":
        if new_auth.get("api_key") == "********":
            new_auth["api_key"] = existing_auth.get("api_key", "")
    elif payload.auth_type == "bearer_token":
        if new_auth.get("token") == "********":
            new_auth["token"] = existing_auth.get("token", "")
    elif payload.auth_type == "basic_auth":
        if new_auth.get("password") == "********":
            new_auth["password"] = existing_auth.get("password", "")
            
    encrypted_payload_data = encrypt_auth_config(new_auth)
    
    if not config:
        config = APISetting(
            api_identifier=payload.api_identifier,
            display_name=payload.display_name,
            base_url=payload.base_url,
            auth_type=payload.auth_type,
            encrypted_auth_data=encrypted_payload_data,
            is_active=payload.is_active
        )
        db.add(config)
    else:
        config.display_name = payload.display_name
        config.base_url = payload.base_url
        config.auth_type = payload.auth_type
        config.encrypted_auth_data = encrypted_payload_data
        config.is_active = payload.is_active
        
    db.commit()
    db.refresh(config)
    
    raw_auth = decrypt_auth_config(config.encrypted_auth_data)
    masked_auth = mask_sensitive_data(config.auth_type, raw_auth)
    
    return APISettingResponse(
        id=config.id,
        api_identifier=config.api_identifier,
        display_name=config.display_name,
        base_url=config.base_url,
        auth_type=config.auth_type,
        auth_data=masked_auth,
        is_active=config.is_active
    )

@router.post("/api-configs/test-connection")
def test_api_connection(
    payload: APISettingTest,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """Test remote API target connectivity (Admin only)."""
    if str(current_user.role).lower() != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can test connections."
        )

    headers = {}
    auth_params = None
    
    auth_data = payload.auth_data.copy()
    
    # If the UI sends masked credentials "********", try loading actual password from DB
    ems_api = db.query(APISetting).filter(APISetting.base_url == payload.base_url).first()
    db_auth = decrypt_auth_config(ems_api.encrypted_auth_data) if ems_api else {}
    
    if payload.auth_type == "api_key_header":
        api_key = auth_data.get("api_key")
        if api_key == "********":
            api_key = db_auth.get("api_key", "")
        header_name = auth_data.get("header_name", "X-api-key")
        headers[header_name] = api_key
        
    elif payload.auth_type == "bearer_token":
        token = auth_data.get("token")
        if token == "********":
            token = db_auth.get("token", "")
        headers["Authorization"] = f"Bearer {token}"
        
    elif payload.auth_type == "basic_auth":
        username = auth_data.get("username", "")
        password = auth_data.get("password", "")
        if password == "********":
            password = db_auth.get("password", "")
        from requests.auth import HTTPBasicAuth
        auth_params = HTTPBasicAuth(username, password)

    try:
        # Perform request scan
        response = requests.get(
            payload.base_url, 
            headers=headers, 
            auth=auth_params, 
            params={"page": 1}, 
            timeout=8
        )
        return {
            "success": response.status_code == 200,
            "status_code": response.status_code,
            "message": f"Connection succeeded with Status {response.status_code}!" if response.status_code == 200 else f"Target returned status code {response.status_code}."
        }
    except requests.exceptions.Timeout:
        return {
            "success": False,
            "status_code": 408,
            "message": "Connection attempt timed out. Verify your URL and network rules."
        }
    except Exception as e:
        return {
            "success": False,
            "status_code": 500,
            "message": f"Failed to connect: {str(e)}"
        }
