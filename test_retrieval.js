/**
 * Test retrieval to diagnose NOT FOUND issue
 * Run: node test_retrieval.js
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { retrieveRelevantChunks } from './backend/utils/embeddings.js';

dotenv.config();

async function testRetrieval() {
    try {
        console.log('🔧 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected\n');

        // Get your document ID (replace with your actual document ID)
        console.log('📄 Enter your document ID:');
        const documentId = '678ef1f41e9ea6b5dfb57b0c'; // REPLACE THIS with your actual doc ID

        // Test queries
        const testQueries = [
            'What are the access requirements for joining this program?',
            'Summarize the key learning outcomes of the ISE program',
            'Explain what students learn in the course ECC102'
        ];

        for (const question of testQueries) {
            console.log('═══════════════════════════════════════');
            console.log(`\n❓ Question: "${question}"\n`);

            const chunks = await retrieveRelevantChunks({
                question,
                documentId,
                k: 15,
                pageFilter: null
            });

            console.log(`\n📊 Retrieved ${chunks.length} chunks:\n`);

            if (chunks.length === 0) {
                console.log('❌ NO CHUNKS FOUND - This is why you get NOT FOUND\n');
            } else {
                chunks.slice(0, 3).forEach((chunk, i) => {
                    console.log(`Chunk ${i + 1}:`);
                    console.log(`  Page: ${chunk.pageNumber}`);
                    console.log(`  Type: ${chunk.chunkType || 'text'}`);
                    console.log(`  Similarity: ${chunk.similarity?.toFixed(3) || 'N/A'}`);
                    console.log(`  Text preview: ${chunk.chunkText.substring(0, 150)}...`);
                    console.log('');
                });
            }

            console.log('═══════════════════════════════════════\n');
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    }
}

testRetrieval();