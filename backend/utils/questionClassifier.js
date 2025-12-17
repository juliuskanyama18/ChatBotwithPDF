/**
 * Question Classifier - Feature 4
 * Classifies questions as IN_PDF_ONLY, MIXED, or OUTSIDE_PDF
 */

import { OpenAI } from 'openai';

// Lazy-load OpenAI client
let openaiClient = null;

function getOpenAIClient() {
    if (!openaiClient) {
        openaiClient = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
    }
    return openaiClient;
}

/**
 * Classify a question based on whether it relates to document content
 * @param {string} question - User's question
 * @param {string} documentTitle - Title/filename of the document
 * @param {string} documentType - Type of document (pdf, pptx, etc.)
 * @returns {Promise<Object>} Classification result
 */
export async function classifyQuestion(question, documentTitle, documentType = 'pdf') {
    try {
        const openai = getOpenAIClient();

        const citationType = documentType === 'pptx' ? 'slides' : 'pages';

        const classificationPrompt = `You are a question classifier for a document Q&A system. Classify the user's question into one of three categories:

1. **IN_PDF_ONLY**: The question asks specifically about content in the document. Examples:
   - "What does page 5 say about X?"
   - "Summarize the document"
   - "What is discussed in chapter 3?"
   - "Find information about X in this PDF"

2. **MIXED**: The question asks about document content AND requires general knowledge. Examples:
   - "Explain the quantum computing concept mentioned on page 10"
   - "Is the theory in slide 3 still valid today?"
   - "Compare what the document says with current research"

3. **OUTSIDE_PDF**: The question has nothing to do with the document. Examples:
   - "What is quantum computing?" (when document is about biology)
   - "Tell me a joke"
   - "What's the weather?"
   - "How do I cook pasta?"

Document context:
- Title: "${documentTitle}"
- Type: ${documentType.toUpperCase()}

User's question: "${question}"

Respond with ONLY ONE of these exact words: IN_PDF_ONLY, MIXED, or OUTSIDE_PDF
No explanation, just the classification.`;

        const response = await openai.chat.completions.create({
            model: "gpt-4-turbo-preview",
            temperature: 0,
            max_tokens: 20,
            messages: [
                {
                    role: "system",
                    content: "You are a precise question classifier. Respond with only one word: IN_PDF_ONLY, MIXED, or OUTSIDE_PDF"
                },
                {
                    role: "user",
                    content: classificationPrompt
                }
            ]
        });

        const classification = response.choices[0].message.content.trim().toUpperCase();

        // Validate classification
        const validClassifications = ['IN_PDF_ONLY', 'MIXED', 'OUTSIDE_PDF'];
        const finalClassification = validClassifications.includes(classification)
            ? classification
            : 'IN_PDF_ONLY'; // Default to IN_PDF_ONLY if unclear

        return {
            classification: finalClassification,
            shouldSearchDocument: finalClassification !== 'OUTSIDE_PDF',
            allowGeneralKnowledge: finalClassification === 'MIXED' || classification === 'OUTSIDE_PDF',
            confidence: validClassifications.includes(classification) ? 'high' : 'low'
        };

    } catch (error) {
        console.error('❌ Error classifying question:', error.message);

        // Default to IN_PDF_ONLY on error
        return {
            classification: 'IN_PDF_ONLY',
            shouldSearchDocument: true,
            allowGeneralKnowledge: false,
            confidence: 'error'
        };
    }
}

/**
 * Fast heuristic-based classifier (no API call)
 * Used as a fallback or for quick checks
 * @param {string} question - User's question
 * @param {string} documentTitle - Title/filename of the document
 * @returns {Object} Classification result
 */
export function classifyQuestionHeuristic(question, documentTitle) {
    const lowerQuestion = question.toLowerCase();

    // Keywords indicating document-specific questions
    const documentKeywords = [
        'page', 'slide', 'chapter', 'section', 'paragraph',
        'document', 'pdf', 'file', 'this paper', 'this book',
        'summarize', 'summary', 'according to', 'mentioned',
        'in the', 'from the', 'extract', 'find in'
    ];

    // Keywords indicating general/outside questions
    const outsideKeywords = [
        'weather', 'time', 'date today', 'current', 'latest news',
        'tell me a joke', 'how are you', 'recipe', 'cook',
        'in general', 'generally speaking', 'what is the definition'
    ];

    // Check for page/slide references
    const hasPageReference = /\b(page|pg|p\.|slide|sl\.?)\s*\d+/i.test(question);
    if (hasPageReference) {
        return {
            classification: 'IN_PDF_ONLY',
            shouldSearchDocument: true,
            allowGeneralKnowledge: false,
            confidence: 'high'
        };
    }

    // Check for document keywords
    const hasDocumentKeywords = documentKeywords.some(keyword =>
        lowerQuestion.includes(keyword)
    );

    // Check for outside keywords
    const hasOutsideKeywords = outsideKeywords.some(keyword =>
        lowerQuestion.includes(keyword)
    );

    // Mixed indicators: "explain", "compare", "tell me more about"
    const mixedIndicators = ['explain', 'compare', 'tell me more', 'elaborate', 'expand on'];
    const hasMixedIndicators = mixedIndicators.some(indicator =>
        lowerQuestion.includes(indicator)
    ) && hasDocumentKeywords;

    // Classification logic
    if (hasOutsideKeywords && !hasDocumentKeywords) {
        return {
            classification: 'OUTSIDE_PDF',
            shouldSearchDocument: false,
            allowGeneralKnowledge: true,
            confidence: 'medium'
        };
    } else if (hasMixedIndicators) {
        return {
            classification: 'MIXED',
            shouldSearchDocument: true,
            allowGeneralKnowledge: true,
            confidence: 'medium'
        };
    } else if (hasDocumentKeywords) {
        return {
            classification: 'IN_PDF_ONLY',
            shouldSearchDocument: true,
            allowGeneralKnowledge: false,
            confidence: 'medium'
        };
    }

    // Default: assume document-related
    return {
        classification: 'IN_PDF_ONLY',
        shouldSearchDocument: true,
        allowGeneralKnowledge: false,
        confidence: 'low'
    };
}