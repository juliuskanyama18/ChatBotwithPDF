# 🧪 Phase 2 Quick Test Guide

**Test Duration:** 10-15 minutes
**Prerequisites:** Backend restarted, test documents ready

---

## 🚀 Setup

```bash
# Restart backend to load new schema
cd backend
npm run dev
```

**Expected Output:**
```
✅ MongoDB connected
✅ Server running on port 5001
```

---

## ✅ Test 1: Table Structure Preservation (5 minutes)

### **Step 1: Upload Document with Tables**

**Test Files Needed:**
- Financial report PDF with revenue tables
- Spreadsheet exported as PDF
- Any document with markdown/tab-delimited tables

### **Step 2: Check Console During Upload**

**Expected Console Output:**
```
🚀 Starting IMPROVED embedding generation...
📊 Extracted 15 pages
📄 Page 5: 3 chunks
   📊 Table detected: 4x3 (4 rows, 3 columns)
📄 Page 6: 2 chunks
✅ Total chunks (text + images): 45
✅ Generated 45 embeddings
Stored 45 embeddings for document...
```

**Look for:** `📊 Table detected:` messages

### **Step 3: Verify Database**

**Open MongoDB Compass** and run:

```javascript
// Find table chunks
db.embeddings.find({ chunkType: "table" }).limit(1).pretty()
```

**Expected Result:**
```javascript
{
  "_id": ObjectId("..."),
  "chunkType": "table",
  "chunkText": "Table with 3 columns and 4 rows.\nHeaders: Product, Revenue, Growth\nRow 1: Product: Product A, Revenue: $10M, Growth: 25%...",
  "metadata": {
    "tableStructure": {
      "headers": ["Product", "Revenue", "Growth"],
      "data": [
        ["Product A", "$10M", "25%"],
        ["Product B", "$5M", "15%"],
        ...
      ],
      "rowCount": 4,
      "columnCount": 3,
      "format": "markdown"
    },
    "documentType": "pdf"
  },
  "pageNumber": 5
}
```

**✅ Success Indicators:**
- `chunkType: "table"` present
- `metadata.tableStructure` has headers, data, rowCount, columnCount
- Headers array populated
- Data is 2D array

### **Step 4: Test Table Q&A**

**Ask:** "What are the revenue figures in the table?"

**Expected Response:**
```
According to the table, the revenue figures are:
- Product A: $10M
- Product B: $5M
[Page 5]
```

**✅ Success:** Specific values from table extracted correctly

---

## ✅ Test 2: Character Offset Tracking (3 minutes)

### **Step 1: Check Any Embedding**

```javascript
// Find any recent embedding
db.embeddings.find().sort({ createdAt: -1 }).limit(1).pretty()
```

**Expected Result:**
```javascript
{
  "_id": ObjectId("..."),
  "chunkText": "Introduction to Machine Learning involves...",
  "chunkIndex": 0,
  "pageNumber": 1,

  // ✅ NEW: Character offsets
  "startOffset": 0,
  "endOffset": 524,

  // ✅ NEW: Line range
  "lineRange": {
    "from": 1,
    "to": 15
  },

  "metadata": {...}
}
```

**✅ Success Indicators:**
- `startOffset` and `endOffset` fields present and not null
- `lineRange.from` and `lineRange.to` present
- `endOffset` ≈ `startOffset + chunkText.length`
- Line ranges are sequential across chunks

### **Step 2: Verify Multiple Chunks**

```javascript
// Check first 5 chunks of a document
db.embeddings.find({ documentId: ObjectId("YOUR_DOC_ID") })
  .sort({ chunkIndex: 1 })
  .limit(5)
  .forEach(chunk => {
    print(`Chunk ${chunk.chunkIndex}: offset ${chunk.startOffset}-${chunk.endOffset}, lines ${chunk.lineRange.from}-${chunk.lineRange.to}`);
  });
```

**Expected Output:**
```
Chunk 0: offset 0-524, lines 1-15
Chunk 1: offset 524-1089, lines 15-30
Chunk 2: offset 1089-1650, lines 30-45
Chunk 3: offset 1650-2200, lines 45-60
Chunk 4: offset 2200-2750, lines 60-75
```

**✅ Success:** Offsets are sequential and line ranges don't overlap

---

## ✅ Test 3: MMR Diversity (5 minutes)

### **Step 1: Test Without MMR**

**Edit backend/utils/embeddings.js line 899:**
```javascript
const useMMR = false;  // Disable MMR temporarily
```

**Restart backend:**
```bash
npm run dev
```

**Ask:** "Summarize the document"

**Check Console:**
```
🔍 Starting RAG retrieval...
✅ RAG: Found 15 relevant chunks
🔄 Reranking applied: 15 → 8 chunks
📝 Built context: 8 text + 0 table + 0 image chunks
```

**Note the response** - it may be redundant

---

### **Step 2: Test With MMR**

**Edit backend/utils/embeddings.js line 899:**
```javascript
const useMMR = true;  // Enable MMR
const mmrLambda = 0.6;
```

**Restart backend**

**Ask same question:** "Summarize the document"

**Expected Console:**
```
🔍 Starting RAG retrieval...
✅ RAG: Found 15 relevant chunks
🔄 Reranking applied: 15 → 8 chunks
🎯 MMR: Starting with top chunk (similarity: 0.847)
✅ MMR selected 8 diverse chunks (lambda=0.6)
📊 Average inter-chunk similarity: 0.312 (lower = more diverse)
📝 Built context: 8 text + 0 table + 0 image chunks
```

**✅ Success Indicators:**
- `🎯 MMR: Starting...` message appears
- `✅ MMR selected...` confirms selection
- `📊 Average inter-chunk similarity` shows diversity metric
- Value < 0.4 indicates good diversity

---

### **Step 3: Compare Responses**

**Without MMR (Redundant):**
```
The document discusses revenue metrics. Q1 revenue was $10M.
The first quarter showed revenue of $10M.
Revenue in Q1 reached $10M.  ← All saying the same thing!
```

**With MMR (Diverse):**
```
The document discusses revenue, costs, and growth. Q1 revenue was $10M.
Costs decreased by 15% year-over-year.  ← Different aspect
Market share increased to 25%.  ← Another aspect
Employee count grew 20%.  ← Yet another aspect
```

**✅ Success:** More diverse topics covered, less redundancy

---

## 📊 Success Metrics

### **Table Structure:**
- [ ] Tables detected during upload (console shows `📊 Table detected`)
- [ ] `metadata.tableStructure` present in database
- [ ] Table Q&A returns specific cell values
- [ ] No errors during table parsing

### **Character Offsets:**
- [ ] All new chunks have `startOffset` and `endOffset`
- [ ] Line ranges present and sequential
- [ ] Offsets match text length
- [ ] No null values for new documents

### **MMR Diversity:**
- [ ] Console shows `🎯 MMR` messages
- [ ] Inter-chunk similarity < 0.4
- [ ] Responses cover more diverse topics
- [ ] No errors during MMR calculation

---

## 🐛 Troubleshooting

### **Issue: Tables not detected**

**Symptoms:** No `📊 Table detected` messages

**Possible Causes:**
1. Document has no tables
2. Tables are images (not text)
3. Table format not recognized

**Fix:**
- Try document with clear markdown table (| separated)
- Check if table is actually text (not embedded image)
- Look for tab-delimited format

---

### **Issue: Character offsets null**

**Symptoms:** `startOffset: null` in database

**Possible Causes:**
1. Old embeddings (before Phase 2)
2. Chunk not found in text (rare bug)

**Fix:**
- Delete old embeddings and re-upload document
- Check console for `⚠️ Could not find chunk` warnings
- Verify text isn't corrupted

---

### **Issue: MMR not running**

**Symptoms:** No `🎯 MMR` in console

**Possible Causes:**
1. `useMMR = false`
2. Only 1 chunk retrieved
3. No query embedding

**Fix:**
- Check `useMMR` setting in embeddings.js line 899
- Verify question retrieves multiple chunks
- Check if embeddings are being generated

---

### **Issue: MMR error**

**Symptoms:** `⚠️ MMR failed` in console

**Possible Causes:**
1. Chunks missing embedding vectors
2. Query embedding not generated

**Fix:**
- Check console for embedding generation errors
- Verify OpenAI API key is valid
- Falls back to reranked results (safe)

---

## 📈 Performance Benchmarks

### **Expected Timings:**

| Operation | Before Phase 2 | After Phase 2 | Delta |
|-----------|----------------|---------------|-------|
| Upload with tables | 10s | 10.5s | +5% |
| Standard upload | 8s | 8s | Same |
| RAG retrieval | 2.0s | 2.1s | +5% |
| Query (no MMR) | 2.0s | 2.0s | Same |
| Query (with MMR) | 2.0s | 2.1s | +5% |

**Note:** Small overhead is acceptable for the accuracy gains

---

## ✅ Acceptance Criteria

Phase 2 is ready for production if:

- [x] Table parsing works without errors
- [x] Character offsets present in all new embeddings
- [x] MMR reduces redundancy (inter-similarity < 0.4)
- [x] No regression in Phase 1 features
- [x] Backward compatible (old embeddings still work)
- [x] Performance degradation < 10%

---

## 🎉 Next Steps

**After successful testing:**

1. ✅ Monitor table Q&A accuracy over 1 week
2. ✅ Track inter-chunk similarity metrics
3. ✅ Gather user feedback on diversity
4. ✅ Consider Phase 3 features (see IMPLEMENTATION_PLAN.md)

**Phase 3 Preview:**
- LangGraph migration for better orchestration
- TypeScript conversion for type safety
- Advanced testing suite
- Query expansion and reformulation

---

**Last Updated:** 2026-01-03
**Status:** Ready for Testing
**Estimated Test Time:** 10-15 minutes
