#!/bin/bash

echo "========================================"
echo "Starting Python Document Service"
echo "========================================"

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "ERROR: Python 3 is not installed"
    echo "Please install Python 3.8+ from https://www.python.org/downloads/"
    exit 1
fi

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv venv
    if [ $? -ne 0 ]; then
        echo "ERROR: Failed to create virtual environment"
        exit 1
    fi
    echo "Virtual environment created successfully!"
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Install/Update dependencies
echo "Installing Python dependencies..."
pip install -r requirements.txt

if [ $? -ne 0 ]; then
    echo "ERROR: Failed to install dependencies"
    exit 1
fi

# Check if Tesseract is installed
echo ""
echo "Checking for Tesseract OCR..."
if command -v tesseract &> /dev/null; then
    TESSERACT_VERSION=$(tesseract --version | head -n 1)
    echo "✓ Tesseract found: $TESSERACT_VERSION"
else
    echo ""
    echo "WARNING: Tesseract OCR not found!"
    echo "OCR functionality will not work for images."
    echo ""
    echo "To install Tesseract:"
    echo "  Ubuntu/Debian: sudo apt-get install tesseract-ocr"
    echo "  macOS: brew install tesseract"
    echo "  Fedora: sudo dnf install tesseract"
    echo ""
fi

echo ""
echo "========================================"
echo "Starting Document Processing Service..."
echo "========================================"
echo "Service will run on: http://localhost:8000"
echo "API Documentation: http://localhost:8000/docs"
echo "Health Check: http://localhost:8000/health"
echo "========================================"
echo ""

# Start the FastAPI service
python3 document_service.py