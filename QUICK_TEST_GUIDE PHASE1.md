# 🧪 Quick Test Guide - Phase 1 Features

**Test Duration:** 5-10 minutes
**Prerequisites:** Upload at least one PDF document

---

## ✅ Test 1: Query Routing (2 minutes)

### **Conversational Queries (Should be FAST - No RAG)**

Send these messages and watch the console:

1. **"Hello!"**
   - Expected console: `🎯 Query routed to DIRECT (pattern match - conversational)`
   - Expected response time: **~200-400ms** (very fast)
   - Should NOT see: `🔍 Starting RAG retrieval...`

2. **"Thank you"**
   - Expected console: `💬 DIRECT RESPONSE MODE (no RAG retrieval)`
   - Expected response: Friendly acknowledgment
   - Should NOT retrieve embeddings

3. **"What can you do?"**
   - Expected: Direct response about capabilities
   - No document search needed

### **Document Queries (Should use RAG)**

4. **"What is on page 5?"**
   - Expected console: `🎯 Query routed to RETRIEVE (document-specific keywords)`
   - Expected: `📚 RAG RETRIEVAL MODE (document query detected)`
   - Should see: `🔍 Starting RAG retrieval...`

5. **"Summarize the document"**
   - Expected: Full RAG pipeline runs
   - Expected response time: **~2-3 seconds** (normal)

---

## ✅ Test 2: Citation Verification (2 minutes)

### **Test Accurate Citations**

Ask: **"What does page 5 discuss?"**

**Check Console Logs:**
```
📊 Citation Analysis:
   Total citations: 2
   Valid citations: 2
   Accuracy: 100.0%
✅ Citation Verification: 2 citations, 100% accurate
```

**Check Response JSON:**
```json
{
  "citationAnalysis": {
    "citedPages": [5],
    "citationCount": 2,
    "accuracy": "100.0",
    "isAccurate": true,
    "invalidCitations": []
  }
}
```

### **Database Verification**

Open MongoDB Compass and check the latest message:

```javascript
{
  "_id": "...",
  "role": "assistant",
  "content": "Page 5 discusses revenue metrics [Page 5]...",
  "pageReference": [5],  // ✅ Array, not single number!
  "citationAccuracy": true,
  "metadata": {
    "route": "retrieve",
    "citedPages": [5],
    "citationCount": 2,
    "citationAccuracy": "100.0",
    "invalidCitations": []
  }
}
```

---

## ✅ Test 3: Chunk Deduplication (2 minutes)

### **Find a Document with Repeated Content**
(PDFs with headers/footers on every page work well)

Ask: **"What are the main topics covered?"**

**Check Console Logs:**
```
✂️  Deduplication: 15 → 12 chunks (removed 3 duplicates)
🔄 Skipping exact duplicate: Page 5, Index 2
📝 Built context: 4 text + 0 table + 0 image chunks
```

**What to Look For:**
- Fewer chunks after deduplication
- Log messages about removed duplicates
- No repeated text in the response

---

## ✅ Test 4: Complete Flow Test (3 minutes)

### **Scenario: Mixed Query Session**

1. **"Hello!"** (Direct route)
   - Check console: DIRECT RESPONSE MODE
   - Response time: < 500ms

2. **"What is this chatbot?"** (Direct route)
   - No RAG retrieval
   - Fast response

3. **"What does page 1 say?"** (RAG route)
   - Check console: RAG RETRIEVAL MODE
   - Should see: Hybrid search, deduplication, citation verification
   - Response time: ~2-3 seconds

4. **"Thanks!"** (Direct route)
   - Back to fast mode

---

## 📊 Success Indicators

### **Console Output Should Show:**

✅ **Query Routing:**
```
🎯 Query routed to DIRECT (pattern match - conversational)
⏱️ Query Routing: 45ms

OR

🎯 Query routed to RETRIEVE (document-specific keywords detected)
⏱️ Query Routing: 52ms
```

✅ **Citation Verification (for RAG queries):**
```
✅ Citation Verification: 3 citations, 100% accurate
⏱️ Citation Verification: 8ms
```

✅ **Deduplication:**
```
✂️  Deduplication: 15 → 12 chunks (removed 3 duplicates)
```

✅ **Performance:**
```
⏱️ TOTAL REQUEST TIME: 1,842ms (with RAG)
⏱️ TOTAL REQUEST TIME: 387ms (direct mode)
```

---

## 🔍 Detailed Performance Check

### **Before Phase 1 (Baseline):**

**Any Query (even "Hello"):**
- Embedding generation: ~200ms
- Vector search: ~150ms
- Total: ~2000-2500ms

### **After Phase 1:**

**Conversational Query ("Hello"):**
- Query routing: ~50ms
- Direct LLM call: ~300ms
- Total: ~**350-500ms** ⚡ **5x faster!**

**Document Query ("What is on page 5?"):**
- Query routing: ~50ms
- Embedding generation: ~200ms
- Vector search: ~150ms
- Deduplication: ~10ms
- Citation verification: ~5ms
- Total: ~**1800-2200ms** (slightly faster due to deduplication)

---

## 🐛 Troubleshooting

### **Issue: All queries still run RAG**

**Check:**
- Is `routeQuery()` being called? (Line 287 in chatController.js)
- Are console logs showing routing decisions?
- Try exact test: `"Hello"` - should route to DIRECT

**Fix:**
```javascript
// Verify this code exists at line 287-331:
const route = await routeQuery(prompt, hasDocuments);
if (route === 'direct') {
    // ... direct response logic
}
```

---

### **Issue: Citations not being verified**

**Check:**
- Is `verifyCitations()` being called? (Line 706 in chatController.js)
- Are console logs showing citation analysis?

**Fix:**
- Ensure code exists at line 704-723
- Check that `citationAnalysis` is defined before Message.create

---

### **Issue: Deduplication not working**

**Check:**
- Is `deduplicateChunks()` being called in buildContextFromChunks?
- Line 381 in embeddings.js should call it

**Fix:**
```javascript
// In buildContextFromChunks (line 381):
const dedupedChunks = deduplicateChunks(chunks);
```

---

### **Issue: Database errors with pageReference**

**Error:** `pageReference must be a number`

**Cause:** Old schema cached

**Fix:**
```bash
# Restart the backend server
npm run dev

# Or manually update schema in MongoDB Compass
```

---

## 📈 Monitoring Production

### **Track These Metrics:**

1. **Query Routing Distribution:**
   ```javascript
   // Count messages by route
   db.messages.aggregate([
     { $match: { "metadata.route": { $exists: true } } },
     { $group: { _id: "$metadata.route", count: { $sum: 1 } } }
   ])

   // Expected: 40-60% direct, 40-60% retrieve
   ```

2. **Citation Accuracy:**
   ```javascript
   // Count accurate vs inaccurate citations
   db.messages.aggregate([
     { $match: { citationAccuracy: { $exists: true } } },
     { $group: { _id: "$citationAccuracy", count: { $sum: 1 } } }
   ])

   // Expected: >95% accurate
   ```

3. **Hallucination Rate:**
   ```javascript
   // Find messages with hallucinated citations
   db.messages.find({
     "metadata.invalidCitations": { $exists: true, $ne: [] }
   }).count()

   // Expected: <5% of messages
   ```

---

## ✅ Checklist

Before considering Phase 1 complete:

- [ ] Conversational queries route to DIRECT (console confirms)
- [ ] Document queries route to RETRIEVE (console confirms)
- [ ] Direct mode is faster than RAG mode (check timing logs)
- [ ] Citation analysis appears in console for RAG queries
- [ ] `pageReference` is now an array in database
- [ ] `citationAnalysis` appears in API response
- [ ] Deduplication logs appear when duplicates found
- [ ] No errors in console or database
- [ ] Frontend still works without changes

---

## 🎉 Success!

If all tests pass, Phase 1 is successfully implemented!

**Next Steps:**
1. Monitor production metrics for 1-2 weeks
2. Gather cost savings data
3. Review citation accuracy improvements
4. Decide whether to proceed to Phase 2

**Phase 2 Preview:**
- Table structure preservation
- Character offset tracking
- MMR for diversity
- Advanced testing suite

---

**Questions?** See [PHASE1_IMPLEMENTATION_SUMMARY.md](PHASE1_IMPLEMENTATION_SUMMARY.md) for details.
