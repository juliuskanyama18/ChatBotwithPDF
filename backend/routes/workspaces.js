import express from 'express';
import { protect } from '../middleware/auth.js';
import {
    createWorkspace,
    getAllWorkspaces,
    getWorkspaceById,
    updateWorkspace,
    deleteWorkspace,
    migrateDocumentsToWorkspace
} from '../controllers/workspaceController.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Workspace CRUD
router.post('/', createWorkspace);
router.get('/', getAllWorkspaces);
router.get('/:id', getWorkspaceById);
router.put('/:id', updateWorkspace);
router.delete('/:id', deleteWorkspace);

// Migration
router.post('/migrate-documents', migrateDocumentsToWorkspace);

export default router;
