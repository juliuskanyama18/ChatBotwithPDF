/**
 * Verify the threshold fix works
 */
import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import Document from './backend/models/Document.js';
import { retrieveRelevantChunks } from './backend/utils/embeddings.js';

async function verifyFix() {
    try {
        // Connect to MongoDB
        const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB\n');

        // Get the most recent document
        const doc = await Document.findOne().sort({ createdAt: -1 });

        if (!doc) {
            console.log('❌ No documents found');
            return;
        }

        console.log(`📄 Testing on: ${doc.originalName}\n`);

        // Test query that was failing
        const testQuery = "What are the access requirements for joining this program?";
        console.log(`❓ Query: "${testQuery}"\n`);

        console.log('🔍 Retrieving relevant chunks with NEW thresholds...\n');

        // Use the retrieveRelevantChunks function (which now has lower thresholds)
        const relevantChunks = await retrieveRelevantChunks({
            question: testQuery,
            documentId: doc._id.toString(),
            k: 8,
            pageFilter: null
        });

        if (relevantChunks.length === 0) {
            console.log('❌ STILL FAILING: No chunks passed the new thresholds');
            console.log('   This query will still trigger NOT FOUND template\n');
        } else {
            console.log(`✅ SUCCESS: ${relevantChunks.length} chunks passed the new thresholds!\n`);
            console.log('📄 Retrieved chunks:\n');

            relevantChunks.forEach((chunk, idx) => {
                console.log(`${idx + 1}. Page ${chunk.pageNumber} | ${chunk.chunkType.toUpperCase()} | Similarity: ${chunk.similarity.toFixed(4)}`);
                console.log(`   Preview: "${chunk.chunkText.substring(0, 120).replace(/\n/g, ' ')}..."`);
                console.log('');
            });

            // Check if access requirements chunk is included
            const hasAccessInfo = relevantChunks.some(chunk =>
                chunk.chunkText.toLowerCase().includes('access') &&
                chunk.chunkText.toLowerCase().includes('requirement')
            );

            if (hasAccessInfo) {
                console.log('✅ Access requirements information IS included in results!');
                console.log('   Bot should now be able to answer this question correctly.\n');
            } else {
                console.log('⚠️  Access requirements not in top chunks, but other relevant content found.');
                console.log('   Bot may give a partial answer.\n');
            }
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

verifyFix();
