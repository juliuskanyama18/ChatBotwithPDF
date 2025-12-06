# Microservices Architecture Setup Guide

This document explains the microservices architecture and provides step-by-step setup instructions.

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────┐
│         React Frontend (Port 5173)          │
│     - User Interface                        │
│     - PDF Viewer                            │
│     - Chat Interface                        │
└────────────────┬────────────────────────────┘
                 │ HTTP/REST API
                 ▼
┌─────────────────────────────────────────────┐
│     Node.js Express API (Port 3600)         │
│     - Authentication (JWT)                  │
│     - Database Operations (MongoDB)         │
│     - Chat with AI (OpenAI GPT-3.5)         │
│     - RAG Search (Vector Embeddings)        │
│     - File Upload Management                │
└────────────────┬────────────────────────────┘
                 │ HTTP/REST API
                 ▼
┌─────────────────────────────────────────────┐
│  Python FastAPI Service (Port 8000)         │
│     - PDF Text Extraction (pdfplumber)      │
│     - DOCX Processing (python-docx)         │
│     - PPTX Processing (python-pptx)         │
│     - Image OCR (Tesseract)                 │
└─────────────────────────────────────────────┘
```

## 🎯 Why Microservices?

### Benefits

1. **Best Tool for Each Job**
   - Node.js: Great for API, real-time, async operations
   - Python: Superior document processing libraries

2. **Independent Scaling**
   - Scale document processing independently
   - Heavy OCR doesn't affect main app

3. **Fault Tolerance**
   - If Python service fails, Node.js fallback works
   - Main app continues running

4. **Technology Flexibility**
   - Use best libraries in each language
   - Easy to add more services (e.g., Go for heavy computation)

5. **Easier Maintenance**
   - Clear separation of concerns
   - Update document processing without touching main app

## 📋 Prerequisites

### Node.js Service
- Node.js 16+ and npm
- MongoDB (local or Atlas)
- OpenAI API key

### Python Service
- Python 3.8+
- Tesseract OCR (optional, for image OCR)

### React Frontend
- Node.js 16+ and npm
- Vite build tool

## 🚀 Complete Setup Instructions

### Step 1: Install Tesseract OCR (Optional but Recommended)

**Windows**:
1. Download from [GitHub Releases](https://github.com/UB-Mannheim/tesseract/wiki)
2. Run installer (default location: `C:\Program Files\Tesseract-OCR\`)
3. Verify installation:
   ```cmd
   tesseract --version
   ```

**Ubuntu/Debian**:
```bash
sudo apt-get update
sudo apt-get install tesseract-ocr
tesseract --version
```

**macOS**:
```bash
brew install tesseract
tesseract --version
```

### Step 2: Setup Python Document Service

**Navigate to python_service directory**:
```bash
cd "c:\Users\jk\Desktop\ISE492\ChatBotwithPDF Project\ChatBotwithPDF\python_service"
```

**Windows - Run startup script**:
```cmd
start_python_service.bat
```

**Linux/macOS - Run startup script**:
```bash
chmod +x start_python_service.sh
./start_python_service.sh
```

**Verify service is running**:
Open browser: http://localhost:8000/health

Expected response:
```json
{
  "status": "healthy",
  "service": "document-processor",
  "tesseract_available": true
}
```

**View API documentation**:
http://localhost:8000/docs

### Step 3: Setup Node.js Backend

**Navigate to project root**:
```bash
cd "c:\Users\jk\Desktop\ISE492\ChatBotwithPDF Project\ChatBotwithPDF"
```

**Install dependencies** (if not already done):
```bash
npm install
```

**Create/Update .env file**:
```env
MONGODB_URI=mongodb://localhost:27017/chatbotwithpdf
JWT_SECRET=your_secure_jwt_secret_here
OPENAI_API_KEY=your_openai_api_key_here
PYTHON_SERVICE_URL=http://localhost:8000
```

**Start Node.js backend**:
```bash
npm run dev
```

Expected output:
```
🔍 Checking Python microservice availability...
✅ Python service extracted ... characters from PDF
Server is running on port 3600
```

### Step 4: Setup React Frontend

**Navigate to client directory**:
```bash
cd client
```

**Install dependencies** (if not already done):
```bash
npm install
```

**Start React development server**:
```bash
npm run dev
```

Expected output:
```
VITE ready in 500 ms
➜  Local:   http://localhost:5173/
```

### Step 5: Verify Everything is Running

**Check all services**:

1. **Python Service**: http://localhost:8000/health
   - Should return `{"status": "healthy"}`

2. **Node.js Backend**: http://localhost:3600
   - Should show landing page or redirect to workspace

3. **React Frontend**: http://localhost:5173
   - Should show login/register page

## 🧪 Testing the Integration

### Test 1: Upload a PDF

1. Open http://localhost:5173
2. Login or register
3. Upload a PDF file
4. Check Node.js console for:
   ```
   🔍 Checking Python microservice availability...
   ✅ Processed via Python service (python-pdfplumber): 5432 characters
   ```

### Test 2: Upload a DOCX

1. Upload a DOCX file
2. Check Node.js console for:
   ```
   ✅ Processed via Python service (python-docx): 3456 characters
   ```

### Test 3: Upload an Image (OCR)

1. Upload a JPG/PNG image with text
2. Check Python service console for:
   ```
   🔍 Starting OCR processing via Python service...
   OCR Progress: 100%
   ✅ Python service extracted 567 characters via OCR (confidence: 92.5%)
   ```

### Test 4: Test Fallback Mechanism

1. **Stop Python service** (Ctrl+C in Python terminal)
2. Try uploading a PDF
3. Node.js should fall back:
   ```
   ⚠️ Python service unavailable, using Node.js fallback...
   ✅ PDF processed via Node.js: 10 pages, 5000 characters
   ```

## 📊 Service Communication Flow

### Document Upload Flow

```
User uploads DOCX
        ↓
React Frontend (localhost:5173)
        ↓ POST /uploadPdf
Node.js Backend (localhost:3600)
        ↓ Check Python service health
        ↓ POST http://localhost:8000/extract/docx
Python Service (localhost:8000)
        ↓ Extract text using python-docx
        ↓ Return {text, paragraphs, success}
Node.js Backend
        ↓ Save to MongoDB
        ↓ Generate embeddings
        ↓ Return success
React Frontend
        ↓ Show success message
        ↓ Navigate to chat interface
```

## 🔧 Configuration

### Change Python Service Port

**In `python_service/document_service.py`** (bottom of file):
```python
uvicorn.run(app, host="0.0.0.0", port=8000)  # Change 8000 to your port
```

**In `utils/pythonServiceClient.js`**:
```javascript
const PYTHON_SERVICE_URL = 'http://localhost:8000';  // Update port here
```

### Add More Document Types

**In Python Service** (`python_service/document_service.py`):
1. Add new endpoint (e.g., `/extract/rtf`)
2. Implement extraction logic
3. Add to auto-detect router

**In Node.js Backend** (`utils/pythonServiceClient.js`):
1. Add new extraction function
2. Update `processDocumentWithFallback()` switch statement

## 🐛 Troubleshooting

### Python Service Not Starting

**Problem**: Port 8000 already in use

**Solution**:
```bash
# Find process using port 8000
# Windows:
netstat -ano | findstr :8000
# Linux/macOS:
lsof -i :8000

# Kill the process or change port in configuration
```

**Problem**: ModuleNotFoundError

**Solution**:
```bash
# Ensure virtual environment is activated
cd python_service
# Windows:
venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

# Reinstall dependencies
pip install -r requirements.txt
```

### Node.js Can't Connect to Python Service

**Problem**: Node.js shows "Python service unavailable"

**Check**:
1. Is Python service running? → Check http://localhost:8000/health
2. Firewall blocking connection?
3. CORS configuration correct?

**Solution**:
```bash
# Test Python service manually
curl http://localhost:8000/health

# If this fails, Python service isn't running
```

### Documents Not Processing

**Problem**: Upload succeeds but no text extracted

**Debug**:
1. Check Node.js console for errors
2. Check Python service console for errors
3. Check `python_service/document_service.log`

**Common causes**:
- Scanned PDF (needs OCR, not text extraction)
- Corrupted file
- Unsupported file format

### OCR Not Working

**Problem**: Image upload fails or returns empty text

**Solution**:
1. Verify Tesseract installed:
   ```bash
   tesseract --version
   ```

2. Check Tesseract path in `document_service.py`:
   ```python
   pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
   ```

3. Test Tesseract directly:
   ```bash
   tesseract test.png output
   ```

## 🚀 Production Deployment

### Using PM2 (Recommended)

**Install PM2**:
```bash
npm install -g pm2
```

**Start services**:
```bash
# Node.js backend
pm2 start npm --name "chatbot-backend" -- run dev

# Python service (in python_service directory)
pm2 start document_service.py --name "doc-processor" --interpreter python3

# React frontend
cd client
pm2 start npm --name "chatbot-frontend" -- run dev

# Save configuration
pm2 save
pm2 startup
```

**Monitor services**:
```bash
pm2 status
pm2 logs
```

### Using Docker Compose

Create `docker-compose.yml`:
```yaml
version: '3.8'

services:
  mongodb:
    image: mongo:6
    ports:
      - "27017:27017"
    volumes:
      - mongodb_data:/data/db

  python-service:
    build: ./python_service
    ports:
      - "8000:8000"
    environment:
      - PYTHONUNBUFFERED=1

  node-backend:
    build: .
    ports:
      - "3600:3600"
    environment:
      - MONGODB_URI=mongodb://mongodb:27017/chatbotwithpdf
      - PYTHON_SERVICE_URL=http://python-service:8000
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - JWT_SECRET=${JWT_SECRET}
    depends_on:
      - mongodb
      - python-service

  react-frontend:
    build: ./client
    ports:
      - "5173:5173"
    depends_on:
      - node-backend

volumes:
  mongodb_data:
```

**Deploy**:
```bash
docker-compose up -d
```

## 📈 Monitoring

### Health Checks

**Python Service**:
```bash
curl http://localhost:8000/health
```

**Node.js Backend**:
```bash
curl http://localhost:3600/
```

### Log Files

**Python Service**:
- Console: Real-time logs in terminal
- File: `python_service/document_service.log`

**Node.js Backend**:
- Console: Real-time logs in terminal
- MongoDB logs: Check database logs

### Performance Monitoring

**Python Service endpoints return processing metrics**:
```json
{
  "text": "...",
  "char_count": 5432,
  "processing_time": 1.2
}
```

**Node.js console shows timing**:
```
⏱️ TOTAL REQUEST TIME: 1500ms
⏱️ OpenAI API call: 800ms
⏱️ Fetch document: 50ms
```

## 🔐 Security Considerations

1. **API Authentication**
   - Node.js uses JWT tokens
   - Python service should be behind firewall (not publicly accessible)
   - Use environment variables for secrets

2. **CORS Configuration**
   - Restrict allowed origins in production
   - Don't use `*` for allow_origins

3. **File Upload Security**
   - Validate file types
   - Limit file sizes (currently 10MB)
   - Scan uploaded files for malware

4. **Rate Limiting**
   - Add rate limiting to prevent abuse
   - Especially important for OCR (CPU-intensive)

## 📚 Further Reading

- [Python Service README](python_service/README.md)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Express.js Best Practices](https://expressjs.com/en/advanced/best-practice-performance.html)
- [React Production Build](https://vitejs.dev/guide/build.html)

## 🤝 Contributing

When adding new features:

1. **Document processing**: Add to Python service
2. **Business logic**: Add to Node.js backend
3. **UI components**: Add to React frontend

Keep separation of concerns clear!

## ✅ Quick Start Checklist

- [ ] Install Tesseract OCR
- [ ] Start Python service (port 8000)
- [ ] Start Node.js backend (port 3600)
- [ ] Start React frontend (port 5173)
- [ ] Verify all services at their health endpoints
- [ ] Test document upload (PDF, DOCX, PPTX, Image)
- [ ] Test chat functionality
- [ ] Check logs for any errors

## 🎉 Success Indicators

Your setup is correct when:

✅ http://localhost:8000/health returns healthy status
✅ http://localhost:3600 shows landing page
✅ http://localhost:5173 shows login page
✅ Document upload logs show "Processed via Python service"
✅ Chat responses use RAG with semantic search
✅ OCR extracts text from images successfully

## 📞 Support

For issues:
1. Check service logs
2. Verify all services running
3. Test each service independently
4. Check firewall/network configuration