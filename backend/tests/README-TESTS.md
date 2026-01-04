# RAG Improvement Testing Guide

## Overview

This testing suite verifies that Phase 1 (Semantic Chunking + Page Extraction) and Phase 2 (Reranking) are working correctly.

## Quick Start

### 1. Provide Your Test Data

Please provide:
- **Test PDF Document**: A multi-page PDF (5+ pages recommended)
- **Test Questions**: 3-5 questions that have answers in the document
- **Expected Page Numbers**: Which pages should contain the answers

### 2. Run Automated Tests

```bash
# From project root
cd backend
node tests/rag-improvement-tests.js
```

## What Gets Tested

### ✅ Phase 1 Tests

#### Test 1: Semantic Chunking Quality
- **What**: Verifies chunks preserve sentence boundaries
- **How**: Checks that chunks don't break mid-sentence
- **Pass Criteria**: All chunks start with capital letter and end with punctuation
- **Expected**: 100% pass rate

#### Test 2: Page Extraction Accuracy
- **What**: Verifies PDF.js extracts correct page boundaries
- **How**: Extracts pages and checks sequential numbering
- **Pass Criteria**: Pages are sequential and all have content
- **Expected**: 100% pass rate

#### Test 3: Citation Accuracy
- **What**: Tests if correct page numbers are retrieved
- **How**: Queries document and checks page references
- **Pass Criteria**: Retrieved pages match expected pages
- **Expected**: 90%+ accuracy

#### Test 4: Text Preprocessing
- **What**: Verifies text cleaning works correctly
- **How**: Tests whitespace normalization, header removal
- **Pass Criteria**: Clean text without artifacts
- **Expected**: 100% pass rate

### ✅ Phase 2 Tests

#### Test 5: Reranking Effectiveness
- **What**: Verifies reranking improves chunk ordering
- **How**: Ranks test chunks and checks keyword matching
- **Pass Criteria**: Most relevant chunk ranked first
- **Expected**: 90%+ accuracy

#### Test 6: Keyword Overlap
- **What**: Tests keyword matching works
- **How**: Checks Jaccard similarity calculation
- **Pass Criteria**: Keywords are detected and scored
- **Expected**: 100% pass rate

## Sample Test Output

```
🧪 RAG Improvement Testing Suite
Testing Phase 1 (Semantic Chunking) and Phase 2 (Reranking)

🔌 Connecting to MongoDB...
✅ Connected to MongoDB

📝 TEST 1: Semantic Chunking Quality
════════════════════════════════════════════════════════════
✅ All chunks preserve sentence boundaries
✅ Chunks have proper overlap
⏱️  Chunking time: 45ms

🧹 TEST 2: Text Preprocessing
════════════════════════════════════════════════════════════
✅ Multiple spaces normalized
✅ Excessive newlines removed
✅ Page headers removed

📄 TEST 3: Page Extraction Accuracy
════════════════════════════════════════════════════════════
✅ Extracted 12 pages
✅ Page numbers are sequential
✅ All pages have content
⏱️  Extraction time: 156ms

🎯 TEST 4: Citation Accuracy
════════════════════════════════════════════════════════════
📝 Test questions: 3
   Question 1: "What is the main topic of page 3?"
   Expected page: 3

🔄 TEST 5: Reranking Effectiveness
════════════════════════════════════════════════════════════
✅ Most relevant chunk ranked first
   Top chunk: "Q4 2023 financial results showed revenue growth of 25%..."
✅ Rerank scores assigned to all chunks
   Top 3 scores: 0.892, 0.851, 0.823
✅ Keyword overlap detected: 42.0%
⏱️  Reranking time: 12ms


══════════════════════════════════════════════════════════════════════
                    📊 TEST REPORT SUMMARY
══════════════════════════════════════════════════════════════════════

🔹 PHASE 1: Semantic Chunking + Page Extraction
   Chunking Tests:        5/5 passed
   Page Extraction Tests: 3/3 passed
   Citation Tests:        0/0 passed
   Overall: 8/8 (100%)

🔹 PHASE 2: Reranking
   Reranking Tests:  3/3 passed
   Relevance Tests:  0/0 passed
   Overall: 3/3 (100%)

🔹 PERFORMANCE METRICS
   Chunking Time:    45ms
   Extraction Time:  156ms
   Reranking Time:   12ms

══════════════════════════════════════════════════════════════════════
                TOTAL: 11/11 tests passed (100%)
══════════════════════════════════════════════════════════════════════

✅ EXCELLENT: RAG improvements working as expected!
```

## Manual Testing (Recommended)

For comprehensive testing, also test manually:

### Manual Test Steps:

1. **Start your backend server**
   ```bash
   cd backend
   npm start
   ```

2. **Upload your test document**
   - Go to your app
   - Upload the test PDF
   - Wait for embeddings to generate

3. **Ask test questions**
   - Ask each test question
   - Check the console logs for:
     ```
     📄 Extracting PDF with page boundaries...
        ✅ PDF.js extracted 12/12 pages

     🔄 Cross-encoder reranking 15 chunks...
        ✅ Reranked to top 8 chunks
        📊 Top 3 scores: 0.912, 0.879, 0.843
     ```

4. **Verify citations**
   - Click on citations in the answer
   - Verify they jump to the correct page
   - Confirm page numbers match your expectations

## Expected Results

### ✅ Success Indicators:

- [ ] Console shows "PDF.js extracted X/Y pages"
- [ ] Chunks preserve sentence boundaries
- [ ] Citations show correct page numbers
- [ ] Clicking citations navigates to correct pages
- [ ] Reranking logs appear in console
- [ ] Answers are more relevant than before

### ❌ Failure Indicators:

- [ ] "PDF.js failed" errors
- [ ] Wrong page numbers in citations
- [ ] Broken chunk text
- [ ] No reranking logs
- [ ] Poor answer quality

## Troubleshooting

### Issue: Tests fail with "Cannot find module"
**Solution**: Make sure you're in the `backend` directory
```bash
cd backend
node tests/rag-improvement-tests.js
```

### Issue: Database connection error
**Solution**: Check `.env` file has correct `MONGODB_URI`

### Issue: Page extraction fails
**Solution**: Make sure `pdfjs-dist` is installed:
```bash
npm install pdfjs-dist
```

## Next Steps

After testing:

1. **If all tests pass**: ✅ Your RAG improvements are working!
2. **If some tests fail**: Review console output for specific errors
3. **For production**: Monitor real user queries and citation accuracy

## Questions?

- Check console logs for detailed error messages
- Review test results in the report summary
- Compare before/after answer quality manually
