import os
from typing import Any, Dict, Optional
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env"),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )

    PROJECT_NAME: str = "Bit-Indent"
    API_V1_STR: str = "/api/v1"
    SECRET_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    ENVIRONMENT: str = "development"
    ENABLE_OTP: bool = False

    # MySQL Settings
    MYSQL_SERVER: str = "localhost"
    MYSQL_USER: str = "root"
    MYSQL_PASSWORD: str = "root"
    MYSQL_DB: str = "bit_indent"
    MYSQL_PORT: int = 3306
    
    # BAVYA EMS API Settings (loaded from .env)
    BAVYA_EMS_API_URL: str
    BAVYA_EMS_API_KEY: str

    # SMTP Email Settings
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None

    # Alternative/New Email Configs mapping
    EMAIL_HOST: Optional[str] = None
    EMAIL_PORT: Optional[int] = None
    EMAIL_HOST_USER: Optional[str] = None
    EMAIL_HOST_PASSWORD: Optional[str] = None
    
    # Credentials encryption key (44 base64 characters for Fernet)
    CREDENTIALS_ENCRYPTION_KEY: str = "-9q2zB6Pb_rT1zT7VN2_aNH3ZexzyyNNquERWOO19dk="

    
    SQLALCHEMY_DATABASE_URI: Optional[str] = None

    @model_validator(mode="after")
    def assemble_db_connection(self) -> "Settings":
        if not self.SQLALCHEMY_DATABASE_URI:
            self.SQLALCHEMY_DATABASE_URI = (
                f"mysql+pymysql://{self.MYSQL_USER}:{self.MYSQL_PASSWORD}"
                f"@{self.MYSQL_SERVER}:{self.MYSQL_PORT}/{self.MYSQL_DB}"
            )
        
        # Map alternative/new email configs to standard SMTP keys if provided
        if self.EMAIL_HOST:
            self.SMTP_HOST = self.EMAIL_HOST
        if self.EMAIL_PORT:
            self.SMTP_PORT = self.EMAIL_PORT
        if self.EMAIL_HOST_USER:
            self.SMTP_USER = self.EMAIL_HOST_USER
        if self.EMAIL_HOST_PASSWORD:
            self.SMTP_PASSWORD = self.EMAIL_HOST_PASSWORD
            
        return self

settings = Settings()
