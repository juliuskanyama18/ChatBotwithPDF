/**
 * Check what's in Page 5 chunk
 */
import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import Document from './backend/models/Document.js';
import Embedding from './backend/models/Embedding.js';

async function checkPage5() {
    try {
        const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB\n');

        const doc = await Document.findOne().sort({ createdAt: -1 });
        console.log(`📄 Document: ${doc.originalName}\n`);

        // Get all chunks for page 5
        const page5Chunks = await Embedding.find({
            documentId: doc._id,
            pageNumber: 5
        }).select('chunkIndex pageNumber chunkType chunkText').lean();

        console.log(`📍 Found ${page5Chunks.length} chunks for Page 5:\n`);

        page5Chunks.forEach(chunk => {
            console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            console.log(`Chunk ${chunk.chunkIndex} | Type: ${chunk.chunkType || 'text'}`);
            console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            console.log(chunk.chunkText);
            console.log('\n');
        });

        // Also check page 4 since access requirements might span pages
        const page4Chunks = await Embedding.find({
            documentId: doc._id,
            pageNumber: 4
        }).select('chunkIndex pageNumber chunkType chunkText').lean();

        console.log(`\n📍 Found ${page4Chunks.length} chunks for Page 4:\n`);

        page4Chunks.forEach(chunk => {
            if (chunk.chunkText.toLowerCase().includes('access') ||
                chunk.chunkText.toLowerCase().includes('admission')) {
                console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
                console.log(`Chunk ${chunk.chunkIndex} | Type: ${chunk.chunkType || 'text'}`);
                console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
                console.log(chunk.chunkText);
                console.log('\n');
            }
        });

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

checkPage5();
