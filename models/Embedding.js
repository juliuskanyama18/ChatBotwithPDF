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
    embedding: {
        type: [Number],
        required: true
    },
    metadata: {
        type: Map,
        of: String
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
