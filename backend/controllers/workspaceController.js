import fs from 'fs';
import Workspace from '../models/Workspace.js';
import Document from '../models/Document.js';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import {
    createVectorStore,
    deleteVectorStore,
    getVectorStore,
    removeFileFromVectorStore,
    deleteOpenAIFile
} from '../services/openaiVectorStore.js';
import {
    createAssistant,
    deleteAssistant
} from '../services/openaiAssistant.js';
import { USE_MANAGED_RAG } from '../utils/featureFlags.js';

/**
 * Create a new workspace
 */
export async function createWorkspace(req, res) {
    try {
        const { name, description } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Workspace name is required' });
        }

        console.log(`\n📁 Creating workspace: ${name}`);

        let vectorStoreId = null;
        let assistantId = null;

        // If managed RAG is enabled, create OpenAI resources
        if (USE_MANAGED_RAG()) {
            try {
                // Create vector store
                const vectorStoreResult = await createVectorStore(
                    `${name} - ${req.user.email}`,
                    {
                        metadata: {
                            userId: req.user._id.toString(),
                            workspaceName: name
                        }
                    }
                );

                vectorStoreId = vectorStoreResult.vectorStoreId;

                // Create assistant
                const assistantResult = await createAssistant(vectorStoreId, {
                    name: `${name} Assistant`,
                    instructions: `You are a helpful assistant for the "${name}" workspace.

Important guidelines:
1. ONLY answer based on information from the documents in this workspace
2. If the information is not in the documents, say "I cannot find that information in the workspace documents"
3. Always cite the source document and page/slide number when possible
4. Be precise and quote relevant text when appropriate
5. For questions spanning multiple documents, provide a comprehensive answer citing all relevant sources`
                });

                assistantId = assistantResult.assistantId;

                console.log(`✅ OpenAI resources created`);
                console.log(`   Vector Store: ${vectorStoreId}`);
                console.log(`   Assistant: ${assistantId}`);
            } catch (error) {
                console.error('❌ Error creating OpenAI resources:', error.message);
                return res.status(500).json({
                    error: 'Failed to create workspace resources',
                    details: error.message
                });
            }
        }

        // Create workspace in MongoDB
        const workspace = await Workspace.create({
            name,
            description: description || '',
            userId: req.user._id,
            openaiVectorStoreId: vectorStoreId,
            openaiAssistantId: assistantId
        });

        console.log(`✅ Workspace created: ${workspace._id}`);

        res.json({
            success: true,
            workspace: {
                _id: workspace._id,
                name: workspace.name,
                description: workspace.description,
                openaiVectorStoreId: workspace.openaiVectorStoreId,
                openaiAssistantId: workspace.openaiAssistantId,
                createdAt: workspace.createdAt
            }
        });
    } catch (error) {
        console.error('Create workspace error:', error);
        res.status(500).json({ error: 'Error creating workspace' });
    }
}

/**
 * Get all workspaces for user
 */
export async function getAllWorkspaces(req, res) {
    try {
        const workspaces = await Workspace.find({ userId: req.user._id })
            .sort({ updatedAt: -1 });

        // Get document counts for each workspace
        const workspacesWithCounts = await Promise.all(
            workspaces.map(async (workspace) => {
                const documentCount = await Document.countDocuments({
                    workspaceId: workspace._id
                });

                return {
                    _id: workspace._id,
                    name: workspace.name,
                    description: workspace.description,
                    documentCount,
                    openaiVectorStoreId: workspace.openaiVectorStoreId,
                    createdAt: workspace.createdAt,
                    updatedAt: workspace.updatedAt
                };
            })
        );

        res.json({ success: true, workspaces: workspacesWithCounts });
    } catch (error) {
        console.error('Get workspaces error:', error);
        res.status(500).json({ error: 'Error fetching workspaces' });
    }
}

/**
 * Get single workspace by ID
 */
export async function getWorkspaceById(req, res) {
    try {
        const workspace = await Workspace.findOne({
            _id: req.params.id,
            userId: req.user._id
        });

        if (!workspace) {
            return res.status(404).json({ error: 'Workspace not found' });
        }

        // Get documents in workspace
        const documents = await Document.find({ workspaceId: workspace._id })
            .select('_id originalName fileName status pageCount uploadedAt')
            .sort({ uploadedAt: -1 });

        // Get vector store info if managed RAG is enabled
        let vectorStoreInfo = null;
        if (USE_MANAGED_RAG() && workspace.openaiVectorStoreId) {
            try {
                const result = await getVectorStore(workspace.openaiVectorStoreId);
                vectorStoreInfo = result.vectorStore;
            } catch (error) {
                console.error('Error fetching vector store info:', error.message);
            }
        }

        res.json({
            success: true,
            workspace: {
                _id: workspace._id,
                name: workspace.name,
                description: workspace.description,
                openaiVectorStoreId: workspace.openaiVectorStoreId,
                openaiAssistantId: workspace.openaiAssistantId,
                createdAt: workspace.createdAt,
                updatedAt: workspace.updatedAt,
                documentCount: documents.length,
                vectorStoreInfo
            },
            documents
        });
    } catch (error) {
        console.error('Get workspace error:', error);
        res.status(500).json({ error: 'Error fetching workspace' });
    }
}

/**
 * Update workspace
 */
export async function updateWorkspace(req, res) {
    try {
        const workspace = await Workspace.findOne({
            _id: req.params.id,
            userId: req.user._id
        });

        if (!workspace) {
            return res.status(404).json({ error: 'Workspace not found' });
        }

        const { name, description } = req.body;

        if (name) {
            workspace.name = name;
        }

        if (description !== undefined) {
            workspace.description = description;
        }

        await workspace.save();

        res.json({ success: true, workspace });
    } catch (error) {
        console.error('Update workspace error:', error);
        res.status(500).json({ error: 'Error updating workspace' });
    }
}

/**
 * Delete workspace and all associated resources
 */
export async function deleteWorkspace(req, res) {
    try {
        const workspace = await Workspace.findOne({
            _id: req.params.id,
            userId: req.user._id
        });

        if (!workspace) {
            return res.status(404).json({ error: 'Workspace not found' });
        }

        console.log(`\n🗑️  Deleting workspace: ${workspace.name}`);

        // Get all documents in workspace
        const documents = await Document.find({ workspaceId: workspace._id });
        console.log(`   Found ${documents.length} documents`);

        // Delete OpenAI resources if managed RAG is enabled
        if (USE_MANAGED_RAG()) {
            // Delete all files from vector store
            for (const doc of documents) {
                if (doc.openaiFileId && workspace.openaiVectorStoreId) {
                    try {
                        await removeFileFromVectorStore(
                            doc.openaiFileId,
                            workspace.openaiVectorStoreId
                        );
                        await deleteOpenAIFile(doc.openaiFileId);
                    } catch (error) {
                        console.error(`   Error deleting file ${doc.openaiFileId}:`, error.message);
                    }
                }
            }

            // Delete assistant
            if (workspace.openaiAssistantId) {
                try {
                    await deleteAssistant(workspace.openaiAssistantId);
                } catch (error) {
                    console.error('   Error deleting assistant:', error.message);
                }
            }

            // Delete vector store
            if (workspace.openaiVectorStoreId) {
                try {
                    await deleteVectorStore(workspace.openaiVectorStoreId);
                } catch (error) {
                    console.error('   Error deleting vector store:', error.message);
                }
            }
        }

        // Delete all documents from filesystem and MongoDB
        for (const doc of documents) {
            if (fs.existsSync(doc.filePath)) {
                fs.unlinkSync(doc.filePath);
            }
        }

        await Document.deleteMany({ workspaceId: workspace._id });

        // Delete all conversations and messages
        const conversations = await Conversation.find({ workspaceId: workspace._id });
        const conversationIds = conversations.map(c => c._id);
        await Message.deleteMany({ conversationId: { $in: conversationIds } });
        await Conversation.deleteMany({ workspaceId: workspace._id });

        // Delete workspace
        await Workspace.deleteOne({ _id: workspace._id });

        console.log(`✅ Workspace deleted successfully`);

        res.json({ success: true, message: 'Workspace deleted successfully' });
    } catch (error) {
        console.error('Delete workspace error:', error);
        res.status(500).json({ error: 'Error deleting workspace' });
    }
}

/**
 * Migrate existing documents to a workspace
 * Useful for transitioning from old system to workspace-based system
 */
export async function migrateDocumentsToWorkspace(req, res) {
    try {
        const { workspaceId, documentIds } = req.body;

        if (!workspaceId || !documentIds || !Array.isArray(documentIds)) {
            return res.status(400).json({
                error: 'workspaceId and documentIds array are required'
            });
        }

        const workspace = await Workspace.findOne({
            _id: workspaceId,
            userId: req.user._id
        });

        if (!workspace) {
            return res.status(404).json({ error: 'Workspace not found' });
        }

        console.log(`\n📦 Migrating ${documentIds.length} documents to workspace: ${workspace.name}`);

        const results = {
            success: [],
            failed: []
        };

        for (const docId of documentIds) {
            try {
                const document = await Document.findOne({
                    _id: docId,
                    userId: req.user._id
                });

                if (!document) {
                    results.failed.push({ documentId: docId, error: 'Document not found' });
                    continue;
                }

                // Update document with workspace ID
                document.workspaceId = workspace._id;
                await document.save();

                results.success.push(docId);
                console.log(`   ✅ Migrated: ${document.originalName}`);
            } catch (error) {
                console.error(`   ❌ Failed to migrate ${docId}:`, error.message);
                results.failed.push({ documentId: docId, error: error.message });
            }
        }

        console.log(`✅ Migration complete: ${results.success.length} succeeded, ${results.failed.length} failed`);

        res.json({
            success: true,
            results,
            message: `Migrated ${results.success.length} documents`
        });
    } catch (error) {
        console.error('Migrate documents error:', error);
        res.status(500).json({ error: 'Error migrating documents' });
    }
}
