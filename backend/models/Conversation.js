import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    documentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Document',
        required: false, // Now optional for folder conversations
        index: true
    },
    folderId: {
        type: String, // Folder IDs are stored as strings in localStorage
        required: false,
        index: true
    },
    title: {
        type: String,
        default: 'New Conversation'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Index for efficient queries
conversationSchema.index({ userId: 1, documentId: 1 });
conversationSchema.index({ userId: 1, folderId: 1 });

const Conversation = mongoose.model('Conversation', conversationSchema);

export default Conversation;
