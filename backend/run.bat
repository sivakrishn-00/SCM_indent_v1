@echo off
echo ==========================================
echo Starting Bit-Indent Backend Setup
echo ==========================================

echo [1/3] Running Database Migrations...
call .\venv\Scripts\alembic upgrade head
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Migration failed. Please make sure:
    echo 1. Your MySQL server is running.
    echo 2. The database 'bitindent' exists.
    echo 3. The credentials in backend/.env are correct.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [2/3] Seeding Database...
call .\venv\Scripts\python -m app.seed
if %ERRORLEVEL% neq 0 (
    echo [WARNING] Seeding failed or already seeded.
)

echo.
echo [3/3] Starting FastAPI Server...
call .\venv\Scripts\uvicorn app.main:app --reload
