import path from 'path';
import fs from 'fs';
import langdetect from 'langdetect';
import pdf from 'pdf-parse';
import Document from '../models/Document.js';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import { processDocument, isValidFileType, getSupportedExtensions } from '../utils/documentProcessor.js';
import { processDocumentWithFallback } from '../utils/pythonServiceClient.js';
import { deleteEmbeddings } from '../utils/embeddings.js';

const pdfDirectory = path.join(process.cwd(), 'pdfs');
const pdfStore = {}; // Backward compatibility

/**
 * Detect PDF language
 */
async function detectPdfLanguage(pdfPath) {
    try {
        const dataBuffer = fs.readFileSync(path.join(pdfDirectory, pdfPath));
        const data = await pdf(dataBuffer);
        const text = data.text;
        const sentences = text.split(/(?<=[.!?])\s+/);
        const languageCounts = {};

        sentences.forEach(sentence => {
            const detectedLang = langdetect.detect(sentence);
            if (detectedLang && detectedLang.length > 0) {
                const lang = detectedLang[0].lang;
                languageCounts[lang] = (languageCounts[lang] || 0) + 1;
            }
        });

        const mostFrequentLang = Object.keys(languageCounts).reduce((a, b) =>
            languageCounts[a] > languageCounts[b] ? a : b, null
        );

        return mostFrequentLang || 'en';
    } catch (error) {
        console.error('Error detecting language:', error);
        return 'en';
    }
}

/**
 * Upload document (PDF, DOCX, PPTX, Images)
 */
export async function uploadDocument(req, res, generateEmbeddings) {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded.' });
        }

        const fileName = req.file.filename;
        const filePath = path.join(pdfDirectory, fileName);
        const fileExt = path.extname(fileName).toLowerCase();

        console.log(`📤 Processing uploaded file: ${fileName} (${fileExt})`);

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
        let processingMethod = 'node';

        // Try Python microservice first
        console.log('🔍 Checking Python microservice availability...');
        const pythonResult = await processDocumentWithFallback(filePath, fileExt);

        if (pythonResult.success) {
            extractedText = pythonResult.text;
            pageCount = pythonResult.pageCount;
            processingMethod = pythonResult.method;

            console.log(`✅ Processed via Python service (${processingMethod}): ${extractedText.length} characters`);

            // Detect language
            try {
                const detectedLang = langdetect.detect(extractedText.substring(0, 1000));
                language = detectedLang && detectedLang.length > 0 ? detectedLang[0].lang : 'en';
            } catch (e) {
                language = 'en';
            }

            if (fileExt === '.pdf') {
                pdfStore[fileName] = language;
            }
        } else {
            // Fallback to Node.js processing
            console.log('⚠️ Python service unavailable, using Node.js fallback...');

            if (fileExt === '.pdf') {
                language = await detectPdfLanguage(fileName);
                const dataBuffer = fs.readFileSync(filePath);
                const pdfData = await pdf(dataBuffer);
                extractedText = pdfData.text;
                pageCount = pdfData.numpages;
                pdfStore[fileName] = language;
                processingMethod = 'node-pdf-parse';

                console.log(`✅ PDF processed via Node.js: ${pageCount} pages, ${extractedText.length} characters`);
            } else {
                const processResult = await processDocument(filePath, documentType);

                if (processResult) {
                    extractedText = processResult.text;
                    pageCount = processResult.pageCount || 1;
                    processingMethod = 'node-' + documentType;

                    try {
                        const detectedLang = langdetect.detect(extractedText.substring(0, 1000));
                        language = detectedLang && detectedLang.length > 0 ? detectedLang[0].lang : 'en';
                    } catch (e) {
                        language = 'en';
                    }

                    console.log(`✅ ${documentType.toUpperCase()} processed via Node.js: ${extractedText.length} characters`);
                }
            }
        }

        // PPTX to PDF conversion
        let convertedPdfPath = null;
        if (fileExt === '.pptx') {
            try {
                console.log('🔄 Attempting to convert PPTX to PDF...');
                const { convertPptxToPdfViaPython } = await import('../utils/pythonServiceClient.js');

                const pdfBuffer = await convertPptxToPdfViaPython(filePath);
                const pdfFileName = fileName.replace('.pptx', '_converted.pdf');
                convertedPdfPath = path.join(pdfDirectory, pdfFileName);
                fs.writeFileSync(convertedPdfPath, pdfBuffer);

                console.log(`✅ PPTX converted to PDF: ${pdfFileName}`);
            } catch (error) {
                if (error.message === 'LIBREOFFICE_NOT_AVAILABLE') {
                    console.log('⚠️ LibreOffice not installed - PPTX will be displayed as text content');
                } else {
                    console.error('❌ PPTX to PDF conversion failed:', error.message);
                }
            }
        }

        // Save document to database
        const document = await Document.create({
            userId: req.user._id,
            originalName: req.file.originalname,
            fileName: fileName,
            filePath: filePath,
            fileSize: req.file.size,
            language: language,
            pageCount: pageCount,
            extractedText: extractedText,
            convertedPdfPath: convertedPdfPath
        });

        // Generate embeddings in background
        if (extractedText && extractedText.length > 50) {
            generateEmbeddings(document._id, req.user._id, extractedText)
                .then(() => {
                    console.log(`✅ Embeddings generated for ${documentType.toUpperCase()} ${document._id}`);
                })
                .catch(error => {
                    console.error(`❌ Error generating embeddings for ${document._id}:`, error);
                });
        } else {
            console.log(`⚠️ No text extracted - skipping embeddings for ${document._id}`);
        }

        res.json({
            success: true,
            fileName: fileName,
            documentId: document._id,
            language: language,
            pageCount: pageCount,
            documentType: documentType,
            message: 'Document uploaded successfully!',
            document: {
                _id: document._id,
                originalName: document.originalName,
                fileName: document.fileName,
                filePath: document.filePath,
                fileSize: document.fileSize,
                language: document.language,
                pageCount: document.pageCount,
                createdAt: document.createdAt,
                uploadedAt: document.uploadedAt
            }
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: `Error uploading document: ${error.message}` });
    }
}

/**
 * Get all documents for user
 */
export async function getAllDocuments(req, res) {
    try {
        const documents = await Document.find({ userId: req.user._id })
            .sort({ uploadedAt: -1 });

        res.json({ success: true, documents });
    } catch (error) {
        console.error('Get documents error:', error);
        res.status(500).json({ error: 'Error fetching documents' });
    }
}

/**
 * Get single document by ID
 */
export async function getDocumentById(req, res) {
    try {
        const document = await Document.findOne({
            _id: req.params.id,
            userId: req.user._id
        });

        if (!document) {
            return res.status(404).json({ error: 'Document not found' });
        }

        res.json({ success: true, document });
    } catch (error) {
        console.error('Get document error:', error);
        res.status(500).json({ error: 'Error fetching document' });
    }
}

/**
 * Update document
 */
export async function updateDocument(req, res) {
    try {
        const document = await Document.findOne({
            _id: req.params.id,
            userId: req.user._id
        });

        if (!document) {
            return res.status(404).json({ error: 'Document not found' });
        }

        // Update allowed fields
        const { originalName, folder } = req.body;

        if (originalName) {
            document.originalName = originalName;
        }

        if (folder !== undefined) {
            document.folder = folder;
        }

        await document.save();

        res.json({ success: true, document });
    } catch (error) {
        console.error('Update document error:', error);
        res.status(500).json({ error: 'Error updating document' });
    }
}

/**
 * Delete document
 */
export async function deleteDocument(req, res) {
    try {
        const document = await Document.findOne({
            _id: req.params.id,
            userId: req.user._id
        });

        if (!document) {
            return res.status(404).json({ error: 'Document not found' });
        }

        // Delete file from filesystem
        if (fs.existsSync(document.filePath)) {
            fs.unlinkSync(document.filePath);
        }

        // Delete document from database
        await Document.deleteOne({ _id: req.params.id });

        // Delete associated conversations and messages
        const conversations = await Conversation.find({ documentId: req.params.id });
        const conversationIds = conversations.map(c => c._id);
        await Message.deleteMany({ conversationId: { $in: conversationIds } });
        await Conversation.deleteMany({ documentId: req.params.id });

        // Delete associated embeddings
        await deleteEmbeddings(req.params.id);

        res.json({ success: true, message: 'Document deleted successfully' });
    } catch (error) {
        console.error('Delete document error:', error);
        res.status(500).json({ error: 'Error deleting document' });
    }
}

/**
 * Get conversations for a document
 */
export async function getDocumentConversations(req, res) {
    try {
        const conversations = await Conversation.find({
            documentId: req.params.id,
            userId: req.user._id
        }).sort({ updatedAt: -1 });

        res.json({ success: true, conversations });
    } catch (error) {
        console.error('Get conversations error:', error);
        res.status(500).json({ error: 'Error fetching conversations' });
    }
}

/**
 * Get latest conversation and messages for a document
 */
export async function getLatestConversation(req, res) {
    try {
        const conversation = await Conversation.findOne({
            documentId: req.params.documentId,
            userId: req.user._id
        }).sort({ updatedAt: -1 });

        if (!conversation) {
            return res.json({ success: true, conversation: null, messages: [] });
        }

        const messages = await Message.find({ conversationId: conversation._id })
            .sort({ createdAt: 1 });

        res.json({
            success: true,
            conversation: {
                _id: conversation._id,
                title: conversation.title
            },
            messages
        });
    } catch (error) {
        console.error('Get latest conversation error:', error);
        res.status(500).json({ error: 'Error fetching conversation' });
    }
}

/**
 * Get latest conversation and messages for a folder
 */
export async function getFolderLatestConversation(req, res) {
    try {
        const { folderId } = req.params;

        // Find latest conversation for this folder
        const conversation = await Conversation.findOne({
            folderId: folderId,
            userId: req.user._id
        }).sort({ updatedAt: -1 });

        if (!conversation) {
            return res.json({
                success: true,
                conversation: null,
                messages: []
            });
        }

        // Get messages for this conversation
        const messages = await Message.find({
            conversationId: conversation._id
        }).sort({ createdAt: 1 });

        res.json({
            success: true,
            conversation: {
                _id: conversation._id,
                title: conversation.title,
                folderId: conversation.folderId
            },
            messages: messages.map(msg => ({
                _id: msg._id,
                role: msg.role,
                content: msg.content,
                pageReference: msg.pageReference,
                sourceDocument: msg.sourceDocument,
                createdAt: msg.createdAt
            }))
        });

    } catch (error) {
        console.error('Get folder conversation error:', error);
        res.status(500).json({ error: 'Error fetching folder conversation' });
    }
}
