import path from 'path';
import { OpenAI } from 'openai';
import Document from '../models/Document.js';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import { retrieveRelevantChunks, buildContextFromChunks, buildContextFromChunksMultiDoc } from '../utils/embeddings.js';

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
 * 🎯 PHASE 1 IMPROVEMENT: Citation Verification
 * Verify that LLM citations match retrieved chunk pages
 * Detects hallucinated page references
 */
function verifyCitations(aiResponse, retrievedChunks, citationType = 'page', isMultiDoc = false) {
    // Extract citations from response based on type
    const citationPatterns = {
        page: isMultiDoc
            ? /\[([^\]]+?)\s*-\s*Page\s+(\d+(?:\s*,\s*\d+)*)\]/gi  // Multi-doc: [Doc.pdf - Page 5]
            : /\[Page\s+(\d+(?:\s*,\s*\d+)*)\]/gi,                 // Single-doc: [Page 5]
        slide: isMultiDoc
            ? /\[([^\]]+?)\s*-\s*Slide\s+(\d+(?:\s*,\s*\d+)*)\]/gi // Multi-doc: [Doc.pptx - Slide 5]
            : /\[Slide\s+(\d+(?:\s*,\s*\d+)*)\]/gi,                // Single-doc: [Slide 5]
        section: /\[Section\s+(\d+(?:\s*,\s*\d+)*)\]/gi
    };

    const regex = citationPatterns[citationType.toLowerCase()] || citationPatterns.page;
    const citedPages = [];
    const citedDocs = new Set();
    let match;

    while ((match = regex.exec(aiResponse)) !== null) {
        if (isMultiDoc) {
            // Multi-doc format: match[1] = doc name, match[2] = page numbers
            const docName = match[1];
            const pageNumbers = match[2].split(',').map(p => parseInt(p.trim()));
            citedDocs.add(docName);
            citedPages.push(...pageNumbers);
        } else {
            // Single-doc format: match[1] = page numbers
            const pageNumbers = match[1].split(',').map(p => parseInt(p.trim()));
            citedPages.push(...pageNumbers);
        }
    }

    // Get valid pages from retrieved chunks
    const validPages = new Set(retrievedChunks.map(c => c.pageNumber));

    // Find hallucinated citations
    const invalidCitations = citedPages.filter(p => !validPages.has(p));
    const validCitations = citedPages.filter(p => validPages.has(p));

    const analysis = {
        citedPages: [...new Set(validCitations)],
        allCitedPages: [...new Set(citedPages)],
        invalidCitations: [...new Set(invalidCitations)],
        citedDocuments: Array.from(citedDocs),
        isAccurate: invalidCitations.length === 0,
        citationCount: citedPages.length,
        validCitationCount: validCitations.length,
        retrievedPageCount: validPages.size,
        accuracy: citedPages.length > 0 ? (validCitations.length / citedPages.length * 100).toFixed(1) : 100
    };

    if (invalidCitations.length > 0) {
        console.warn('⚠️  Citation Hallucination Detected:', {
            invalid: invalidCitations,
            valid: Array.from(validPages),
            accuracy: `${analysis.accuracy}%`
        });
    } else if (citedPages.length > 0) {
        console.log(`✅ Citation Verification: ${analysis.citationCount} citations, 100% accurate`);
    }

    return analysis;
}

/**
 * 🔍 GENERAL KEYWORD EXTRACTION
 * Extract specific identifiers, codes, names from user question
 * Works for ANY type of document (courses, products, reports, etc.)
 */
function extractKeyIdentifiers(question) {
    const identifiers = [];

    // Pattern 1: Alphanumeric codes (ECC102, MTH101, PROD-123, ID456, etc.)
    // Matches: 2-5 letters + 2-4 digits OR letter-digit combos with hyphens
    const alphaCodes = question.match(/\b[A-Z]{2,5}\d{2,4}\b/g);
    if (alphaCodes) identifiers.push(...alphaCodes);

    // Pattern 2: Hyphenated codes (PROD-123, ID-456, SEC-7.2, etc.)
    const hyphenatedCodes = question.match(/\b[A-Z][\w]*-[\w]+\b/gi);
    if (hyphenatedCodes) identifiers.push(...hyphenatedCodes);

    // Pattern 3: Quoted terms - user explicitly highlighting something
    const quoted = question.match(/"([^"]+)"/g);
    if (quoted) {
        identifiers.push(...quoted.map(q => q.replace(/"/g, '')));
    }

    // Pattern 4: Terms after "about", "for", "in", "of" (e.g., "about Product A", "for Director Smith")
    const aboutPattern = /\b(about|for|in|of|regarding|concerning)\s+([A-Z][\w\s]{2,30}?)(?=\s*[?.!,]|$)/gi;
    let aboutMatch;
    while ((aboutMatch = aboutPattern.exec(question)) !== null) {
        const term = aboutMatch[2].trim();
        if (term.length >= 3) identifiers.push(term);
    }

    // Remove duplicates and empty strings
    const unique = [...new Set(identifiers.filter(id => id && id.trim().length > 0))];

    if (unique.length > 0) {
        console.log(`   🔍 Extracted key identifiers: [${unique.join(', ')}]`);
    }

    return unique;
}

/**
 * 🎯 FILTER CHUNKS BY KEYWORDS
 * Only keep chunks that contain at least one of the extracted identifiers
 * Prevents LLM confusion when multiple similar codes/items exist
 */
function filterChunksByKeywords(chunks, keywords) {
    if (!keywords || keywords.length === 0) {
        return chunks; // No filtering if no keywords detected
    }

    const filtered = chunks.filter(chunk => {
        const chunkText = chunk.chunkText;
        // Check if chunk contains ANY of the keywords (case-sensitive for codes)
        return keywords.some(keyword => chunkText.includes(keyword));
    });

    if (filtered.length < chunks.length) {
        console.log(`   ✂️  Filtered chunks: ${chunks.length} → ${filtered.length} (removed ${chunks.length - filtered.length} chunks not containing key identifiers)`);
    }

    // If filtering removed ALL chunks, return original (safeguard)
    return filtered.length > 0 ? filtered : chunks;
}

/**
 * Generate AI response using RAG
 */
export async function generateResponse(req, res) {
    try {
        console.log('\n🚀 ========== NEW CHAT REQUEST ==========');
        console.time('⏱️ TOTAL REQUEST TIME');

        const { prompt, matchedSection, documentId, documentIds, folderId, conversationId } = req.body;
        console.log(`📝 Question: "${prompt.substring(0, 100)}..."`);

        // MULTI-DOCUMENT MODE vs SINGLE DOCUMENT MODE
        const isMultiDocMode = documentIds && Array.isArray(documentIds) && documentIds.length > 0;
        const targetDocIds = isMultiDocMode ? documentIds : [documentId];

        console.log(`🎯 Mode: ${isMultiDocMode ? 'MULTI-DOCUMENT (Folder)' : 'SINGLE DOCUMENT'}`);
        console.log(`📚 Documents to search: ${targetDocIds.length}`);

        // Fetch all target documents
        console.time('⏱️ Fetch document(s)');
        const documents = await Document.find({
            _id: { $in: targetDocIds },
            userId: req.user._id
        });
        console.timeEnd('⏱️ Fetch document(s)');

        if (documents.length === 0) {
            return res.status(404).json({ error: 'No documents found' });
        }

        console.log(`✅ Found ${documents.length} document(s)`);
        documents.forEach(doc => {
            console.log(`   - ${doc.originalName} (${doc.pageCount} pages)`);
        });

        // For single document mode, use the first (and only) document
        const document = documents[0];

        // Get or create conversation
        console.time('⏱️ Get/Create conversation');
        let conversation;
        if (conversationId) {
            conversation = await Conversation.findOne({
                _id: conversationId,
                userId: req.user._id
            });
        }

        if (!conversation) {
            conversation = await Conversation.create({
                userId: req.user._id,
                documentId: isMultiDocMode ? null : documentId, // null for folder conversations
                folderId: folderId || null,
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

        // 📚 ALWAYS USE RAG RETRIEVAL
        console.log('\n📚 RAG RETRIEVAL MODE\n');

        // Get document type for proper citation format
        const documentType = path.extname(document.fileName).substring(1).toLowerCase();

        // RAG: Semantic search for relevant content
        let relevantContext = '';
        let pageReferences = [];
        let sourceDocument = null; // Which document provided the answer (for multi-doc mode)
        let citationType = documentType === 'pptx' ? 'Slide' : 'Page';

        try {
            if (isMultiDocMode) {
                console.log('\n🔍 Starting MULTI-DOCUMENT RAG retrieval...');

                // Call retrieveRelevantChunks for EACH document in parallel
                const allChunksPromises = targetDocIds.map(docId =>
                    retrieveRelevantChunks({
                        question: prompt,
                        documentId: docId,
                        k: 10, // Get top 10 from each document
                        pageFilter: null
                    })
                );

                const allChunksArrays = await Promise.all(allChunksPromises);

                // Create a map of documentId to document object (MongoDB find doesn't preserve order)
                const docMap = {};
                documents.forEach(doc => {
                    docMap[doc._id.toString()] = doc;
                });

                // Flatten and add document metadata to each chunk
                const allChunksWithMetadata = [];
                allChunksArrays.forEach((chunks, idx) => {
                    const docId = targetDocIds[idx];
                    const doc = docMap[docId];
                    if (!doc) {
                        console.error(`Document not found for ID: ${docId}`);
                        return;
                    }
                    chunks.forEach(chunk => {
                        allChunksWithMetadata.push({
                            ...chunk,
                            documentId: doc._id.toString(),
                            documentName: doc.originalName,
                            documentFileName: doc.fileName
                        });
                    });
                });

                console.log(`📊 Total chunks retrieved: ${allChunksWithMetadata.length}`);

                if (allChunksWithMetadata.length > 0) {
                    // Sort by similarity (highest first)
                    allChunksWithMetadata.sort((a, b) => b.similarity - a.similarity);

                    // Take top 15 chunks overall (across all documents)
                    let topChunks = allChunksWithMetadata.slice(0, 15);

                    // 🔍 FILTER BY KEY IDENTIFIERS (e.g., ECC102, Product-A, etc.)
                    const keyIdentifiers = extractKeyIdentifiers(prompt);
                    if (keyIdentifiers.length > 0) {
                        topChunks = filterChunksByKeywords(topChunks, keyIdentifiers);
                    }

                    // Determine which document has the most relevant answer
                    const topChunk = topChunks[0];
                    sourceDocument = {
                        id: topChunk.documentId,
                        name: topChunk.documentName,
                        fileName: topChunk.documentFileName
                    };

                    console.log(`🏆 Most relevant document: ${sourceDocument.name} (similarity: ${topChunk.similarity.toFixed(3)})`);

                    // Determine citation type
                    if (topChunk.metadata && topChunk.metadata.documentType) {
                        citationType = topChunk.metadata.documentType === 'pptx' ? 'Slide' : 'Page';
                    }

                    // Build context with document names
                    const buildResult = buildContextFromChunksMultiDoc(topChunks);
                    relevantContext = buildResult.contextString || '';
                    const selectedChunks = buildResult.selectedChunks || [];

                    pageReferences = topChunks
                        .filter(chunk => chunk.pageNumber)
                        .map(chunk => chunk.pageNumber);

                    // Prepare chunk-level data for client highlighting
                    var relevantChunksForClient = selectedChunks.map(c => ({
                        pageNumber: c.pageNumber,
                        chunkText: c.chunkText,
                        chunkIndex: c.chunkIndex,
                        chunkType: c.chunkType || 'text',
                        similarity: c.similarity || 1.0,
                        documentName: c.documentName,
                        documentId: c.documentId
                    }));

                    console.log(`✅ RAG: Found ${topChunks.length} relevant chunks across ${documents.length} documents`);
                    console.log(`   Top similarity score: ${topChunks[0].similarity.toFixed(3)}`);

                    // Log document distribution
                    const docDistribution = {};
                    topChunks.forEach(c => {
                        docDistribution[c.documentName] = (docDistribution[c.documentName] || 0) + 1;
                    });
                    console.log('   Document distribution:', docDistribution);

                } else {
                    console.log('⚠️ No chunks passed similarity thresholds → Using NOT FOUND template');
                    relevantContext = '[No relevant information found in documents - similarity scores too low]';
                }
            } else {
                console.log('\n🔍 Starting RAG retrieval with similarity filtering...');

                // SINGLE DOCUMENT MODE (existing flow)
                let similarChunks = await retrieveRelevantChunks({
                    question: prompt,
                    documentId: documentId,
                    k: 15,
                    pageFilter: null
                });

                if (similarChunks && similarChunks.length > 0) {
                    // 🔍 FILTER BY KEY IDENTIFIERS (e.g., ECC102, Product-A, etc.)
                    const keyIdentifiers = extractKeyIdentifiers(prompt);
                    if (keyIdentifiers.length > 0) {
                        similarChunks = filterChunksByKeywords(similarChunks, keyIdentifiers);
                    }

                    // Determine citation type from chunk metadata
                    if (similarChunks[0].metadata && similarChunks[0].metadata.documentType) {
                        citationType = similarChunks[0].metadata.documentType === 'pptx' ? 'Slide' : 'Page';
                    }

                    // Use type-aware context building (4 text, 2 table, 2 image)
                    const buildResult = buildContextFromChunks(similarChunks);
                    relevantContext = buildResult.contextString || '';
                    const selectedChunks = buildResult.selectedChunks || [];

                    pageReferences = similarChunks
                        .filter(chunk => chunk.pageNumber)
                        .map(chunk => chunk.pageNumber);

                    // Prepare chunk-level data for client highlighting
                    var relevantChunksForClient = selectedChunks.map(c => ({
                        pageNumber: c.pageNumber,
                        chunkText: c.chunkText,
                        chunkIndex: c.chunkIndex,
                        chunkType: c.chunkType || 'text',
                        similarity: c.similarity || 1.0
                    }));

                    console.log(`✅ RAG: Found ${similarChunks.length} relevant chunks passing similarity thresholds`);
                    console.log(`   ${citationType}s: ${pageReferences.join(', ')}`);
                    console.log(`   Top similarity score: ${similarChunks[0].similarity.toFixed(3)}`);
                } else {
                    console.log('⚠️ No chunks passed similarity thresholds → Using NOT FOUND template');
                    relevantContext = '[No relevant information found in document - similarity scores too low]';
                }
            }
        } catch (error) {
            console.error('Error in semantic search:', error);
            relevantContext = '[Error retrieving document context - please try again]';
        }

        // Enhanced system prompt for intelligent document analysis
        const strictMode = false; // Normal mode (MANAGED RAG removed)

        const instruction = isMultiDocMode
            ? // MULTI-DOCUMENT MODE: Include document names in citations
              `You are an intelligent multi-document analysis AI assistant. Your job is to provide helpful, accurate answers based on content from multiple documents.\n\n` +
              `⚠️ CRITICAL CITATION RULE FOR MULTI-DOCUMENT MODE:\n` +
              `EVERY citation MUST include BOTH the document name AND ${citationType.toLowerCase()} number.\n` +
              `Format: [Document Name - ${citationType} X]\n` +
              `NEVER use [${citationType} X] format - ALWAYS include the document name!\n\n` +
              `CORE PRINCIPLES:\n` +
              `1. Use ONLY information from the "Context from the documents" section provided below\n` +
              `2. ALWAYS cite BOTH the document name AND ${citationType.toLowerCase()} number using format [Document Name - ${citationType} X]\n` +
              `   Example: "The program requires 240 ECTS credits [Course Catalog.pdf - ${citationType} 5]."\n` +
              `   WRONG: "The program requires 240 ECTS credits [${citationType} 5]." ❌\n` +
              `3. When content is found in the context, provide a complete and helpful answer\n` +
              `4. Extract and present information from text, tables, and images in the context\n` +
              `5. If information comes from multiple documents, cite all sources\n` +
              `6. Be specific, direct, and informative\n\n` +
              `CITATION FORMAT (MANDATORY):\n` +
              `- ALWAYS include document name: [Document Name - ${citationType} X] ✓\n` +
              `- NEVER use [${citationType} X] alone ❌\n` +
              `- For multiple pages from same document: [Document Name - ${citationType} 5, 6, 7]\n` +
              `- For multiple documents: [Doc1.pdf - ${citationType} 5] and [Doc2.pdf - ${citationType} 10]\n` +
              `- Use the EXACT document name as shown in the context labels\n\n` +
              `DOCUMENT-SPECIFIC QUERIES:\n` +
              `- When asked about a specific ${citationType.toLowerCase()} (e.g., "${citationType.toLowerCase()} 5"), provide ALL content from that ${citationType.toLowerCase()}\n` +
              `- Always include the document name in the citation\n\n` +
              `TABLE HANDLING:\n` +
              `- Tables are provided in Markdown format - read them carefully\n` +
              `- For questions about tables, extract and present the data clearly\n` +
              `- Reference tables as "the table in [Document Name - ${citationType} X] shows..."\n\n` +
              `IMAGE HANDLING:\n` +
              `- Image descriptions start with "[IMAGE DESCRIPTION - ${citationType} X]"\n` +
              `- Reference images as "the image in [Document Name - ${citationType} X] shows..."\n\n` +
              `WHEN INFORMATION IS NOT FOUND:\n` +
              `Use this template ONLY if the context genuinely doesn't contain the answer:\n` +
              `"I cannot find specific information about [TOPIC] in the provided documents. ` +
              `The context includes content from [list document names], which cover [briefly mention what IS in context]."\n\n` +
              `Language: Match the user's language (Turkish → Turkish, English → English).\n`
            : strictMode
            ? // STRICT GROUNDING MODE (single doc)
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
            : // NORMAL MODE (single doc)
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

        const fullPrompt = isMultiDocMode
            ? // MULTI-DOCUMENT PROMPT
              `
            ═══════════════════════════════════════
            MULTI-DOCUMENT METADATA
            ═══════════════════════════════════════
            Number of Documents: ${documents.length}
            Documents:
            ${documents.map(doc => `- ${doc.originalName} (${doc.pageCount} ${citationType.toLowerCase()}s)`).join('\n')}
            ═══════════════════════════════════════

            ═══════════════════════════════════════
            CONTEXT FROM THE DOCUMENTS
            ═══════════════════════════════════════
            ${relevantContext}
            ═══════════════════════════════════════

            ${formattedHistory ? `\nCONVERSATION HISTORY:\n${formattedHistory}\n` : ''}

            USER'S QUESTION: ${prompt}

            ⚠️ CRITICAL INSTRUCTIONS:
            - Answer ONLY using the context above
            - MANDATORY: EVERY citation MUST include document name: [Document Name - ${citationType} X]
            - NEVER use [${citationType} X] format alone - ALWAYS include the document name!
            - Use the EXACT document name as it appears in the context labels above
            - If information comes from multiple documents, cite all sources with their document names
            - If the information is NOT in the context, use the enhanced NOT FOUND template
            - Be specific and direct

            REMEMBER: Look at the context labels like "[Context 1 - TEXT - filename.pdf - Page 5]"
            When citing, use the document name from the label: [filename.pdf - ${citationType} 5]
        `
            : // SINGLE DOCUMENT PROMPT
              `
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

        // 🎯 PHASE 1: Verify citations in AI response
        console.time('⏱️ Citation Verification');
        const citationAnalysis = verifyCitations(
            aiResponse,
            relevantChunksForClient || [],
            citationType,
            isMultiDocMode
        );
        console.timeEnd('⏱️ Citation Verification');

        // Log citation analysis
        if (citationAnalysis.citationCount > 0) {
            console.log(`📊 Citation Analysis:`);
            console.log(`   Total citations: ${citationAnalysis.citationCount}`);
            console.log(`   Valid citations: ${citationAnalysis.validCitationCount}`);
            console.log(`   Accuracy: ${citationAnalysis.accuracy}%`);
            if (citationAnalysis.invalidCitations.length > 0) {
                console.log(`   ⚠️  Hallucinated pages: ${citationAnalysis.invalidCitations.join(', ')}`);
            }
        }

        // Save messages to database
        console.time('⏱️ Save messages to DB');
        await Message.create({
            conversationId: conversation._id,
            role: 'user',
            content: prompt,
            pageReference: pageReferences.length > 0 ? pageReferences : undefined,
            metadata: {
                retrievedPages: pageReferences
            }
        });

        await Message.create({
            conversationId: conversation._id,
            role: 'assistant',
            content: aiResponse,
            pageReference: citationAnalysis.citedPages.length > 0 ? citationAnalysis.citedPages : undefined,
            sourceDocument: sourceDocument ? sourceDocument.id : null,
            citationAccuracy: citationAnalysis.isAccurate,
            metadata: {
                citedPages: citationAnalysis.citedPages,
                allCitedPages: citationAnalysis.allCitedPages,
                invalidCitations: citationAnalysis.invalidCitations,
                citationCount: citationAnalysis.citationCount,
                citationAccuracy: citationAnalysis.accuracy,
                retrievedPageCount: citationAnalysis.retrievedPageCount
            }
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
            relevantPages: pageReferences,
            relevantChunks: relevantChunksForClient || [],
            sourceDocument: sourceDocument, // Which document provided the answer
            // Citation analysis in response
            citationAnalysis: {
                citedPages: citationAnalysis.citedPages,
                citationCount: citationAnalysis.citationCount,
                accuracy: citationAnalysis.accuracy,
                isAccurate: citationAnalysis.isAccurate,
                invalidCitations: citationAnalysis.invalidCitations
            }
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
