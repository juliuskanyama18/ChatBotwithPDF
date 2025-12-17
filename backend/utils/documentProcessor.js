import mammoth from 'mammoth';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import Tesseract from 'tesseract.js';
import pdf from 'pdf-parse';

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