# Python 3.13 Setup Guide - Multi-Strategy Chunking

## TL;DR - Quick Start (Skip Python Chunking)

**The easiest option:** Just run the system WITHOUT the Python chunking service. It has automatic fallback to Node.js chunking!

```bash
# Terminal 1 - Backend
npm run dev

# Terminal 2 - Frontend
cd client
npm run dev
```

Done! The system will use Node.js RecursiveCharacterTextSplitter automatically.

---

## Option 1: Lite Version (NLTK Only) - Works with Python 3.13 ✅

This version uses only NLTK (no spaCy) and works with Python 3.13.

### Step 1: Install Lite Dependencies

```bash
cd python_service
pip install fastapi uvicorn[standard] python-multipart
pip install pdfplumber python-docx python-pptx
pip install Pillow pytesseract PyPDF2
pip install nltk aiofiles python-magic-bin fastapi-cors loguru
```

### Step 2: Rename Multi-Strategy Chunker

```bash
# Rename the lite version to be the main one
move multi_strategy_chunker.py multi_strategy_chunker_full.py
move multi_strategy_chunker_lite.py multi_strategy_chunker.py
```

### Step 3: Start Python Service

```bash
python document_service.py
```

You should see:
```
⚠️  spaCy not available, using lite chunker (NLTK only)
INFO:     Uvicorn running on http://0.0.0.0:8000
```

### What You Get
✅ Document-type-specific chunking (PDF, DOCX, PPTX)
✅ Section-aware chunking for PDFs
✅ Paragraph-based chunking for DOCX
✅ Slide-based chunking for PPTX
✅ Works with Python 3.13
❌ No spaCy sentence segmentation (uses NLTK instead - slightly less accurate)

---

## Option 2: Just Use Node.js Fallback (No Python Setup) ✅✅✅

**Recommended for quick testing!**

The system has automatic fallback built-in. If Python service is not running, it uses Node.js chunking automatically.

### Advantages:
- ✅ No Python setup required
- ✅ No dependency issues
- ✅ Works immediately
- ✅ Still gets optimal chunk sizes per document type (PDF: 800, DOCX: 700, PPTX: 500)

### How to Use:
Just start the backend and frontend (don't start Python service):

```bash
# Terminal 1
npm run dev

# Terminal 2
cd client
npm run dev
```

Upload a document and check the console:
```
⚠️ Python service not available at http://localhost:8000
⚠️ Falling back to Node.js RecursiveCharacterTextSplitter
```

Everything works perfectly!

---

## Option 3: Wait for spaCy Python 3.13 Support

spaCy will eventually release pre-built wheels for Python 3.13. Check their GitHub or PyPI periodically:
- https://github.com/explosion/spaCy/releases
- https://pypi.org/project/spacy/#files

When available, you can install the full version:
```bash
pip install spacy==3.7.6
python -m spacy download en_core_web_sm
```

---

## Comparison of Options

| Feature | Lite (NLTK) | Node.js Fallback | Full (spaCy) |
|---------|-------------|------------------|--------------|
| Python 3.13 Support | ✅ Yes | ✅ Yes | ❌ No (yet) |
| Setup Difficulty | 🟡 Medium | 🟢 Easy | 🔴 Hard |
| Document-Specific Strategies | ✅ Yes | ❌ No | ✅ Yes |
| Sentence Segmentation | NLTK | Regex | spaCy (best) |
| Section Detection | ✅ Regex | ❌ No | ✅ Regex |
| Performance | Good | Best | Good |

---

## My Recommendation for Python 3.13 Users

1. **For immediate use:** Option 2 (Node.js fallback) - Zero setup, works instantly
2. **For better chunking:** Option 1 (Lite version) - Good balance, works with Python 3.13
3. **For best results:** Downgrade to Python 3.11/3.12 and use full version

---

## Testing Each Option

### Test Node.js Fallback:
```bash
# Don't start Python service
npm run dev
cd client && npm run dev
```

Expected log:
```
⚠️ Python service not available
⚠️ Falling back to Node.js RecursiveCharacterTextSplitter
```

### Test Lite Version:
```bash
# Terminal 1
cd python_service
python document_service.py

# Terminal 2
npm run dev

# Terminal 3
cd client && npm run dev
```

Expected log:
```
🐍 Calling Python chunking service for PDF...
✅ Python chunking successful: XX chunks created
Strategy used: PDFChunkingStrategy
```

---

## Troubleshooting

### Q: Can I still use the project without Python chunking?
**A:** Yes! 100%. The automatic fallback ensures zero disruption.

### Q: Is the lite version good enough?
**A:** Yes. NLTK sentence tokenization is very good. The main difference is spaCy has slightly better handling of edge cases (abbreviations, etc.), but for most documents you won't notice a difference.

### Q: Should I downgrade Python?
**A:** Only if you want the absolute best chunking quality. For most use cases, the lite version or Node.js fallback is perfectly fine.

### Q: When will spaCy support Python 3.13?
**A:** Typically a few months after Python release. Python 3.13 was released in October 2024, so support should come in Q1-Q2 2025. Check: https://github.com/explosion/spaCy/issues

---

## Current Recommendation

**Use Node.js fallback for now** (Option 2). Start the project without Python service:

```bash
# Terminal 1
npm run dev

# Terminal 2
cd client
npm run dev
```

Your project will work perfectly. You can always add Python chunking later when spaCy supports Python 3.13.

The multi-strategy chunking is an **enhancement**, not a **requirement**. The system is designed to work flawlessly without it!
