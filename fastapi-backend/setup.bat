@echo off
echo Setting up FastAPI backend...

REM Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Python is not installed. Please install Python 3.8 or higher.
    pause
    exit /b 1
)

REM Check if pip is installed
pip --version >nul 2>&1
if %errorlevel% neq 0 (
    echo pip is not installed. Please install pip.
    pause
    exit /b 1
)

REM Install dependencies
echo Installing dependencies...
pip install -r requirements.txt

REM Check if installation was successful
if %errorlevel% neq 0 (
    echo Failed to install dependencies.
    pause
    exit /b 1
)

REM Initialize database
echo Initializing database...
python init_db.py

REM Check if database initialization was successful
if %errorlevel% neq 0 (
    echo Failed to initialize database.
    pause
    exit /b 1
)

echo Setup completed successfully!
echo You can now start the FastAPI backend with: python -m uvicorn main:app --reload --port 8000
pause