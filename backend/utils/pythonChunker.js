/**
 * Python Multi-Strategy Chunking Service Integration
 * Calls the Python FastAPI service for document-type-specific chunking
 */

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000';

/**
 * Call Python service for multi-strategy chunking
 *
 * @param {string} text - Full document text to chunk
 * @param {string} fileType - Document type ('pdf', 'docx', 'pptx')
 * @param {number} chunkSize - Target chunk size in tokens (default: 800)
 * @param {number} chunkOverlap - Overlap between chunks in tokens (default: 100)
 * @returns {Promise<Array>} Array of chunk objects with text, offsets, and metadata
 */
export async function chunkWithPythonService(text, fileType, chunkSize = 800, chunkOverlap = 100) {
    try {
        console.log(`\n🐍 Calling Python chunking service for ${fileType.toUpperCase()}...`);
        console.log(`   Parameters: chunk_size=${chunkSize}, chunk_overlap=${chunkOverlap}`);
        console.log(`   Text length: ${text.length} characters`);

        const response = await axios.post(
            `${PYTHON_SERVICE_URL}/chunk`,
            {
                text,
                file_type: fileType,
                chunk_size: chunkSize,
                chunk_overlap: chunkOverlap
            },
            {
                timeout: 60000, // 60 second timeout for large documents
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );

        if (response.data && response.data.success) {
            const chunks = response.data.chunks;
            const strategy = response.data.strategy;

            console.log(`   ✅ Python chunking successful: ${chunks.length} chunks created`);
            console.log(`   Strategy used: ${strategy}`);

            // Transform Python chunks to match expected format
            return chunks.map((chunk, index) => ({
                text: chunk.text,
                startOffset: chunk.start_offset,
                endOffset: chunk.end_offset,
                tokenCount: chunk.token_count,
                chunkIndex: chunk.chunk_index || index,
                metadata: chunk.metadata || {},
                // Add line range estimation (approximate based on offsets)
                lineRange: estimateLineRange(text, chunk.start_offset, chunk.end_offset)
            }));
        } else {
            throw new Error('Python service returned unsuccessful response');
        }

    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            console.warn(`   ⚠️  Python service not available at ${PYTHON_SERVICE_URL}`);
            console.warn('   💡 Make sure to start the Python service with: python python_service/document_service.py');
        } else if (error.response) {
            console.error(`   ❌ Python service error: ${error.response.status} - ${error.response.data?.detail || error.message}`);
        } else {
            console.error(`   ❌ Error calling Python chunking service:`, error.message);
        }

        // Return null to signal fallback to Node.js chunking
        return null;
    }
}

/**
 * Estimate line range from character offsets
 *
 * @param {string} fullText - Complete document text
 * @param {number} startOffset - Starting character offset
 * @param {number} endOffset - Ending character offset
 * @returns {object} Line range {start, end}
 */
function estimateLineRange(fullText, startOffset, endOffset) {
    try {
        // Count newlines up to startOffset
        const textBeforeStart = fullText.substring(0, startOffset);
        const startLine = (textBeforeStart.match(/\n/g) || []).length + 1;

        // Count newlines between start and end
        const chunkText = fullText.substring(startOffset, endOffset);
        const linesInChunk = (chunkText.match(/\n/g) || []).length;
        const endLine = startLine + linesInChunk;

        return { start: startLine, end: endLine };
    } catch (error) {
        // Fallback if estimation fails
        return { start: 1, end: 1 };
    }
}

/**
 * Check if Python chunking service is available
 *
 * @returns {Promise<boolean>} True if service is reachable
 */
export async function isPythonChunkingAvailable() {
    try {
        const response = await axios.get(`${PYTHON_SERVICE_URL}/health`, { timeout: 3000 });
        return response.status === 200;
    } catch (error) {
        return false;
    }
}

/**
 * Get chunking parameters based on document type
 * Optimized for each format based on typical structure
 *
 * @param {string} documentType - Document type ('pdf', 'docx', 'pptx')
 * @returns {object} Chunking parameters {chunkSize, chunkOverlap}
 */
export function getOptimalChunkingParams(documentType) {
    switch (documentType.toLowerCase()) {
        case 'pdf':
            // PDFs: Standard academic/business documents
            // Larger chunks to preserve context across paragraphs
            return {
                chunkSize: 800,
                chunkOverlap: 100,
                description: 'PDF: Section-aware chunking with heading detection'
            };

        case 'docx':
        case 'doc':
            // DOCX: Word documents, often have shorter paragraphs
            // Medium chunks to respect paragraph boundaries
            return {
                chunkSize: 700,
                chunkOverlap: 80,
                description: 'DOCX: Paragraph-based chunking with list preservation'
            };

        case 'pptx':
        case 'ppt':
            // PPTX: Presentations, slide-based structure
            // Smaller chunks since slides are discrete units
            return {
                chunkSize: 500,
                chunkOverlap: 50,
                description: 'PPTX: Slide-based chunking with bullet preservation'
            };

        default:
            // Default parameters
            return {
                chunkSize: 800,
                chunkOverlap: 100,
                description: 'Default chunking strategy'
            };
    }
}

/**
 * Smart chunking with automatic fallback
 * Tries Python service first, falls back to Node.js chunking if unavailable
 *
 * @param {string} text - Text to chunk
 * @param {string} fileType - Document type
 * @param {object} fallbackChunker - Fallback chunking function (RecursiveCharacterTextSplitter)
 * @returns {Promise<Array>} Array of chunks
 */
export async function smartChunk(text, fileType, fallbackChunker = null) {
    const params = getOptimalChunkingParams(fileType);

    // Try Python service first
    const pythonChunks = await chunkWithPythonService(
        text,
        fileType,
        params.chunkSize,
        params.chunkOverlap
    );

    if (pythonChunks && pythonChunks.length > 0) {
        console.log(`   ✅ Using Python multi-strategy chunking: ${params.description}`);
        return pythonChunks;
    }

    // Fallback to Node.js chunking
    if (fallbackChunker) {
        console.log(`   ⚠️  Falling back to Node.js RecursiveCharacterTextSplitter`);
        return fallbackChunker.splitTextWithOffsets(text);
    }

    // If no fallback provided, throw error
    throw new Error('Python chunking service unavailable and no fallback provided');
}

export default {
    chunkWithPythonService,
    isPythonChunkingAvailable,
    getOptimalChunkingParams,
    smartChunk
};
