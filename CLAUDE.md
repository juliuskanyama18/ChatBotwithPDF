# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ChatPDF is a graduation project (ISE492): a full-stack RAG (Retrieval-Augmented Generation) chatbot that lets users upload documents (PDF, DOCX, PPTX, images) and ask questions answered from document content with page/slide citations. It has three runtime components that must be run together during development:

1. **Node.js/Express backend** (root `app.js`, port 3600) — MVC structure under `backend/`, MongoDB Atlas (with Vector Search) for storage, OpenAI for embeddings + chat completions.
2. **React frontend** (`client/`, Vite dev server, port 5173) — the actual UI. The root `views/`/EJS mentioned in the top-level `README.md` is legacy/outdated; the real frontend is the Vite/React app in `client/`.
3. **Python FastAPI microservice** (`python_service/`, port 8000) — document text extraction (PDF/DOCX/PPTX/OCR) and multi-strategy NLP chunking. The Node backend calls this service and **falls back to Node.js-only processing if it's unreachable**, so it's optional for basic development but required for full-quality extraction/chunking.

## Common Commands

### Backend (run from repo root)
```bash
npm install                # install Node deps
npm run dev                 # nodemon app.js (auto-restart), serves on :3600
npm start                   # node app.js
npm test                    # node backend/tests/phase-1-2-3-tests.js
npm run test:rag            # node backend/tests/rag-improvement-tests.js
npm run test:all            # both test suites
```
These test scripts are standalone Node scripts (not a test framework runner) that connect directly to MongoDB — they need a valid `.env` in place before running, and are run from the repo root (paths inside assume root cwd), not from `backend/`.

### Frontend (run from `client/`)
```bash
cd client
npm install
npm run dev       # Vite dev server on :5173, proxies /api, /uploadPdf, /generate-response, /pdfs to :3600
npm run build
npm run preview
```

### Python microservice (run from `python_service/`)
```bash
cd python_service
start_python_service.bat        # Windows: creates venv, installs deps, starts on :8000
./start_python_service.sh       # Linux/macOS equivalent
# Manual:
python -m venv venv && venv\Scripts\activate   # (or source venv/bin/activate)
pip install -r requirements.txt
python document_service.py
```
Interactive API docs at `http://localhost:8000/docs`. Requires Tesseract OCR installed separately for image/OCR endpoints (optional; health check reports `tesseract_available`).

### Environment setup
Copy `.env.example` to `.env` in the repo root and set `OPENAI_API_KEY`, `MONGO_URI` (MongoDB Atlas, needed for Vector Search), `JWT_SECRET`, `SESSION_SECRET`.

## Architecture

### Request flow (Node backend)
`app.js` wires everything: connects to MongoDB (`backend/config/database.js`), mounts CORS restricted to `http://localhost:5173`, and mounts routers at `/api/auth`, `/api/documents`, `/api` (chat). Legacy routes (`/uploadPdf`, `/generate-response`) exist for backward compatibility and internally forward into the same route handlers. All protected routes use JWT-based `protect` middleware (`backend/middleware/auth.js`), reading the token from an httpOnly cookie.

Standard MVC layering under `backend/`:
- `routes/` → thin Express routers
- `controllers/` → request handling (`documentController.js`, `chatController.js`)
- `services/embeddingService.js` → orchestrates embedding generation for a document
- `models/` → Mongoose schemas (`Document`, `Embedding`, `Conversation`, `Message`, `User`)
- `utils/` → the actual RAG/document-processing logic (see below)

### Document ingestion pipeline
1. `documentController.uploadDocument` receives the file (multer, stored in `pdfs/`), tries `pythonServiceClient.processDocumentWithFallback` first (calls the FastAPI service), and falls back to Node-only extraction (`documentProcessor.js`: `pdf-parse`, `mammoth` for DOCX, `tesseract.js` for OCR) if the Python service is unavailable.
2. PPTX files are additionally converted to PDF via the Python service (LibreOffice) for in-browser preview; if LibreOffice isn't installed, this step degrades gracefully (`LIBREOFFICE_NOT_AVAILABLE`).
3. On success, `embeddingService.generateDocumentEmbeddings` runs **in the background** (not awaited by the upload response):
   - `documentProcessor.extractTextWithPageBoundaries` gets correct per-page/per-slide text (PDF.js for PDFs, `--- Slide N ---` markers from the Python service for PPTX, word-count-based logical sections for DOCX).
   - Each page/slide is chunked with document-type-specific parameters (`embeddingService.getChunkingParams`) using `pythonChunker.smartChunk`, which prefers the Python multi-strategy chunker (`python_service/multi_strategy_chunker.py`, spaCy/NLTK-based, per-type strategies for PDF/DOCX/PPTX) and falls back to the Node `RecursiveCharacterTextSplitter` (`utils/semanticChunking.js`) if Python is unavailable.
   - Tables are detected and parsed (`semanticChunking.containsTable`/`parseTableStructure`) and stored as `chunkType: 'table'` with structured data; images are extracted and captioned (`imageExtractor.js`, PDF only) and stored as `chunkType: 'image'`.
   - Embeddings are generated in batches via OpenAI `text-embedding-3-small` and stored in the `Embedding` collection along with page number, chunk type, character offsets, and line ranges.
4. Upload progress (percentage of expected chunks embedded) is tracked in an in-memory `uploadProgressMap` and polled via `GET /api/documents/:id/progress` — this map is per-process, so it does not survive server restarts and won't work across multiple Node instances.

### Query / RAG pipeline (`chatController.generateResponse`, `utils/embeddings.js`)
- Detects explicit page/slide references in the user's question (e.g. "page 5", "slide 3-7") to build an optional `pageFilter`.
- Supports **single-document** and **multi-document (folder)** modes — multi-doc mode retrieves chunks from every document in the folder in parallel, merges and ranks them, and requires citations to include the document name.
- `retrieveRelevantChunks` performs **hybrid search**: MongoDB Atlas `$vectorSearch` (vector similarity) combined with a MongoDB text index (BM25-like keyword search), merged via Reciprocal Rank Fusion. If Atlas Vector Search isn't configured/available, it falls back to in-app cosine similarity over all embeddings for the document.
- Results pass through type-specific similarity thresholds (lower thresholds for images/tables, and much lower thresholds when the user explicitly asked for a specific page), then chunk deduplication, optional cross-encoder/LLM reranking (`utils/reranker.js`), and context building that balances text/table/image chunks (`buildContextFromChunks` / `buildContextFromChunksMultiDoc`, max 4 text + 2 table + 2 image chunks).
- The system prompt sent to OpenAI (`gpt-3.5-turbo`) differs by mode (single-doc normal, single-doc strict-grounding [currently disabled via `strictMode = false`], multi-doc) and mandates citation formats like `[Page 5]` or `[DocName.pdf - Page 5]`.
- After the LLM responds, `verifyCitations` parses citations out of the response and cross-checks them against the pages actually retrieved, flagging hallucinated citations — this analysis is stored on the `Message` and returned to the client for UI display.
- MongoDB Atlas Vector Search requires a configured index named `vector_index` on the `embeddings` collection (see `docs/setup/MONGODB_VECTOR_SEARCH_SETUP.md`); a text index migration exists for keyword search (`backend/migrations/add-text-index.js`).

### Frontend (`client/`)
React + Vite + Tailwind, React Router. `App.jsx` defines routes: `/` (Landing), `/login`, `/register`, `/app` (the single unified authenticated workspace, `pages/UnifiedChat.jsx`) — older `/workspace` and `/chat/:documentId` routes redirect to `/app`. Auth state lives in `hooks/useAuth.jsx` (cookie-based JWT, checked via `/api/auth/me`). Document viewing is format-specific (`components/PDFViewer.jsx`, `DocxViewer.jsx`, `PptxViewer.jsx`, dispatched via `UniversalDocumentViewer.jsx`). API calls go through `services/api.js`.

### Key data model relationships
`Document` (owns `userId`, extracted text, page count, file paths) → `Embedding` (many per document, one per chunk, vector + page/type metadata) → `Conversation` (per document, or per folder for multi-doc mode) → `Message` (role, content, cited pages, citation accuracy metadata).

## Notes for making changes

- When changing chunking, retrieval, or citation logic, keep the Node fallback paths working — the Python microservice is treated as an optional accelerator/quality-improver throughout the codebase, never a hard dependency.
- Similarity thresholds and chunk-type limits in `utils/embeddings.js` (`retrieveRelevantChunks`, `buildContextFromChunks`) were tuned empirically (see inline comments); treat changes to these numbers as behavior-affecting, not cosmetic.
- `docs/` is organized by category (`setup/`, `features/`, `improvements/`, `archive/`) with its own index at `docs/README.md` — check there before writing new setup/feature docs, and prefer updating the relevant existing doc over creating new top-level markdown files.
