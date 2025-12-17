import axios from 'axios';
import fs from 'fs';
import FormData from 'form-data';
import pdf from 'pdf-parse';

const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000';

/**
 * Detect if a PDF is scanned (has no extractable text)
 * @param {string} filePath - Path to the PDF file
 * @returns {Promise<boolean>} True if scanned/image-based PDF
 */
export async function detectIfScannedPDF(filePath) {
    try {
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdf(dataBuffer);

        // If text length is very short compared to number of pages,
        // it's likely a scanned PDF
        const avgTextPerPage = data.text.length / data.numpages;

        // Heuristic: less than 100 characters per page suggests scanned PDF
        const isScanned = avgTextPerPage < 100;

        if (isScanned) {
            console.log(`📄 PDF appears to be scanned (${avgTextPerPage.toFixed(0)} chars/page)`);
        } else {
            console.log(`📝 PDF has extractable text (${avgTextPerPage.toFixed(0)} chars/page)`);
        }

        return isScanned;
    } catch (error) {
        console.error('Error detecting scanned PDF:', error.message);
        // If we can't parse, assume it might be scanned
        return true;
    }
}

/**
 * Send file to Python OCR service
 * @param {string} filePath - Path to the file (image or scanned PDF)
 * @param {string} fileType - File extension (.pdf, .png, .jpg, etc.)
 * @returns {Promise<object>} OCR result with extracted text
 */
export async function sendToOCR(filePath, fileType) {
    try {
        console.log(`🔍 Sending file to OCR service: ${filePath}`);

        // Check if file exists
        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }

        // Create form data
        const form = new FormData();
        form.append('file', fs.createReadStream(filePath));

        // Send to Python OCR endpoint
        const response = await axios.post(`${PYTHON_SERVICE_URL}/ocr`, form, {
            headers: {
                ...form.getHeaders()
            },
            timeout: 120000, // 2 minute timeout for OCR
            maxBodyLength: Infinity,
            maxContentLength: Infinity
        });

        if (response.data.success) {
            console.log(`✅ OCR completed: ${response.data.text.length} characters extracted`);
            console.log(`   Pages processed: ${response.data.pageCount || 1}`);

            return {
                success: true,
                text: response.data.text,
                pageCount: response.data.pageCount || 1,
                language: response.data.language || 'en',
                method: 'ocr',
                confidence: response.data.confidence || null
            };
        } else {
            throw new Error(response.data.error || 'OCR failed');
        }
    } catch (error) {
        console.error('❌ OCR error:', error.message);

        // Check if it's a connection error (service not available)
        if (error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET') {
            return {
                success: false,
                error: 'OCR service not available',
                serviceUnavailable: true
            };
        }

        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Process a file with OCR if needed
 * @param {string} filePath - Path to the file
 * @param {string} fileType - File extension
 * @returns {Promise<object>} Processed result
 */
export async function processWithOCR(filePath, fileType) {
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.tiff', '.tif', '.bmp'];

    // Always use OCR for images
    if (imageExtensions.includes(fileType.toLowerCase())) {
        console.log(`📷 Image file detected - using OCR`);
        return await sendToOCR(filePath, fileType);
    }

    // For PDFs, check if it's scanned
    if (fileType.toLowerCase() === '.pdf') {
        const isScanned = await detectIfScannedPDF(filePath);

        if (isScanned) {
            console.log(`📄 Scanned PDF detected - using OCR`);
            return await sendToOCR(filePath, fileType);
        } else {
            console.log(`📝 Text-based PDF - OCR not needed`);
            return {
                success: false,
                needsOCR: false,
                message: 'PDF has extractable text, OCR not needed'
            };
        }
    }

    return {
        success: false,
        needsOCR: false,
        message: 'File type does not require OCR'
    };
}

/**
 * Check if Python OCR service is healthy
 * @returns {Promise<boolean>} True if service is available
 */
export async function isOCRServiceHealthy() {
    try {
        const response = await axios.get(`${PYTHON_SERVICE_URL}/health`, {
            timeout: 5000
        });

        return response.status === 200 && response.data.status === 'healthy';
    } catch (error) {
        return false;
    }
}

export default {
    detectIfScannedPDF,
    sendToOCR,
    processWithOCR,
    isOCRServiceHealthy
};
