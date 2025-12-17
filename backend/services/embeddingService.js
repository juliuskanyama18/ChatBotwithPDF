import path from 'path';
import Document from '../models/Document.js';
import { chunkText, cleanText } from '../utils/textProcessing.js';
import { generateEmbeddingsBatch, storeEmbeddings } from '../utils/embeddings.js';
import { extractAndCaptionImages, cleanupImageFiles } from '../utils/imageExtractor.js';
import { extractTablesFromPDF } from '../utils/tableExtractor.js';

/**
 * Generate and store embeddings for a document
 */
export async function generateDocumentEmbeddings(documentId, userId, text) {
    try {
        console.log(`Starting embedding generation for document ${documentId}...`);

        // Get document to check type
        const document = await Document.findById(documentId);
        const documentType = path.extname(document.fileName).substring(1).toLowerCase();

        // Clean and chunk the text
        const cleanedText = cleanText(text);
        // Increased chunk size (800 tokens) and overlap (100 tokens)
        const chunks = chunkText(cleanedText, 800, 100);

        console.log(`Generated ${chunks.length} chunks for document ${documentId}`);

        // Prepare chunks with metadata - detect page/slide numbers
        const chunksWithMetadata = chunks.map((chunkText, index) => {
            let pageNumber = Math.floor(index / 2) + 1; // Default approximation

            // For PPTX: Look for "--- Slide X ---" markers
            if (documentType === 'pptx') {
                const slideMatch = chunkText.match(/---\s*Slide\s+(\d+)\s*---/i);
                if (slideMatch) {
                    pageNumber = parseInt(slideMatch[1], 10);
                }
            }
            // For PDF: Look for "--- Page X ---" markers
            else if (documentType === 'pdf') {
                const pageMatch = chunkText.match(/---\s*Page\s+(\d+)\s*---/i);
                if (pageMatch) {
                    pageNumber = parseInt(pageMatch[1], 10);
                }
            }

            return {
                text: chunkText,
                pageNumber: pageNumber,
                chunkIndex: index
            };
        });

        // Feature 3: Extract and caption images (if PDF)
        let imageCaptions = [];
        let imageFiles = [];

        if (documentType === 'pdf' && document.filePath) {
            try {
                const captionedImages = await extractAndCaptionImages(document.filePath, documentType);

                if (captionedImages.length > 0) {
                    // Add image captions as separate chunks with special marker
                    imageCaptions = captionedImages.map((img, idx) => ({
                        text: `[IMAGE DESCRIPTION - Page ${img.pageNumber}]: ${img.caption}`,
                        pageNumber: img.pageNumber,
                        chunkIndex: chunksWithMetadata.length + idx
                    }));

                    // Collect image file paths for cleanup
                    imageFiles = captionedImages.map(img => img.imagePath);

                    console.log(`   📷 Added ${imageCaptions.length} image caption chunks`);
                }
            } catch (error) {
                console.error('⚠️  Error processing images:', error.message);
                // Continue without image captions if there's an error
            }
        }

        // TASK B: Extract tables from PDF (if PDF)
        let tableCaptions = [];

        if (documentType === 'pdf' && document.filePath) {
            try {
                const extractedTables = await extractTablesFromPDF(document.filePath, documentType);

                if (extractedTables.length > 0) {
                    // Add table markdown as separate chunks with special marker
                    tableCaptions = extractedTables.map((table, idx) => ({
                        text: `[TABLE - Page ${table.pageNumber}]:\n${table.tableMarkdown}`,
                        pageNumber: table.pageNumber,
                        chunkIndex: chunksWithMetadata.length + imageCaptions.length + idx
                    }));

                    console.log(`   📊 Added ${tableCaptions.length} table chunks`);
                }
            } catch (error) {
                console.error('⚠️  Error processing tables:', error.message);
                // Continue without table chunks if there's an error
            }
        }

        // Combine text chunks, image captions, and table chunks
        const allChunks = [...chunksWithMetadata, ...imageCaptions, ...tableCaptions];

        // Generate embeddings for all chunks (text + image captions)
        const textArray = allChunks.map(c => c.text);
        const embeddings = await generateEmbeddingsBatch(textArray);

        console.log(`Generated ${embeddings.length} embeddings for document ${documentId} (${chunksWithMetadata.length} text + ${imageCaptions.length} images + ${tableCaptions.length} tables)`);

        // Store embeddings in database with document type
        await storeEmbeddings(documentId, userId, allChunks, embeddings, documentType);

        // Clean up temporary image files
        if (imageFiles.length > 0) {
            cleanupImageFiles(imageFiles);
        }

        console.log(`✅ Successfully stored embeddings for document ${documentId}`);
    } catch (error) {
        console.error(`Error in generateDocumentEmbeddings for ${documentId}:`, error);
        throw error;
    }
}
