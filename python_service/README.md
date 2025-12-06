# Python Document Processing Microservice

A FastAPI-based microservice for extracting text from various document formats (PDF, DOCX, PPTX, and images with OCR).

## 🎯 Features

- **PDF Extraction** - Extract text from PDF files using pdfplumber
- **DOCX Extraction** - Extract text from Microsoft Word documents including tables
- **PPTX Extraction** - Extract text from PowerPoint presentations including slide content
- **Image OCR** - Extract text from images (JPG, PNG, GIF, BMP, TIFF) using Tesseract OCR
- **Auto-detection** - Automatically detect file type and route to appropriate processor
- **Health Monitoring** - Built-in health check endpoint
- **API Documentation** - Interactive Swagger UI documentation

## 📋 Prerequisites

### Required
- **Python 3.8+** - [Download Python](https://www.python.org/downloads/)
- **pip** - Python package installer (included with Python)

### Optional (for OCR functionality)
- **Tesseract OCR** - For image text extraction
  - **Windows**: [Download from GitHub](https://github.com/UB-Mannheim/tesseract/wiki)
  - **Ubuntu/Debian**: `sudo apt-get install tesseract-ocr`
  - **macOS**: `brew install tesseract`
  - **Fedora**: `sudo dnf install tesseract`

## 🚀 Quick Start

### Windows

1. **Navigate to python_service directory**:
   ```bash
   cd python_service
   ```

2. **Run the startup script**:
   ```bash
   start_python_service.bat
   ```

   The script will:
   - Check Python installation
   - Create virtual environment (first run only)
   - Install dependencies
   - Start the service on port 8000

### Linux/macOS

1. **Navigate to python_service directory**:
   ```bash
   cd python_service
   ```

2. **Make startup script executable**:
   ```bash
   chmod +x start_python_service.sh
   ```

3. **Run the startup script**:
   ```bash
   ./start_python_service.sh
   ```

### Manual Setup

If you prefer manual setup:

```bash
# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows:
venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run the service
python document_service.py
```

## 🌐 API Endpoints

Once running, the service will be available at **http://localhost:8000**

### Interactive Documentation
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

### Health Check
```bash
GET http://localhost:8000/health
```

Response:
```json
{
  "status": "healthy",
  "service": "document-processor",
  "tesseract_available": true
}
```

### Extract PDF
```bash
POST http://localhost:8000/extract/pdf
Content-Type: multipart/form-data

Body: file=<pdf_file>
```

Response:
```json
{
  "text": "Extracted text content...",
  "pages": 10,
  "success": true,
  "filename": "document.pdf",
  "char_count": 5432
}
```

### Extract DOCX
```bash
POST http://localhost:8000/extract/docx
Content-Type: multipart/form-data

Body: file=<docx_file>
```

Response:
```json
{
  "text": "Extracted text content...",
  "paragraphs": 25,
  "tables": 3,
  "success": true,
  "filename": "document.docx",
  "char_count": 3456
}
```

### Extract PPTX
```bash
POST http://localhost:8000/extract/pptx
Content-Type: multipart/form-data

Body: file=<pptx_file>
```

Response:
```json
{
  "text": "Extracted slide content...",
  "slides": 15,
  "success": true,
  "filename": "presentation.pptx",
  "char_count": 2345
}
```

### Extract Image (OCR)
```bash
POST http://localhost:8000/extract/ocr
Content-Type: multipart/form-data

Body: file=<image_file>
```

Response:
```json
{
  "text": "Extracted text via OCR...",
  "confidence": 92.5,
  "success": true,
  "filename": "image.png",
  "char_count": 567,
  "image_size": [1920, 1080]
}
```

### Auto-detect and Extract
```bash
POST http://localhost:8000/extract/auto
Content-Type: multipart/form-data

Body: file=<any_supported_file>
```

Automatically detects file type and routes to appropriate extractor.

## 🔧 Configuration

### Tesseract Path (Windows)

The service automatically checks these paths:
- `C:\Program Files\Tesseract-OCR\tesseract.exe`
- `C:\Program Files (x86)\Tesseract-OCR\tesseract.exe`
- `C:\Tesseract-OCR\tesseract.exe`

If Tesseract is installed elsewhere, edit `document_service.py`:

```python
# Line 41-52
pytesseract.pytesseract.tesseract_cmd = r"C:\Your\Custom\Path\tesseract.exe"
```

### Change Port

Default port is 8000. To change it, edit the last line of `document_service.py`:

```python
uvicorn.run(
    app,
    host="0.0.0.0",
    port=8000,  # Change this
    log_level="info"
)
```

### CORS Configuration

By default, the service allows requests from:
- `http://localhost:3600` (Node.js backend)
- `http://localhost:5173` (React frontend)

To add more origins, edit `document_service.py`:

```python
# Line 28-34
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3600", "http://localhost:5173", "http://your-domain.com"],
    ...
)
```

## 📦 Dependencies

See `requirements.txt` for full list. Key dependencies:

- **fastapi** - Web framework
- **uvicorn** - ASGI server
- **pdfplumber** - PDF text extraction
- **python-docx** - Word document processing
- **python-pptx** - PowerPoint processing
- **pytesseract** - OCR wrapper
- **Pillow** - Image processing
- **loguru** - Logging

## 🐛 Troubleshooting

### "Tesseract not found" error

**Problem**: OCR endpoints fail with Tesseract error

**Solution**:
1. Install Tesseract OCR (see Prerequisites)
2. Verify installation:
   ```bash
   tesseract --version
   ```
3. Check Tesseract path in `document_service.py`

### Port 8000 already in use

**Problem**: Service fails to start - "Address already in use"

**Solution**:
1. Change port in `document_service.py` (see Configuration)
2. Update Node.js backend to use new port in `utils/pythonServiceClient.js`:
   ```javascript
   const PYTHON_SERVICE_URL = 'http://localhost:YOUR_NEW_PORT';
   ```

### Import errors

**Problem**: Module import errors when starting service

**Solution**:
1. Ensure virtual environment is activated
2. Reinstall dependencies:
   ```bash
   pip install -r requirements.txt --upgrade
   ```

### Slow OCR processing

**Problem**: Image OCR takes too long

**Solution**:
1. Large images are automatically resized to 3000px max dimension
2. For faster processing, resize images before uploading
3. OCR is CPU-intensive - normal for large images (5-30 seconds)

### PDF extraction returns empty text

**Problem**: PDF processed but no text extracted

**Solution**:
- PDF may be scanned/image-based
- Use `/extract/ocr` endpoint for scanned PDFs (convert PDF to images first)
- Check if PDF has text layer using a PDF viewer

## 📊 Logging

Logs are written to:
- **Console** - Real-time logs
- **document_service.log** - Persistent log file (rotates at 10 MB)

Log levels:
- INFO: Normal operations
- WARNING: Non-critical issues
- ERROR: Processing failures

## 🔗 Integration with Node.js Backend

The Node.js backend automatically calls this service through `utils/pythonServiceClient.js`.

**Fallback behavior**:
- If Python service is available → Uses Python processors (better quality)
- If Python service is unavailable → Falls back to Node.js processors

**Testing integration**:
```javascript
// In Node.js backend
import { isPythonServiceHealthy } from './utils/pythonServiceClient.js';

const isHealthy = await isPythonServiceHealthy();
console.log('Python service healthy:', isHealthy);
```

## 🧪 Testing

### Test with curl

**PDF**:
```bash
curl -X POST "http://localhost:8000/extract/pdf" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@test.pdf"
```

**DOCX**:
```bash
curl -X POST "http://localhost:8000/extract/docx" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@test.docx"
```

**Image OCR**:
```bash
curl -X POST "http://localhost:8000/extract/ocr" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@test.png"
```

### Test with Python

```python
import requests

# Test PDF extraction
with open('test.pdf', 'rb') as f:
    response = requests.post('http://localhost:8000/extract/pdf', files={'file': f})
    print(response.json())
```

### Test with Postman

1. Set method to POST
2. URL: `http://localhost:8000/extract/pdf`
3. Body tab → form-data
4. Key: `file` (type: File)
5. Value: Select your test file
6. Send request

## 📈 Performance

Typical processing times (depends on hardware):

| Document Type | File Size | Processing Time |
|--------------|-----------|----------------|
| PDF (10 pages) | 500 KB | 1-2 seconds |
| DOCX (20 pages) | 100 KB | 0.5-1 second |
| PPTX (15 slides) | 2 MB | 1-2 seconds |
| Image OCR (2000x2000px) | 1 MB | 5-15 seconds |

**OCR optimization**:
- Images are automatically resized to 3000px max
- Converted to grayscale for better accuracy
- Use higher resolution images for better OCR results

## 🚀 Production Deployment

### Using Docker

Create `Dockerfile`:
```dockerfile
FROM python:3.9-slim

# Install Tesseract
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY document_service.py .

EXPOSE 8000
CMD ["python", "document_service.py"]
```

Build and run:
```bash
docker build -t doc-processor .
docker run -p 8000:8000 doc-processor
```

### Using systemd (Linux)

Create `/etc/systemd/system/doc-processor.service`:
```ini
[Unit]
Description=Document Processing Service
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/python_service
Environment="PATH=/path/to/python_service/venv/bin"
ExecStart=/path/to/python_service/venv/bin/python document_service.py
Restart=always

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable doc-processor
sudo systemctl start doc-processor
```

## 📝 License

Part of the ChatBotwithPDF project.

## 🤝 Support

For issues or questions:
1. Check this README
2. Review logs in `document_service.log`
3. Test endpoints at `http://localhost:8000/docs`