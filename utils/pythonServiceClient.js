/**
 * Python Document Processing Service Client
 *
 * This module provides a Node.js client for communicating with the Python FastAPI
 * document processing microservice.
 */

import FormData from 'form-data';
import fs from 'fs';
import axios from 'axios';

// Configuration
const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000';
const PYTHON_SERVICE_TIMEOUT = 120000; // 2 minutes for OCR processing

/**
 * Check if Python service is healthy and running
 * @returns {Promise<boolean>}
 */
export async function isPythonServiceHealthy() {
    try {
        const response = await axios.get(`${PYTHON_SERVICE_URL}/health`, {
            timeout: 5000
        });
        return response.data.status === 'healthy';
    } catch (error) {
        console.error('❌ Python service health check failed:', error.message);
        return false;
    }
}

/**
 * Extract text from PDF using Python service
 * @param {string} filePath - Path to the PDF file
 * @returns {Promise<{text: string, pages: number, success: boolean}>}
 */
export async function extractPdfViaPython(filePath) {
    try {
        const formData = new FormData();
        formData.append('file', fs.createReadStream(filePath));

        const response = await axios.post(
            `${PYTHON_SERVICE_URL}/extract/pdf`,
            formData,
            {
                headers: formData.getHeaders(),
                timeout: PYTHON_SERVICE_TIMEOUT,
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            }
        );

        console.log(`✅ Python service extracted ${response.data.char_count} characters from PDF`);
        return response.data;
    } catch (error) {
        console.error('❌ Python PDF extraction failed:', error.message);
        throw new Error(`Python service PDF extraction failed: ${error.message}`);
    }
}

/**
 * Extract text from DOCX using Python service
 * @param {string} filePath - Path to the DOCX file
 * @returns {Promise<{text: string, paragraphs: number, success: boolean}>}
 */
export async function extractDocxViaPython(filePath) {
    try {
        const formData = new FormData();
        formData.append('file', fs.createReadStream(filePath));

        const response = await axios.post(
            `${PYTHON_SERVICE_URL}/extract/docx`,
            formData,
            {
                headers: formData.getHeaders(),
                timeout: PYTHON_SERVICE_TIMEOUT,
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            }
        );

        console.log(`✅ Python service extracted ${response.data.char_count} characters from DOCX (${response.data.paragraphs} paragraphs)`);
        return response.data;
    } catch (error) {
        console.error('❌ Python DOCX extraction failed:', error.message);
        throw new Error(`Python service DOCX extraction failed: ${error.message}`);
    }
}

/**
 * Extract text from PPTX using Python service
 * @param {string} filePath - Path to the PPTX file
 * @returns {Promise<{text: string, slides: number, success: boolean}>}
 */
export async function extractPptxViaPython(filePath) {
    try {
        const formData = new FormData();
        formData.append('file', fs.createReadStream(filePath));

        const response = await axios.post(
            `${PYTHON_SERVICE_URL}/extract/pptx`,
            formData,
            {
                headers: formData.getHeaders(),
                timeout: PYTHON_SERVICE_TIMEOUT,
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            }
        );

        console.log(`✅ Python service extracted ${response.data.char_count} characters from PPTX (${response.data.slides} slides)`);
        return response.data;
    } catch (error) {
        console.error('❌ Python PPTX extraction failed:', error.message);
        throw new Error(`Python service PPTX extraction failed: ${error.message}`);
    }
}

/**
 * Extract text from image using OCR via Python service
 * @param {string} filePath - Path to the image file
 * @returns {Promise<{text: string, confidence?: number, success: boolean}>}
 */
export async function extractImageOcrViaPython(filePath) {
    try {
        const formData = new FormData();
        formData.append('file', fs.createReadStream(filePath));

        console.log('🔍 Starting OCR processing via Python service...');
        const response = await axios.post(
            `${PYTHON_SERVICE_URL}/extract/ocr`,
            formData,
            {
                headers: formData.getHeaders(),
                timeout: PYTHON_SERVICE_TIMEOUT,
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            }
        );

        const confidence = response.data.confidence ? ` (confidence: ${response.data.confidence}%)` : '';
        console.log(`✅ Python service extracted ${response.data.char_count} characters via OCR${confidence}`);
        return response.data;
    } catch (error) {
        console.error('❌ Python OCR extraction failed:', error.message);
        throw new Error(`Python service OCR extraction failed: ${error.message}`);
    }
}

/**
 * Convert PPTX to PDF using Python service (LibreOffice)
 * @param {string} filePath - Path to the PPTX file
 * @returns {Promise<Buffer>} PDF file as buffer
 */
export async function convertPptxToPdfViaPython(filePath) {
    try {
        console.log(`🔄 Converting PPTX to PDF via Python service...`);

        const formData = new FormData();
        formData.append('file', fs.createReadStream(filePath));

        const response = await axios.post(
            `${PYTHON_SERVICE_URL}/convert/pptx-to-pdf`,
            formData,
            {
                headers: formData.getHeaders(),
                timeout: 120000, // 2 minutes for conversion
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
                responseType: 'arraybuffer' // Important: receive binary data
            }
        );

        console.log(`✅ Successfully converted PPTX to PDF: ${response.data.length} bytes`);
        return response.data; // Returns PDF as Buffer
    } catch (error) {
        if (error.response && error.response.status === 503) {
            console.log('⚠️ LibreOffice not available for PPTX to PDF conversion');
            throw new Error('LIBREOFFICE_NOT_AVAILABLE');
        }
        console.error('❌ Python PPTX to PDF conversion failed:', error.message);
        throw new Error(`Python service PPTX to PDF conversion failed: ${error.message}`);
    }
}

/**
 * Auto-detect file type and extract text using Python service
 * @param {string} filePath - Path to the file
 * @returns {Promise<{text: string, success: boolean}>}
 */
export async function extractDocumentViaPython(filePath) {
    try {
        const formData = new FormData();
        formData.append('file', fs.createReadStream(filePath));

        const response = await axios.post(
            `${PYTHON_SERVICE_URL}/extract/auto`,
            formData,
            {
                headers: formData.getHeaders(),
                timeout: PYTHON_SERVICE_TIMEOUT,
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            }
        );

        console.log(`✅ Python service auto-extracted ${response.data.char_count} characters`);
        return response.data;
    } catch (error) {
        console.error('❌ Python auto-extraction failed:', error.message);
        throw new Error(`Python service extraction failed: ${error.message}`);
    }
}

/**
 * Process document using Python service with fallback to Node.js processing
 * @param {string} filePath - Path to the document
 * @param {string} fileExtension - File extension (.pdf, .docx, etc.)
 * @returns {Promise<{text: string, pageCount: number, success: boolean, method: string}>}
 */
export async function processDocumentWithFallback(filePath, fileExtension) {
    const ext = fileExtension.toLowerCase();

    // Check Python service health first
    const isPythonHealthy = await isPythonServiceHealthy();

    if (!isPythonHealthy) {
        console.warn('⚠️  Python service not available, will use fallback methods');
        return {
            success: false,
            method: 'none',
            error: 'Python service not available'
        };
    }

    try {
        let result;

        switch (ext) {
            case '.pdf':
                result = await extractPdfViaPython(filePath);
                return {
                    text: result.text,
                    pageCount: result.pages || 1,
                    success: true,
                    method: 'python-pdfplumber'
                };

            case '.docx':
                result = await extractDocxViaPython(filePath);
                // DOCX doesn't have a fixed page count - estimate based on character count
                // Roughly 3000 characters per page (standard document)
                const estimatedPages = Math.max(1, Math.ceil((result.text?.length || 0) / 3000));
                return {
                    text: result.text,
                    pageCount: estimatedPages,
                    success: true,
                    method: 'python-docx'
                };

            case '.pptx':
                result = await extractPptxViaPython(filePath);
                return {
                    text: result.text,
                    pageCount: result.slides || 1,
                    success: true,
                    method: 'python-pptx'
                };

            case '.jpg':
            case '.jpeg':
            case '.png':
            case '.gif':
            case '.bmp':
            case '.tiff':
            case '.tif':
                result = await extractImageOcrViaPython(filePath);
                return {
                    text: result.text,
                    pageCount: 1,
                    success: true,
                    method: 'python-tesseract',
                    confidence: result.confidence
                };

            default:
                throw new Error(`Unsupported file type: ${ext}`);
        }
    } catch (error) {
        console.error(`❌ Python processing failed for ${ext}:`, error.message);
        return {
            success: false,
            method: 'python-failed',
            error: error.message
        };
    }
}

export default {
    isPythonServiceHealthy,
    extractPdfViaPython,
    extractDocxViaPython,
    extractPptxViaPython,
    extractImageOcrViaPython,
    extractDocumentViaPython,
    processDocumentWithFallback
};