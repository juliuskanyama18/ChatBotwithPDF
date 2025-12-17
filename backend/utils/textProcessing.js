import { encoding_for_model } from 'tiktoken';

/**
 * Split text into chunks with overlap for better context preservation
 * @param {string} text - The text to chunk
 * @param {number} chunkSize - Maximum tokens per chunk (default: 500)
 * @param {number} overlap - Number of overlapping tokens between chunks (default: 50)
 * @returns {Array} Array of text chunks
 */
export function chunkText(text, chunkSize = 500, overlap = 50) {
    try {
        // Initialize tokenizer for GPT models
        const encoder = encoding_for_model('gpt-3.5-turbo');

        // Encode the entire text
        const tokens = encoder.encode(text);

        const chunks = [];
        let start = 0;

        while (start < tokens.length) {
            // Get chunk of tokens
            const end = Math.min(start + chunkSize, tokens.length);
            const chunkTokens = tokens.slice(start, end);

            // Decode back to text
            const chunkText = new TextDecoder().decode(encoder.decode(chunkTokens));
            chunks.push(chunkText.trim());

            // Move start position with overlap
            start += chunkSize - overlap;

            // Prevent infinite loop
            if (start >= tokens.length) break;
        }

        encoder.free();
        return chunks;

    } catch (error) {
        console.error('Error in chunkText:', error);
        // Fallback to simple character-based chunking
        return fallbackChunking(text, chunkSize * 4); // Approximate 4 chars per token
    }
}

/**
 * Fallback chunking method using character count
 * @param {string} text
 * @param {number} chunkSize
 * @returns {Array}
 */
function fallbackChunking(text, chunkSize = 2000) {
    const chunks = [];
    const sentences = text.split(/(?<=[.!?])\s+/);

    let currentChunk = '';

    for (const sentence of sentences) {
        if ((currentChunk + sentence).length > chunkSize && currentChunk.length > 0) {
            chunks.push(currentChunk.trim());
            currentChunk = sentence;
        } else {
            currentChunk += ' ' + sentence;
        }
    }

    if (currentChunk.trim().length > 0) {
        chunks.push(currentChunk.trim());
    }

    return chunks;
}

/**
 * Extract text from PDF and split by pages
 * @param {Object} pdfData - PDF data from pdf-parse
 * @returns {Array} Array of page texts with page numbers
 */
export function extractPageTexts(pdfData) {
    const pages = [];

    // If pdf-parse doesn't provide page-by-page text, split the full text
    if (pdfData.numpages && pdfData.text) {
        // Estimate pages by splitting text evenly
        const textPerPage = Math.ceil(pdfData.text.length / pdfData.numpages);

        for (let i = 0; i < pdfData.numpages; i++) {
            const start = i * textPerPage;
            const end = Math.min(start + textPerPage, pdfData.text.length);
            pages.push({
                pageNumber: i + 1,
                text: pdfData.text.substring(start, end).trim()
            });
        }
    }

    return pages;
}

/**
 * Clean and normalize text
 * @param {string} text
 * @returns {string}
 */
export function cleanText(text) {
    return text
        .replace(/\s+/g, ' ') // Replace multiple spaces with single space
        .replace(/\n\s*\n/g, '\n') // Remove multiple newlines
        .trim();
}
