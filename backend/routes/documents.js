import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { protect } from '../middleware/auth.js';
import {
    uploadDocument,
    getAllDocuments,
    getDocumentById,
    updateDocument,
    deleteDocument,
    getDocumentConversations,
    getLatestConversation,
    getFolderLatestConversation
} from '../controllers/documentController.js';
import { generateDocumentEmbeddings } from '../services/embeddingService.js';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pdfDirectory = path.join(process.cwd(), 'pdfs');

// Multer configuration for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, pdfDirectory);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        const baseName = path.basename(file.originalname, ext);
        cb(null, baseName + '-' + uniqueSuffix + ext);
    }
});

const upload = multer({ storage: storage });

// Upload document
router.post('/upload', protect, upload.single('pdfFile'), (req, res) => {
    return uploadDocument(req, res, generateDocumentEmbeddings);
});

// Get all documents for user
router.get('/', protect, getAllDocuments);

// Get single document by ID
router.get('/:id', protect, getDocumentById);

// Update document
router.put('/:id', protect, updateDocument);

// Delete document
router.delete('/:id', protect, deleteDocument);

// Get conversations for a document
router.get('/:id/conversations', protect, getDocumentConversations);

// Get latest conversation for a document
router.get('/:documentId/latest-conversation', protect, getLatestConversation);

// Get latest conversation for a folder
router.get('/folders/:folderId/latest-conversation', protect, getFolderLatestConversation);

export default router;
