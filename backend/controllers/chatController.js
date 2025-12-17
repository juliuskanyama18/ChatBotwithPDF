import path from 'path';
import { OpenAI } from 'openai';
import Document from '../models/Document.js';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import { retrieveRelevantChunks, buildContextFromChunks } from '../utils/embeddings.js';
import { detectPageReferences, expandPageRangeWithContext } from '../utils/pageDetector.js';
import { classifyQuestionHeuristic } from '../utils/questionClassifier.js';
import { STRICT_GROUNDING } from '../utils/featureFlags.js';

// Lazy-load OpenAI client to ensure env vars are loaded
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
 * Generate AI response using RAG
 */
export async function generateResponse(req, res) {
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

        // Get conversation history
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

        // Feature 4: Classify question type
        const questionClass = classifyQuestionHeuristic(prompt, document.originalName);
        console.log(`🏷️  Question classification: ${questionClass.classification} (confidence: ${questionClass.confidence})`);

        // Handle OUTSIDE_PDF questions early
        if (questionClass.classification === 'OUTSIDE_PDF') {
            console.log('   ⚠️  Question appears unrelated to document - using NOT FOUND template');
        }

        // Detect page references in the question (Feature 1: Page-specific retrieval)
        const pageDetection = detectPageReferences(prompt);
        if (pageDetection.hasPageReference) {
            console.log(`📍 Page detection: ${pageDetection.type} - Pages/Slides: ${pageDetection.pageNumbers.join(', ')}`);
            if (pageDetection.originalMatch) {
                console.log(`   Original match: "${pageDetection.originalMatch}"`);
            }
        }

        // RAG: Semantic search for relevant content
        let relevantContext = '';
        let pageReferences = [];
        let citationType = documentType === 'pptx' ? 'Slide' : 'Page';

        try {
            // Only perform semantic search if question is related to document
            if (questionClass.shouldSearchDocument) {
                console.log('\n🔍 Starting RAG retrieval with similarity filtering...');

                // Build page filter if page reference was detected
                const pageFilter = pageDetection.hasPageReference ? {
                    pageNumbers: expandPageRangeWithContext(pageDetection.pageNumbers, 1)
                } : null;

                if (pageFilter) {
                    console.log(`   🎯 Filtering by ${citationType.toLowerCase()}s: ${pageFilter.pageNumbers.join(', ')} (with context window)`);
                }

                // TASK A: Use retrieveRelevantChunks with type-aware similarity thresholds
                const similarChunks = await retrieveRelevantChunks({
                    question: prompt,
                    documentId: documentId,
                    k: 15, // Retrieve more candidates to ensure we don't miss relevant content
                    pageFilter: pageFilter
                });

                if (similarChunks && similarChunks.length > 0) {
                    // Determine citation type from chunk metadata
                    if (similarChunks[0].metadata && similarChunks[0].metadata.documentType) {
                        citationType = similarChunks[0].metadata.documentType === 'pptx' ? 'Slide' : 'Page';
                    }

                    // TASK C: Use type-aware context building (4 text, 2 table, 2 image)
                    relevantContext = buildContextFromChunks(similarChunks);

                    pageReferences = similarChunks
                        .filter(chunk => chunk.pageNumber)
                        .map(chunk => chunk.pageNumber);

                    console.log(`✅ RAG: Found ${similarChunks.length} relevant chunks passing similarity thresholds`);
                    console.log(`   ${citationType}s: ${pageReferences.join(', ')}`);
                    console.log(`   Top similarity score: ${similarChunks[0].similarity.toFixed(3)}`);
                } else {
                    // No chunks passed similarity threshold → Trigger NOT FOUND template
                    console.log('⚠️ No chunks passed similarity thresholds → Using NOT FOUND template');
                    relevantContext = '[No relevant information found in document - similarity scores too low]';
                }
            } else {
                // OUTSIDE_PDF: Skip retrieval, use empty context
                console.log('   ⏭️  Skipping document search (question classified as OUTSIDE_PDF)');
                relevantContext = '[No relevant document context - question appears unrelated to document]';
            }
        } catch (error) {
            console.error('Error in semantic search:', error);
            // On error, trigger NOT FOUND rather than using fallback text
            relevantContext = '[Error retrieving document context - please try again]';
        }

        // Enhanced system prompt for intelligent document analysis
        const strictMode = STRICT_GROUNDING();

        const instruction = strictMode
            ? // STRICT GROUNDING MODE: Balanced - strict but helpful when context exists
              `You are a grounded document Q&A assistant. Answer ONLY from the provided context, with mandatory ${citationType.toLowerCase()} citations.\n\n` +
              `🎯 CORE RULES:\n` +
              `1. Use ONLY information from the "Context from the document" section below\n` +
              `2. EVERY factual statement MUST cite a ${citationType.toLowerCase()} number: [${citationType} X]\n` +
              `3. If context is provided and relevant, extract the answer - don't be overly cautious\n` +
              `4. Only return NOT FOUND if context genuinely lacks the information\n\n` +
              `✅ WHEN TO ANSWER (be helpful if context exists):\n` +
              `- Context contains relevant information, even if not perfectly worded\n` +
              `- You can extract the answer from the text, tables, or images provided\n` +
              `- Multiple chunks together provide the answer\n` +
              `- Always cite ${citationType.toLowerCase()} numbers for every claim: [${citationType} X]\n\n` +
              `❌ WHEN TO RETURN "NOT FOUND":\n` +
              `Use this ONLY when context truly lacks information:\n` +
              `"I cannot find information about [TOPIC] in the provided ${citationType.toLowerCase()}s. ` +
              `The context covers ${citationType.toLowerCase()}s [X, Y, Z], which discuss [what IS there]."\n\n` +
              `Return NOT FOUND only if:\n` +
              `- No context chunks were provided (empty context)\n` +
              `- Context discusses completely different topics\n` +
              `- Question requires information not in any chunk\n\n` +
              `📊 CONTENT HANDLING:\n` +
              `- Text: Extract answers from text chunks; cite ${citationType.toLowerCase()}s\n` +
              `- Tables: Read markdown tables carefully; cite exact values with ${citationType.toLowerCase()} numbers\n` +
              `- Images: Use "[IMAGE DESCRIPTION - ${citationType} X]" text; cite ${citationType.toLowerCase()}\n` +
              `- For numbers/totals: Extract from tables, show calculation if needed\n\n` +
              `📄 PAGE-SPECIFIC QUESTIONS:\n` +
              `- "What's on ${citationType.toLowerCase()} 5?" → Describe content from that ${citationType.toLowerCase()}\n` +
              `- "Explain ${citationType.toLowerCase()} 10" → Summarize that ${citationType.toLowerCase()}\n` +
              `- Always cite: [${citationType} X]\n\n` +
              `Language: Match user's language. Be helpful when context exists. Cite everything.`
            : // NORMAL MODE: Helpful but still grounded
              `You are an intelligent document analysis AI assistant. Your job is to provide helpful, accurate answers based on the document context provided.\n\n` +
              `CORE PRINCIPLES:\n` +
              `1. Use ONLY information from the "Context from the document" section provided below\n` +
              `2. ALWAYS cite the ${citationType.toLowerCase()} number(s) using format [${citationType} X] at the END of sentences\n` +
              `   Example: "The program requires 240 ECTS credits [${citationType} 5]."\n` +
              `3. When content is found in the context, provide a complete and helpful answer\n` +
              `4. Extract and present information from text, tables, and images in the context\n` +
              `5. Be specific, direct, and informative\n\n` +
              `PAGE-SPECIFIC QUERIES:\n` +
              `- When asked about a specific ${citationType.toLowerCase()} (e.g., "${citationType.toLowerCase()} 5", "explain ${citationType.toLowerCase()} 10"), provide ALL content from that ${citationType.toLowerCase()}\n` +
              `- Describe the main topics, concepts, headings, and key information\n` +
              `- Include information about tables and images if present\n` +
              `- Be comprehensive - users want to understand what's on that ${citationType.toLowerCase()}\n` +
              `- Example: For "what's on ${citationType.toLowerCase()} 3?", describe all content: headings, text, tables, images, key points\n\n` +
              `TABLE HANDLING:\n` +
              `- Tables are provided in Markdown format - read them carefully\n` +
              `- For questions about tables, extract and present the data clearly\n` +
              `- When comparing values, mention row/column context\n` +
              `- Reference tables as "the table on ${citationType.toLowerCase()} X shows..."\n` +
              `- For numeric data (revenue, percentages, counts), quote exact values\n` +
              `- Present table data in an organized, readable format\n\n` +
              `IMAGE HANDLING:\n` +
              `- Image descriptions start with "[IMAGE DESCRIPTION - ${citationType} X]"\n` +
              `- When images are relevant, include their descriptions in your answer\n` +
              `- Explain what the image shows and its relevance to the question\n` +
              `- Reference images as "the image on ${citationType.toLowerCase()} X shows..."\n\n` +
              `CONTENT TYPES IN CONTEXT:\n` +
              `- [Context X - TEXT - ${citationType} Y]: Regular text content\n` +
              `- [Context X - TABLE - ${citationType} Y]: Table data in Markdown\n` +
              `- [Context X - IMAGE - ${citationType} Y]: Image description\n` +
              `Read ALL content types and use them to answer comprehensively\n\n` +
              `WHEN INFORMATION IS NOT FOUND:\n` +
              `Use this template ONLY if the context genuinely doesn't contain the answer:\n` +
              `"I cannot find specific information about [TOPIC] in the provided ${citationType.toLowerCase()}s of this document. ` +
              `The context includes ${citationType.toLowerCase()}s [list ${citationType.toLowerCase()} numbers], which cover [briefly mention what IS in context]."\n\n` +
              `SPECIAL CASES:\n` +
              `- Mathematical questions: Solve and show the calculation\n` +
              `- True/False: State "True" or "False" clearly, then explain\n` +
              `- Multiple choice: State the correct option letter (A, B, C, D) clearly\n` +
              `- Missing question numbers: Clarify which questions ARE available\n\n` +
              `Language: Match the user's language (Turkish → Turkish, English → English).\n`;

        console.log(`🔒 Grounding mode: ${strictMode ? 'STRICT' : 'NORMAL'}`);

        // Construct prompt with context
        const formattedHistory = conversationHistory.map(
            (msg) => `${msg.role === 'user' ? 'User' : 'Bot'}: ${msg.content}`
        ).join("\n");

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
            - If the information is NOT in the context, use the enhanced NOT FOUND template from the system instructions
            - If asked to "answer" a math/calculation question, perform the calculation and show the result
            - If asked about a question that doesn't exist, clarify which questions ARE in the document
            - For True/False: State "True" or "False" clearly
            - For MCQs: State the correct letter option (A, B, C, D) clearly
            - Be specific and direct
        `;

        console.log("\n🤖 Sending prompt to OpenAI...");

        // Append user input to history
        conversationHistory.push({ role: 'user', content: prompt });

        // Send request to OpenAI GPT-3.5 Turbo
        console.time('⏱️ OpenAI API call');
        const openaiClient = getOpenAIClient();
        const response = await openaiClient.chat.completions.create({
            model: "gpt-3.5-turbo", // GPT-3.5 Turbo for faster and cheaper responses
            temperature: 0,
            messages: [
                { role: 'system', content: instruction },
                ...conversationHistory.map(({ role, content }) => ({ role, content })),
                { role: 'user', content: fullPrompt }
            ],
            max_tokens: 1000 // Token limit for GPT-3.5 Turbo
        });
        console.timeEnd('⏱️ OpenAI API call');

        const aiResponse = response.choices[0].message.content.trim();
        console.log(`✅ Response generated: ${aiResponse.substring(0, 100)}...`);

        // Save messages to database
        console.time('⏱️ Save messages to DB');
        await Message.create({
            conversationId: conversation._id,
            role: 'user',
            content: prompt,
            pageReference: pageReferences.length > 0 ? pageReferences[0] : null
        });

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
}

/**
 * Get messages for a conversation
 */
export async function getConversationMessages(req, res) {
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
}

/**
 * Reset chat - Delete all conversations and messages for a document
 */
export async function resetChat(req, res) {
    try {
        const { documentId } = req.params;

        // Verify document belongs to user
        const document = await Document.findOne({
            _id: documentId,
            userId: req.user._id
        });

        if (!document) {
            return res.status(404).json({ error: 'Document not found' });
        }

        // Find all conversations for this document
        const conversations = await Conversation.find({
            documentId: documentId,
            userId: req.user._id
        });

        const conversationIds = conversations.map(c => c._id);

        // Delete all messages for these conversations
        await Message.deleteMany({
            conversationId: { $in: conversationIds }
        });

        // Delete all conversations for this document
        await Conversation.deleteMany({
            documentId: documentId,
            userId: req.user._id
        });

        console.log(`✅ Chat reset for document ${documentId}: ${conversationIds.length} conversations and their messages deleted`);

        res.json({
            success: true,
            message: 'Chat reset successfully',
            deletedConversations: conversationIds.length
        });
    } catch (error) {
        console.error('Reset chat error:', error);
        res.status(500).json({ error: 'Error resetting chat' });
    }
}
