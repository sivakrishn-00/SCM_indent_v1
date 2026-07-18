from datetime import timedelta
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.security import create_access_token, verify_password, get_password_hash
from app.api import deps
from app.models.user import User
from app.schemas.user import Token, UserCreate, UserOut

router = APIRouter()

import random
import os
import smtplib
from datetime import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from pydantic import BaseModel, EmailStr

class SendOTPRequest(BaseModel):
    username: str
    email: str

class VerifyOTPRequest(BaseModel):
    username: str
    email: str
    otp: str

def send_otp_email(email: str, otp: str):
    # Log to console so it's always visible in development terminal
    print("\n" + "="*50)
    print(f"  [OTP EMAIL] To: {email} | OTP Code: {otp}")
    print("="*50 + "\n")
    
    try:
        smtp_server = settings.SMTP_HOST
        smtp_port = settings.SMTP_PORT
        sender_email = settings.SMTP_USER
        sender_password = settings.SMTP_PASSWORD
        
        if sender_email and sender_password:
            msg = MIMEMultipart()
            msg['From'] = sender_email
            msg['To'] = email
            msg['Subject'] = "Bit-Indent: Your One-Time Password (OTP)"
            
            body = f"""
            Hello,

            Thank you for registering with Bit-Indcon.
            This is your first-time login verification.

            Your One-Time Password (OTP) is: {otp}

            This code is valid for 10 minutes. Please do not share this code with anyone.

            Best regards,
            Bit-Indent SCM Team
            """
            msg.attach(MIMEText(body, 'plain'))
            
            with smtplib.SMTP(smtp_server, smtp_port) as server:
                server.starttls()
                server.login(sender_email, sender_password)
                server.send_message(msg)
            print(f"Successfully sent OTP email to {email}")
    except Exception as e:
        print(f"Could not send email via SMTP (normal for local dev): {e}")

@router.post("/login", response_model=Token)
def login_access_token(
    db: Session = Depends(deps.get_db),
    form_data: OAuth2PasswordRequestForm = Depends()
) -> Any:
    """
    OAuth2 compatible token login, retrieve a JWT token for future requests.
    """
    # Authenticate by username or email
    user = db.query(User).filter(
        (User.username == form_data.username) | (User.email == form_data.username)
    ).first()
    
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect email/username or password"
        )
    elif not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user"
        )
    
    # Sync latest role & project from BAVYA EMS API on login
    if user.username != "admin":
        try:
            import requests
            headers = {"X-api-key": settings.BAVYA_EMS_API_KEY}
            url = settings.BAVYA_EMS_API_URL
            res = requests.get(url, headers=headers, params={"search": user.username}, timeout=3.0)
            if res.status_code == 200:
                employees_data = res.json().get("results", [])
                for item in employees_data:
                    if isinstance(item, dict):
                        emp = item.get("employee", {})
                        if emp.get("employee_code") == user.username:
                            pos = item.get("position") or {}
                            proj = item.get("project") or {}
                            latest_role = pos.get("role_name", "").strip()
                            latest_project = proj.get("name")
                            
                            updated = False
                            if latest_role and user.role != latest_role:
                                user.role = latest_role
                                updated = True
                            if latest_project and user.project != latest_project:
                                user.project = latest_project
                                updated = True
                            
                            if updated:
                                db.commit()
                                db.refresh(user)
                            break
        except Exception as e:
            print(f"Error syncing user role/project on login: {e}")
    
    # Check if first-time login (skip for default admin user or in development mode for easy testing)
    # if user.first_login and user.username != "admin" and settings.ENVIRONMENT != "development":
    if settings.ENABLE_OTP and user.first_login and user.username != "admin" and settings.ENVIRONMENT != "development":
        return {
            "first_login_required": True,
            "username": user.username,
            "email": user.email
        }
    
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return {
        "access_token": create_access_token(
            user.id, expires_delta=access_token_expires
        ),
        "token_type": "bearer",
        "user": user
    }

@router.post("/first-login-send-otp")
def first_login_send_otp(
    request_data: SendOTPRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(deps.get_db)
) -> Any:
    """
    Send OTP for first time login verification if the email matches.
    """
    user = db.query(User).filter(User.username == request_data.username).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user"
        )
        
    if not user.first_login:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User has already completed first-time login verification"
        )
 
    # Check if the email matches the registered email
    if user.email.lower() != request_data.email.lower():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email does not match our records."
        )
 
    # Generate 6-digit OTP
    otp = f"{random.randint(100000, 999999)}"
    user.otp_code = otp
    user.otp_expiry = datetime.utcnow() + timedelta(minutes=10)
    db.commit()
 
    # Send email asynchronously in the background
    background_tasks.add_task(send_otp_email, user.email, otp)
 
    resp = {"message": "OTP sent successfully to your email."}
    if settings.ENVIRONMENT == "development":
        resp["dev_otp"] = otp
    return resp

@router.post("/first-login-verify-otp", response_model=Token)
def first_login_verify_otp(
    request_data: VerifyOTPRequest,
    db: Session = Depends(deps.get_db)
) -> Any:
    """
    Verify OTP for first time login and return access token.
    """
    user = db.query(User).filter(
        (User.username == request_data.username) & (User.email == request_data.email)
    ).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User or email not found"
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user"
        )

    if not user.first_login:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User has already completed first-time login verification"
        )

    is_dev_bypass = settings.ENVIRONMENT == "development" and request_data.otp == "000000"
    
    if not is_dev_bypass:
        if not user.otp_code or user.otp_code != request_data.otp:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid OTP code"
            )

        if not user.otp_expiry or user.otp_expiry < datetime.utcnow():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="OTP has expired"
            )

    # Clear OTP and mark first_login as False
    user.first_login = False
    user.otp_code = None
    user.otp_expiry = None
    db.commit()
    db.refresh(user)

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return {
        "access_token": create_access_token(
            user.id, expires_delta=access_token_expires
        ),
        "token_type": "bearer",
        "user": user
    }

@router.post("/register", response_model=UserOut)
def register_user(
    *,
    db: Session = Depends(deps.get_db),
    user_in: UserCreate
) -> Any:
    """
    Register a new user (for testing and onboarding).
    """
    # Check if username or email already exists
    user = db.query(User).filter(
        (User.username == user_in.username) | (User.email == user_in.email)
    ).first()
    if user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this username or email already exists."
        )
    
    db_user = User(
        username=user_in.username,
        email=user_in.email,
        hashed_password=get_password_hash(user_in.password),
        role=user_in.role,
        project=user_in.project,
        is_active=user_in.is_active
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

@router.post("/test-token", response_model=UserOut)
def test_token(current_user: User = Depends(deps.get_current_user)) -> Any:
    """
    Test access token validity.
    """
    return current_user
