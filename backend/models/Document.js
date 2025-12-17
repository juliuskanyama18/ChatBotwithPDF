import mongoose from 'mongoose';

const documentSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    originalName: {
        type: String,
        required: true
    },
    fileName: {
        type: String,
        required: true
    },
    filePath: {
        type: String,
        required: true
    },
    fileSize: {
        type: Number,
        required: true
    },
    language: {
        type: String,
        default: 'en'
    },
    pageCount: {
        type: Number
    },
    extractedText: {
        type: String
    },
    convertedPdfPath: {
        type: String,
        default: null
    },

    // OpenAI Managed RAG fields
    workspaceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Workspace',
        default: null
    },
    openaiFileId: {
        type: String,
        default: null
    },
    openaiVectorStoreId: {
        type: String,
        default: null
    },
    sourceType: {
        type: String,
        enum: ['file', 'ocr_text', 'manual'],
        default: 'file'
    },
    status: {
        type: String,
        enum: ['uploading', 'processing', 'indexing', 'ready', 'error'],
        default: 'uploading'
    },
    ocrSourceDocumentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Document',
        default: null
    },
    processingError: {
        type: String,
        default: null
    },

    uploadedAt: {
        type: Date,
        default: Date.now
    }
});

const Document = mongoose.model('Document', documentSchema);

export default Document;
