# OpenAI Managed RAG - Testing & Implementation Guide

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Starting the Services](#starting-the-services)
4. [API Testing with cURL](#api-testing-with-curl)
5. [Frontend Integration](#frontend-integration)
6. [Troubleshooting](#troubleshooting)
7. [Migration from Old System](#migration-from-old-system)

---

## Prerequisites

### Required Software
- Node.js (v16 or higher)
- Python 3.8+ (for OCR service)
- MongoDB Atlas account (or local MongoDB)
- OpenAI API key with access to Assistants API
- Tesseract OCR (optional, for image/scanned PDF support)
- pdf2image library (optional, for scanned PDF support)

### Python Dependencies
```bash
cd python_service
pip install -r requirements.txt
pip install pdf2image  # For scanned PDF OCR
```

### Node Dependencies
Already installed via `npm install` in root directory.

---

## Environment Setup

### 1. Configure `.env` File

Update your `.env` file with the following:

```env
# OpenAI API Key (REQUIRED)
OPENAI_API_KEY=sk-proj-YOUR_KEY_HERE

# Feature Flags
USE_MANAGED_RAG=true   # Enable managed RAG
USE_PYTHON_OCR=true    # Enable OCR support
STRICT_GROUNDING=false # Strict document grounding

# Python Service
PYTHON_SERVICE_URL=http://localhost:8000

# MongoDB & JWT (already configured)
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
```

### 2. Feature Flag Options

**`USE_MANAGED_RAG`**
- `true`: Use OpenAI Vector Stores + Assistants API (NEW system)
- `false`: Use custom embeddings + MongoDB Vector Search (OLD system)
- **Default**: `false` (safe rollback)

**`USE_PYTHON_OCR`**
- `true`: Enable OCR for images and scanned PDFs
- `false`: Skip OCR processing
- **Default**: `true`

**`STRICT_GROUNDING`**
- `true`: Assistant refuses to answer if no relevant documents found
- `false`: Assistant may use general knowledge
- **Default**: `false`

---

## Starting the Services

### Terminal 1: Backend Server
```bash
npm run dev
# Or: node app.js
```

Expected output:
```
========================================
🚀 ChatBotwithPDF Server Started
📍 Server running on port 3600
🌐 URL: http://localhost:3600
📁 Backend: MVC Structure ✅
========================================

🚩 Feature Flags:
   USE_MANAGED_RAG: ✅ Enabled
   USE_PYTHON_OCR: ✅ Enabled
   STRICT_GROUNDING: ❌ Disabled

✅ Python Document Processing Service is HEALTHY
✅ Server ready to accept requests
```

### Terminal 2: Python OCR Service
```bash
cd python_service
python document_service.py
```

Expected output:
```
INFO: Starting Document Processing Service...
INFO: Service will be available at: http://localhost:8000
INFO: API docs available at: http://localhost:8000/docs
```

### Terminal 3: React Frontend
```bash
cd client
npm run dev
```

---

## API Testing with cURL

### Step 1: Register/Login

**Register:**
```bash
curl -X POST http://localhost:3600/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "fullName": "Test User"
  }' \
  -c cookies.txt
```

**Login:**
```bash
curl -X POST http://localhost:3600/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }' \
  -c cookies.txt
```

### Step 2: Create a Workspace

```bash
curl -X POST http://localhost:3600/api/workspaces \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "name": "My Research Project",
    "description": "Documents for my research"
  }'
```

Expected response:
```json
{
  "success": true,
  "workspace": {
    "_id": "workspace_id_here",
    "name": "My Research Project",
    "description": "Documents for my research",
    "openaiVectorStoreId": "vs_xxx",
    "openaiAssistantId": "asst_xxx",
    "createdAt": "2025-01-01T00:00:00.000Z"
  }
}
```

**Save the workspace ID for next steps!**

### Step 3: Upload a Document

```bash
curl -X POST http://localhost:3600/api/managed-rag/upload \
  -b cookies.txt \
  -F "file=@/path/to/document.pdf" \
  -F "workspaceId=YOUR_WORKSPACE_ID"
```

Expected response:
```json
{
  "success": true,
  "documentId": "doc_id_here",
  "fileName": "1234567890-document.pdf",
  "status": "processing",
  "message": "Document is being indexed..."
}
```

### Step 4: Check Document Status

```bash
curl -X GET http://localhost:3600/api/managed-rag/documents/DOCUMENT_ID/status \
  -b cookies.txt
```

Expected responses:
```json
// Processing:
{
  "success": true,
  "document": {
    "_id": "doc_id",
    "originalName": "document.pdf",
    "status": "indexing",
    "pageCount": 10
  }
}

// Ready:
{
  "success": true,
  "document": {
    "_id": "doc_id",
    "originalName": "document.pdf",
    "status": "ready",
    "pageCount": 10
  }
}
```

### Step 5: Chat with Documents

```bash
curl -X POST http://localhost:3600/api/managed-rag/chat \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "workspaceId": "YOUR_WORKSPACE_ID",
    "message": "What are the main findings in the documents?"
  }'
```

Expected response:
```json
{
  "success": true,
  "answer": "Based on the documents in your workspace, the main findings are...",
  "citations": [
    {
      "index": 0,
      "fileId": "file-xxx",
      "quote": "...relevant excerpt...",
      "documentId": "doc_id",
      "fileName": "document.pdf",
      "pageNumber": null,
      "textRange": {
        "start": 123,
        "end": 456
      }
    }
  ],
  "usedDocuments": ["doc_id_1", "doc_id_2"],
  "conversationId": "conv_id",
  "openaiThreadId": "thread_xxx"
}
```

### Step 6: Summarize Documents

**Summarize Single Document:**
```bash
curl -X POST http://localhost:3600/api/managed-rag/summarize \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "documentId": "YOUR_DOCUMENT_ID"
  }'
```

**Summarize Entire Workspace:**
```bash
curl -X POST http://localhost:3600/api/managed-rag/summarize \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "workspaceId": "YOUR_WORKSPACE_ID"
  }'
```

Expected response:
```json
{
  "success": true,
  "summary": "## Summary\n\nThe document discusses...\n\n## Key Points\n- Point 1\n- Point 2\n\n...",
  "citations": [...],
  "usedDocuments": [...]
}
```

### Step 7: Test OCR (Image Upload)

```bash
curl -X POST http://localhost:3600/api/managed-rag/upload \
  -b cookies.txt \
  -F "file=@/path/to/scanned_document.png" \
  -F "workspaceId=YOUR_WORKSPACE_ID"
```

The system will:
1. Detect it's an image
2. Send to Python OCR service
3. Extract text via Tesseract
4. Upload extracted text to OpenAI
5. Index in vector store

### Step 8: Delete Document

```bash
curl -X DELETE http://localhost:3600/api/managed-rag/documents/DOCUMENT_ID \
  -b cookies.txt
```

### Step 9: List All Workspaces

```bash
curl -X GET http://localhost:3600/api/workspaces \
  -b cookies.txt
```

---

## Frontend Integration

### Example: Upload Document with Progress

```javascript
import { managedRagAPI } from './services/api';

async function uploadDocument(file, workspaceId) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('workspaceId', workspaceId);

  try {
    // Initial upload
    const response = await managedRagAPI.uploadDocument(formData);
    const { documentId, status } = response.data;

    // Poll for status
    const checkStatus = async () => {
      const statusResponse = await managedRagAPI.getDocumentStatus(documentId);
      const { status } = statusResponse.data.document;

      if (status === 'ready') {
        console.log('Document ready!');
        return true;
      } else if (status === 'error') {
        console.error('Document processing failed');
        return false;
      }

      // Continue polling
      setTimeout(checkStatus, 2000);
    };

    await checkStatus();
  } catch (error) {
    console.error('Upload failed:', error);
  }
}
```

### Example: Chat with Citations

```javascript
import { managedRagAPI } from './services/api';

async function chatWithDocuments(workspaceId, message) {
  try {
    const response = await managedRagAPI.chat({
      workspaceId,
      message
    });

    const { answer, citations } = response.data;

    // Display answer
    console.log('Answer:', answer);

    // Display citations
    citations.forEach(citation => {
      console.log(`Source: ${citation.fileName}`);
      console.log(`Quote: "${citation.quote}"`);
    });
  } catch (error) {
    console.error('Chat failed:', error);
  }
}
```

---

## Troubleshooting

### Issue: "Vector store not configured"
**Cause:** Workspace was created before enabling managed RAG

**Solution:**
1. Set `USE_MANAGED_RAG=true` in `.env`
2. Restart backend server
3. Create a new workspace
4. Or manually create vector store and update workspace record

### Issue: "OCR service not available"
**Cause:** Python service not running or Tesseract not installed

**Solution:**
1. Start Python service: `python python_service/document_service.py`
2. Install Tesseract: https://github.com/tesseract-ocr/tesseract
3. Or set `USE_PYTHON_OCR=false` to disable OCR

### Issue: "No text extracted from image"
**Cause:** Image quality too poor or Tesseract misconfigured

**Solution:**
1. Check Tesseract installation
2. Verify image is clear and readable
3. Check Python service logs for errors

### Issue: "Run polling timed out"
**Cause:** Assistants API taking too long (large documents)

**Solution:**
1. Increase timeout in `pollRunStatus()` function
2. Check OpenAI API status
3. Reduce document size

### Issue: "Citations not showing page numbers"
**Cause:** OpenAI doesn't provide granular page citations

**Solution:**
- This is a limitation of OpenAI's file_search tool
- Citations include document name and text excerpts
- For page-level citations, use custom extraction (future enhancement)

---

## Migration from Old System

### Option 1: Gradual Migration (Recommended)

1. **Set feature flag to false initially:**
   ```env
   USE_MANAGED_RAG=false
   ```

2. **Deploy new code (routes exist but inactive)**

3. **Create test workspace:**
   ```bash
   # Set USE_MANAGED_RAG=true temporarily
   curl -X POST http://localhost:3600/api/workspaces ...
   ```

4. **Upload test documents to new workspace**

5. **Compare quality:** Test both old and new systems side-by-side

6. **Enable for production:**
   ```env
   USE_MANAGED_RAG=true
   ```

7. **Migrate existing documents:**
   ```bash
   curl -X POST http://localhost:3600/api/workspaces/migrate-documents \
     -H "Content-Type: application/json" \
     -b cookies.txt \
     -d '{
       "workspaceId": "new_workspace_id",
       "documentIds": ["doc1", "doc2", "doc3"]
     }'
   ```

### Option 2: Fresh Start

1. **Set feature flag:**
   ```env
   USE_MANAGED_RAG=true
   ```

2. **Restart services**

3. **Create new workspaces**

4. **Re-upload all documents**

5. **Old data remains in database for rollback**

---

## Performance Benchmarks

### Upload Times (Approximate)
- Small PDF (1-10 pages): 5-15 seconds
- Medium PDF (10-50 pages): 15-45 seconds
- Large PDF (50+ pages): 45-120 seconds
- Scanned PDF with OCR: +50-200% additional time

### Chat Response Times
- Simple question: 3-8 seconds
- Complex question (multiple documents): 8-20 seconds
- Summarization: 15-60 seconds

### Cost Estimates (OpenAI)
- Vector storage: $0.10/GB/day
- GPT-4 Turbo: ~$0.01-0.03 per query
- File upload: Free
- Expected monthly cost for 100 documents, 1000 queries: ~$30-50

---

## API Rate Limits

OpenAI API limits (as of 2025):
- Assistants API: 100 requests/minute
- File uploads: 100 files/day (free tier)
- Vector stores: 1 per workspace

If you hit rate limits:
- Add retry logic with exponential backoff
- Implement request queuing
- Consider upgrading OpenAI plan

---

## Next Steps

1. ✅ **Test basic workflow** (create workspace → upload → chat)
2. ✅ **Test OCR functionality** (upload image/scanned PDF)
3. ✅ **Test summarization**
4. ⏭️ **Integrate with frontend UI**
5. ⏭️ **Add citation click handlers** (scroll to page)
6. ⏭️ **Implement upload progress UI**
7. ⏭️ **Add workspace management UI**
8. ⏭️ **Production deployment**

---

## Support & Resources

- **OpenAI Assistants API Docs:** https://platform.openai.com/docs/assistants
- **Vector Stores Guide:** https://platform.openai.com/docs/assistants/tools/file-search
- **Tesseract OCR:** https://github.com/tesseract-ocr/tesseract
- **Migration Plan:** See `OPENAI_MANAGED_RAG_MIGRATION.md`

---

## Quick Test Script

Save as `test_managed_rag.sh`:

```bash
#!/bin/bash

# Configuration
API_URL="http://localhost:3600"
EMAIL="test@example.com"
PASSWORD="password123"

# 1. Login
echo "Logging in..."
curl -X POST $API_URL/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
  -c cookies.txt \
  -s | jq

# 2. Create workspace
echo -e "\nCreating workspace..."
WORKSPACE=$(curl -X POST $API_URL/api/workspaces \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"name":"Test Workspace","description":"Testing managed RAG"}' \
  -s | jq)

WORKSPACE_ID=$(echo $WORKSPACE | jq -r '.workspace._id')
echo "Workspace ID: $WORKSPACE_ID"

# 3. Upload document
echo -e "\nUploading document..."
UPLOAD=$(curl -X POST $API_URL/api/managed-rag/upload \
  -b cookies.txt \
  -F "file=@./test.pdf" \
  -F "workspaceId=$WORKSPACE_ID" \
  -s | jq)

DOC_ID=$(echo $UPLOAD | jq -r '.documentId')
echo "Document ID: $DOC_ID"

# 4. Wait and check status
echo -e "\nWaiting for indexing..."
sleep 10

curl -X GET $API_URL/api/managed-rag/documents/$DOC_ID/status \
  -b cookies.txt \
  -s | jq

# 5. Chat
echo -e "\nSending chat message..."
curl -X POST $API_URL/api/managed-rag/chat \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d "{\"workspaceId\":\"$WORKSPACE_ID\",\"message\":\"What is this document about?\"}" \
  -s | jq

echo -e "\n✅ Test complete!"
```

Make executable: `chmod +x test_managed_rag.sh`
Run: `./test_managed_rag.sh`
