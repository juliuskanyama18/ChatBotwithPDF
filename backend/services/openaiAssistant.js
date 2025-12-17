import { OpenAI } from 'openai';

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
 * Create an assistant with file_search tool
 * @param {string} vectorStoreId - Vector store ID to attach
 * @param {object} options - Additional options
 * @returns {Promise<object>} Assistant object
 */
export async function createAssistant(vectorStoreId, options = {}) {
    try {
        const client = getOpenAIClient();

        console.log(`🤖 Creating OpenAI assistant with vector store: ${vectorStoreId}`);

        const assistant = await client.beta.assistants.create({
            name: options.name || 'Document Chat Assistant',
            instructions: options.instructions || `You are a helpful assistant that answers questions about documents.

Important guidelines:
1. ONLY answer based on information from the retrieved documents
2. If the information is not in the documents, say "I cannot find that information in the uploaded documents"
3. Always cite the source document and page number when possible
4. Be precise and quote relevant text when appropriate
5. If asked about multiple documents, clearly distinguish between them`,
            model: options.model || 'gpt-4-turbo-preview',
            tools: [{ type: 'file_search' }],
            tool_resources: {
                file_search: {
                    vector_store_ids: [vectorStoreId]
                }
            }
        });

        console.log(`✅ Assistant created: ${assistant.id}`);

        return {
            success: true,
            assistantId: assistant.id,
            name: assistant.name,
            model: assistant.model
        };
    } catch (error) {
        console.error('❌ Error creating assistant:', error.message);
        throw new Error(`Failed to create assistant: ${error.message}`);
    }
}

/**
 * Update an assistant's vector store
 * @param {string} assistantId - Assistant ID
 * @param {string} vectorStoreId - New vector store ID
 * @returns {Promise<object>} Updated assistant
 */
export async function updateAssistantVectorStore(assistantId, vectorStoreId) {
    try {
        const client = getOpenAIClient();

        console.log(`🔄 Updating assistant ${assistantId} with vector store: ${vectorStoreId}`);

        const assistant = await client.beta.assistants.update(assistantId, {
            tool_resources: {
                file_search: {
                    vector_store_ids: [vectorStoreId]
                }
            }
        });

        console.log(`✅ Assistant updated`);

        return {
            success: true,
            assistantId: assistant.id
        };
    } catch (error) {
        console.error('❌ Error updating assistant:', error.message);
        throw new Error(`Failed to update assistant: ${error.message}`);
    }
}

/**
 * Create a new thread for conversation
 * @param {object} options - Thread options
 * @returns {Promise<object>} Thread object
 */
export async function createThread(options = {}) {
    try {
        const client = getOpenAIClient();

        console.log(`💬 Creating new thread`);

        const thread = await client.beta.threads.create({
            metadata: options.metadata || {}
        });

        console.log(`✅ Thread created: ${thread.id}`);

        return {
            success: true,
            threadId: thread.id
        };
    } catch (error) {
        console.error('❌ Error creating thread:', error.message);
        throw new Error(`Failed to create thread: ${error.message}`);
    }
}

/**
 * Add a message to a thread
 * @param {string} threadId - Thread ID
 * @param {string} content - Message content
 * @param {string} role - Message role (default: 'user')
 * @returns {Promise<object>} Message object
 */
export async function addMessage(threadId, content, role = 'user') {
    try {
        const client = getOpenAIClient();

        console.log(`📝 Adding message to thread ${threadId}`);

        const message = await client.beta.threads.messages.create(threadId, {
            role: role,
            content: content
        });

        console.log(`✅ Message added: ${message.id}`);

        return {
            success: true,
            messageId: message.id,
            content: message.content
        };
    } catch (error) {
        console.error('❌ Error adding message:', error.message);
        throw new Error(`Failed to add message: ${error.message}`);
    }
}

/**
 * Run the assistant on a thread
 * @param {string} threadId - Thread ID
 * @param {string} assistantId - Assistant ID
 * @param {string} instructions - Additional instructions (optional)
 * @returns {Promise<object>} Run object
 */
export async function runAssistant(threadId, assistantId, instructions = null) {
    try {
        const client = getOpenAIClient();

        console.log(`🏃 Running assistant ${assistantId} on thread ${threadId}`);

        const run = await client.beta.threads.runs.create(threadId, {
            assistant_id: assistantId,
            instructions: instructions || undefined
        });

        console.log(`✅ Run created: ${run.id}`);

        return {
            success: true,
            runId: run.id,
            status: run.status
        };
    } catch (error) {
        console.error('❌ Error running assistant:', error.message);
        throw new Error(`Failed to run assistant: ${error.message}`);
    }
}

/**
 * Poll run status until completion or failure
 * @param {string} threadId - Thread ID
 * @param {string} runId - Run ID
 * @param {number} maxWaitMs - Maximum wait time in milliseconds
 * @returns {Promise<object>} Final run status
 */
export async function pollRunStatus(threadId, runId, maxWaitMs = 120000) {
    const client = getOpenAIClient();
    const startTime = Date.now();
    const pollInterval = 1000; // 1 second

    console.log(`⏳ Polling run status...`);

    while (Date.now() - startTime < maxWaitMs) {
        try {
            const run = await client.beta.threads.runs.retrieve(threadId, runId);

            console.log(`   Status: ${run.status}`);

            if (run.status === 'completed') {
                console.log(`✅ Run completed`);
                return {
                    success: true,
                    status: 'completed',
                    run: run
                };
            }

            if (run.status === 'failed' || run.status === 'cancelled' || run.status === 'expired') {
                console.log(`❌ Run failed with status: ${run.status}`);
                return {
                    success: false,
                    status: run.status,
                    error: run.last_error?.message || `Run ${run.status}`,
                    run: run
                };
            }

            if (run.status === 'requires_action') {
                console.log(`⚠️ Run requires action (not yet supported)`);
                return {
                    success: false,
                    status: 'requires_action',
                    error: 'Run requires action',
                    run: run
                };
            }

            // Status is still in progress, wait and retry
            await new Promise(resolve => setTimeout(resolve, pollInterval));
        } catch (error) {
            console.error('Error polling run status:', error.message);
            throw error;
        }
    }

    console.log(`⚠️ Run polling timed out after ${maxWaitMs}ms`);
    return {
        success: false,
        status: 'timeout',
        error: 'Run polling timed out'
    };
}

/**
 * Get messages from a thread
 * @param {string} threadId - Thread ID
 * @param {number} limit - Maximum number of messages to retrieve
 * @returns {Promise<object>} Messages array
 */
export async function getMessages(threadId, limit = 20) {
    try {
        const client = getOpenAIClient();

        console.log(`📨 Retrieving messages from thread ${threadId}`);

        const messages = await client.beta.threads.messages.list(threadId, {
            limit: limit,
            order: 'desc'
        });

        console.log(`✅ Retrieved ${messages.data.length} messages`);

        return {
            success: true,
            messages: messages.data.reverse() // Reverse to get chronological order
        };
    } catch (error) {
        console.error('❌ Error retrieving messages:', error.message);
        throw new Error(`Failed to retrieve messages: ${error.message}`);
    }
}

/**
 * Extract citations from message annotations
 * @param {array} annotations - Message annotations from OpenAI
 * @param {array} documents - Array of document objects from MongoDB
 * @returns {array} Formatted citations
 */
export function extractCitations(annotations, documents = []) {
    if (!annotations || annotations.length === 0) {
        return [];
    }

    const citations = [];

    annotations.forEach((annotation, index) => {
        if (annotation.type === 'file_citation') {
            const citation = annotation.file_citation;

            // Try to find matching document by OpenAI file ID
            const matchingDoc = documents.find(doc => doc.openaiFileId === citation.file_id);

            citations.push({
                index: index,
                fileId: citation.file_id,
                quote: citation.quote || annotation.text || '',
                documentId: matchingDoc?._id?.toString(),
                fileName: matchingDoc?.originalName || `File ${citation.file_id}`,
                pageNumber: null, // OpenAI doesn't provide page numbers directly
                textRange: {
                    start: annotation.start_index,
                    end: annotation.end_index
                }
            });
        } else if (annotation.type === 'file_path') {
            // File path annotations (less common)
            const filePath = annotation.file_path;

            citations.push({
                index: index,
                fileId: filePath.file_id,
                type: 'file_path',
                textRange: {
                    start: annotation.start_index,
                    end: annotation.end_index
                }
            });
        }
    });

    return citations;
}

/**
 * Delete an assistant
 * @param {string} assistantId - Assistant ID
 * @returns {Promise<object>} Deletion result
 */
export async function deleteAssistant(assistantId) {
    try {
        const client = getOpenAIClient();

        console.log(`🗑️  Deleting assistant: ${assistantId}`);

        const deletionStatus = await client.beta.assistants.del(assistantId);

        console.log(`✅ Assistant deleted`);

        return {
            success: true,
            deleted: deletionStatus.deleted
        };
    } catch (error) {
        console.error('❌ Error deleting assistant:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Delete a thread
 * @param {string} threadId - Thread ID
 * @returns {Promise<object>} Deletion result
 */
export async function deleteThread(threadId) {
    try {
        const client = getOpenAIClient();

        console.log(`🗑️  Deleting thread: ${threadId}`);

        const deletionStatus = await client.beta.threads.del(threadId);

        console.log(`✅ Thread deleted`);

        return {
            success: true,
            deleted: deletionStatus.deleted
        };
    } catch (error) {
        console.error('❌ Error deleting thread:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}
