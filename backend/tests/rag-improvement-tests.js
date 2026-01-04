/**
 * RAG Improvement Testing Suite
 * Tests Phase 1 (Semantic Chunking + Page Extraction) and Phase 2 (Reranking)
 *
 * Run: node backend/tests/rag-improvement-tests.js
 */

import { config } from 'dotenv';
import mongoose from 'mongoose';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
config();

// ES Module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import utilities
import { RecursiveCharacterTextSplitter, preprocessText } from '../utils/semanticChunking.js';
import { extractTextWithPageBoundaries } from '../utils/documentProcessor.js';
import { crossEncoderRerank } from '../utils/reranker.js';
import { generateEmbedding, semanticSearch, hybridSearch } from '../utils/embeddings.js';
import Document from '../models/Document.js';
import Embedding from '../models/Embedding.js';

// Test configuration
const TEST_CONFIG = {
    testDocumentPath: null,  // Will be set by user
    testQuestions: [],       // Will be set by user
    expectedPages: {},       // Will be set by user
};

// Test results storage
const testResults = {
    phase1: {
        chunking: { passed: 0, failed: 0, details: [] },
        pageExtraction: { passed: 0, failed: 0, details: [] },
        citations: { passed: 0, failed: 0, details: [] }
    },
    phase2: {
        reranking: { passed: 0, failed: 0, details: [] },
        relevance: { passed: 0, failed: 0, details: [] }
    },
    performance: {
        chunkingTime: 0,
        extractionTime: 0,
        rerankingTime: 0
    }
};

/**
 * Initialize database connection
 */
async function connectDatabase() {
    try {
        console.log('\n🔌 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');
    } catch (error) {
        console.error('❌ Database connection failed:', error);
        process.exit(1);
    }
}

/**
 * Disconnect from database
 */
async function disconnectDatabase() {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
}

/**
 * TEST 1: Semantic Chunking Quality
 * Verifies chunks preserve sentence boundaries and have proper overlap
 */
async function testSemanticChunking() {
    console.log('\n📝 TEST 1: Semantic Chunking Quality');
    console.log('═'.repeat(60));

    const sampleText = `
    The company reported strong financial results for Q4 2023. Revenue increased by 25% year-over-year.

    Operating expenses decreased by 10% due to efficiency improvements. The board approved a new dividend policy.

    Future outlook remains positive with expansion plans in Asia. Market share grew from 15% to 18% in key segments.
    `;

    const startTime = Date.now();
    const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 800,
        chunkOverlap: 100,
        separators: ['\n\n', '\n', '. ', ' ', '']
    });

    const chunks = splitter.splitText(sampleText);
    testResults.performance.chunkingTime = Date.now() - startTime;

    // Test 1.1: Chunks should not break mid-sentence
    let brokenChunks = 0;
    chunks.forEach((chunk, idx) => {
        const endsWithPunctuation = /[.!?]\s*$/.test(chunk.trim());
        const startsWithCapital = /^[A-Z]/.test(chunk.trim());

        if (!endsWithPunctuation || !startsWithCapital) {
            brokenChunks++;
            testResults.phase1.chunking.details.push({
                test: 'Sentence Boundary',
                chunk: idx + 1,
                status: 'FAIL',
                reason: 'Chunk breaks mid-sentence'
            });
        }
    });

    if (brokenChunks === 0) {
        testResults.phase1.chunking.passed++;
        console.log('✅ All chunks preserve sentence boundaries');
    } else {
        testResults.phase1.chunking.failed++;
        console.log(`❌ ${brokenChunks} chunks break mid-sentence`);
    }

    // Test 1.2: Overlap verification
    let hasOverlap = false;
    for (let i = 0; i < chunks.length - 1; i++) {
        const currentChunk = chunks[i];
        const nextChunk = chunks[i + 1];

        // Check if there's any text overlap
        const currentWords = currentChunk.split(/\s+/).slice(-20);
        const nextWords = nextChunk.split(/\s+/).slice(0, 20);

        const overlap = currentWords.some(word =>
            word.length > 3 && nextWords.includes(word)
        );

        if (overlap) {
            hasOverlap = true;
            break;
        }
    }

    if (hasOverlap) {
        testResults.phase1.chunking.passed++;
        console.log('✅ Chunks have proper overlap');
    } else {
        testResults.phase1.chunking.failed++;
        console.log('❌ No overlap detected between chunks');
    }

    console.log(`⏱️  Chunking time: ${testResults.performance.chunkingTime}ms`);
}

/**
 * TEST 2: Page Extraction Accuracy
 * Verifies correct page boundaries for PDF documents
 */
async function testPageExtraction(testDocPath) {
    console.log('\n📄 TEST 2: Page Extraction Accuracy');
    console.log('═'.repeat(60));

    if (!testDocPath) {
        console.log('⏭️  Skipping (no test document provided)');
        return;
    }

    const startTime = Date.now();
    const documentType = path.extname(testDocPath).substring(1).toLowerCase();

    try {
        const pages = await extractTextWithPageBoundaries(testDocPath, documentType, null);
        testResults.performance.extractionTime = Date.now() - startTime;

        // Test 2.1: Pages extracted
        if (pages.length > 0) {
            testResults.phase1.pageExtraction.passed++;
            console.log(`✅ Extracted ${pages.length} pages`);
        } else {
            testResults.phase1.pageExtraction.failed++;
            console.log('❌ No pages extracted');
        }

        // Test 2.2: Page numbers are sequential
        let sequentialPages = true;
        for (let i = 0; i < pages.length; i++) {
            if (pages[i].pageNumber !== i + 1) {
                sequentialPages = false;
                break;
            }
        }

        if (sequentialPages) {
            testResults.phase1.pageExtraction.passed++;
            console.log('✅ Page numbers are sequential');
        } else {
            testResults.phase1.pageExtraction.failed++;
            console.log('❌ Page numbers are not sequential');
        }

        // Test 2.3: Each page has content
        let emptyPages = 0;
        pages.forEach(page => {
            if (!page.text || page.text.trim().length < 10) {
                emptyPages++;
            }
        });

        if (emptyPages === 0) {
            testResults.phase1.pageExtraction.passed++;
            console.log('✅ All pages have content');
        } else {
            testResults.phase1.pageExtraction.failed++;
            console.log(`❌ ${emptyPages} pages have no content`);
        }

        console.log(`⏱️  Extraction time: ${testResults.performance.extractionTime}ms`);

    } catch (error) {
        testResults.phase1.pageExtraction.failed++;
        console.log(`❌ Page extraction failed: ${error.message}`);
    }
}

/**
 * TEST 3: Citation Accuracy
 * Tests if retrieved chunks match expected page numbers
 */
async function testCitationAccuracy(testQuestions, expectedPages) {
    console.log('\n🎯 TEST 3: Citation Accuracy');
    console.log('═'.repeat(60));

    if (!testQuestions || testQuestions.length === 0) {
        console.log('⏭️  Skipping (no test questions provided)');
        return;
    }

    // This test requires a document to be uploaded and embedded
    // For now, we'll simulate the test structure
    console.log(`📝 Test questions: ${testQuestions.length}`);

    testQuestions.forEach((question, idx) => {
        const expected = expectedPages[question];
        console.log(`\n   Question ${idx + 1}: "${question}"`);
        console.log(`   Expected page: ${expected || 'Not specified'}`);

        testResults.phase1.citations.details.push({
            question,
            expectedPage: expected,
            status: 'PENDING',
            note: 'Requires full document embedding'
        });
    });

    console.log('\n⚠️  Full citation testing requires document upload and embedding');
    console.log('   Run manual test after starting the server');
}

/**
 * TEST 4: Reranking Effectiveness
 * Verifies reranking improves chunk ordering
 */
async function testReranking() {
    console.log('\n🔄 TEST 4: Reranking Effectiveness');
    console.log('═'.repeat(60));

    // Sample query and chunks
    const query = "What are the financial results for Q4 2023?";

    const sampleChunks = [
        {
            chunkText: "The weather was sunny today.",
            pageNumber: 1,
            chunkIndex: 0,
            chunkType: 'text',
            similarity: 0.75
        },
        {
            chunkText: "Q4 2023 financial results showed revenue growth of 25% with strong performance across all segments.",
            pageNumber: 5,
            chunkIndex: 10,
            chunkType: 'text',
            similarity: 0.70
        },
        {
            chunkText: "The company announced a new product line.",
            pageNumber: 3,
            chunkIndex: 5,
            chunkType: 'text',
            similarity: 0.72
        }
    ];

    const startTime = Date.now();
    const rerankedChunks = crossEncoderRerank(query, sampleChunks, 3);
    testResults.performance.rerankingTime = Date.now() - startTime;

    // Test 4.1: Most relevant chunk should be ranked first
    const topChunk = rerankedChunks[0];
    const containsKeywords = topChunk.chunkText.includes('Q4 2023') &&
                            topChunk.chunkText.includes('financial results');

    if (containsKeywords) {
        testResults.phase2.reranking.passed++;
        console.log('✅ Most relevant chunk ranked first');
        console.log(`   Top chunk: "${topChunk.chunkText.substring(0, 80)}..."`);
    } else {
        testResults.phase2.reranking.failed++;
        console.log('❌ Most relevant chunk not ranked first');
    }

    // Test 4.2: Rerank scores are assigned
    const hasRerankScores = rerankedChunks.every(chunk =>
        chunk.rerankScore !== undefined && chunk.rerankScore >= 0
    );

    if (hasRerankScores) {
        testResults.phase2.reranking.passed++;
        console.log('✅ Rerank scores assigned to all chunks');
        console.log(`   Top 3 scores: ${rerankedChunks.slice(0, 3).map(c => c.rerankScore.toFixed(3)).join(', ')}`);
    } else {
        testResults.phase2.reranking.failed++;
        console.log('❌ Rerank scores not assigned');
    }

    // Test 4.3: Keyword overlap bonus applied
    const topChunkHasKeywords = topChunk.keywordOverlap !== undefined && topChunk.keywordOverlap > 0;

    if (topChunkHasKeywords) {
        testResults.phase2.reranking.passed++;
        console.log(`✅ Keyword overlap detected: ${(topChunk.keywordOverlap * 100).toFixed(1)}%`);
    } else {
        testResults.phase2.reranking.failed++;
        console.log('❌ Keyword overlap not calculated');
    }

    console.log(`⏱️  Reranking time: ${testResults.performance.rerankingTime}ms`);
}

/**
 * TEST 5: Text Preprocessing
 * Verifies text cleaning and normalization
 */
async function testTextPreprocessing() {
    console.log('\n🧹 TEST 5: Text Preprocessing');
    console.log('═'.repeat(60));

    const dirtyText = `
    This   has    multiple     spaces.



    And multiple newlines.

    Page 1 of 10

    Some-
    hyphenated words.
    `;

    const cleaned = preprocessText(dirtyText);

    // Test 5.1: Multiple spaces reduced
    const hasMultipleSpaces = /  +/.test(cleaned);
    if (!hasMultipleSpaces) {
        testResults.phase1.chunking.passed++;
        console.log('✅ Multiple spaces normalized');
    } else {
        testResults.phase1.chunking.failed++;
        console.log('❌ Multiple spaces still present');
    }

    // Test 5.2: Excessive newlines removed
    const hasExcessiveNewlines = /\n{3,}/.test(cleaned);
    if (!hasExcessiveNewlines) {
        testResults.phase1.chunking.passed++;
        console.log('✅ Excessive newlines removed');
    } else {
        testResults.phase1.chunking.failed++;
        console.log('❌ Excessive newlines still present');
    }

    // Test 5.3: Page headers removed
    const hasPageHeader = /Page \d+ of \d+/.test(cleaned);
    if (!hasPageHeader) {
        testResults.phase1.chunking.passed++;
        console.log('✅ Page headers removed');
    } else {
        testResults.phase1.chunking.failed++;
        console.log('❌ Page headers still present');
    }

    console.log(`\n   Original length: ${dirtyText.length} chars`);
    console.log(`   Cleaned length: ${cleaned.length} chars`);
}

/**
 * Generate test report
 */
function generateReport() {
    console.log('\n\n');
    console.log('═'.repeat(70));
    console.log('                    📊 TEST REPORT SUMMARY');
    console.log('═'.repeat(70));

    const phase1Total = Object.values(testResults.phase1).reduce((sum, cat) =>
        sum + cat.passed + cat.failed, 0
    );
    const phase1Passed = Object.values(testResults.phase1).reduce((sum, cat) =>
        sum + cat.passed, 0
    );

    const phase2Total = Object.values(testResults.phase2).reduce((sum, cat) =>
        sum + cat.passed + cat.failed, 0
    );
    const phase2Passed = Object.values(testResults.phase2).reduce((sum, cat) =>
        sum + cat.passed, 0
    );

    console.log('\n🔹 PHASE 1: Semantic Chunking + Page Extraction');
    console.log(`   Chunking Tests:        ${testResults.phase1.chunking.passed}/${testResults.phase1.chunking.passed + testResults.phase1.chunking.failed} passed`);
    console.log(`   Page Extraction Tests: ${testResults.phase1.pageExtraction.passed}/${testResults.phase1.pageExtraction.passed + testResults.phase1.pageExtraction.failed} passed`);
    console.log(`   Citation Tests:        ${testResults.phase1.citations.passed}/${testResults.phase1.citations.passed + testResults.phase1.citations.failed} passed`);
    console.log(`   Overall: ${phase1Passed}/${phase1Total} (${Math.round(phase1Passed/phase1Total*100)}%)`);

    console.log('\n🔹 PHASE 2: Reranking');
    console.log(`   Reranking Tests:  ${testResults.phase2.reranking.passed}/${testResults.phase2.reranking.passed + testResults.phase2.reranking.failed} passed`);
    console.log(`   Relevance Tests:  ${testResults.phase2.relevance.passed}/${testResults.phase2.relevance.passed + testResults.phase2.relevance.failed} passed`);
    console.log(`   Overall: ${phase2Passed}/${phase2Total} (${Math.round(phase2Passed/phase2Total*100)}%)`);

    console.log('\n🔹 PERFORMANCE METRICS');
    console.log(`   Chunking Time:    ${testResults.performance.chunkingTime}ms`);
    console.log(`   Extraction Time:  ${testResults.performance.extractionTime}ms`);
    console.log(`   Reranking Time:   ${testResults.performance.rerankingTime}ms`);

    const totalPassed = phase1Passed + phase2Passed;
    const totalTests = phase1Total + phase2Total;
    const successRate = Math.round(totalPassed / totalTests * 100);

    console.log('\n═'.repeat(70));
    console.log(`                TOTAL: ${totalPassed}/${totalTests} tests passed (${successRate}%)`);
    console.log('═'.repeat(70));

    if (successRate >= 90) {
        console.log('\n✅ EXCELLENT: RAG improvements working as expected!');
    } else if (successRate >= 70) {
        console.log('\n⚠️  WARNING: Some tests failed, review details above');
    } else {
        console.log('\n❌ CRITICAL: Multiple tests failed, needs investigation');
    }

    console.log('\n');
}

/**
 * Main test runner
 */
async function runTests() {
    console.log('\n🧪 RAG Improvement Testing Suite');
    console.log('Testing Phase 1 (Semantic Chunking) and Phase 2 (Reranking)\n');

    try {
        // Connect to database
        await connectDatabase();

        // Run tests
        await testSemanticChunking();
        await testTextPreprocessing();
        await testPageExtraction(TEST_CONFIG.testDocumentPath);
        await testCitationAccuracy(TEST_CONFIG.testQuestions, TEST_CONFIG.expectedPages);
        await testReranking();

        // Generate report
        generateReport();

    } catch (error) {
        console.error('\n❌ Test suite failed:', error);
        console.error(error.stack);
    } finally {
        // Disconnect database
        await disconnectDatabase();
    }
}

// Export for use in other modules
export { runTests, TEST_CONFIG, testResults };

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runTests().then(() => {
        process.exit(0);
    }).catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}
