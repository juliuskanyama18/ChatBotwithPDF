import mongoose from 'mongoose';

const workspaceSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // OpenAI managed RAG fields
    openaiVectorStoreId: {
        type: String,
        default: null
    },
    openaiAssistantId: {
        type: String,
        default: null
    },
    description: {
        type: String,
        default: ''
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

// Update the updatedAt timestamp before saving
workspaceSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

const Workspace = mongoose.model('Workspace', workspaceSchema);

export default Workspace;
