import { encoding_for_model } from 'tiktoken';

/**
 * Recursive Character Text Splitter (LangChain-inspired)
 * Splits text while preserving semantic boundaries (paragraphs → sentences → words)
 *
 * Based on: https://docs.langchain.com/oss/python/integrations/splitters
 */
export class RecursiveCharacterTextSplitter {
    constructor({
        chunkSize = 800,        // tokens
        chunkOverlap = 100,     // tokens
        separators = ['\n\n', '\n', '. ', ' ', '']  // Try these in order
    } = {}) {
        this.chunkSize = chunkSize;
        this.chunkOverlap = chunkOverlap;
        this.separators = separators;
        this.encoder = encoding_for_model('gpt-3.5-turbo');
    }

    /**
     * Split text into semantically meaningful chunks
     * @param {string} text - The text to split
     * @returns {Array<string>} Array of text chunks
     */
    splitText(text) {
        const chunks = [];

        // Try each separator in order until we find one that works
        const finalChunks = this._recursiveSplit(text, this.separators);

        this.encoder.free();
        return finalChunks.filter(chunk => chunk.trim().length > 0);
    }

    /**
     * 🎯 PHASE 2: Split text with character offset tracking
     * @param {string} fullText - The full text to split
     * @returns {Array<Object>} Array of chunks with offset metadata
     */
    splitTextWithOffsets(fullText) {
        // Get basic chunks first
        const chunks = this.splitText(fullText);

        // Add character offsets and line ranges
        let currentOffset = 0;
        const chunksWithOffsets = [];

        for (let i = 0; i < chunks.length; i++) {
            const chunkText = chunks[i];

            // Find chunk in full text
            const startOffset = fullText.indexOf(chunkText, currentOffset);

            if (startOffset === -1) {
                // Fallback if exact match not found (shouldn't happen)
                console.warn(`⚠️ Could not find chunk ${i} in text, using approximate offset`);
                chunksWithOffsets.push({
                    text: chunkText,
                    index: i,
                    startOffset: null,
                    endOffset: null,
                    lineRange: { from: null, to: null }
                });
                continue;
            }

            const endOffset = startOffset + chunkText.length;

            // Calculate line numbers
            const textUpToChunk = fullText.slice(0, startOffset);
            const lineStart = textUpToChunk.split('\n').length;
            const lineEnd = lineStart + chunkText.split('\n').length - 1;

            chunksWithOffsets.push({
                text: chunkText,
                index: i,
                startOffset,
                endOffset,
                lineRange: {
                    from: lineStart,
                    to: lineEnd
                }
            });

            currentOffset = endOffset;
        }

        return chunksWithOffsets;
    }

    /**
     * Recursively split text using separators
     */
    _recursiveSplit(text, separators) {
        const finalChunks = [];
        const separator = separators[0] || '';
        const newSeparators = separators.slice(1);

        // Split by current separator
        const splits = separator ? text.split(separator) : [text];

        const goodSplits = [];
        for (const split of splits) {
            const numTokens = this._countTokens(split);

            if (numTokens < this.chunkSize) {
                // Small enough - keep as is
                goodSplits.push(split);
            } else {
                // Too large - merge what we have and continue
                if (goodSplits.length > 0) {
                    const mergedSplits = this._mergeSplits(goodSplits, separator);
                    finalChunks.push(...mergedSplits);
                    goodSplits.length = 0; // Clear
                }

                // Recursively split this large chunk with next separator
                if (newSeparators.length === 0) {
                    // No more separators - force split by tokens
                    finalChunks.push(split);
                } else {
                    const recursiveChunks = this._recursiveSplit(split, newSeparators);
                    finalChunks.push(...recursiveChunks);
                }
            }
        }

        // Merge remaining splits
        if (goodSplits.length > 0) {
            const mergedSplits = this._mergeSplits(goodSplits, separator);
            finalChunks.push(...mergedSplits);
        }

        return finalChunks;
    }

    /**
     * Merge splits while respecting chunk size and overlap
     */
    _mergeSplits(splits, separator) {
        const mergedChunks = [];
        let currentChunk = [];
        let currentTokenCount = 0;

        for (const split of splits) {
            const splitTokens = this._countTokens(split);

            // Would adding this split exceed chunk size?
            const separatorTokens = separator ? this._countTokens(separator) : 0;
            const newTokenCount = currentTokenCount + splitTokens + separatorTokens;

            if (newTokenCount > this.chunkSize && currentChunk.length > 0) {
                // Save current chunk
                mergedChunks.push(currentChunk.join(separator));

                // Start new chunk with overlap
                const overlapChunks = this._getOverlapChunks(currentChunk, separator);
                currentChunk = overlapChunks;
                currentTokenCount = this._countTokens(currentChunk.join(separator));
            }

            currentChunk.push(split);
            currentTokenCount += splitTokens + separatorTokens;
        }

        // Add remaining chunk
        if (currentChunk.length > 0) {
            mergedChunks.push(currentChunk.join(separator));
        }

        return mergedChunks;
    }

    /**
     * Get overlapping content from previous chunk
     */
    _getOverlapChunks(chunks, separator) {
        const overlapChunks = [];
        let overlapTokenCount = 0;

        // Take chunks from the end until we reach overlap size
        for (let i = chunks.length - 1; i >= 0; i--) {
            const chunk = chunks[i];
            const tokenCount = this._countTokens(chunk);

            if (overlapTokenCount + tokenCount <= this.chunkOverlap) {
                overlapChunks.unshift(chunk);
                overlapTokenCount += tokenCount + this._countTokens(separator);
            } else {
                break;
            }
        }

        return overlapChunks;
    }

    /**
     * Count tokens in text
     */
    _countTokens(text) {
        if (!text) return 0;
        return this.encoder.encode(text).length;
    }
}

/**
 * Enhanced text preprocessing before chunking
 * @param {string} text - Raw text from document
 * @returns {string} Cleaned text
 */
export function preprocessText(text) {
    if (!text || typeof text !== 'string') {
        return '';
    }

    let cleaned = text;

    // 1. Normalize Unicode characters
    cleaned = cleaned.normalize('NFKC');

    // 2. Fix hyphenated words at line breaks
    cleaned = cleaned.replace(/(\w+)-\n(\w+)/g, '$1$2');

    // 3. Remove excessive whitespace (but preserve paragraph breaks)
    cleaned = cleaned.replace(/[ \t]+/g, ' '); // Multiple spaces → single space
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n'); // 3+ newlines → 2 newlines

    // 4. Remove common page headers/footers patterns
    cleaned = cleaned.replace(/^Page \d+ of \d+$/gm, ''); // "Page 1 of 10"
    cleaned = cleaned.replace(/^\d+\s*$/gm, ''); // Standalone page numbers

    // 5. Trim each line
    cleaned = cleaned.split('\n').map(line => line.trim()).join('\n');

    // 6. Remove empty lines
    cleaned = cleaned.replace(/\n\s*\n/g, '\n\n');

    return cleaned.trim();
}

/**
 * 🎯 PHASE 2: Parse table structure from text
 * Detects markdown and tab-delimited tables and preserves their structure
 * @param {string} tableText - Raw table text
 * @returns {Object} Structured table data or null if not a table
 */
export function parseTableStructure(tableText) {
    if (!tableText || typeof tableText !== 'string') {
        return { structured: false, rawText: tableText };
    }

    // Detect table format
    const isMarkdown = tableText.includes('|') && tableText.split('\n').filter(line => line.includes('|')).length >= 2;
    const isTabDelimited = tableText.includes('\t') && tableText.split('\n').filter(line => line.includes('\t')).length >= 2;

    if (!isMarkdown && !isTabDelimited) {
        return { structured: false, rawText: tableText };
    }

    try {
        let rows;

        if (isMarkdown) {
            // Parse markdown table
            rows = tableText
                .split('\n')
                .filter(line => line.trim().startsWith('|') || line.trim().includes('|'))
                .map(line =>
                    line.split('|')
                        .map(cell => cell.trim())
                        .filter(cell => cell.length > 0 && !cell.match(/^[-:]+$/))  // Remove separator and empty cells
                );

            // Remove separator row (contains only dashes and colons)
            rows = rows.filter(row => !row.every(cell => /^[-:\s]+$/.test(cell)));
        } else {
            // Parse tab-delimited table
            rows = tableText
                .split('\n')
                .filter(line => line.trim() && line.includes('\t'))
                .map(line => line.split('\t').map(cell => cell.trim()));
        }

        if (rows.length === 0) {
            return { structured: false, rawText: tableText };
        }

        const headers = rows[0];
        const data = rows.slice(1);

        // Validate: must have at least 1 header and 1 data row
        if (headers.length === 0 || data.length === 0) {
            return { structured: false, rawText: tableText };
        }

        // Create searchable text representation for embedding
        const searchableText = [
            `Table with ${headers.length} columns and ${data.length} rows.`,
            `Headers: ${headers.join(', ')}`,
            ...data.map((row, i) => `Row ${i + 1}: ${headers.map((h, j) => `${h}: ${row[j] || 'N/A'}`).join(', ')}`)
        ].join('\n');

        return {
            structured: true,
            format: isMarkdown ? 'markdown' : 'tab-delimited',
            headers,
            data,
            rowCount: data.length,
            columnCount: headers.length,
            searchableText,  // For vector search
            rawText: tableText  // Preserve original
        };
    } catch (error) {
        console.error('❌ Table parsing failed:', error.message);
        return { structured: false, rawText: tableText };
    }
}

/**
 * 🎯 PHASE 2: Detect if text contains a table
 * Quick heuristic check before parsing
 * @param {string} text - Text to check
 * @returns {boolean} True if likely a table
 */
export function containsTable(text) {
    if (!text || typeof text !== 'string') return false;

    // Check for markdown table (at least 2 lines with pipes)
    const pipeLines = text.split('\n').filter(line => line.includes('|')).length;
    if (pipeLines >= 2) return true;

    // Check for tab-delimited table (at least 2 lines with tabs)
    const tabLines = text.split('\n').filter(line => line.includes('\t')).length;
    if (tabLines >= 2) return true;

    return false;
}
