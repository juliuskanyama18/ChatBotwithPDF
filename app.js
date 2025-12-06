// Load environment variables FIRST, before any other imports
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import fs from 'fs';
import { OpenAI } from 'openai';
import pdf from 'pdf-parse';
import langdetect from 'langdetect';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import connectDB from './config/database.js';
import authRoutes from './routes/auth.js';
import { protect } from './middleware/auth.js';
import Document from './models/Document.js';
import Conversation from './models/Conversation.js';
import Message from './models/Message.js';
import Embedding from './models/Embedding.js';
import { chunkText, cleanText } from './utils/textProcessing.js';
import { generateEmbeddingsBatch, storeEmbeddings, semanticSearch, deleteEmbeddings } from './utils/embeddings.js';
import { processDocument, isValidFileType, getSupportedExtensions } from './utils/documentProcessor.js';
import { processDocumentWithFallback, isPythonServiceHealthy } from './utils/pythonServiceClient.js';

// console.log("OpenAI API Key:", process.env.OPENAI_API_KEY);
const pdfStore = {};

// Connect to MongoDB
connectDB();
const app = express();
const port = 3600;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pdfDirectory = path.join(__dirname, 'pdfs');
if (!fs.existsSync(pdfDirectory)) {
    fs.mkdirSync(pdfDirectory);
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, pdfDirectory);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        const baseName = path.basename(file.originalname, ext);
        cb(null, baseName + '-' + uniqueSuffix + ext);
    }
});

const upload = multer({ storage: storage });

// CORS configuration for React frontend - Must be BEFORE static file serving
app.use(cors({
    origin: 'http://localhost:5173',
    credentials: true
}));

app.use(function (req, res, next) {
    res.set('Cache-Control', 'no-cache, private, no-store, must-revalidate, max-stale=0, post-check=0, pre-check=0');
    res.set('Expires', '0');
    res.set('Pragma', 'no-cache');
    res.set('BFCache-Control', 'no-store, no-cache');
    next();
});

app.use(express.static(path.join(__dirname, 'public')));
app.use('/pdfs', express.static(pdfDirectory));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser());

app.use(session({
    secret: 'your_secure_session_secret', // Change to a secure key
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Use true if your app is HTTPS
}));

// Auth routes
app.use('/api/auth', authRoutes);

// Serve translation files
app.get('/translations/:lang', (req, res) => {
    const lang = req.params.lang;
    const filePath = path.join(__dirname, 'translations', `${lang}.json`);
    console.log(`Request for translations in language: ${lang}`);
    console.log(`Looking for translation file at: ${filePath}`);
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        console.log('Translation file not found');
        res.status(404).send('Translation file not found');
    }
});

// All UI routes are handled by React frontend (client/)
// The React app is served by Vite dev server on http://localhost:5173
// API routes are under /api/* prefix

async function detectPdfLanguage(pdfPath) {
    try {
        const dataBuffer = fs.readFileSync(path.join(pdfDirectory, pdfPath));
        const data = await pdf(dataBuffer);
        const text = data.text;
        // console.log('Detected Text from PDF:', text); // Log extracted text for debugging
        // Split the text into sentences
        const sentences = text.split(/(?<=[.!?])\s+/);
        const languageCounts = {};
        // Detect language for each sentence
        sentences.forEach(sentence => {
            const detectedLang = langdetect.detect(sentence);
            if (detectedLang && detectedLang.length > 0) {
                const lang = detectedLang[0].lang;
                languageCounts[lang] = (languageCounts[lang] || 0) + 1;
            }
        });

        // Determine the most frequent language
        const mostFrequentLang = Object.keys(languageCounts).reduce((a, b) => languageCounts[a] > languageCounts[b] ? a : b, null);
        console.log('Most Frequent Language Detected:', mostFrequentLang);

        return mostFrequentLang || 'en'; // Fallback to English if no language is detected
    } catch (error) {
        console.error('Error detecting language:', error);
        return 'en'; // Fallback to English
    }
}

// Universal document upload endpoint - supports PDF, DOCX, PPTX, Images
app.post('/uploadPdf', protect, upload.single('pdfFile'), async (req, res) => {
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
            fs.unlinkSync(filePath); // Delete invalid file
            return res.status(400).json({
                error: `Unsupported file type. Supported: ${getSupportedExtensions().join(', ')}`
            });
        }

        let extractedText = '';
        let pageCount = 1;
        let language = 'en';
        let documentType = fileExt.substring(1); // Remove the dot
        let processingMethod = 'node';

        // Try Python microservice first for better document processing
        console.log('🔍 Checking Python microservice availability...');
        const pythonResult = await processDocumentWithFallback(filePath, fileExt);

        if (pythonResult.success) {
            // Python service successfully processed the document
            extractedText = pythonResult.text;
            pageCount = pythonResult.pageCount;
            processingMethod = pythonResult.method;

            console.log(`✅ Processed via Python service (${processingMethod}): ${extractedText.length} characters`);

            // Detect language from extracted text
            try {
                const detectedLang = langdetect.detect(extractedText.substring(0, 1000));
                language = detectedLang && detectedLang.length > 0 ? detectedLang[0].lang : 'en';
            } catch (e) {
                language = 'en';
            }

            if (fileExt === '.pdf') {
                pdfStore[fileName] = language; // Backward compatibility
            }
        } else {
            // Fallback to Node.js processing if Python service fails
            console.log('⚠️ Python service unavailable, using Node.js fallback...');

            if (fileExt === '.pdf') {
                // PDF Processing via Node.js
                language = await detectPdfLanguage(fileName);
                const dataBuffer = fs.readFileSync(filePath);
                const pdfData = await pdf(dataBuffer);
                extractedText = pdfData.text;
                pageCount = pdfData.numpages;
                pdfStore[fileName] = language;
                processingMethod = 'node-pdf-parse';

                console.log(`✅ PDF processed via Node.js: ${pageCount} pages, ${extractedText.length} characters`);
            } else {
                // Non-PDF documents via Node.js (DOCX, PPTX, Images)
                const processResult = await processDocument(filePath, documentType);

                if (processResult) {
                    extractedText = processResult.text;
                    pageCount = processResult.pageCount || 1;
                    processingMethod = 'node-' + documentType;

                    // Try to detect language from extracted text
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

        // PPTX to PDF conversion (for better rendering in browser)
        let convertedPdfPath = null;
        if (fileExt === '.pptx') {
            try {
                console.log('🔄 Attempting to convert PPTX to PDF for better rendering...');
                const { convertPptxToPdfViaPython } = await import('./utils/pythonServiceClient.js');

                const pdfBuffer = await convertPptxToPdfViaPython(filePath);

                // Save PDF file alongside original PPTX
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
                // Continue without PDF conversion - will fall back to text display
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

        // Generate embeddings in the background
        if (extractedText && extractedText.length > 50) {
            generateDocumentEmbeddings(document._id, req.user._id, extractedText)
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
            fileName: fileName,
            documentId: document._id,
            language: language,
            pageCount: pageCount,
            documentType: documentType,
            message: `${documentType.toUpperCase()} uploaded successfully. ${extractedText.length > 50 ? 'Embeddings are being generated in the background.' : ''}`
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: `Error uploading document: ${error.message}` });
    }
});

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Helper function to generate and store embeddings for a document
async function generateDocumentEmbeddings(documentId, userId, text) {
    try {
        console.log(`Starting embedding generation for document ${documentId}...`);

        // Get document to check type
        const document = await Document.findById(documentId);
        const documentType = path.extname(document.fileName).substring(1).toLowerCase();

        // Clean and chunk the text
        const cleanedText = cleanText(text);
        // Increased chunk size (800 tokens) and overlap (100 tokens) to keep related content together
        // This helps preserve question groups, math problems, and context continuity
        const chunks = chunkText(cleanedText, 800, 100);

        console.log(`Generated ${chunks.length} chunks for document ${documentId}`);

        // Prepare chunks with metadata - detect page/slide numbers from text markers
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

        // Generate embeddings for all chunks
        const textArray = chunksWithMetadata.map(c => c.text);
        const embeddings = await generateEmbeddingsBatch(textArray);

        console.log(`Generated ${embeddings.length} embeddings for document ${documentId}`);

        // Store embeddings in database with document type
        await storeEmbeddings(documentId, userId, chunksWithMetadata, embeddings, documentType);

        console.log(`✅ Successfully stored embeddings for document ${documentId}`);
    } catch (error) {
        console.error(`Error in generateDocumentEmbeddings for ${documentId}:`, error);
        throw error;
    }
}

// Get all documents for logged-in user
app.get('/api/documents', protect, async (req, res) => {
    try {
        const documents = await Document.find({ userId: req.user._id })
            .sort({ uploadedAt: -1 });

        res.json({ success: true, documents });
    } catch (error) {
        console.error('Get documents error:', error);
        res.status(500).json({ error: 'Error fetching documents' });
    }
});

// Get single document by ID
app.get('/api/documents/:id', protect, async (req, res) => {
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
});

// Delete document
app.delete('/api/documents/:id', protect, async (req, res) => {
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
});

// Get conversations for a document
app.get('/api/documents/:id/conversations', protect, async (req, res) => {
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
});

// Get messages for a conversation
app.get('/api/conversations/:id/messages', protect, async (req, res) => {
    try {
        const conversation = await Conversation.findOne({
            _id: req.params.id,
            userId: req.user._id
        });

        if (!conversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        const messages = await Message.find({ conversationId: req.params.id })
            .sort({ createdAt: 1 });

        res.json({ success: true, messages });
    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ error: 'Error fetching messages' });
    }
});

// Get latest conversation and messages for a document
app.get('/api/documents/:documentId/latest-conversation', protect, async (req, res) => {
    try {
        // Find the most recent conversation for this document
        const conversation = await Conversation.findOne({
            documentId: req.params.documentId,
            userId: req.user._id
        }).sort({ updatedAt: -1 });

        if (!conversation) {
            return res.json({ success: true, conversation: null, messages: [] });
        }

        // Get all messages for this conversation
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
});



app.post('/generate-response', protect, async (req, res) => {
    try {
        console.log('\n🚀 ========== NEW CHAT REQUEST ==========');
        console.time('⏱️ TOTAL REQUEST TIME');

        const { prompt, matchedSection, documentId, conversationId } = req.body;
        console.log(`📝 Question: "${prompt.substring(0, 100)}..."`);

        // Get document from database
        console.time('⏱️ Fetch document');
        const document = await Document.findOne({
            _id: documentId,
            userId: req.user._id
        });
        console.timeEnd('⏱️ Fetch document');

        if (!document) {
            return res.status(404).json({ error: 'Document not found' });
        }

        // Get or create conversation
        console.time('⏱️ Get/Create conversation');
        let conversation;
        if (conversationId) {
            conversation = await Conversation.findOne({
                _id: conversationId,
                userId: req.user._id,
                documentId: documentId
            });
        }

        if (!conversation) {
            conversation = await Conversation.create({
                userId: req.user._id,
                documentId: documentId,
                title: prompt.substring(0, 50) + '...'
            });
        }
        console.timeEnd('⏱️ Get/Create conversation');

        // Get conversation history from database
        console.time('⏱️ Fetch conversation history');
        const messages = await Message.find({ conversationId: conversation._id })
            .sort({ createdAt: 1 })
            .limit(10);

        let conversationHistory = messages.map(msg => ({
            role: msg.role,
            content: msg.content
        }));
        console.timeEnd('⏱️ Fetch conversation history');

        // Get document type for proper citation format
        const documentType = path.extname(document.fileName).substring(1).toLowerCase();

        // 🔍 RAG: Use semantic search to find relevant content from embeddings
        let relevantContext = '';
        let pageReferences = [];
        let citationType = documentType === 'pptx' ? 'Slide' : 'Page';

        try {
            console.log('\n🔍 Starting RAG semantic search...');
            const similarChunks = await semanticSearch(prompt, documentId, 5); // Get top 5 chunks for better coverage

            if (similarChunks && similarChunks.length > 0) {
                // Determine citation type from chunk metadata
                if (similarChunks[0].metadata && similarChunks[0].metadata.documentType) {
                    citationType = similarChunks[0].metadata.documentType === 'pptx' ? 'Slide' : 'Page';
                }

                relevantContext = similarChunks
                    .map((chunk, idx) => `[Context ${idx + 1}] ${chunk.chunkText}`)
                    .join('\n\n');

                pageReferences = similarChunks
                    .filter(chunk => chunk.pageNumber)
                    .map(chunk => chunk.pageNumber);

                console.log(`✅ RAG: Found ${similarChunks.length} relevant chunks (${citationType.toLowerCase()}s: ${pageReferences.join(', ')})`);
                console.log(`Top similarity score: ${similarChunks[0].similarity.toFixed(3)}`);
            } else {
                console.log('⚠️ No embeddings found, using fallback context');
                relevantContext = document.extractedText?.substring(0, 2000) || 'No context available';
            }
        } catch (error) {
            console.error('Error in semantic search:', error);
            // Fallback to raw text if RAG fails
            relevantContext = document.extractedText?.substring(0, 2000) || 'No context available';
        }

        // Enhanced system prompt with strict hallucination prevention
        const instruction =
            `You are a document analysis AI. Your ONLY job is to answer questions based STRICTLY on the provided document context.\n\n` +
            `CRITICAL RULES YOU MUST FOLLOW:\n` +
            `1. ONLY use information from the "Context from the document" section provided below\n` +
            `2. If the answer is NOT in the context, respond with: "I cannot find that information in the uploaded document."\n` +
            `3. Do NOT use your general knowledge or training data under any circumstances\n` +
            `4. ALWAYS cite the ${citationType.toLowerCase()} number(s) where you found the information (e.g., "According to ${citationType.toLowerCase()} 5...")\n` +
            `5. If multiple ${citationType.toLowerCase()}s are relevant, mention all of them\n` +
            `6. If the user asks about something outside the document, politely redirect them to ask document-related questions\n` +
            `7. Be direct and concise - avoid unnecessary explanations\n` +
            `8. If uncertain, err on the side of saying "I cannot find that information" rather than guessing\n\n` +
            `SPECIAL HANDLING:\n` +
            `- If the user asks to "answer" a mathematical question, solve the calculation and provide the final answer with the calculation shown\n` +
            `- If the user asks about a question number that doesn't exist in the context, clarify which questions ARE available in the document\n` +
            `- When listing questions, include their question numbers/labels exactly as shown in the document\n` +
            `- For True/False questions, clearly state "True" or "False" before explaining\n` +
            `- For multiple-choice questions, clearly state the letter (A, B, C, D) of the correct answer\n\n` +
            `Language: If the user's question is in Turkish, respond in Turkish. Otherwise, respond in English.\n`;

        // Construct AI prompt with RAG context
        const formattedHistory = conversationHistory.map(
            (msg) => `${msg.role === 'user' ? 'User' : 'Bot'}: ${msg.content}`
        ).join("\n");

        // Enhanced prompt with clear structure, document metadata, and citation requirements
        const fullPrompt = `
            ═══════════════════════════════════════
            DOCUMENT METADATA
            ═══════════════════════════════════════
            Document Type: ${documentType.toUpperCase()}
            File Name: ${document.originalName}
            Total ${citationType}s: ${document.pageCount || 'unknown'}
            ═══════════════════════════════════════

            ═══════════════════════════════════════
            CONTEXT FROM THE DOCUMENT
            ═══════════════════════════════════════
            ${relevantContext}

            ${pageReferences.length > 0 ? `\n📄 Source ${citationType}s: ${[...new Set(pageReferences)].join(', ')}\n` : ''}
            ═══════════════════════════════════════

            ${formattedHistory ? `\nCONVERSATION HISTORY:\n${formattedHistory}\n` : ''}

            USER'S QUESTION: ${prompt}

            INSTRUCTIONS:
            - Answer ONLY using the context above
            - Cite ${citationType.toLowerCase()} numbers where you found the information
            - You can use the document metadata to answer questions about the document type and ${citationType.toLowerCase()} count
            - If the information is not in the context, say: "I cannot find that information in the uploaded document."
            - If asked to "answer" a math/calculation question, perform the calculation and show the result
            - If asked about a question that doesn't exist, clarify which questions ARE in the document
            - For True/False: State "True" or "False" clearly
            - For MCQs: State the correct letter option (A, B, C, D) clearly
            - Be specific and direct
        `;

        console.log("\n🤖 Sending prompt to OpenAI...");

        // Append user input to conversation history
        conversationHistory.push({ role: 'user', content: prompt });

        // Send request to OpenAI
        console.time('⏱️ OpenAI API call');
        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            temperature: 0,
            messages: [
                { role: 'system', content: instruction },
                ...conversationHistory.map(({ role, content }) => ({ role, content })),
                { role: 'user', content: fullPrompt }
            ],
            max_tokens: 1000
        });
        console.timeEnd('⏱️ OpenAI API call');

        const aiResponse = response.choices[0].message.content.trim();
        console.log(`✅ Response generated: ${aiResponse.substring(0, 100)}...`);

        // Save user message to database
        console.time('⏱️ Save messages to DB');
        await Message.create({
            conversationId: conversation._id,
            role: 'user',
            content: prompt,
            pageReference: pageReferences.length > 0 ? pageReferences[0] : null
        });

        // Save assistant message to database
        await Message.create({
            conversationId: conversation._id,
            role: 'assistant',
            content: aiResponse,
            pageReference: pageReferences.length > 0 ? pageReferences[0] : null
        });
        console.timeEnd('⏱️ Save messages to DB');

        // Update conversation timestamp
        conversation.updatedAt = new Date();
        await conversation.save();

        console.timeEnd('⏱️ TOTAL REQUEST TIME');
        console.log('========================================\n');

        res.json({
            reply: aiResponse,
            conversationId: conversation._id,
            ragEnabled: pageReferences.length > 0,
            relevantPages: pageReferences
        });

    } catch (error) {
        console.error('❌ Error generating AI response:', error);
        res.status(500).json({ error: 'Error generating AI response' });
    }
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// Check Python service health on startup
async function checkPythonServiceOnStartup() {
    console.log('\n🔍 Checking Python microservice availability...');
    const isHealthy = await isPythonServiceHealthy();

    if (isHealthy) {
        console.log('✅ Python Document Processing Service is HEALTHY');
        console.log('   📍 Service URL: http://localhost:8000');
        console.log('   📚 API Docs: http://localhost:8000/docs');
        console.log('   ⚡ Document processing will use Python service for better quality');
    } else {
        console.log('⚠️  Python Document Processing Service is UNAVAILABLE');
        console.log('   ℹ️  Node.js fallback processors will be used');
        console.log('   💡 To enable Python service:');
        console.log('      1. Open new terminal');
        console.log('      2. cd python_service');
        console.log('      3. Run: start_python_service.bat (Windows) or ./start_python_service.sh (Linux/Mac)');
    }
    console.log('');
}

app.listen(port, async () => {
    console.log('========================================');
    console.log(`🚀 ChatBotwithPDF Server Started`);
    console.log(`📍 Server running on port ${port}`);
    console.log(`🌐 URL: http://localhost:${port}`);
    console.log('========================================');

    // Check Python service health
    await checkPythonServiceOnStartup();

    console.log('✅ Server ready to accept requests');
    console.log('========================================\n');
});