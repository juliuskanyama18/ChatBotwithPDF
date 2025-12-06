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
        const embeddingDocs = chunks.map((chunk, index) => ({
            documentId,
            userId,
            chunkText: chunk.text,
            chunkIndex: index,
            pageNumber: chunk.pageNumber,
            embedding: embeddings[index],
            metadata: {
                length: chunk.text.length.toString(),
                documentType: documentType // Store document type for proper citation format
            }
        }));

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
 * @returns {Promise<Array>} Most similar chunks with scores
 */
export async function semanticSearch(query, documentId, topK = 5) {
    try {
        console.time('⏱️ Total Vector Search');

        // Generate embedding for the query
        console.time('⏱️ Generate query embedding');
        const queryEmbedding = await generateEmbedding(query);
        console.timeEnd('⏱️ Generate query embedding');

        // Use MongoDB Atlas Vector Search aggregation pipeline
        console.time('⏱️ MongoDB Vector Search');

        const results = await Embedding.aggregate([
            {
                $vectorSearch: {
                    index: "vector_index", // Must match your Atlas Search index name
                    path: "embedding",
                    queryVector: queryEmbedding,
                    numCandidates: Math.max(topK * 10, 50), // Search more candidates for better results
                    limit: topK,
                    filter: {
                        documentId: new mongoose.Types.ObjectId(documentId)
                    }
                }
            },
            {
                $project: {
                    chunkText: 1,
                    pageNumber: 1,
                    chunkIndex: 1,
                    similarity: { $meta: "vectorSearchScore" }
                }
            }
        ]);

        console.timeEnd('⏱️ MongoDB Vector Search');

        if (results.length === 0) {
            console.log('⚠️ No results from Vector Search, falling back to in-app search');
            return await semanticSearchFallback(query, documentId, topK);
        }

        console.log(`✅ Vector Search found ${results.length} chunks`);
        console.log(`✅ Top similarity scores: ${results.map(r => r.similarity.toFixed(3)).join(', ')}`);

        console.timeEnd('⏱️ Total Vector Search');
        return results;

    } catch (error) {
        console.error('❌ Error in Vector Search:', error.message);
        console.log('⚠️ Falling back to in-app cosine similarity search');
        return await semanticSearchFallback(query, documentId, topK);
    }
}

/**
 * Fallback: In-app cosine similarity search (used if Vector Search fails)
 * @param {string} query - User's query
 * @param {string} documentId - Document to search in
 * @param {number} topK - Number of results to return
 * @returns {Promise<Array>} Most similar chunks with scores
 */
async function semanticSearchFallback(query, documentId, topK = 5) {
    try {
        console.time('⏱️ Fallback search');

        // Generate embedding for the query
        const queryEmbedding = await generateEmbedding(query);

        // Get embeddings for this document
        console.time('⏱️ Fetch embeddings from DB');
        const documentEmbeddings = await Embedding.find({ documentId })
            .select('chunkText pageNumber chunkIndex embedding')
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
