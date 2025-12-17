import { OpenAI } from 'openai';
import fs from 'fs';
import path from 'path';

// Lazy-load OpenAI client
let openai = null;
function getOpenAIClient() {
    if (!openai) {
        openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
    }
    return openai;
}

/**
 * Create a new vector store for a workspace
 * @param {string} name - Name of the vector store
 * @param {object} options - Additional options
 * @returns {Promise<object>} Vector store object with id
 */
export async function createVectorStore(name, options = {}) {
    try {
        const client = getOpenAIClient();

        console.log(`📦 Creating OpenAI vector store: ${name}`);

        const vectorStore = await client.beta.vectorStores.create({
            name: name,
            expires_after: options.expiresAfter || undefined,
            metadata: options.metadata || {}
        });

        console.log(`✅ Vector store created: ${vectorStore.id}`);

        return {
            success: true,
            vectorStoreId: vectorStore.id,
            name: vectorStore.name,
            status: vectorStore.status
        };
    } catch (error) {
        console.error('❌ Error creating vector store:', error.message);
        throw new Error(`Failed to create vector store: ${error.message}`);
    }
}

/**
 * Upload a file to OpenAI
 * @param {string} filePath - Path to the file
 * @param {string} purpose - Purpose of the file (default: 'assistants')
 * @returns {Promise<object>} File object with id
 */
export async function uploadFileToOpenAI(filePath, purpose = 'assistants') {
    try {
        const client = getOpenAIClient();

        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }

        const fileName = path.basename(filePath);
        console.log(`📤 Uploading file to OpenAI: ${fileName}`);

        const fileStream = fs.createReadStream(filePath);

        const file = await client.files.create({
            file: fileStream,
            purpose: purpose
        });

        console.log(`✅ File uploaded to OpenAI: ${file.id}`);

        return {
            success: true,
            fileId: file.id,
            fileName: file.filename,
            bytes: file.bytes,
            status: file.status
        };
    } catch (error) {
        console.error('❌ Error uploading file to OpenAI:', error.message);
        throw new Error(`Failed to upload file: ${error.message}`);
    }
}

/**
 * Upload text content as a file to OpenAI
 * @param {string} content - Text content
 * @param {string} fileName - Name for the file
 * @param {string} purpose - Purpose of the file
 * @returns {Promise<object>} File object with id
 */
export async function uploadTextToOpenAI(content, fileName, purpose = 'assistants') {
    try {
        const client = getOpenAIClient();

        console.log(`📤 Uploading text content to OpenAI as: ${fileName}`);

        // Create a temporary file
        const tmpDir = path.join(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }

        const tmpFilePath = path.join(tmpDir, fileName);
        fs.writeFileSync(tmpFilePath, content, 'utf8');

        // Upload the file
        const result = await uploadFileToOpenAI(tmpFilePath, purpose);

        // Clean up temporary file
        fs.unlinkSync(tmpFilePath);

        return result;
    } catch (error) {
        console.error('❌ Error uploading text to OpenAI:', error.message);
        throw new Error(`Failed to upload text: ${error.message}`);
    }
}

/**
 * Add a file to a vector store
 * @param {string} fileId - OpenAI file ID
 * @param {string} vectorStoreId - Vector store ID
 * @returns {Promise<object>} Vector store file object
 */
export async function addFileToVectorStore(fileId, vectorStoreId) {
    try {
        const client = getOpenAIClient();

        console.log(`📎 Adding file ${fileId} to vector store ${vectorStoreId}`);

        const vectorStoreFile = await client.beta.vectorStores.files.create(
            vectorStoreId,
            {
                file_id: fileId
            }
        );

        console.log(`✅ File added to vector store: ${vectorStoreFile.id}`);

        return {
            success: true,
            vectorStoreFileId: vectorStoreFile.id,
            status: vectorStoreFile.status
        };
    } catch (error) {
        console.error('❌ Error adding file to vector store:', error.message);
        throw new Error(`Failed to add file to vector store: ${error.message}`);
    }
}

/**
 * Wait for a file to be processed in a vector store
 * @param {string} vectorStoreId - Vector store ID
 * @param {string} fileId - File ID
 * @param {number} maxWaitMs - Maximum wait time in milliseconds
 * @returns {Promise<object>} Final status
 */
export async function waitForFileProcessing(vectorStoreId, fileId, maxWaitMs = 60000) {
    const client = getOpenAIClient();
    const startTime = Date.now();
    const pollInterval = 1000; // 1 second

    console.log(`⏳ Waiting for file ${fileId} to be processed in vector store...`);

    while (Date.now() - startTime < maxWaitMs) {
        try {
            const vectorStoreFile = await client.beta.vectorStores.files.retrieve(
                vectorStoreId,
                fileId
            );

            if (vectorStoreFile.status === 'completed') {
                console.log(`✅ File processing completed`);
                return {
                    success: true,
                    status: 'completed'
                };
            }

            if (vectorStoreFile.status === 'failed' || vectorStoreFile.status === 'cancelled') {
                console.log(`❌ File processing failed with status: ${vectorStoreFile.status}`);
                return {
                    success: false,
                    status: vectorStoreFile.status,
                    error: vectorStoreFile.last_error?.message || 'Unknown error'
                };
            }

            // Status is still 'in_progress', wait and retry
            await new Promise(resolve => setTimeout(resolve, pollInterval));
        } catch (error) {
            console.error('Error checking file status:', error.message);
            throw error;
        }
    }

    console.log(`⚠️ File processing timed out after ${maxWaitMs}ms`);
    return {
        success: false,
        status: 'timeout',
        error: 'File processing timed out'
    };
}

/**
 * Remove a file from a vector store
 * @param {string} fileId - OpenAI file ID
 * @param {string} vectorStoreId - Vector store ID
 * @returns {Promise<object>} Deletion result
 */
export async function removeFileFromVectorStore(fileId, vectorStoreId) {
    try {
        const client = getOpenAIClient();

        console.log(`🗑️  Removing file ${fileId} from vector store ${vectorStoreId}`);

        const deletionStatus = await client.beta.vectorStores.files.del(
            vectorStoreId,
            fileId
        );

        console.log(`✅ File removed from vector store`);

        return {
            success: true,
            deleted: deletionStatus.deleted
        };
    } catch (error) {
        console.error('❌ Error removing file from vector store:', error.message);
        throw new Error(`Failed to remove file from vector store: ${error.message}`);
    }
}

/**
 * Delete a file from OpenAI
 * @param {string} fileId - OpenAI file ID
 * @returns {Promise<object>} Deletion result
 */
export async function deleteOpenAIFile(fileId) {
    try {
        const client = getOpenAIClient();

        console.log(`🗑️  Deleting OpenAI file: ${fileId}`);

        const deletionStatus = await client.files.del(fileId);

        console.log(`✅ File deleted from OpenAI`);

        return {
            success: true,
            deleted: deletionStatus.deleted
        };
    } catch (error) {
        console.error('❌ Error deleting OpenAI file:', error.message);
        // Don't throw - file might already be deleted
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Get vector store details
 * @param {string} vectorStoreId - Vector store ID
 * @returns {Promise<object>} Vector store details
 */
export async function getVectorStore(vectorStoreId) {
    try {
        const client = getOpenAIClient();

        const vectorStore = await client.beta.vectorStores.retrieve(vectorStoreId);

        return {
            success: true,
            vectorStore: {
                id: vectorStore.id,
                name: vectorStore.name,
                status: vectorStore.status,
                fileCount: vectorStore.file_counts?.total || 0,
                createdAt: vectorStore.created_at
            }
        };
    } catch (error) {
        console.error('❌ Error retrieving vector store:', error.message);
        throw new Error(`Failed to get vector store: ${error.message}`);
    }
}

/**
 * List files in a vector store
 * @param {string} vectorStoreId - Vector store ID
 * @returns {Promise<object>} List of files
 */
export async function listVectorStoreFiles(vectorStoreId) {
    try {
        const client = getOpenAIClient();

        const files = await client.beta.vectorStores.files.list(vectorStoreId);

        return {
            success: true,
            files: files.data.map(file => ({
                id: file.id,
                status: file.status,
                createdAt: file.created_at
            }))
        };
    } catch (error) {
        console.error('❌ Error listing vector store files:', error.message);
        throw new Error(`Failed to list vector store files: ${error.message}`);
    }
}

/**
 * Delete a vector store
 * @param {string} vectorStoreId - Vector store ID
 * @returns {Promise<object>} Deletion result
 */
export async function deleteVectorStore(vectorStoreId) {
    try {
        const client = getOpenAIClient();

        console.log(`🗑️  Deleting vector store: ${vectorStoreId}`);

        const deletionStatus = await client.beta.vectorStores.del(vectorStoreId);

        console.log(`✅ Vector store deleted`);

        return {
            success: true,
            deleted: deletionStatus.deleted
        };
    } catch (error) {
        console.error('❌ Error deleting vector store:', error.message);
        throw new Error(`Failed to delete vector store: ${error.message}`);
    }
}
