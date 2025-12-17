/**
 * Debug script to check embedding page numbers in database
 */
import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import Document from './backend/models/Document.js';
import Embedding from './backend/models/Embedding.js';

async function debugEmbeddings() {
    try {
        // Connect to MongoDB
        const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/chatpdf';
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB\n');

        // Get the most recent document
        const documents = await Document.find().sort({ createdAt: -1 }).limit(5);

        if (documents.length === 0) {
            console.log('❌ No documents found in database');
            return;
        }

        console.log('📄 Recent documents:');
        documents.forEach((doc, idx) => {
            console.log(`${idx + 1}. ${doc.originalName} (ID: ${doc._id})`);
        });

        // Use the first document
        const doc = documents[0];
        console.log(`\n🔍 Analyzing: ${doc.originalName}`);
        console.log(`   Total pages: ${doc.pageCount || 'unknown'}\n`);

        // Get all embeddings for this document
        const embeddings = await Embedding.find({ documentId: doc._id })
            .sort({ chunkIndex: 1 })
            .select('chunkIndex pageNumber chunkType chunkText');

        console.log(`📊 Total chunks: ${embeddings.length}\n`);

        // Analyze page distribution and chunk types
        const pageDistribution = {};
        const pagesWithChunks = new Set();
        const chunkTypeCount = { text: 0, image: 0, table: 0, unknown: 0 };

        embeddings.forEach(emb => {
            const page = emb.pageNumber || 'unknown';
            if (!pageDistribution[page]) {
                pageDistribution[page] = 0;
            }
            pageDistribution[page]++;

            if (emb.pageNumber) {
                pagesWithChunks.add(emb.pageNumber);
            }

            // Count chunk types
            const type = emb.chunkType || 'unknown';
            chunkTypeCount[type] = (chunkTypeCount[type] || 0) + 1;
        });

        console.log(`📊 Chunk type distribution:`);
        console.log(`   Text: ${chunkTypeCount.text}`);
        console.log(`   Table: ${chunkTypeCount.table}`);
        console.log(`   Image: ${chunkTypeCount.image}`);
        console.log(`   Unknown: ${chunkTypeCount.unknown}\n`);

        console.log('📈 Page distribution:');
        Object.keys(pageDistribution)
            .sort((a, b) => {
                if (a === 'unknown') return 1;
                if (b === 'unknown') return -1;
                return parseInt(a) - parseInt(b);
            })
            .forEach(page => {
                console.log(`   Page ${page}: ${pageDistribution[page]} chunks`);
            });

        // Check for missing pages
        const allPages = Array.from(pagesWithChunks).sort((a, b) => a - b);
        const missingPages = [];

        if (doc.pageCount) {
            for (let i = 1; i <= doc.pageCount; i++) {
                if (!pagesWithChunks.has(i)) {
                    missingPages.push(i);
                }
            }
        }

        if (missingPages.length > 0) {
            console.log(`\n⚠️  Missing pages (no chunks): ${missingPages.join(', ')}`);
        }

        // Show sample chunks for page 10 specifically
        console.log('\n🔍 Chunks for Page 10:');
        const page10Chunks = embeddings.filter(emb => emb.pageNumber === 10);

        if (page10Chunks.length === 0) {
            console.log('   ❌ NO CHUNKS FOUND FOR PAGE 10!');

            // Check if there are any chunks that might contain page 10 text
            console.log('\n   Searching for "Page 10" marker in chunk text...');
            const chunksWithPage10Marker = embeddings.filter(emb =>
                emb.chunkText.includes('--- Page 10 ---')
            );

            if (chunksWithPage10Marker.length > 0) {
                console.log(`   ⚠️  Found ${chunksWithPage10Marker.length} chunks containing "--- Page 10 ---" marker:`);
                chunksWithPage10Marker.forEach(emb => {
                    console.log(`      Chunk ${emb.chunkIndex}: assigned to page ${emb.pageNumber} (WRONG!)`);
                    console.log(`      First 200 chars: ${emb.chunkText.substring(0, 200)}...\n`);
                });
            } else {
                console.log('   ℹ️  No chunks contain "--- Page 10 ---" marker');
            }
        } else {
            console.log(`   ✅ Found ${page10Chunks.length} chunks for page 10:`);
            page10Chunks.forEach(emb => {
                console.log(`      Chunk ${emb.chunkIndex} (${emb.chunkType}): ${emb.chunkText.substring(0, 150)}...`);
            });
        }

        // Sample a few chunks to see their content
        console.log('\n📝 Sample chunks (first 5):');
        embeddings.slice(0, 5).forEach(emb => {
            const preview = emb.chunkText.substring(0, 100).replace(/\n/g, ' ');
            console.log(`   Chunk ${emb.chunkIndex} → Page ${emb.pageNumber}: "${preview}..."`);
        });

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

debugEmbeddings();
