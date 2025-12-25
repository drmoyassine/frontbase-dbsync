@echo off
echo Starting Frontbase frontend...

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Node.js is not installed. Please install Node.js.
    pause
    exit /b 1
)

REM Check if npm is installed
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo npm is not installed. Please install npm.
    pause
    exit /b 1
)

REM Install dependencies if node_modules doesn't exist
if not exist "node_modules" (
    echo Installing dependencies...
    npm install
)

REM Install axios if it's not already installed
echo Checking for axios dependency...
npm list axios >nul 2>&1
if %errorlevel% neq 0 (
    echo Installing axios...
    npm install axios
)

REM Start the development server
echo Starting development server...
echo Frontend will be available at http://localhost:8080
npm run dev
pause