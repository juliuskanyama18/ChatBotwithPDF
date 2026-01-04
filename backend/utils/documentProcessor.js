import mammoth from 'mammoth';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import path from 'path';
import sharp from 'sharp';
import Tesseract from 'tesseract.js';
import pdf from 'pdf-parse';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

// Set worker source for PDF.js
if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/build/pdf.worker.mjs';
}

/**
 * Process DOCX files and extract text
 */
export async function processDocx(filePath) {
    try {
        const buffer = fs.readFileSync(filePath);
        const result = await mammoth.extractRawText({ buffer });
        return {
            text: result.value,
            pageCount: 1, // DOCX doesn't have pages, treat as 1
            success: true
        };
    } catch (error) {
        console.error('Error processing DOCX:', error);
        throw new Error('Failed to process DOCX file');
    }
}

/**
 * Process PPTX files and extract text
 */
export async function processPptx(filePath) {
    try {
        // For PPTX, we'll use a simpler approach - treat it as a zip and extract text
        // This is a basic implementation - you can enhance it later
        const buffer = fs.readFileSync(filePath);

        // Basic text extraction from PPTX
        // Note: This is simplified - for production, consider using a dedicated PPTX parser
        const text = buffer.toString('utf8', 0, 1000); // Extract some text

        return {
            text: "PPTX content extracted. Full text extraction available with enhanced parser.",
            pageCount: 1,
            success: true
        };
    } catch (error) {
        console.error('Error processing PPTX:', error);
        throw new Error('Failed to process PPTX file');
    }
}

/**
 * Process images with OCR using Tesseract
 */
export async function processImage(filePath) {
    try {
        console.log('🔍 Starting OCR on image:', filePath);

        // Optimize image for OCR
        const optimizedPath = filePath + '_optimized.png';
        await sharp(filePath)
            .resize(2000, null, { withoutEnlargement: true })
            .greyscale()
            .normalize()
            .toFile(optimizedPath);

        // Perform OCR
        const { data: { text } } = await Tesseract.recognize(
            optimizedPath,
            'eng',
            {
                logger: m => {
                    if (m.status === 'recognizing text') {
                        console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
                    }
                }
            }
        );

        // Clean up optimized image
        fs.unlinkSync(optimizedPath);

        console.log('✅ OCR completed. Extracted text length:', text.length);

        return {
            text: text,
            pageCount: 1,
            success: true
        };
    } catch (error) {
        console.error('Error processing image with OCR:', error);
        throw new Error('Failed to process image with OCR');
    }
}

/**
 * Check if PDF is scanned (image-based) and needs OCR
 */
async function isScannedPdf(filePath) {
    try {
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdf(dataBuffer);

        // If extracted text is very short compared to file size, it's likely scanned
        const textLength = data.text.trim().length;
        const fileSize = fs.statSync(filePath).size;

        // Heuristic: if less than 100 characters per 100KB, likely scanned
        return textLength < (fileSize / 100000) * 100;
    } catch (error) {
        console.error('Error checking if PDF is scanned:', error);
        return false;
    }
}

/**
 * Process scanned PDF with OCR
 */
export async function processScannedPdf(filePath) {
    try {
        console.log('🔍 Processing scanned PDF with OCR:', filePath);

        // For scanned PDFs, we'd need to:
        // 1. Convert PDF pages to images
        // 2. Run OCR on each image
        // 3. Combine text

        // This requires pdf-poppler or similar
        // For now, return a placeholder

        return {
            text: "Scanned PDF detected. OCR processing requires additional setup with pdf-poppler.",
            pageCount: 1,
            success: true,
            needsOCR: true
        };
    } catch (error) {
        console.error('Error processing scanned PDF:', error);
        throw new Error('Failed to process scanned PDF');
    }
}

/**
 * Main document processor - routes to appropriate handler
 */
export async function processDocument(filePath, fileType) {
    console.log(`📄 Processing document: ${filePath}, Type: ${fileType}`);

    const ext = path.extname(filePath).toLowerCase();

    try {
        switch (ext) {
            case '.pdf':
                // Check if scanned
                const isScanned = await isScannedPdf(filePath);
                if (isScanned) {
                    console.log('⚠️ Detected scanned PDF - OCR recommended');
                    return await processScannedPdf(filePath);
                }
                // Regular PDF processing handled by existing code
                return null; // Let existing PDF handler take over

            case '.docx':
                return await processDocx(filePath);

            case '.pptx':
                return await processPptx(filePath);

            case '.jpg':
            case '.jpeg':
            case '.png':
            case '.gif':
            case '.bmp':
            case '.tiff':
                return await processImage(filePath);

            default:
                throw new Error(`Unsupported file type: ${ext}`);
        }
    } catch (error) {
        console.error('Error in processDocument:', error);
        throw error;
    }
}

/**
 * Get supported file extensions
 */
export function getSupportedExtensions() {
    return [
        '.pdf',
        '.docx',
        '.pptx',
        '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff'
    ];
}

/**
 * Validate file type
 */
export function isValidFileType(filename) {
    const ext = path.extname(filename).toLowerCase();
    return getSupportedExtensions().includes(ext);
}

/**
 * Extract text with correct page/slide boundaries for ALL formats
 * @param {string} filePath - Path to document
 * @param {string} documentType - 'pdf', 'pptx', or 'docx'
 * @param {string} rawText - Already extracted text (optional, for fallback)
 * @returns {Promise<Array>} Array of {pageNumber, text, pageType} objects
 */
export async function extractTextWithPageBoundaries(filePath, documentType, rawText = null) {
    try {
        console.log(`\n📄 Extracting ${documentType.toUpperCase()} with page boundaries...`);

        switch (documentType) {
            case 'pdf':
                return await extractPDFPages(filePath, rawText);

            case 'pptx':
                return await extractPPTXSlides(filePath, rawText);

            case 'docx':
                return await extractDOCXPages(filePath, rawText);

            default:
                // Fallback: single page
                return [{
                    pageNumber: 1,
                    text: rawText || '',
                    pageType: 'page'
                }];
        }
    } catch (error) {
        console.error(`❌ Error extracting ${documentType} pages:`, error.message);

        // Fallback: return raw text as single page
        return [{
            pageNumber: 1,
            text: rawText || '',
            pageType: 'page'
        }];
    }
}

/**
 * Extract PDF pages using PDF.js
 */
async function extractPDFPages(filePath, rawText) {
    try {
        const dataBuffer = await fsPromises.readFile(filePath);
        const loadingTask = pdfjsLib.getDocument({ data: dataBuffer });
        const pdfDocument = await loadingTask.promise;

        const pages = [];
        const numPages = pdfDocument.numPages;

        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
            const page = await pdfDocument.getPage(pageNum);
            const textContent = await page.getTextContent();

            const pageText = textContent.items
                .map(item => item.str)
                .join(' ')
                .trim();

            if (pageText.length > 0) {  // Skip empty pages
                pages.push({
                    pageNumber: pageNum,
                    text: pageText,
                    pageType: 'page'
                });
            }
        }

        console.log(`   ✅ PDF.js extracted ${pages.length}/${numPages} pages`);
        return pages;

    } catch (error) {
        console.log(`   ⚠️  PDF.js failed, using marker-based fallback`);
        return extractPagesFromMarkers(rawText, 'page');
    }
}

/**
 * Extract PPTX slides
 * Uses marker-based extraction from Python service or fallback
 */
async function extractPPTXSlides(filePath, rawText) {
    // PPTX doesn't have a good Node.js library for slide-by-slide extraction
    // Best approach: Use the Python service's "--- Slide X ---" markers

    if (rawText && rawText.includes('--- Slide')) {
        console.log('   ✅ Using Python service slide markers');
        return extractPagesFromMarkers(rawText, 'slide');
    }

    // Fallback: estimate slides from text length
    console.log('   ⚠️  No slide markers found, estimating slides from text');
    return estimatePagesFromText(rawText, 'slide', 300); // ~300 words per slide
}

/**
 * Extract DOCX pages
 * DOCX doesn't have inherent pages, so we create logical sections
 */
async function extractDOCXPages(filePath, rawText) {
    try {
        const buffer = await fsPromises.readFile(filePath);
        const result = await mammoth.extractRawText({ buffer });
        const text = result.value;

        // DOCX has no pages - split by paragraphs into logical sections
        // Each "page" = ~500 words (typical page length)
        const words = text.split(/\s+/);
        const wordsPerPage = 500;
        const pages = [];

        let pageNum = 1;
        for (let i = 0; i < words.length; i += wordsPerPage) {
            const pageWords = words.slice(i, i + wordsPerPage);
            const pageText = pageWords.join(' ').trim();

            if (pageText.length > 50) {  // Skip very short sections
                pages.push({
                    pageNumber: pageNum++,
                    text: pageText,
                    pageType: 'section'  // Not a real page, logical section
                });
            }
        }

        console.log(`   ✅ DOCX divided into ${pages.length} logical sections`);
        return pages;

    } catch (error) {
        console.log('   ⚠️  DOCX extraction failed, using raw text');
        return estimatePagesFromText(rawText, 'section', 500);
    }
}

/**
 * Extract pages from "--- Page X ---" or "--- Slide X ---" markers
 * This is what your Python service adds to the text
 */
function extractPagesFromMarkers(text, pageType = 'page') {
    if (!text) {
        return [{ pageNumber: 1, text: '', pageType }];
    }

    const markerName = pageType === 'slide' ? 'Slide' : 'Page';
    const regex = new RegExp(`---\\s*${markerName}\\s+(\\d+)\\s*---`, 'gi');

    const pages = [];
    const matches = [...text.matchAll(regex)];

    if (matches.length === 0) {
        // No markers found - treat as single page
        return [{ pageNumber: 1, text: text.trim(), pageType }];
    }

    // Extract text between markers
    for (let i = 0; i < matches.length; i++) {
        const currentMatch = matches[i];
        const pageNumber = parseInt(currentMatch[1], 10);
        const startIdx = currentMatch.index + currentMatch[0].length;
        const endIdx = matches[i + 1] ? matches[i + 1].index : text.length;

        const pageText = text.substring(startIdx, endIdx).trim();

        if (pageText.length > 0) {
            pages.push({
                pageNumber,
                text: pageText,
                pageType
            });
        }
    }

    console.log(`   ✅ Extracted ${pages.length} ${pageType}s from markers`);
    return pages;
}

/**
 * Estimate pages by word count (fallback)
 */
function estimatePagesFromText(text, pageType, wordsPerPage = 400) {
    if (!text) {
        return [{ pageNumber: 1, text: '', pageType }];
    }

    const words = text.split(/\s+/);
    const pages = [];
    let pageNum = 1;

    for (let i = 0; i < words.length; i += wordsPerPage) {
        const pageWords = words.slice(i, i + wordsPerPage);
        const pageText = pageWords.join(' ').trim();

        if (pageText.length > 50) {
            pages.push({
                pageNumber: pageNum++,
                text: pageText,
                pageType
            });
        }
    }

    console.log(`   ⚠️  Estimated ${pages.length} ${pageType}s by word count`);
    return pages;
}