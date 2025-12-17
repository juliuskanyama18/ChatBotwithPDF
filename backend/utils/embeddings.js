import { OpenAI } from 'openai';
import mongoose from 'mongoose';
import Embedding from '../models/Embedding.js';

// Lazy initialization of OpenAI client
let openaiClient = null;

function getOpenAIClient() {
    if (!openaiClient) {
        openaiClient = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
    }
    return openaiClient;
}

/**
 * Generate embedding for a single text chunk using OpenAI
 * @param {string} text - The text to embed
 * @returns {Promise<Array<number>>} The embedding vector
 */
export async function generateEmbedding(text) {
    try {
        const openai = getOpenAIClient();
        const response = await openai.embeddings.create({
            model: 'text-embedding-3-small', // 1536 dimensions, cheaper and faster
            input: text.substring(0, 8000) // Limit to 8000 chars to stay within token limits
        });

        return response.data[0].embedding;
    } catch (error) {
        console.error('Error generating embedding:', error);
        throw error;
    }
}

/**
 * Generate embeddings for multiple text chunks in batch
 * @param {Array<string>} texts - Array of texts to embed
 * @returns {Promise<Array<Array<number>>>} Array of embedding vectors
 */
export async function generateEmbeddingsBatch(texts) {
    try {
        const openai = getOpenAIClient();
        // OpenAI allows up to 2048 inputs per request
        const batchSize = 100;
        const allEmbeddings = [];

        for (let i = 0; i < texts.length; i += batchSize) {
            const batch = texts.slice(i, i + batchSize);

            const response = await openai.embeddings.create({
                model: 'text-embedding-3-small',
                input: batch.map(text => text.substring(0, 8000))
            });

            const embeddings = response.data.map(item => item.embedding);
            allEmbeddings.push(...embeddings);

            // Small delay to avoid rate limits
            if (i + batchSize < texts.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        return allEmbeddings;
    } catch (error) {
        console.error('Error generating embeddings batch:', error);
        throw error;
    }
}

/**
 * Store embeddings in MongoDB
 * @param {string} documentId - Document ID
 * @param {string} userId - User ID
 * @param {Array} chunks - Array of {text, pageNumber, chunkIndex}
 * @param {Array} embeddings - Array of embedding vectors
 * @param {string} documentType - Document type (pdf, pptx, docx, etc.)
 */
export async function storeEmbeddings(documentId, userId, chunks, embeddings, documentType = 'pdf') {
    try {
        const embeddingDocs = chunks.map((chunk, index) => {
            // Detect chunk type based on content markers
            let chunkType = 'text';
            if (chunk.text.startsWith('[IMAGE DESCRIPTION')) {
                chunkType = 'image';
            } else if (chunk.text.startsWith('[TABLE - Page') || chunk.text.startsWith('| ')) {
                chunkType = 'table';
            }

            return {
                documentId,
                userId,
                chunkText: chunk.text,
                chunkIndex: index,
                pageNumber: Number(chunk.pageNumber) || 1, // Ensure it's always a Number
                chunkType: chunkType,
                embedding: embeddings[index],
                metadata: {
                    length: chunk.text.length.toString(),
                    documentType: documentType // Store document type for proper citation format
                }
            };
        });

        await Embedding.insertMany(embeddingDocs);
        console.log(`Stored ${embeddingDocs.length} embeddings for document ${documentId}`);
    } catch (error) {
        console.error('Error storing embeddings:', error);
        throw error;
    }
}

/**
 * Calculate cosine similarity between two vectors
 * @param {Array<number>} a
 * @param {Array<number>} b
 * @returns {number} Similarity score between -1 and 1
 */
export function cosineSimilarity(a, b) {
    if (a.length !== b.length) {
        throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Search for similar text chunks using MongoDB Atlas Vector Search
 * @param {string} query - User's query
 * @param {string} documentId - Document to search in
 * @param {number} topK - Number of results to return
 * @param {Object} pageFilter - Optional page filter {pageNumbers: [1,2,3]}
 * @returns {Promise<Array>} Most similar chunks with scores
 */
export async function semanticSearch(query, documentId, topK = 5, pageFilter = null) {
    try {
        console.time('⏱️ Total Vector Search');

        // Generate embedding for the query
        console.time('⏱️ Generate query embedding');
        const queryEmbedding = await generateEmbedding(query);
        console.timeEnd('⏱️ Generate query embedding');

        // Use MongoDB Atlas Vector Search aggregation pipeline
        console.time('⏱️ MongoDB Vector Search');

        // Build filter for vector search
        const filter = {
            documentId: new mongoose.Types.ObjectId(documentId)
        };

        // Add page filter if provided
        if (pageFilter && pageFilter.pageNumbers && pageFilter.pageNumbers.length > 0) {
            filter.pageNumber = { $in: pageFilter.pageNumbers };
        }

        const results = await Embedding.aggregate([
            {
                $vectorSearch: {
                    index: "vector_index", // Must match your Atlas Search index name
                    path: "embedding",
                    queryVector: queryEmbedding,
                    numCandidates: Math.max(topK * 15, 150), // Increased: search more candidates for better results
                    limit: topK,
                    filter: filter
                }
            },
            {
                $project: {
                    chunkText: 1,
                    pageNumber: 1,
                    chunkIndex: 1,
                    chunkType: 1,
                    metadata: 1,
                    similarity: { $meta: "vectorSearchScore" }
                }
            }
        ]);

        console.timeEnd('⏱️ MongoDB Vector Search');

        if (results.length === 0) {
            console.log('⚠️ No results from Vector Search, falling back to in-app search');
            return await semanticSearchFallback(query, documentId, topK, pageFilter);
        }

        console.log(`✅ Vector Search found ${results.length} chunks`);
        console.log(`✅ Top similarity scores: ${results.map(r => r.similarity.toFixed(3)).join(', ')}`);

        console.timeEnd('⏱️ Total Vector Search');
        return results;

    } catch (error) {
        console.error('❌ Error in Vector Search:', error.message);
        console.log('⚠️ Falling back to in-app cosine similarity search');
        return await semanticSearchFallback(query, documentId, topK, pageFilter);
    }
}

/**
 * Fallback: In-app cosine similarity search (used if Vector Search fails)
 * @param {string} query - User's query
 * @param {string} documentId - Document to search in
 * @param {number} topK - Number of results to return
 * @param {Object} pageFilter - Optional page filter {pageNumbers: [1,2,3]}
 * @returns {Promise<Array>} Most similar chunks with scores
 */
async function semanticSearchFallback(query, documentId, topK = 5, pageFilter = null) {
    try {
        console.time('⏱️ Fallback search');

        // Generate embedding for the query
        const queryEmbedding = await generateEmbedding(query);

        // Get embeddings for this document
        console.time('⏱️ Fetch embeddings from DB');
        const queryFilter = { documentId };

        // Add page filter if provided
        if (pageFilter && pageFilter.pageNumbers && pageFilter.pageNumbers.length > 0) {
            queryFilter.pageNumber = { $in: pageFilter.pageNumbers };
        }

        const documentEmbeddings = await Embedding.find(queryFilter)
            .select('chunkText pageNumber chunkIndex chunkType embedding metadata')
            .lean()
            .exec();
        console.timeEnd('⏱️ Fetch embeddings from DB');

        if (documentEmbeddings.length === 0) {
            console.log('⚠️ No embeddings found for document:', documentId);
            return [];
        }

        console.log(`🔍 Fallback: Searching through ${documentEmbeddings.length} chunks`);

        // Calculate similarity scores
        const results = documentEmbeddings.map(doc => ({
            chunkText: doc.chunkText,
            pageNumber: doc.pageNumber,
            chunkIndex: doc.chunkIndex,
            chunkType: doc.chunkType || 'text',
            metadata: doc.metadata,
            similarity: cosineSimilarity(queryEmbedding, doc.embedding)
        }));

        // Sort by similarity (highest first) and return top K
        results.sort((a, b) => b.similarity - a.similarity);

        const topResults = results.slice(0, topK);
        console.log(`✅ Fallback scores: ${topResults.map(r => r.similarity.toFixed(3)).join(', ')}`);

        console.timeEnd('⏱️ Fallback search');
        return topResults;
    } catch (error) {
        console.error('❌ Error in fallback search:', error);
        throw error;
    }
}

/**
 * Delete all embeddings for a document
 * @param {string} documentId
 */
export async function deleteEmbeddings(documentId) {
    try {
        await Embedding.deleteMany({ documentId });
        console.log(`Deleted embeddings for document ${documentId}`);
    } catch (error) {
        console.error('Error deleting embeddings:', error);
        throw error;
    }
}

/**
 * TASK C: Build context from chunks with type-aware limits
 * Limits chunks by type to ensure balanced representation:
 * - Up to 4 text chunks
 * - Up to 2 table chunks
 * - Up to 2 image chunks
 *
 * @param {Array} chunks - Array of chunks with chunkType, chunkText, pageNumber, similarity
 * @returns {string} Formatted context string ready for GPT-4
 */
export function buildContextFromChunks(chunks) {
    if (!chunks || chunks.length === 0) {
        return '[No relevant context found]';
    }

    // Sort all chunks by similarity (highest first)
    const sortedChunks = [...chunks].sort((a, b) => b.similarity - a.similarity);

    // Separate by type
    const textChunks = sortedChunks.filter(c => (c.chunkType || 'text') === 'text');
    const tableChunks = sortedChunks.filter(c => c.chunkType === 'table');
    const imageChunks = sortedChunks.filter(c => c.chunkType === 'image');

    // Apply type-specific limits
    const selectedText = textChunks.slice(0, 4);
    const selectedTables = tableChunks.slice(0, 2);
    const selectedImages = imageChunks.slice(0, 2);

    // Combine and sort by page number for coherent reading
    const allSelected = [...selectedText, ...selectedTables, ...selectedImages];
    allSelected.sort((a, b) => (a.pageNumber || 0) - (b.pageNumber || 0));

    // Format each chunk with clear type markers
    const formattedChunks = allSelected.map((chunk, idx) => {
        const chunkType = (chunk.chunkType || 'text').toUpperCase();
        const pageNum = chunk.pageNumber || 'Unknown';

        return `[Context ${idx + 1} - ${chunkType} - Page ${pageNum}]\n${chunk.chunkText}`;
    });

    const contextString = formattedChunks.join('\n\n═══════════════════════════════════════\n\n');

    // Log selection summary
    console.log(`   📝 Built context: ${selectedText.length} text + ${selectedTables.length} table + ${selectedImages.length} image chunks`);

    return contextString;
}

/**
 * Keyword search using MongoDB text index (BM25-like scoring)
 * Finds chunks containing exact/fuzzy keyword matches
 */
async function keywordSearch(query, documentId, topK = 15, pageFilter = null) {
    try {
        console.time('⏱️ Keyword Search');

        // Build query filter
        const filter = {
            documentId: documentId,
            $text: { $search: query }
        };

        // Add page filter if specified
        if (pageFilter && pageFilter.pageNumbers && pageFilter.pageNumbers.length > 0) {
            filter.pageNumber = { $in: pageFilter.pageNumbers };
        }

        // Execute keyword search with text score
        const results = await Embedding.find(filter, {
            score: { $meta: 'textScore' }
        })
        .select('chunkText pageNumber chunkIndex chunkType metadata')
        .sort({ score: { $meta: 'textScore' } })
        .limit(topK)
        .lean()
        .exec();

        console.timeEnd('⏱️ Keyword Search');
        console.log(`   🔤 Keyword search found ${results.length} chunks`);

        // Format results (normalize score to 0-1 range)
        const maxScore = results.length > 0 ? results[0].score : 1;
        return results.map(chunk => ({
            chunkText: chunk.chunkText,
            pageNumber: chunk.pageNumber,
            chunkIndex: chunk.chunkIndex,
            chunkType: chunk.chunkType || 'text',
            metadata: chunk.metadata,
            similarity: Math.min(chunk.score / (maxScore + 0.1), 1.0), // Normalize
            source: 'keyword'
        }));

    } catch (error) {
        // If text index doesn't exist yet, return empty array
        if (error.code === 27 || error.message.includes('text index')) {
            console.log('⚠️  Text index not found - keyword search unavailable (run migration to enable)');
            return [];
        }
        console.error('❌ Keyword search error:', error.message);
        return [];
    }
}

/**
 * Hybrid search: Combine vector + keyword search using Reciprocal Rank Fusion (RRF)
 * This is the ChatPDF secret sauce - combines semantic + exact matching
 */
async function hybridSearch(query, documentId, topK = 15, pageFilter = null) {
    try {
        console.log('\n🔀 Hybrid search (Vector + Keyword)...');

        // Run both searches in parallel
        const [vectorResults, keywordResults] = await Promise.all([
            semanticSearch(query, documentId, topK, pageFilter),
            keywordSearch(query, documentId, topK, pageFilter)
        ]);

        console.log(`   📊 Vector: ${vectorResults.length} chunks, Keyword: ${keywordResults.length} chunks`);

        // If keyword search failed (no index), fall back to vector only
        if (keywordResults.length === 0) {
            console.log('   ⚠️  Using vector search only (keyword search unavailable)');
            return vectorResults;
        }

        // Reciprocal Rank Fusion (RRF): Merge results from both methods
        // Score = sum(1 / (k + rank)) for each method where chunk appears
        const k = 60; // RRF constant (standard value)
        const chunkScores = new Map();

        // Score vector results (rank 1 = best)
        vectorResults.forEach((chunk, index) => {
            const key = `${chunk.pageNumber}-${chunk.chunkIndex}`;
            const rrfScore = 1 / (k + index + 1);
            chunkScores.set(key, {
                chunk,
                score: rrfScore,
                vectorRank: index + 1,
                keywordRank: null
            });
        });

        // Add keyword results (if chunk already exists, add to score)
        keywordResults.forEach((chunk, index) => {
            const key = `${chunk.pageNumber}-${chunk.chunkIndex}`;
            const rrfScore = 1 / (k + index + 1);

            if (chunkScores.has(key)) {
                // Chunk appears in both → boost score
                const existing = chunkScores.get(key);
                existing.score += rrfScore;
                existing.keywordRank = index + 1;
            } else {
                // Keyword-only chunk
                chunkScores.set(key, {
                    chunk,
                    score: rrfScore,
                    vectorRank: null,
                    keywordRank: index + 1
                });
            }
        });

        // Sort by RRF score and take topK
        const mergedResults = Array.from(chunkScores.values())
            .sort((a, b) => b.score - a.score)
            .slice(0, topK)
            .map(item => ({
                ...item.chunk,
                // CRITICAL: Keep original vector similarity for threshold filtering
                // Use RRF score only for ranking (sorting), not for threshold comparison
                similarity: item.chunk.similarity, // Preserve original cosine similarity
                rrfScore: item.score, // RRF score for ranking
                vectorRank: item.vectorRank,
                keywordRank: item.keywordRank
            }));

        console.log(`   ✅ Merged ${mergedResults.length} unique chunks using RRF`);

        // Log top 3 chunks' sources
        const topSources = mergedResults.slice(0, 3).map(c =>
            `Page ${c.pageNumber} (V:${c.vectorRank || '-'} K:${c.keywordRank || '-'} Score:${c.rrfScore.toFixed(3)})`
        ).join(', ');
        console.log(`   🏆 Top chunks: ${topSources}`);

        return mergedResults;

    } catch (error) {
        console.error('❌ Hybrid search error:', error.message);
        // Fall back to vector search only
        console.log('   ⚠️  Falling back to vector search only');
        return await semanticSearch(query, documentId, topK, pageFilter);
    }
}

/**
 * TASK A: Retrieve relevant chunks with type-aware similarity thresholds
 * This is a professional-grade wrapper around semanticSearch that:
 * 1. Filters chunks by type-specific minimum similarity thresholds
 * 2. Returns empty array if no chunks pass threshold (triggering NOT FOUND template)
 * 3. Returns filtered chunks sorted by similarity
 *
 * @param {Object} options - Search options
 * @param {string} options.question - User's query
 * @param {string} options.documentId - Document to search in
 * @param {number} options.k - Number of candidates to retrieve (before filtering)
 * @param {Object} options.pageFilter - Optional page filter {pageNumbers: [1,2,3]}
 * @returns {Promise<Array>} Filtered chunks that pass similarity thresholds
 */
export async function retrieveRelevantChunks({ question, documentId, k = 8, pageFilter = null }) {
    // Type-specific similarity thresholds for SEMANTIC queries (lowered for better recall)
    const MIN_SIMILARITY_TEXT = 0.20;  // Lowered for better content retrieval
    const MIN_SIMILARITY_IMAGE = 0.18; // Images need lower threshold
    const MIN_SIMILARITY_TABLE = 0.18; // Tables need lower threshold

    // VERY LOW thresholds for page-specific queries (user explicitly asked for a page)
    const MIN_SIMILARITY_TEXT_PAGE_SPECIFIC = 0.10;  // Very low - user wants this specific page
    const MIN_SIMILARITY_IMAGE_PAGE_SPECIFIC = 0.08; // Very low for page-specific image queries
    const MIN_SIMILARITY_TABLE_PAGE_SPECIFIC = 0.08; // Very low for page-specific table queries

    try {
        console.log('\n🎯 Retrieving relevant chunks with similarity filtering...');

        // Check if this is a page-specific query
        const isPageSpecificQuery = pageFilter && pageFilter.pageNumbers && pageFilter.pageNumbers.length > 0;

        // Check if this is a "PAGE CONTENT" query (user wants to see everything on that page)
        // Keywords: "explain page", "what's on page", "describe page", "show page", "content of page"
        const pageContentQuery = isPageSpecificQuery && /\b(explain|describe|show|what'?s?\s+(on|in)|content\s+of|tell\s+me\s+about)\s+(page|slide)\s+\d+/i.test(question);

        if (pageContentQuery) {
            console.log(`   📄 PAGE CONTENT query detected → Retrieving ALL chunks from pages: ${pageFilter.pageNumbers.join(', ')}`);
            console.log(`   ℹ️  Bypassing similarity thresholds (user wants full page content)\n`);

            // Retrieve ALL chunks from the specified pages, no filtering
            const queryFilter = {
                documentId,
                pageNumber: { $in: pageFilter.pageNumbers }
            };

            const pageChunks = await Embedding.find(queryFilter)
                .select('chunkText pageNumber chunkIndex chunkType metadata')
                .sort({ pageNumber: 1, chunkIndex: 1 })  // Sort by page, then chunk order
                .lean()
                .exec();

            if (pageChunks.length === 0) {
                console.log('   ⚠️  No chunks found for specified pages');
                return [];
            }

            // Format for consistency with vector search results
            const formattedChunks = pageChunks.map(chunk => ({
                chunkText: chunk.chunkText,
                pageNumber: chunk.pageNumber,
                chunkIndex: chunk.chunkIndex,
                chunkType: chunk.chunkType || 'text',
                metadata: chunk.metadata,
                similarity: 1.0  // Perfect score since user explicitly requested this page
            }));

            console.log(`   ✅ Retrieved ${formattedChunks.length} chunks (ALL content from requested pages)`);
            return formattedChunks;
        }

        if (isPageSpecificQuery) {
            console.log(`   📍 Page-specific query detected → Using relaxed thresholds for pages: ${pageFilter.pageNumbers.join(', ')}`);
        }

        // Perform HYBRID search (vector + keyword) with higher k to get more candidates
        const allChunks = await hybridSearch(question, documentId, k, pageFilter);

        if (allChunks.length === 0) {
            console.log('   ⚠️  No chunks found in vector search');
            return [];
        }

        // Filter chunks by type-specific thresholds
        const filteredChunks = allChunks.filter(chunk => {
            const chunkType = chunk.chunkType || 'text';
            let threshold;

            // Use LOWER thresholds for page-specific queries
            if (isPageSpecificQuery) {
                switch (chunkType) {
                    case 'image':
                        threshold = MIN_SIMILARITY_IMAGE_PAGE_SPECIFIC;
                        break;
                    case 'table':
                        threshold = MIN_SIMILARITY_TABLE_PAGE_SPECIFIC;
                        break;
                    case 'text':
                    default:
                        threshold = MIN_SIMILARITY_TEXT_PAGE_SPECIFIC;
                        break;
                }
            } else {
                // Use NORMAL thresholds for semantic queries
                switch (chunkType) {
                    case 'image':
                        threshold = MIN_SIMILARITY_IMAGE;
                        break;
                    case 'table':
                        threshold = MIN_SIMILARITY_TABLE;
                        break;
                    case 'text':
                    default:
                        threshold = MIN_SIMILARITY_TEXT;
                        break;
                }
            }

            const passes = chunk.similarity >= threshold;

            if (!passes) {
                console.log(`   🚫 Filtered out ${chunkType} chunk (similarity: ${chunk.similarity.toFixed(3)} < ${threshold})`);
            }

            return passes;
        });

        console.log(`   ✅ Kept ${filteredChunks.length}/${allChunks.length} chunks after threshold filtering`);

        if (filteredChunks.length === 0) {
            console.log('   ⚠️  No chunks passed similarity thresholds → Will trigger NOT FOUND template');
            return [];
        }

        // Log filtered chunk types and similarities
        const chunkSummary = filteredChunks.map(c =>
            `${c.chunkType || 'text'}(${c.similarity.toFixed(3)})`
        ).join(', ');
        console.log(`   📊 Chunk types: ${chunkSummary}`);

        return filteredChunks;

    } catch (error) {
        console.error('❌ Error in retrieveRelevantChunks:', error.message);
        // On error, return empty array to trigger NOT FOUND template safely
        return [];
    }
}
