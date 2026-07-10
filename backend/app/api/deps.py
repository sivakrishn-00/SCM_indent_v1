from typing import Generator
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.database import SessionLocal
from app.core.security import ALGORITHM
from app.models.user import User
from app.schemas.user import TokenPayload
from app.models.audit_log import AuditLog
import queue
import threading
import requests
import time
from threading import Lock

# OAuth2 scheme for token extraction
oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/auth/login"
)

def get_db() -> Generator:
    try:
        db = SessionLocal()
        yield db
    finally:
        db.close()

# ----------------- POINT 1: CIRCUIT BREAKER PATTERN -----------------
class CircuitBreaker:
    def __init__(self, failure_threshold=5, recovery_time=300):
        self.failure_threshold = failure_threshold
        self.recovery_time = recovery_time
        self.state = "CLOSED"  # CLOSED, OPEN, HALF-OPEN
        self.failure_count = 0
        self.last_state_change = time.time()
        self._lock = Lock()

    def record_success(self):
        with self._lock:
            self.failure_count = 0
            self.state = "CLOSED"

    def record_failure(self):
        with self._lock:
            self.failure_count += 1
            if self.failure_count >= self.failure_threshold:
                self.state = "OPEN"
                self.last_state_change = time.time()
                print(f"[CIRCUIT_BREAKER] Tripped to OPEN state. EMS API calls will be bypassed to protect threads.")

    def check_state(self) -> str:
        with self._lock:
            if self.state == "OPEN":
                # Check if recovery window has passed
                if (time.time() - self.last_state_change) > self.recovery_time:
                    self.state = "HALF-OPEN"
                    print(f"[CIRCUIT_BREAKER] Resetting to HALF-OPEN to probe external service.")
            return self.state

# Initialize Global Circuit Breaker
ems_circuit_breaker = CircuitBreaker(failure_threshold=5, recovery_time=300)


# ----------------- POINT 2: TRANSACTIONAL OUTBOX PATTERN -----------------
audit_log_queue = queue.Queue()

def audit_log_worker():
    """
    Background worker thread that consumes logs from the queue and saves them to the DB.
    This guarantees that audit actions never block or fail the primary user request thread.
    """
    while True:
        try:
            log_data = audit_log_queue.get()
            if log_data is None:  # Sentinel
                break
                
            db = SessionLocal()
            try:
                log_entry = AuditLog(
                    user=log_data.get("user"),
                    action=log_data.get("action"),
                    module=log_data.get("module"),
                    description=log_data.get("description"),
                    status=log_data.get("status"),
                    project=log_data.get("project")
                )
                db.add(log_entry)
                db.commit()
            except Exception as e:
                print(f"[OUTBOX-SERVICE] Failed to save audit log: {e}")
            finally:
                db.close()
        except Exception as e:
            print(f"[OUTBOX-SERVICE] Error in audit worker loop: {e}")
        finally:
            audit_log_queue.task_done()

# Start the background worker daemon
worker_thread = threading.Thread(target=audit_log_worker, daemon=True)
worker_thread.start()


# In-memory user check cache
_user_last_ems_check = {}  # username: timestamp
_ems_check_lock = Lock()

def verify_user_status_live(db: Session, user: User, is_write_action: bool = False) -> bool:
    """
    Check if the employee is still active on BAVYA EMS API.
    Locks user session if they have resigned.
    Returns True if user is verified active.
    Returns False if user has resigned.
    """
    # Default admin bypass
    if user.username == "admin" or user.role == "admin":
        return True

    current_time = time.time()
    
    # Read actions: Skip verify check if checked in the last 10 minutes (600 seconds)
    if not is_write_action:
        with _ems_check_lock:
            last_checked = _user_last_ems_check.get(user.username, 0)
            if (current_time - last_checked) < 600.0:
                return user.is_active

    # Check Circuit Breaker state
    cb_state = ems_circuit_breaker.check_state()
    if cb_state == "OPEN":
        print(f"[HA-AUDIT] Circuit Breaker is OPEN. Bypassing BAVYA EMS API lookup. Fallback to cached status: {user.is_active}")
        if is_write_action:
            audit_log_queue.put({
                "user": user.username,
                "action": "OFFLINE_AUTH_WRITE",
                "module": "Auth",
                "description": f"EMS API bypassed. Circuit Breaker OPEN. Allowed transaction via cache.",
                "status": "SUCCESS",
                "project": user.project
            })
        return user.is_active

    headers = {"X-api-key": settings.BAVYA_EMS_API_KEY}
    url = settings.BAVYA_EMS_API_URL
    
    try:
        # Optimized single-user query using the tested 'search' parameter
        res = requests.get(url, headers=headers, params={"search": user.username}, timeout=2.0)
        
        if res.status_code == 200:
            data = res.json()
            results = data.get("results", [])
            
            # Record success in Circuit Breaker
            ems_circuit_breaker.record_success()
            
            with _ems_check_lock:
                _user_last_ems_check[user.username] = current_time
                
            if not results:
                # User has resigned or did not match the EMS record
                print(f"[SECURITY] User '{user.username}' not found in EMS verification lookup. Deactivating status.")
                if user.is_active:
                    user.is_active = False
                    db.commit()
                return False
                
            # User verified successfully
            if not user.is_active:
                user.is_active = True
                db.commit()
            return True
        else:
            raise Exception(f"EMS API returned status code {res.status_code}")
            
    except Exception as e:
        # Record failure in Circuit Breaker
        ems_circuit_breaker.record_failure()
        
        # Fail-Open Audit Mode: Allow access while logging auditing metrics via non-blocking Outbox Queue
        print(f"[HA-AUDIT] BAVYA EMS API unreachable. Error: {e}. Falling back to cached status: {user.is_active}")
        
        if is_write_action:
            audit_log_queue.put({
                "user": user.username,
                "action": "OFFLINE_AUTH_WRITE",
                "module": "Auth",
                "description": f"EMS verification down/timeout: {e}. Allowed transaction via cache.",
                "status": "SUCCESS",
                "project": user.project
            })
                
        return user.is_active

def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
    token: str = Depends(oauth2_scheme)
) -> User:
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[ALGORITHM]
        )
        token_data = TokenPayload(**payload)
    except (JWTError, Exception):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Could not validate credentials",
        )
    user = db.query(User).filter(User.id == token_data.sub).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    # Check if this is a write method operation
    is_write = request.method in ("POST", "PUT", "DELETE", "PATCH")
    
    # Run user status verification (SWR read-throttle / synchronous write-check)
    is_verified_active = verify_user_status_live(db, user, is_write_action=is_write)
    
    if not is_verified_active or not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user profile or active credentials revoked.")
        
    return user
