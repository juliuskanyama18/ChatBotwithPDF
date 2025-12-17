/**
 * Test specific query to debug retrieval issues
 */
import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import Document from './backend/models/Document.js';
import Embedding from './backend/models/Embedding.js';
import { generateEmbedding, cosineSimilarity } from './backend/utils/embeddings.js';

async function testQuery() {
    try {
        // Connect to MongoDB
        const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/chatpdf';
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB\n');

        // Get the most recent document
        const doc = await Document.findOne().sort({ createdAt: -1 });

        if (!doc) {
            console.log('❌ No documents found');
            return;
        }

        console.log(`📄 Testing on: ${doc.originalName}\n`);

        // Test query
        const testQuery = "What are the access requirements for joining this program?";
        console.log(`❓ Query: "${testQuery}"\n`);

        // Generate query embedding
        console.log('🔍 Generating query embedding...');
        const queryEmbedding = await generateEmbedding(testQuery);
        console.log('✅ Query embedding generated\n');

        // Get all embeddings
        const embeddings = await Embedding.find({ documentId: doc._id })
            .select('chunkText pageNumber chunkIndex chunkType embedding')
            .lean();

        console.log(`📊 Searching through ${embeddings.length} chunks...\n`);

        // Calculate similarities
        const results = embeddings.map(emb => ({
            chunkIndex: emb.chunkIndex,
            pageNumber: emb.pageNumber,
            chunkType: emb.chunkType || 'text',
            similarity: cosineSimilarity(queryEmbedding, emb.embedding),
            preview: emb.chunkText.substring(0, 150).replace(/\n/g, ' ')
        }));

        // Sort by similarity
        results.sort((a, b) => b.similarity - a.similarity);

        // Show top 10 results
        console.log('🎯 Top 10 most similar chunks:\n');
        results.slice(0, 10).forEach((r, idx) => {
            console.log(`${idx + 1}. Page ${r.pageNumber} | Chunk ${r.chunkIndex} | ${r.chunkType.toUpperCase()}`);
            console.log(`   Similarity: ${r.similarity.toFixed(4)}`);
            console.log(`   Preview: "${r.preview}..."`);
            console.log('');
        });

        // Check thresholds
        console.log('\n📏 Threshold Analysis:');
        console.log(`   Current TEXT threshold: 0.70`);
        console.log(`   Current TABLE threshold: 0.60`);
        console.log(`   Current IMAGE threshold: 0.65`);
        console.log(`   Page-specific TEXT threshold: 0.30`);
        console.log(`   Page-specific TABLE threshold: 0.20`);
        console.log(`   Page-specific IMAGE threshold: 0.25\n`);

        const textChunks = results.filter(r => r.chunkType === 'text');
        const passNormal = textChunks.filter(r => r.similarity >= 0.70).length;
        const passPageSpecific = textChunks.filter(r => r.similarity >= 0.30).length;

        console.log(`   Text chunks passing normal threshold (0.70): ${passNormal}`);
        console.log(`   Text chunks passing page-specific threshold (0.30): ${passPageSpecific}\n`);

        // Search for "access" or "requirement" keywords
        console.log('🔎 Searching for chunks containing "access" or "requirement":\n');
        const relevantChunks = embeddings.filter(emb => {
            const text = emb.chunkText.toLowerCase();
            return text.includes('access') || text.includes('requirement') || text.includes('admission');
        });

        console.log(`Found ${relevantChunks.length} chunks with relevant keywords:\n`);
        relevantChunks.forEach(chunk => {
            const similarity = results.find(r => r.chunkIndex === chunk.chunkIndex)?.similarity || 0;
            console.log(`📍 Page ${chunk.pageNumber} | Chunk ${chunk.chunkIndex} | Similarity: ${similarity.toFixed(4)}`);
            console.log(`   Type: ${chunk.chunkType || 'text'}`);
            console.log(`   Content: "${chunk.chunkText.substring(0, 200)}..."`);
            console.log('');
        });

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

testQuery();
