import express from 'express';
import { protect } from '../middleware/auth.js';
import { generateResponse, getConversationMessages, resetChat } from '../controllers/chatController.js';

const router = express.Router();

// Generate AI response
router.post('/generate-response', protect, generateResponse);

// Get messages for a conversation
router.get('/conversations/:id/messages', protect, getConversationMessages);

// Reset chat - Delete all conversations and messages for a document
router.delete('/documents/:documentId/reset', protect, resetChat);

export default router;
