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
    uploadedAt: {
        type: Date,
        default: Date.now
    }
});

const Document = mongoose.model('Document', documentSchema);

export default Document;
