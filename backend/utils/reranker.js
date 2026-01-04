import { OpenAI } from 'openai';

let openaiClient = null;
function getOpenAIClient() {
    if (!openaiClient) {
        openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return openaiClient;
}

/**
 * Cross-Encoder Reranking (Fast & Cheap)
 * Uses multiple signals to rerank chunks without calling external APIs
 *
 * Based on: https://www.pinecone.io/learn/series/rag/rerankers/
 *
 * @param {string} query - User's question
 * @param {Array} chunks - Retrieved chunks with similarity scores
 * @param {number} topK - Number of top chunks to return
 * @returns {Array} Reranked chunks
 */
export function crossEncoderRerank(query, chunks, topK = 8) {
    console.log(`\n🔄 Cross-encoder reranking ${chunks.length} chunks...`);
    console.time('⏱️ Cross-encoder reranking');

    if (chunks.length <= topK) {
        console.log('   ⏭️  Skipping reranking (already have ≤ topK chunks)');
        return chunks;
    }

    // Extract important query tokens (ignore common words)
    const queryTokens = new Set(
        query.toLowerCase()
            .replace(/[^\w\s]/g, '')
            .split(/\s+/)
            .filter(t => t.length > 3 && !isCommonWord(t))
    );

    const scoredChunks = chunks.map((chunk, idx) => {
        const chunkTokens = new Set(
            chunk.chunkText.toLowerCase()
                .replace(/[^\w\s]/g, '')
                .split(/\s+/)
        );

        // Signal 1: Keyword overlap (Jaccard similarity)
        const intersection = new Set([...queryTokens].filter(t => chunkTokens.has(t)));
        const union = new Set([...queryTokens, ...chunkTokens]);
        const keywordOverlap = intersection.size / (union.size || 1);

        // Signal 2: Position score (earlier pages = more important)
        const positionScore = 1 - (chunk.pageNumber / 100); // Normalize to 0-1

        // Signal 3: Chunk type preference (text > table > image for most queries)
        let typeScore = 1.0;
        if (chunk.chunkType === 'table') typeScore = 0.9;
        if (chunk.chunkType === 'image') typeScore = 0.8;

        // Signal 4: Exact phrase matching (bonus for exact query phrases in chunk)
        const exactMatchBonus = chunk.chunkText.toLowerCase().includes(query.toLowerCase()) ? 0.2 : 0;

        // Signal 5: Length penalty (very short chunks are less informative)
        const lengthScore = Math.min(chunk.chunkText.length / 200, 1.0);

        // Combined score with weighted signals
        const combinedScore =
            (chunk.similarity * 0.50) +       // 50% vector similarity (existing)
            (keywordOverlap * 0.25) +         // 25% keyword overlap
            (positionScore * 0.05) +          // 5% position in document
            (typeScore * 0.05) +              // 5% chunk type
            (exactMatchBonus * 0.10) +        // 10% exact match bonus
            (lengthScore * 0.05);             // 5% length score

        return {
            ...chunk,
            rerankScore: combinedScore,
            keywordOverlap,
            positionScore,
            typeScore,
            exactMatchBonus,
            originalRank: idx + 1,
            signals: {
                vectorSim: chunk.similarity.toFixed(3),
                keyword: keywordOverlap.toFixed(3),
                position: positionScore.toFixed(3),
                type: typeScore.toFixed(2),
                exactMatch: exactMatchBonus.toFixed(2),
                length: lengthScore.toFixed(2)
            }
        };
    });

    // Sort by combined rerank score
    scoredChunks.sort((a, b) => b.rerankScore - a.rerankScore);

    // Take top K
    const topChunks = scoredChunks.slice(0, topK);

    console.timeEnd('⏱️ Cross-encoder reranking');
    console.log(`   ✅ Reranked to top ${topK} chunks`);
    console.log(`   📊 Top 3 scores: ${topChunks.slice(0, 3).map(c => c.rerankScore.toFixed(3)).join(', ')}`);

    // Log score breakdown for top chunk
    const top = topChunks[0];
    console.log(`   🏆 Top chunk signals: Vector=${top.signals.vectorSim}, Keyword=${top.signals.keyword}, Position=${top.signals.position}`);

    return topChunks;
}

/**
 * LLM-Based Reranking (Slower but More Accurate)
 * Uses GPT-3.5-turbo to score chunk relevance
 *
 * Based on: https://developer.nvidia.com/blog/enhancing-rag-pipelines-with-re-ranking/
 *
 * @param {string} query - User's question
 * @param {Array} chunks - Retrieved chunks with similarity scores
 * @param {number} topK - Number of top chunks to return
 * @returns {Promise<Array>} Reranked chunks
 */
export async function llmBasedRerank(query, chunks, topK = 8) {
    try {
        console.log(`\n🤖 LLM-based reranking ${chunks.length} chunks...`);
        console.time('⏱️ LLM reranking');

        if (chunks.length <= topK) {
            console.log('   ⏭️  Skipping reranking (already have ≤ topK chunks)');
            return chunks;
        }

        const openai = getOpenAIClient();

        // Score each chunk in parallel (faster)
        const scoringPromises = chunks.map(async (chunk, idx) => {
            try {
                // Limit chunk preview to 500 chars to save tokens
                const chunkPreview = chunk.chunkText.substring(0, 500);

                const prompt = `Rate how relevant this text is to answering the question on a scale of 0-100.

Question: "${query}"

Text: "${chunkPreview}${chunk.chunkText.length > 500 ? '...' : ''}"

Respond with ONLY a number from 0-100. No explanation.`;

                const response = await openai.chat.completions.create({
                    model: 'gpt-3.5-turbo',
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0,
                    max_tokens: 5
                });

                const scoreText = response.choices[0].message.content.trim();
                const score = parseInt(scoreText, 10) || 0;

                return {
                    ...chunk,
                    rerankScore: score / 100, // Normalize to 0-1
                    llmScore: score,
                    originalRank: idx + 1
                };
            } catch (error) {
                console.error(`   ⚠️  Error scoring chunk ${idx}:`, error.message);
                // Fall back to cosine similarity on error
                return {
                    ...chunk,
                    rerankScore: chunk.similarity,
                    llmScore: Math.round(chunk.similarity * 100),
                    originalRank: idx + 1
                };
            }
        });

        const scoredChunks = await Promise.all(scoringPromises);

        // Sort by LLM score (highest first)
        scoredChunks.sort((a, b) => b.rerankScore - a.rerankScore);

        // Take top K
        const topChunks = scoredChunks.slice(0, topK);

        console.timeEnd('⏱️ LLM reranking');
        console.log(`   ✅ Reranked to top ${topK} chunks`);
        console.log(`   📊 Top 3 LLM scores: ${topChunks.slice(0, 3).map(c => c.llmScore).join(', ')}/100`);

        return topChunks;

    } catch (error) {
        console.error('❌ LLM reranking error:', error.message);
        // Fall back to original chunks on catastrophic failure
        return chunks.slice(0, topK);
    }
}

/**
 * Hybrid Reranking Strategy
 * Combines cross-encoder (fast) with optional LLM refinement (accurate)
 *
 * @param {string} query - User's question
 * @param {Array} chunks - Retrieved chunks
 * @param {number} topK - Final number of chunks to return
 * @param {Object} options - Reranking options
 * @returns {Promise<Array>} Reranked chunks
 */
export async function hybridRerank(query, chunks, topK = 8, options = {}) {
    const {
        useLLM = false,           // Use expensive LLM reranking?
        llmTopK = 15              // If using LLM, rerank top N from cross-encoder first
    } = options;

    // Step 1: Fast cross-encoder reranking
    const crossEncoderTop = crossEncoderRerank(query, chunks, useLLM ? llmTopK : topK);

    // Step 2: Optional LLM refinement on top candidates
    if (useLLM && crossEncoderTop.length > topK) {
        console.log(`\n🔬 Refining top ${llmTopK} with LLM reranking...`);
        return await llmBasedRerank(query, crossEncoderTop, topK);
    }

    return crossEncoderTop;
}

/**
 * Helper: Check if word is common (stop word)
 */
function isCommonWord(word) {
    const commonWords = new Set([
        'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
        'of', 'with', 'by', 'from', 'about', 'into', 'through',
        'during', 'before', 'after', 'above', 'below', 'between',
        'this', 'that', 'these', 'those', 'what', 'which', 'who',
        'when', 'where', 'why', 'how', 'all', 'each', 'every',
        'both', 'few', 'more', 'most', 'other', 'some', 'such',
        'than', 'too', 'very', 'can', 'will', 'just', 'should',
        'now', 'only', 'also', 'does', 'did', 'has', 'have', 'had',
        'been', 'being', 'are', 'was', 'were', 'is', 'am'
    ]);

    return commonWords.has(word.toLowerCase());
}

/**
 * Reciprocal Rank Fusion (RRF) - Alternative reranking method
 * Merges results from multiple retrievers
 *
 * @param {Array<Array>} rankedLists - Multiple lists of chunks (e.g., from vector + keyword search)
 * @param {number} k - RRF constant (default: 60)
 * @param {number} topK - Number of final results
 * @returns {Array} Merged and reranked chunks
 */
export function reciprocalRankFusion(rankedLists, k = 60, topK = 15) {
    console.log(`\n🔀 Reciprocal Rank Fusion on ${rankedLists.length} result lists...`);

    const chunkScores = new Map();

    // Score each chunk based on its rank in each list
    rankedLists.forEach((rankedList, listIdx) => {
        rankedList.forEach((chunk, rank) => {
            const key = `${chunk.pageNumber}-${chunk.chunkIndex}`;
            const rrfScore = 1 / (k + rank + 1);

            if (chunkScores.has(key)) {
                const existing = chunkScores.get(key);
                existing.score += rrfScore;
                existing.appearances++;
            } else {
                chunkScores.set(key, {
                    chunk,
                    score: rrfScore,
                    appearances: 1
                });
            }
        });
    });

    // Sort by RRF score
    const mergedResults = Array.from(chunkScores.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
        .map(item => ({
            ...item.chunk,
            rrfScore: item.score,
            appearances: item.appearances
        }));

    console.log(`   ✅ RRF merged to ${mergedResults.length} unique chunks`);
    return mergedResults;
}
