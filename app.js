// Load environment variables FIRST
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import connectDB from './backend/config/database.js';
import authRoutes from './backend/routes/auth.js';
import documentRoutes from './backend/routes/documents.js';
import chatRoutes from './backend/routes/chat.js';
import workspaceRoutes from './backend/routes/workspaces.js';
import managedRagRoutes from './backend/routes/managedRag.js';
import { isPythonServiceHealthy } from './backend/utils/pythonServiceClient.js';
import { logFeatureFlags } from './backend/utils/featureFlags.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Connect to MongoDB
connectDB();

const app = express();
const port = 3600;

// Create pdfs directory if it doesn't exist
const pdfDirectory = path.join(__dirname, 'pdfs');
if (!fs.existsSync(pdfDirectory)) {
    fs.mkdirSync(pdfDirectory);
}

// CORS configuration for React frontend
app.use(cors({
    origin: 'http://localhost:5173',
    credentials: true
}));

// Cache control headers
app.use(function (req, res, next) {
    res.set('Cache-Control', 'no-cache, private, no-store, must-revalidate, max-stale=0, post-check=0, pre-check=0');
    res.set('Expires', '0');
    res.set('Pragma', 'no-cache');
    res.set('BFCache-Control', 'no-store, no-cache');
    next();
});

// Static file serving
app.use(express.static(path.join(__dirname, 'public')));
app.use('/pdfs', express.static(pdfDirectory));

// Body parsing middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser());

// Session configuration
app.use(session({
    secret: 'your_secure_session_secret',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

// Serve translation files
app.get('/translations/:lang', (req, res) => {
    const lang = req.params.lang;
    const filePath = path.join(__dirname, 'translations', `${lang}.json`);

    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).send('Translation file not found');
    }
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api', chatRoutes);

// Managed RAG routes (OpenAI Vector Stores + Assistants API)
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/managed-rag', managedRagRoutes);

// Legacy routes for backward compatibility
import { protect } from './backend/middleware/auth.js';
app.post('/uploadPdf', protect, (req, res, next) => {
    req.url = '/upload';
    documentRoutes(req, res, next);
});
app.post('/generate-response', (req, res, next) => {
    chatRoutes(req, res, next);
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// Check Python service health on startup
async function checkPythonServiceOnStartup() {
    console.log('\n🔍 Checking Python microservice availability...');
    const isHealthy = await isPythonServiceHealthy();

    if (isHealthy) {
        console.log('✅ Python Document Processing Service is HEALTHY');
        console.log('   📍 Service URL: http://localhost:8000');
        console.log('   📚 API Docs: http://localhost:8000/docs');
        console.log('   ⚡ Document processing will use Python service for better quality');
    } else {
        console.log('⚠️  Python Document Processing Service is UNAVAILABLE');
        console.log('   ℹ️  Node.js fallback processors will be used');
        console.log('   💡 To enable Python service:');
        console.log('      1. Open new terminal');
        console.log('      2. cd python_service');
        console.log('      3. Run: start_python_service.bat (Windows) or ./start_python_service.sh (Linux/Mac)');
    }
    console.log('');
}

// Start server
app.listen(port, async () => {
    console.log('========================================');
    console.log(`🚀 ChatBotwithPDF Server Started`);
    console.log(`📍 Server running on port ${port}`);
    console.log(`🌐 URL: http://localhost:${port}`);
    console.log(`📁 Backend: MVC Structure ✅`);
    console.log('========================================');

    // Log feature flags
    logFeatureFlags();

    // Check Python service health
    await checkPythonServiceOnStartup();

    console.log('✅ Server ready to accept requests');
    console.log('========================================\n');
});
