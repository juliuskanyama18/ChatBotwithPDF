# OpenAI Managed RAG Migration Plan

## Overview
Migrating from custom MongoDB Vector Search + embeddings to OpenAI's managed RAG using Vector Stores and Assistants API with `file_search` tool.

## Architecture Changes

### Before (Current)
```
User uploads doc → Extract text → Generate embeddings (OpenAI) → Store in MongoDB
User asks question → Generate query embedding → Vector search MongoDB → Build context → GPT-4
```

### After (Managed RAG)
```
User uploads doc → Extract text → Upload to OpenAI → Add to Vector Store → Store file ID
User asks question → Assistants API with file_search tool → Returns answer + citations
```

## Database Schema Changes

### 1. NEW: Workspace Model (`backend/models/Workspace.js`)
```javascript
{
  name: String,
  userId: ObjectId,
  openaiVectorStoreId: String,  // NEW: OpenAI vector store ID
  createdAt: Date,
  updatedAt: Date
}
```

### 2. UPDATED: Document Model
```javascript
{
  // Existing fields
  userId: ObjectId,
  originalName: String,
  fileName: String,
  filePath: String,
  fileSize: Number,
  language: String,
  pageCount: Number,
  extractedText: String,

  // NEW fields for OpenAI managed RAG
  workspaceId: ObjectId,                    // Link to workspace
  openaiFileId: String,                     // OpenAI file ID
  openaiVectorStoreId: String,              // OpenAI vector store ID
  sourceType: String,                       // 'file' | 'ocr_text'
  status: String,                           // 'uploading' | 'indexing' | 'ready' | 'error'
  ocrSourceDocumentId: ObjectId,            // If sourceType='ocr_text', link to original
  processingError: String,                  // Error message if status='error'

  // Keep for backward compatibility (feature flag)
  convertedPdfPath: String,
  uploadedAt: Date
}
```

### 3. UPDATED: Conversation Model
```javascript
{
  userId: ObjectId,
  documentId: ObjectId,        // Keep for single-doc chat
  workspaceId: ObjectId,       // NEW: For workspace-level chat
  title: String,
  openaiThreadId: String,      // NEW: OpenAI thread ID for Assistants API
  createdAt: Date,
  updatedAt: Date
}
```

## Environment Variables

Add to `.env`:
```env
# Feature flag
USE_MANAGED_RAG=true

# OpenAI configuration (already exists)
OPENAI_API_KEY=sk-proj-...

# Optional: Global vector store (if not using per-workspace)
# OPENAI_VECTOR_STORE_ID=vs_xxx

# Python OCR service
PYTHON_SERVICE_URL=http://localhost:8000
```

## API Endpoints

### Document Upload
**Endpoint:** `POST /api/docs/upload` (UPDATE existing)

**Flow:**
1. Accept file upload (PDF/DOCX/PPTX/TXT/images)
2. If image or scanned PDF → call Python `/ocr`
3. Upload to OpenAI (original file or OCR text as .txt)
4. Add to workspace vector store
5. Save to MongoDB with `openaiFileId` and status
6. Return document metadata

**Request:**
```javascript
FormData: {
  file: File,
  workspaceId: String  // NEW
}
```

**Response:**
```javascript
{
  documentId: String,
  fileName: String,
  status: 'indexing',  // then 'ready'
  openaiFileId: String,
  pageCount: Number,
  documentType: String
}
```

### Chat with Documents
**Endpoint:** `POST /api/chat/managed` (NEW)

**Flow:**
1. Get/create OpenAI thread
2. Create message with user question
3. Create run with Assistant + file_search tool
4. Poll for completion
5. Extract answer + citations (annotations)
6. Map citations to page/slide numbers
7. Save to MongoDB
8. Return formatted response

**Request:**
```javascript
{
  workspaceId: String,
  documentIds: [String],  // Optional: filter to specific docs
  message: String,
  conversationId: String  // Optional: continue conversation
}
```

**Response:**
```javascript
{
  answer: String,
  citations: [
    {
      documentId: String,
      fileName: String,
      pageNumber: Number,      // if available
      slideNumber: Number,     // if PPTX
      quoteSnippet: String,    // text excerpt
      score: Number            // optional relevance
    }
  ],
  usedDocuments: [String],     // document IDs used
  conversationId: String,
  openaiThreadId: String
}
```

### Summarize Document
**Endpoint:** `POST /api/docs/summarize` (NEW)

**Request:**
```javascript
{
  documentId: String,  // or workspaceId
  workspaceId: String
}
```

**Response:**
```javascript
{
  summary: String,
  keyPoints: [String],
  pageReferences: [Number]
}
```

### Delete Document
**Endpoint:** `DELETE /api/docs/:id` (UPDATE)

**Flow:**
1. Find document in MongoDB
2. Remove from OpenAI vector store
3. Delete OpenAI file (if not used elsewhere)
4. Delete from MongoDB
5. Delete conversations/messages

## Implementation Files

### Backend

#### 1. Models
- `backend/models/Workspace.js` (NEW)
- `backend/models/Document.js` (UPDATE)
- `backend/models/Conversation.js` (UPDATE)

#### 2. Services
- `backend/services/openaiVectorStore.js` (NEW)
  - `createVectorStore(name)`
  - `uploadFileToOpenAI(filePath, purpose)`
  - `addFileToVectorStore(fileId, vectorStoreId)`
  - `removeFileFromVectorStore(fileId, vectorStoreId)`
  - `deleteOpenAIFile(fileId)`

- `backend/services/openaiAssistant.js` (NEW)
  - `createAssistant(vectorStoreId)`
  - `createThread()`
  - `addMessage(threadId, content)`
  - `runAssistant(threadId, assistantId, instructions)`
  - `pollRunStatus(threadId, runId)`
  - `getMessages(threadId)`
  - `extractCitations(annotations)`

#### 3. Controllers
- `backend/controllers/managedRagController.js` (NEW)
  - `uploadDocumentManaged(req, res)`
  - `chatWithManagedRAG(req, res)`
  - `summarizeDocument(req, res)`
  - `deleteDocumentManaged(req, res)`

- `backend/controllers/workspaceController.js` (NEW)
  - `createWorkspace(req, res)`
  - `getAllWorkspaces(req, res)`
  - `getWorkspaceById(req, res)`
  - `deleteWorkspace(req, res)`

#### 4. Routes
- `backend/routes/managedRag.js` (NEW)
- `backend/routes/workspaces.js` (NEW)

#### 5. Utilities
- `backend/utils/ocrClient.js` (NEW)
  - `detectIfScannedPDF(filePath)`
  - `sendToOCR(filePath)`

- `backend/utils/featureFlags.js` (NEW)
  - `isFeatureEnabled(flagName)`
  - `USE_MANAGED_RAG`

### Python Service

#### OCR Endpoint
**File:** `python_service/document_service.py` (UPDATE)

**New endpoint:** `POST /ocr`

**Libraries needed:**
- `pytesseract` for OCR
- `pdf2image` for PDF page images
- `Pillow` for image handling

**Flow:**
1. Accept image or PDF
2. Extract images (if PDF)
3. Run OCR on each page
4. Return structured text with page markers

### Frontend

#### 1. API Service
**File:** `client/src/services/api.js` (UPDATE)

Add:
```javascript
export const managedRagAPI = {
  uploadDocument: (formData) => api.post('/api/docs/upload', formData),
  chat: (data) => api.post('/api/chat/managed', data),
  summarize: (documentId) => api.post('/api/docs/summarize', { documentId }),
  deleteDocument: (id) => api.delete(`/api/docs/${id}`)
};

export const workspacesAPI = {
  getAll: () => api.get('/api/workspaces'),
  create: (data) => api.post('/api/workspaces', data),
  getById: (id) => api.get(`/api/workspaces/${id}`),
  delete: (id) => api.delete(`/api/workspaces/${id}`)
};
```

#### 2. Components
**File:** `client/src/pages/ChatInterface.jsx` (UPDATE)

Changes:
- Show upload progress: Uploading → Indexing → Ready
- Display citations with file name + page number
- Add "Summarize" button
- Handle workspace selection

**File:** `client/src/components/Citation.jsx` (NEW)

Display clickable citations:
```jsx
<Citation
  fileName="report.pdf"
  pageNumber={5}
  snippet="..."
  onClick={() => scrollToPage(5)}
/>
```

## Migration Strategy

### Phase 1: Add Feature Flag (No Breaking Changes)
1. Add `USE_MANAGED_RAG=false` to `.env`
2. Deploy new models and services (unused)
3. Add new routes (parallel to existing)
4. Test in dev environment

### Phase 2: Enable for New Uploads
1. Set `USE_MANAGED_RAG=true`
2. New documents use managed RAG
3. Old documents still use custom embeddings
4. Both systems run in parallel

### Phase 3: Migration Script
1. For each existing document:
   - Upload to OpenAI
   - Add to vector store
   - Update MongoDB record
   - Keep old embeddings for rollback

### Phase 4: Full Cutover
1. Remove custom embedding generation
2. Archive old embedding collections
3. Remove old code paths

## Testing Checklist

### Backend
- [ ] Create workspace → OpenAI vector store created
- [ ] Upload PDF → File uploaded to OpenAI, added to vector store
- [ ] Upload image → OCR called, text uploaded to OpenAI
- [ ] Chat → Assistants API returns answer with citations
- [ ] Citations → Page numbers correctly mapped
- [ ] Summarize → Summary generated from documents
- [ ] Delete document → Removed from OpenAI and MongoDB
- [ ] Feature flag OFF → Falls back to old system

### Frontend
- [ ] Upload shows "Indexing..." status
- [ ] Chat displays citations with page numbers
- [ ] Clicking citation scrolls to page
- [ ] Summarize button works
- [ ] Error handling for failed uploads

### Integration
- [ ] OCR integration works for scanned PDFs
- [ ] OCR integration works for images (PNG, JPG)
- [ ] Per-workspace isolation (no cross-user leakage)
- [ ] Chat history persists correctly

## Rollback Plan

If issues arise:
1. Set `USE_MANAGED_RAG=false` in `.env`
2. System reverts to custom embeddings
3. Old data still intact
4. Fix issues and retry

## Performance Considerations

### Advantages
- No embedding generation delay
- No vector search infrastructure
- OpenAI handles chunking/indexing
- Better citation quality

### Disadvantages
- API latency (Assistants API polling)
- Cost per request vs. self-hosted
- Dependence on OpenAI availability

## Cost Estimation

### OpenAI Costs
- File storage: $0.10/GB/day
- Vector store operations: Free
- Assistants API: Standard GPT-4 pricing
- file_search tool: $0.10 per GB per day

### Example:
- 100 documents × 1MB avg = 100MB = $0.01/day
- 1000 queries/day = ~$30/day (GPT-4 Turbo)

## Security Considerations

1. **Data Privacy:** Files uploaded to OpenAI (review Terms of Service)
2. **Access Control:** Per-workspace vector stores prevent cross-user access
3. **API Key Security:** Store in environment variables, never commit
4. **Input Validation:** Sanitize file uploads, user messages
5. **Rate Limiting:** Implement to prevent abuse

## Next Steps

1. Review and approve this plan
2. Implement backend models and services
3. Implement OCR endpoint in Python
4. Implement managed RAG controllers
5. Update frontend components
6. Test thoroughly in dev environment
7. Deploy with feature flag OFF
8. Enable feature flag for testing
9. Migrate existing data
10. Full production rollout

---

**Estimated Timeline:**
- Backend implementation: 2-3 days
- Python OCR: 1 day
- Frontend updates: 1-2 days
- Testing & migration: 1-2 days
- **Total: 5-8 days**

**Priority:** High - Improves accuracy and reduces maintenance burden
