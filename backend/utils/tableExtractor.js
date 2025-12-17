/**
 * Table Extraction - Task B (Node.js side)
 * Calls Python service to extract tables from PDFs
 */

import fs from 'fs';
import FormData from 'form-data';
import axios from 'axios';

/**
 * Extract tables from PDF using Python service
 * @param {string} documentPath - Path to the PDF file
 * @param {string} documentType - Type of document (pdf, pptx, etc.)
 * @returns {Promise<Array>} Array of {tableMarkdown, pageNumber}
 */
export async function extractTablesFromPDF(documentPath, documentType) {
    console.log('\n📊 Starting table extraction...');

    const ext = documentType.toLowerCase();

    // Currently only supporting PDFs for table extraction
    if (ext !== 'pdf') {
        console.log(`   ℹ️  Table extraction not yet supported for ${ext.toUpperCase()} files`);
        return [];
    }

    try {
        // Check if Python service is available
        const pythonServiceUrl = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000';

        const form = new FormData();
        form.append('file', fs.createReadStream(documentPath));

        const response = await axios.post(
            `${pythonServiceUrl}/extract-tables`,
            form,
            {
                headers: form.getHeaders(),
                timeout: 120000, // 2 minutes timeout for large PDFs
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            }
        );

        if (!response.data.success || !response.data.tables || response.data.tables.length === 0) {
            console.log('   ℹ️  No tables found in document');
            return [];
        }

        console.log(`   ✅ Extracted ${response.data.tables.length} tables from PDF`);

        // Format tables for embedding
        const formattedTables = response.data.tables.map((table) => ({
            tableMarkdown: table.table_markdown,
            pageNumber: table.page,
            tableIndex: table.table_index
        }));

        return formattedTables;

    } catch (error) {
        console.log(`⚠️  Python service unavailable for table extraction: ${error.message}`);
        console.log(`   ℹ️  Skipping table extraction. To enable, start python_service.`);
        return [];
    }
}