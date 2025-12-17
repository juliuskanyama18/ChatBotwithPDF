/**
 * Test page 5 specific query
 */
import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import Document from './backend/models/Document.js';
import Embedding from './backend/models/Embedding.js';
import { detectPageReferences, expandPageRangeWithContext } from './backend/utils/pageDetector.js';
import { retrieveRelevantChunks } from './backend/utils/embeddings.js';

async function testPage5Query() {
    try {
        const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB\n');

        const doc = await Document.findOne().sort({ createdAt: -1 });
        console.log(`📄 Document: ${doc.originalName}\n`);

        // Test query
        const query = "explain page 5";
        console.log(`❓ Query: "${query}"\n`);

        // Check page detection
        const pageDetection = detectPageReferences(query);
        console.log('🔍 Page Detection Result:');
        console.log(`   hasPageReference: ${pageDetection.hasPageReference}`);
        console.log(`   pageNumbers: ${pageDetection.pageNumbers.join(', ')}`);
        console.log(`   type: ${pageDetection.type}`);
        console.log(`   originalMatch: "${pageDetection.originalMatch}"\n`);

        // Check expanded range
        const expandedPages = expandPageRangeWithContext(pageDetection.pageNumbers, 1);
        console.log(`📍 Expanded page range (with context): ${expandedPages.join(', ')}\n`);

        // Get all chunks for page 5
        const page5Chunks = await Embedding.find({
            documentId: doc._id,
            pageNumber: 5
        }).select('chunkIndex pageNumber chunkType chunkText').lean();

        console.log(`📊 Total chunks on Page 5: ${page5Chunks.length}\n`);

        // Test retrieval with page filter
        console.log('🔍 Testing retrieveRelevantChunks with page filter...\n');

        const pageFilter = {
            pageNumbers: expandedPages
        };

        const retrievedChunks = await retrieveRelevantChunks({
            question: query,
            documentId: doc._id.toString(),
            k: 15,
            pageFilter: pageFilter
        });

        console.log(`\n✅ Retrieved ${retrievedChunks.length} chunks:\n`);

        retrievedChunks.forEach((chunk, idx) => {
            console.log(`${idx + 1}. Page ${chunk.pageNumber} | ${chunk.chunkType.toUpperCase()} | Similarity: ${chunk.similarity.toFixed(4)}`);
            console.log(`   Preview: "${chunk.chunkText.substring(0, 100).replace(/\n/g, ' ')}..."\n`);
        });

        // Check if ALL page 5 chunks are in results
        const page5InResults = retrievedChunks.filter(c => c.pageNumber === 5).length;
        console.log(`\n📊 Analysis:`);
        console.log(`   Total Page 5 chunks in DB: ${page5Chunks.length}`);
        console.log(`   Page 5 chunks in results: ${page5InResults}`);
        console.log(`   Missing chunks: ${page5Chunks.length - page5InResults}`);

        if (page5InResults < page5Chunks.length) {
            console.log(`\n⚠️  PROBLEM: Not all Page 5 chunks are being retrieved!`);
            console.log(`   User asked for "page 5" but only getting ${page5InResults}/${page5Chunks.length} chunks.`);
            console.log(`   This will result in incomplete answers.\n`);
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

testPage5Query();
