# 🚀 Quick Start Guide - Microservices Setup

Get your ChatBotwithPDF microservices architecture up and running in 5 minutes!

## ⚡ Prerequisites Check

Before starting, ensure you have:

- ✅ **Node.js 16+** installed → `node --version`
- ✅ **Python 3.8+** installed → `python --version`
- ✅ **MongoDB** running (local or Atlas)
- ✅ **OpenAI API Key** ready
- ⚠️ **Tesseract OCR** (optional, for image processing)

## 🎯 3-Step Setup

### Step 1: Start Python Document Service (30 seconds)

Open **Terminal 1**:

```bash
# Navigate to python service
cd "c:\Users\jk\Desktop\ISE492\ChatBotwithPDF Project\ChatBotwithPDF\python_service"

# Windows:
start_python_service.bat

# Mac/Linux:
chmod +x start_python_service.sh
./start_python_service.sh
```

**✅ Success check**: Open http://localhost:8000/health
- Should see: `{"status": "healthy"}`

**📖 API Docs**: http://localhost:8000/docs

---

### Step 2: Start Node.js Backend (30 seconds)

Open **Terminal 2**:

```bash
# Navigate to project root
cd "c:\Users\jk\Desktop\ISE492\ChatBotwithPDF Project\ChatBotwithPDF"

# Make sure .env file exists with:
# MONGODB_URI=mongodb://localhost:27017/chatbotwithpdf
# JWT_SECRET=your_secret
# OPENAI_API_KEY=your_key
# PYTHON_SERVICE_URL=http://localhost:8000

# Start backend
npm run dev
```

**✅ Success check**: You should see:
```
🔍 Checking Python microservice availability...
Server is running on port 3600
```

---

### Step 3: Start React Frontend (30 seconds)

Open **Terminal 3**:

```bash
# Navigate to client
cd "c:\Users\jk\Desktop\ISE492\ChatBotwithPDF Project\ChatBotwithPDF\client"

# Start frontend
npm run dev
```

**✅ Success check**: Open http://localhost:5173
- Should see login/register page

---

## 🎉 You're Ready!

### Test the System

1. **Register/Login** at http://localhost:5173
2. **Upload a document**:
   - Try a PDF → Processed via Python's pdfplumber
   - Try a DOCX → Processed via Python's python-docx
   - Try a PPTX → Processed via Python's python-pptx
   - Try an image → Processed via Tesseract OCR
3. **Chat with AI** about your document

### Check Logs

Watch all 3 terminals to see the microservices in action:

**Terminal 1 (Python)**: Document processing logs
```
INFO: Processing DOCX file: document.docx
✅ Successfully extracted 3456 characters from 25 paragraphs
```

**Terminal 2 (Node.js)**: Backend orchestration
```
🔍 Checking Python microservice availability...
✅ Processed via Python service (python-docx): 3456 characters
✅ Embeddings generated for DOCX 64f3c2a1b5e4d8f9a1c2d3e4
```

**Terminal 3 (React)**: Frontend development server
```
VITE ready in 500 ms
```

---

## 🔍 Architecture at a Glance

```
┌─────────────────┐
│ React Frontend  │  http://localhost:5173
│  (Port 5173)    │  - User Interface
└────────┬────────┘  - Document Viewer
         │           - Chat Interface
         ▼
┌─────────────────┐
│ Node.js Backend │  http://localhost:3600
│  (Port 3600)    │  - Authentication
└────────┬────────┘  - Database
         │           - AI Chat & RAG
         ▼           - File Upload
┌─────────────────┐
│ Python Service  │  http://localhost:8000
│  (Port 8000)    │  - PDF Extraction
└─────────────────┘  - DOCX Processing
                     - PPTX Processing
                     - Image OCR
```

---

## 💡 Quick Tips

### Upload Different Document Types

**PDF** → Full text extraction + page-by-page viewing
**DOCX** → Text + tables extraction, informational card viewer
**PPTX** → Slide content extraction, informational card viewer
**Images** → OCR text extraction, shows actual image

### What Python Service Does Better

- **PDF**: pdfplumber is more accurate than pdf-parse
- **DOCX**: python-docx handles tables and formatting better
- **PPTX**: python-pptx actually works (Node.js version was broken!)
- **OCR**: Tesseract is the industry standard

### Fallback Mechanism

If Python service stops:
- Node.js automatically falls back to its own processors
- PDF and DOCX still work (using node libraries)
- PPTX and OCR won't work (no Node.js alternative)

**Try it**: Stop Python service (Ctrl+C in Terminal 1), upload PDF → Still works!

---

## 🐛 Common Issues & Quick Fixes

### "Python service unavailable"

**Problem**: Node.js can't connect to Python service

**Fix**:
1. Check Terminal 1 - Is Python service running?
2. Check http://localhost:8000/health
3. Restart Python service

### "Port 8000 already in use"

**Problem**: Another app using port 8000

**Fix**:
```bash
# Find what's using the port
# Windows:
netstat -ano | findstr :8000
# Mac/Linux:
lsof -i :8000

# Kill it or change port in python_service/document_service.py
```

### "Tesseract not found"

**Problem**: OCR won't work on images

**Fix**: Install Tesseract OCR
- **Windows**: https://github.com/UB-Mannheim/tesseract/wiki
- **Ubuntu**: `sudo apt-get install tesseract-ocr`
- **Mac**: `brew install tesseract`

### "ModuleNotFoundError" in Python

**Problem**: Missing Python packages

**Fix**:
```bash
cd python_service
# Windows:
venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate

pip install -r requirements.txt
```

---

## 📚 What's Next?

### Explore the System

1. **Test all document types** - PDF, DOCX, PPTX, Images
2. **Check API docs** - http://localhost:8000/docs
3. **Read full documentation**:
   - [MICROSERVICES_SETUP.md](MICROSERVICES_SETUP.md) - Complete guide
   - [python_service/README.md](python_service/README.md) - Python service details

### Customize

1. **Change ports** - Edit configuration files
2. **Add more document types** - Extend Python service
3. **Improve OCR** - Configure Tesseract settings
4. **Deploy to production** - Use Docker or PM2

---

## ✅ System Status Checklist

Your setup is correct when:

| Service | URL | Expected Response |
|---------|-----|-------------------|
| Python Service | http://localhost:8000/health | `{"status": "healthy"}` |
| Node.js Backend | http://localhost:3600 | Landing page or workspace |
| React Frontend | http://localhost:5173 | Login/Register page |

| Feature | Test | Expected Result |
|---------|------|-----------------|
| PDF Upload | Upload any PDF | "Processed via Python service (python-pdfplumber)" |
| DOCX Upload | Upload any DOCX | "Processed via Python service (python-docx)" |
| PPTX Upload | Upload any PPTX | "Processed via Python service (python-pptx)" |
| Image Upload | Upload JPG/PNG | "Processed via Python service (python-tesseract)" |
| Chat | Ask question | AI responds with relevant answer |
| RAG Search | Ask specific question | Response references specific pages |

---

## 🎯 Success!

You now have a fully functional microservices architecture where:

✅ **Node.js** handles authentication, database, and AI chat
✅ **Python** handles superior document processing
✅ **React** provides modern, responsive UI
✅ **Fallback** system ensures reliability

**Happy coding!** 🚀

---

## 📞 Need Help?

- **Python Service Issues**: Check [python_service/README.md](python_service/README.md)
- **Architecture Questions**: Read [MICROSERVICES_SETUP.md](MICROSERVICES_SETUP.md)
- **Logs**: Check all 3 terminal windows for errors