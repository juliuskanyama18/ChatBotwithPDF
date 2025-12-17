/**
 * Migration: Add MongoDB text index for keyword search
 * Run this once to enable hybrid retrieval (BM25 + Vector)
 *
 * Usage: node backend/migrations/add-text-index.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Embedding from '../models/Embedding.js';

dotenv.config();

async function addTextIndex() {
    try {
        console.log('🔧 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected');

        console.log('\n📊 Creating text index on chunkText field...');

        // Create text index for keyword search
        await Embedding.collection.createIndex(
            { chunkText: 'text' },
            {
                name: 'chunk_text_search',
                weights: { chunkText: 1 },
                default_language: 'english'
            }
        );

        console.log('✅ Text index created successfully');
        console.log('\n🎯 Hybrid retrieval (Vector + BM25) is now enabled!\n');

        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

addTextIndex();