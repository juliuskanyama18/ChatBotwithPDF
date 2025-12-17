import path from 'path';
import fs from 'fs';
import langdetect from 'langdetect';
import Document from '../models/Document.js';
import Workspace from '../models/Workspace.js';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import {
    uploadFileToOpenAI,
    uploadTextToOpenAI,
    addFileToVectorStore,
    waitForFileProcessing,
    removeFileFromVectorStore,
    deleteOpenAIFile
} from '../services/openaiVectorStore.js';
import {
    createAssistant,
    createThread,
    addMessage,
    runAssistant,
    pollRunStatus,
    getMessages,
    extractCitations
} from '../services/openaiAssistant.js';
import { processWithOCR } from '../utils/ocrClient.js';
import { processDocumentWithFallback } from '../utils/pythonServiceClient.js';
import { isValidFileType, getSupportedExtensions } from '../utils/documentProcessor.js';

const pdfDirectory = path.join(process.cwd(), 'pdfs');

/**
 * Upload document with OpenAI managed RAG
 */
export async function uploadDocumentManaged(req, res) {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const { workspaceId } = req.body;

        if (!workspaceId) {
            return res.status(400).json({ error: 'workspaceId is required' });
        }

        // Verify workspace exists and belongs to user
        const workspace = await Workspace.findOne({
            _id: workspaceId,
            userId: req.user._id
        });

        if (!workspace) {
            return res.status(404).json({ error: 'Workspace not found' });
        }

        if (!workspace.openaiVectorStoreId) {
            return res.status(400).json({
                error: 'Workspace does not have a vector store configured'
            });
        }

        const fileName = req.file.filename;
        const filePath = path.join(pdfDirectory, fileName);
        const fileExt = path.extname(fileName).toLowerCase();

        console.log(`\n📤 Processing uploaded file with managed RAG: ${fileName}`);

        // Validate file type
        if (!isValidFileType(fileName)) {
            fs.unlinkSync(filePath);
            return res.status(400).json({
                error: `Unsupported file type. Supported: ${getSupportedExtensions().join(', ')}`
            });
        }

        let extractedText = '';
        let pageCount = 1;
        let language = 'en';
        let documentType = fileExt.substring(1);
        let sourceType = 'file';
        let ocrSourceDocumentId = null;
        let openaiFileId = null;

        // Step 1: Extract text using existing methods
        console.log('📝 Extracting text from document...');

        const pythonResult = await processDocumentWithFallback(filePath, fileExt);

        if (pythonResult.success) {
            extractedText = pythonResult.text;
            pageCount = pythonResult.pageCount;

            // Detect language
            try {
                const detectedLang = langdetect.detect(extractedText.substring(0, 1000));
                language = detectedLang && detectedLang.length > 0 ? detectedLang[0].lang : 'en';
            } catch (e) {
                language = 'en';
            }

            console.log(`✅ Text extracted: ${extractedText.length} characters, ${pageCount} pages`);
        } else {
            console.log('⚠️  Failed to extract text with standard methods, trying OCR...');

            // Try OCR for images or scanned PDFs
            const ocrResult = await processWithOCR(filePath, fileExt);

            if (ocrResult.success) {
                extractedText = ocrResult.text;
                pageCount = ocrResult.pageCount || 1;
                language = ocrResult.language || 'en';
                sourceType = 'ocr_text';

                console.log(`✅ OCR completed: ${extractedText.length} characters`);
            } else if (ocrResult.serviceUnavailable) {
                return res.status(503).json({
                    error: 'OCR service not available. Please try again later.',
                    details: 'This file requires OCR processing, but the OCR service is unavailable.'
                });
            } else {
                return res.status(500).json({
                    error: 'Failed to extract text from document',
                    details: ocrResult.error
                });
            }
        }

        // Step 2: Save initial document record
        const document = await Document.create({
            userId: req.user._id,
            workspaceId: workspace._id,
            originalName: req.file.originalname,
            fileName: fileName,
            filePath: filePath,
            fileSize: req.file.size,
            language: language,
            pageCount: pageCount,
            extractedText: extractedText,
            sourceType: sourceType,
            status: 'processing'
        });

        console.log(`💾 Document saved to database: ${document._id}`);

        // Send immediate response to client
        res.json({
            success: true,
            documentId: document._id,
            fileName: fileName,
            status: 'processing',
            message: 'Document is being indexed...'
        });

        // Step 3: Upload to OpenAI and index (background process)
        (async () => {
            try {
                console.log('🚀 Starting background indexing...');

                // Decide what to upload to OpenAI
                let uploadResult;

                if (sourceType === 'ocr_text') {
                    // Upload extracted OCR text as .txt file
                    const txtFileName = `${document._id}_ocr_text.txt`;
                    uploadResult = await uploadTextToOpenAI(extractedText, txtFileName);
                    console.log(`✅ OCR text uploaded as file: ${uploadResult.fileId}`);
                } else {
                    // Upload original file
                    uploadResult = await uploadFileToOpenAI(filePath);
                    console.log(`✅ Original file uploaded: ${uploadResult.fileId}`);
                }

                openaiFileId = uploadResult.fileId;

                // Update document with file ID
                document.openaiFileId = openaiFileId;
                document.status = 'indexing';
                await document.save();

                // Add to vector store
                console.log(`📎 Adding file to vector store: ${workspace.openaiVectorStoreId}`);
                await addFileToVectorStore(openaiFileId, workspace.openaiVectorStoreId);

                // Wait for processing to complete
                console.log('⏳ Waiting for file to be indexed...');
                const processingResult = await waitForFileProcessing(
                    workspace.openaiVectorStoreId,
                    openaiFileId,
                    120000 // 2 minutes
                );

                if (processingResult.success) {
                    document.status = 'ready';
                    document.openaiVectorStoreId = workspace.openaiVectorStoreId;
                    await document.save();

                    console.log(`✅ Document indexed successfully: ${document._id}`);
                } else {
                    document.status = 'error';
                    document.processingError = processingResult.error || 'Indexing failed';
                    await document.save();

                    console.error(`❌ Indexing failed: ${processingResult.error}`);
                }
            } catch (error) {
                console.error('❌ Background indexing error:', error);

                document.status = 'error';
                document.processingError = error.message;
                await document.save();
            }
        })();

    } catch (error) {
        console.error('Upload document error:', error);
        res.status(500).json({ error: `Error uploading document: ${error.message}` });
    }
}

/**
 * Chat with documents using OpenAI Assistants API and file_search
 */
export async function chatWithManagedRAG(req, res) {
    try {
        console.log('\n🚀 ========== MANAGED RAG CHAT REQUEST ==========');
        console.time('⏱️  TOTAL REQUEST TIME');

        const { message, workspaceId, documentIds, conversationId } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        if (!workspaceId) {
            return res.status(400).json({ error: 'workspaceId is required' });
        }

        console.log(`📝 Question: "${message.substring(0, 100)}..."`);
        console.log(`📁 Workspace: ${workspaceId}`);

        // Get workspace
        const workspace = await Workspace.findOne({
            _id: workspaceId,
            userId: req.user._id
        });

        if (!workspace) {
            return res.status(404).json({ error: 'Workspace not found' });
        }

        if (!workspace.openaiAssistantId || !workspace.openaiVectorStoreId) {
            return res.status(400).json({
                error: 'Workspace is not configured for managed RAG'
            });
        }

        // Get or create conversation
        let conversation;
        let threadId;

        if (conversationId) {
            conversation = await Conversation.findOne({
                _id: conversationId,
                userId: req.user._id,
                workspaceId: workspaceId
            });

            if (conversation && conversation.openaiThreadId) {
                threadId = conversation.openaiThreadId;
                console.log(`💬 Using existing thread: ${threadId}`);
            }
        }

        if (!threadId) {
            // Create new thread
            console.log('💬 Creating new thread...');
            const threadResult = await createThread({
                metadata: {
                    workspaceId: workspaceId.toString(),
                    userId: req.user._id.toString()
                }
            });
            threadId = threadResult.threadId;
            console.log(`✅ Thread created: ${threadId}`);
        }

        if (!conversation) {
            // Create new conversation
            conversation = await Conversation.create({
                userId: req.user._id,
                workspaceId: workspaceId,
                title: message.substring(0, 50) + '...',
                openaiThreadId: threadId
            });
            console.log(`💾 Conversation created: ${conversation._id}`);
        } else if (!conversation.openaiThreadId) {
            // Update conversation with thread ID
            conversation.openaiThreadId = threadId;
            await conversation.save();
        }

        // Save user message
        await Message.create({
            conversationId: conversation._id,
            role: 'user',
            content: message
        });

        // Add message to thread
        console.log('📤 Adding message to thread...');
        await addMessage(threadId, message);

        // Run assistant
        console.log(`🏃 Running assistant: ${workspace.openaiAssistantId}`);
        const runResult = await runAssistant(
            threadId,
            workspace.openaiAssistantId,
            `Answer the user's question based ONLY on the documents in the workspace.
If the information is not in the documents, clearly state that you cannot find it.
Always cite sources with document names and page numbers when available.`
        );

        // Poll for completion
        console.log('⏳ Waiting for assistant response...');
        const pollResult = await pollRunStatus(threadId, runResult.runId, 120000);

        if (!pollResult.success) {
            console.error('❌ Assistant run failed:', pollResult.error);

            // Save error message
            await Message.create({
                conversationId: conversation._id,
                role: 'assistant',
                content: `I encountered an error processing your request: ${pollResult.error}`,
                metadata: { error: true }
            });

            return res.status(500).json({
                error: 'Assistant failed to generate response',
                details: pollResult.error
            });
        }

        // Get messages from thread
        console.log('📨 Retrieving assistant response...');
        const messagesResult = await getMessages(threadId, 1);
        const assistantMessage = messagesResult.messages[0];

        if (!assistantMessage) {
            throw new Error('No response from assistant');
        }

        // Extract text and annotations
        const textContent = assistantMessage.content.find(c => c.type === 'text');
        const answer = textContent.text.value;
        const annotations = textContent.text.annotations || [];

        console.log(`✅ Response received: ${answer.length} characters`);
        console.log(`   Citations: ${annotations.length}`);

        // Get documents for citation mapping
        const documents = await Document.find({
            workspaceId: workspaceId,
            status: 'ready'
        }).select('_id originalName fileName openaiFileId pageCount');

        // Extract and format citations
        const citations = extractCitations(annotations, documents);

        console.log(`📚 Formatted ${citations.length} citations`);

        // Save assistant message
        await Message.create({
            conversationId: conversation._id,
            role: 'assistant',
            content: answer,
            metadata: {
                citations: citations,
                annotations: annotations,
                runId: runResult.runId
            }
        });

        // Update conversation
        conversation.updatedAt = new Date();
        await conversation.save();

        console.timeEnd('⏱️  TOTAL REQUEST TIME');
        console.log('========================================\n');

        // Send response
        res.json({
            success: true,
            answer: answer,
            citations: citations,
            usedDocuments: [...new Set(citations.map(c => c.documentId).filter(Boolean))],
            conversationId: conversation._id,
            openaiThreadId: threadId
        });

    } catch (error) {
        console.error('Chat with managed RAG error:', error);
        res.status(500).json({
            error: 'Error processing chat request',
            details: error.message
        });
    }
}

/**
 * Summarize a document or workspace
 */
export async function summarizeDocument(req, res) {
    try {
        const { documentId, workspaceId } = req.body;

        if (!documentId && !workspaceId) {
            return res.status(400).json({
                error: 'Either documentId or workspaceId is required'
            });
        }

        console.log(`\n📋 Generating summary...`);

        let workspace;
        let summaryPrompt;

        if (documentId) {
            // Summarize single document
            const document = await Document.findOne({
                _id: documentId,
                userId: req.user._id
            }).populate('workspaceId');

            if (!document) {
                return res.status(404).json({ error: 'Document not found' });
            }

            workspace = document.workspaceId;

            summaryPrompt = `Please provide a comprehensive summary of the document "${document.originalName}".

Include:
1. Main topics and themes
2. Key points and findings
3. Important details
4. Page references for major sections

Be thorough and cite specific pages when possible.`;

            console.log(`   Document: ${document.originalName}`);
        } else {
            // Summarize entire workspace
            workspace = await Workspace.findOne({
                _id: workspaceId,
                userId: req.user._id
            });

            if (!workspace) {
                return res.status(404).json({ error: 'Workspace not found' });
            }

            const documentCount = await Document.countDocuments({
                workspaceId: workspace._id,
                status: 'ready'
            });

            summaryPrompt = `Please provide a comprehensive summary of all documents in this workspace.

Include:
1. Overview of all documents and their main topics
2. Common themes across documents
3. Key findings and insights
4. Notable differences or contradictions
5. Document and page references

Be thorough and cite specific documents and pages.`;

            console.log(`   Workspace: ${workspace.name} (${documentCount} documents)`);
        }

        if (!workspace.openaiAssistantId || !workspace.openaiVectorStoreId) {
            return res.status(400).json({
                error: 'Workspace is not configured for managed RAG'
            });
        }

        // Create new thread for summary
        const threadResult = await createThread({
            metadata: {
                workspaceId: workspace._id.toString(),
                type: 'summary'
            }
        });

        const threadId = threadResult.threadId;

        // Add summary prompt
        await addMessage(threadId, summaryPrompt);

        // Run assistant
        const runResult = await runAssistant(
            threadId,
            workspace.openaiAssistantId,
            `Generate a comprehensive, well-structured summary based on the documents.
Use markdown formatting for better readability.
Always cite sources with document names and page numbers.`
        );

        // Poll for completion
        const pollResult = await pollRunStatus(threadId, runResult.runId, 180000); // 3 minutes

        if (!pollResult.success) {
            return res.status(500).json({
                error: 'Failed to generate summary',
                details: pollResult.error
            });
        }

        // Get response
        const messagesResult = await getMessages(threadId, 1);
        const assistantMessage = messagesResult.messages[0];
        const textContent = assistantMessage.content.find(c => c.type === 'text');
        const summary = textContent.text.value;
        const annotations = textContent.text.annotations || [];

        // Get documents for citation mapping
        const documents = await Document.find({
            workspaceId: workspace._id,
            status: 'ready'
        }).select('_id originalName fileName openaiFileId pageCount');

        // Extract citations
        const citations = extractCitations(annotations, documents);

        console.log(`✅ Summary generated: ${summary.length} characters`);

        res.json({
            success: true,
            summary: summary,
            citations: citations,
            usedDocuments: [...new Set(citations.map(c => c.documentId).filter(Boolean))]
        });

    } catch (error) {
        console.error('Summarize document error:', error);
        res.status(500).json({
            error: 'Error generating summary',
            details: error.message
        });
    }
}

/**
 * Delete document from managed RAG
 */
export async function deleteDocumentManaged(req, res) {
    try {
        const document = await Document.findOne({
            _id: req.params.id,
            userId: req.user._id
        });

        if (!document) {
            return res.status(404).json({ error: 'Document not found' });
        }

        console.log(`\n🗑️  Deleting document: ${document.originalName}`);

        // Remove from OpenAI vector store
        if (document.openaiFileId && document.openaiVectorStoreId) {
            try {
                await removeFileFromVectorStore(
                    document.openaiFileId,
                    document.openaiVectorStoreId
                );
                console.log('✅ Removed from vector store');
            } catch (error) {
                console.error('Error removing from vector store:', error.message);
            }

            // Delete file from OpenAI
            try {
                await deleteOpenAIFile(document.openaiFileId);
                console.log('✅ Deleted OpenAI file');
            } catch (error) {
                console.error('Error deleting OpenAI file:', error.message);
            }
        }

        // Delete file from filesystem
        if (fs.existsSync(document.filePath)) {
            fs.unlinkSync(document.filePath);
        }

        // Delete from MongoDB
        await Document.deleteOne({ _id: document._id });

        // Delete associated conversations and messages
        const conversations = await Conversation.find({ documentId: document._id });
        const conversationIds = conversations.map(c => c._id);
        await Message.deleteMany({ conversationId: { $in: conversationIds } });
        await Conversation.deleteMany({ documentId: document._id });

        console.log('✅ Document deleted successfully');

        res.json({ success: true, message: 'Document deleted successfully' });
    } catch (error) {
        console.error('Delete document error:', error);
        res.status(500).json({ error: 'Error deleting document' });
    }
}

/**
 * Get document status (for polling during upload/indexing)
 */
export async function getDocumentStatus(req, res) {
    try {
        const document = await Document.findOne({
            _id: req.params.id,
            userId: req.user._id
        }).select('_id originalName status processingError pageCount');

        if (!document) {
            return res.status(404).json({ error: 'Document not found' });
        }

        res.json({
            success: true,
            document: {
                _id: document._id,
                originalName: document.originalName,
                status: document.status,
                processingError: document.processingError,
                pageCount: document.pageCount
            }
        });
    } catch (error) {
        console.error('Get document status error:', error);
        res.status(500).json({ error: 'Error fetching document status' });
    }
}
