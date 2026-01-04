import mongoose from 'mongoose';

const embeddingSchema = new mongoose.Schema({
    documentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Document',
        required: true,
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    chunkText: {
        type: String,
        required: true
    },
    chunkIndex: {
        type: Number,
        required: true
    },
    pageNumber: {
        type: Number
    },
    chunkType: {
        type: String,
        enum: ['text', 'image', 'table'],
        default: 'text'
    },
    embedding: {
        type: [Number],
        required: true
    },
    // 🎯 PHASE 2: Character offset tracking for precise text highlighting
    startOffset: {
        type: Number,
        required: false,
        default: null
    },
    endOffset: {
        type: Number,
        required: false,
        default: null
    },
    lineRange: {
        from: {
            type: Number,
            required: false
        },
        to: {
            type: Number,
            required: false
        }
    },
    // 🎯 PHASE 2: Enhanced metadata (table structure, etc.)
    metadata: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,  // Changed from String to Mixed for complex objects
        // Can store:
        // - documentType: 'pdf' | 'pptx' | 'docx'
        // - citationType: 'page' | 'slide' | 'section'
        // - tableStructure: { headers: [...], rowCount: N, columnCount: M, format: 'markdown'|'tab' }
        // - length: chunk text length
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Compound index for efficient queries
embeddingSchema.index({ documentId: 1, chunkIndex: 1 });
embeddingSchema.index({ userId: 1, documentId: 1 });

const Embedding = mongoose.model('Embedding', embeddingSchema);

export default Embedding;
