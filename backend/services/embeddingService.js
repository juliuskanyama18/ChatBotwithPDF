import path from 'path';
import Document from '../models/Document.js';
import { RecursiveCharacterTextSplitter, preprocessText, parseTableStructure, containsTable } from '../utils/semanticChunking.js';
import { generateEmbeddingsBatch, storeEmbeddings } from '../utils/embeddings.js';
import { extractAndCaptionImages, cleanupImageFiles } from '../utils/imageExtractor.js';
import { extractTextWithPageBoundaries } from '../utils/documentProcessor.js';

/**
 * Generate and store embeddings for a document (IMPROVED VERSION)
 * Now uses semantic chunking and correct page boundaries for all formats
 */
export async function generateDocumentEmbeddings(documentId, userId, rawText) {
    try {
        console.log(`\n🚀 Starting IMPROVED embedding generation for document ${documentId}...`);

        // Get document to check type
        const document = await Document.findById(documentId);
        const documentType = path.extname(document.fileName).substring(1).toLowerCase();

        // IMPROVEMENT 1: Extract text with correct page/slide boundaries
        const pageTexts = await extractTextWithPageBoundaries(
            document.filePath,
            documentType,
            rawText
        );

        console.log(`   📊 Extracted ${pageTexts.length} ${pageTexts[0]?.pageType || 'page'}s`);

        // IMPROVEMENT 2: Process each page/slide with semantic chunking
        const allChunksWithPages = [];

        for (const pageData of pageTexts) {
            const cleanedText = preprocessText(pageData.text);

            if (!cleanedText || cleanedText.length < 50) {
                console.log(`   ⏭️  Skipping ${pageData.pageType} ${pageData.pageNumber} (too short)`);
                continue;
            }

            // IMPROVEMENT 3: Use semantic chunking with format-aware parameters
            const chunkParams = getChunkingParams(documentType);
            const splitter = new RecursiveCharacterTextSplitter(chunkParams);

            // 🎯 PHASE 2: Use splitTextWithOffsets for character offset tracking
            const pageChunksWithOffsets = splitter.splitTextWithOffsets(cleanedText);
            console.log(`   📄 ${pageData.pageType} ${pageData.pageNumber}: ${pageChunksWithOffsets.length} chunks`);

            // Add page metadata to each chunk
            pageChunksWithOffsets.forEach((chunkData) => {
                // 🎯 PHASE 2: Check if chunk contains a table
                let chunkType = 'text';
                let tableStructure = null;
                let finalText = chunkData.text;

                if (containsTable(chunkData.text)) {
                    const parsed = parseTableStructure(chunkData.text);
                    if (parsed.structured) {
                        chunkType = 'table';
                        tableStructure = {
                            headers: parsed.headers,
                            data: parsed.data,
                            rowCount: parsed.rowCount,
                            columnCount: parsed.columnCount,
                            format: parsed.format
                        };
                        // Use searchable text for embedding
                        finalText = parsed.searchableText;
                        console.log(`      📊 Table detected: ${parsed.rowCount}x${parsed.columnCount}`);
                    }
                }

                allChunksWithPages.push({
                    text: finalText,
                    pageNumber: pageData.pageNumber,
                    pageType: pageData.pageType,
                    chunkIndex: allChunksWithPages.length,
                    chunkType,
                    // 🎯 PHASE 2: Store character offsets
                    startOffset: chunkData.startOffset,
                    endOffset: chunkData.endOffset,
                    lineRange: chunkData.lineRange,
                    // 🎯 PHASE 2: Store table structure if applicable
                    tableStructure
                });
            });
        }

        console.log(`   📊 Total text chunks: ${allChunksWithPages.length}`);

        // IMPROVEMENT 4: Extract and caption images (PDF only for now)
        let imageCaptions = [];
        let imageFiles = [];

        if (documentType === 'pdf' && document.filePath) {
            try {
                const captionedImages = await extractAndCaptionImages(document.filePath, documentType);

                if (captionedImages.length > 0) {
                    imageCaptions = captionedImages.map((img, idx) => ({
                        text: `[IMAGE DESCRIPTION - Page ${img.pageNumber}]: ${img.caption}`,
                        pageNumber: img.pageNumber,
                        pageType: 'page',
                        chunkIndex: allChunksWithPages.length + idx
                    }));

                    imageFiles = captionedImages.map(img => img.imagePath);
                    console.log(`   📷 Added ${imageCaptions.length} image caption chunks`);
                }
            } catch (error) {
                console.error('⚠️  Error processing images:', error.message);
                // Continue without image captions if there's an error
            }
        }

        // Combine text chunks and image captions
        const allChunks = [...allChunksWithPages, ...imageCaptions];
        console.log(`   ✅ Total chunks (text + images): ${allChunks.length}`);

        // Generate embeddings for all chunks (text + image captions)
        const textArray = allChunks.map(c => c.text);
        const embeddings = await generateEmbeddingsBatch(textArray);

        console.log(`   ✅ Generated ${embeddings.length} embeddings`);

        // Store embeddings in database with document type
        await storeEmbeddings(documentId, userId, allChunks, embeddings, documentType);

        // Clean up temporary image files
        if (imageFiles.length > 0) {
            cleanupImageFiles(imageFiles);
        }

        console.log(`✅ Successfully stored embeddings for document ${documentId}\n`);
    } catch (error) {
        console.error(`❌ Error in generateDocumentEmbeddings for ${documentId}:`, error);
        throw error;
    }
}

/**
 * Get optimal chunking parameters for each document type
 * Different formats need different chunking strategies
 */
function getChunkingParams(documentType) {
    switch (documentType) {
        case 'pdf':
            // PDFs: Standard academic/business documents
            return {
                chunkSize: 800,          // Increased from 500
                chunkOverlap: 100,       // Increased from 50
                separators: ['\n\n', '\n', '. ', '! ', '? ', ', ', ' ', '']
            };

        case 'pptx':
            // Slides: Shorter, more concise content
            return {
                chunkSize: 500,
                chunkOverlap: 75,
                separators: ['\n\n', '\n', '. ', '! ', '? ', ' ', '']
            };

        case 'docx':
            // Documents: Can be very long, need larger chunks
            return {
                chunkSize: 1000,
                chunkOverlap: 150,
                separators: ['\n\n', '\n', '. ', '! ', '? ', ', ', ' ', '']
            };

        default:
            // Default fallback
            return {
                chunkSize: 800,
                chunkOverlap: 100,
                separators: ['\n\n', '\n', '. ', '! ', '? ', ', ', ' ', '']
            };
    }
}
