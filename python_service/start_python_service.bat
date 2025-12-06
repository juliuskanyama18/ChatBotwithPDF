@echo off
echo ========================================
echo Starting Python Document Service
echo ========================================

REM Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python 3.8+ from https://www.python.org/downloads/
    pause
    exit /b 1
)

REM Check if virtual environment exists
if not exist "venv" (
    echo Creating Python virtual environment...
    python -m venv venv
    if %errorlevel% neq 0 (
        echo ERROR: Failed to create virtual environment
        pause
        exit /b 1
    )
    echo Virtual environment created successfully!
)

REM Activate virtual environment
echo Activating virtual environment...
call venv\Scripts\activate.bat

REM Install/Update dependencies
echo Installing Python dependencies...
pip install -r requirements.txt

if %errorlevel% neq 0 (
    echo ERROR: Failed to install dependencies
    pause
    exit /b 1
)

REM Check if Tesseract is installed
echo.
echo Checking for Tesseract OCR...
if exist "C:\Program Files\Tesseract-OCR\tesseract.exe" (
    echo ✓ Tesseract found at: C:\Program Files\Tesseract-OCR\tesseract.exe
) else (
    echo.
    echo WARNING: Tesseract OCR not found!
    echo OCR functionality will not work for images.
    echo.
    echo To install Tesseract:
    echo 1. Download from: https://github.com/UB-Mannheim/tesseract/wiki
    echo 2. Install to: C:\Program Files\Tesseract-OCR\
    echo 3. Restart this script
    echo.
)

echo.
echo ========================================
echo Starting Document Processing Service...
echo ========================================
echo Service will run on: http://localhost:8000
echo API Documentation: http://localhost:8000/docs
echo Health Check: http://localhost:8000/health
echo ========================================
echo.

REM Start the FastAPI service
python document_service.py

pause