import express from 'express';
import multer from 'multer';
import path from 'path';
import { protect } from '../middleware/auth.js';
import {
    uploadDocumentManaged,
    chatWithManagedRAG,
    summarizeDocument,
    deleteDocumentManaged,
    getDocumentStatus
} from '../controllers/managedRagController.js';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'pdfs/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit
    }
});

// All routes require authentication
router.use(protect);

// Document management
router.post('/upload', upload.single('file'), uploadDocumentManaged);
router.delete('/documents/:id', deleteDocumentManaged);
router.get('/documents/:id/status', getDocumentStatus);

// Chat and summarization
router.post('/chat', chatWithManagedRAG);
router.post('/summarize', summarizeDocument);

export default router;
