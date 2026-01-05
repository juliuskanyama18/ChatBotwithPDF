# Quick Start Guide - ChatBot with PDF (Multi-Strategy Chunking Edition)

## ⚠️ Python 3.13 Users - Read This First!

**If you're using Python 3.13**, spaCy doesn't have pre-built wheels yet. You have 2 easy options:

1. **Skip Python chunking** (Recommended) - Use automatic Node.js fallback. See "Option B: Without Python Chunking" below.
2. **Use Lite version** - NLTK-only chunking. See [PYTHON313_SETUP.md](PYTHON313_SETUP.md)

---

## Option A: With Python Chunking (Python 3.11/3.12 only)

### First-Time Setup

#### 1. Install Python Dependencies
```bash
cd python_service
pip install -r requirements.txt
python -m spacy download en_core_web_sm
cd ..
```

#### 2. Install Node.js Dependencies
```bash
npm install
cd client
npm install
cd ..
```

### Daily Startup (3 Terminals)

**Terminal 1: Python Chunking Service**
```bash
cd python_service
python document_service.py
```
✅ Wait for: `Uvicorn running on http://0.0.0.0:8000`

**Terminal 2: Node.js Backend**
```bash
npm run dev
```
✅ Wait for: Backend running on port (usually 3600)

**Terminal 3: React Frontend**
```bash
cd client
npm run dev
```
✅ Wait for: Frontend running on [http://localhost:5173](http://localhost:5173)

---

## Option B: Without Python Chunking (Automatic Fallback) ✅ EASIEST

**Works with ANY Python version (3.11, 3.12, 3.13) or no Python setup at all!**

### Daily Startup (2 Terminals Only)

**Terminal 1: Node.js Backend**
```bash
npm run dev
```

**Terminal 2: React Frontend**
```bash
cd client
npm run dev
```

That's it! The system will automatically use Node.js chunking with optimal parameters per document type.

---

## Quick Verification

1. **Python Service Health Check:**
   ```bash
   curl http://localhost:8000/health
   ```
   Expected: `{"status":"healthy"}`

2. **Upload a test document** through the frontend

3. **Check console logs:**
   - ✅ `🐍 Calling Python chunking service...` → Python working
   - ⚠️ `Falling back to Node.js RecursiveCharacterTextSplitter` → Python not available

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| spaCy model not found | `python -m spacy download en_core_web_sm` |
| Python service not available | Check Terminal 1, restart service |
| Port 8000 already in use | Kill process: `lsof -ti:8000 \| xargs kill -9` (Mac/Linux) or `netstat -ano \| findstr :8000` (Windows) |

---

## Features Enabled

✅ PDF: Section-aware chunking with heading detection
✅ DOCX: Paragraph-based chunking with list preservation
✅ PPTX: Slide-based chunking with bullet structure
✅ Automatic fallback to Node.js if Python unavailable
✅ Hybrid search with RRF fusion
✅ Citation verification
✅ Chunk deduplication
✅ Key identifier extraction

---

For detailed information, see [MULTI_STRATEGY_CHUNKING_SETUP.md](MULTI_STRATEGY_CHUNKING_SETUP.md)
