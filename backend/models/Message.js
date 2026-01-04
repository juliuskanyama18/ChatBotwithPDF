import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
    conversationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Conversation',
        required: true,
        index: true
    },
    role: {
        type: String,
        enum: ['user', 'assistant'],
        required: true
    },
    content: {
        type: String,
        required: true
    },
    // 🎯 PHASE 1: Support multiple page references (not just first one)
    pageReference: {
        type: [Number], // Changed from Number to [Number] for array support
        required: false,
        default: undefined
    },
    sourceDocument: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Document',
        required: false // Which document provided this answer (for multi-doc mode)
    },
    // 🎯 PHASE 1: Track citation accuracy
    citationAccuracy: {
        type: Boolean,
        required: false,
        default: true
    },
    // 🎯 PHASE 1: Store query routing and citation metadata
    metadata: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        required: false,
        default: undefined
        // Can store:
        // - route: 'direct' | 'retrieve'
        // - citedPages: [1, 2, 3]
        // - invalidCitations: [99, 100]
        // - citationCount: 5
        // - ragEnabled: true/false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const Message = mongoose.model('Message', messageSchema);

export default Message;
