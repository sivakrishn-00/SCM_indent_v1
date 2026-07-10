from typing import Optional
from pydantic import BaseModel

# Shared properties
class UserBase(BaseModel):
    email: Optional[str] = None
    username: Optional[str] = None
    is_active: Optional[bool] = True
    role: Optional[str] = "operator"
    project: Optional[str] = None

# Properties to receive via API on creation
class UserCreate(UserBase):
    email: str
    username: str
    password: str

# Properties to receive via API on update
class UserUpdate(BaseModel):
    password: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    project: Optional[str] = None

# Properties to return to client
class UserOut(UserBase):
    id: int

    class Config:
        from_attributes = True

# Token schemas
class Token(BaseModel):
    access_token: Optional[str] = None
    token_type: Optional[str] = None
    user: Optional[UserOut] = None
    first_login_required: Optional[bool] = False
    email: Optional[str] = None
    username: Optional[str] = None

class TokenPayload(BaseModel):
    sub: Optional[str] = None
