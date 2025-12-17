/**
 * Migration: Add MongoDB index on pageNumber field
 * Required for Atlas Vector Search page filtering
 *
 * Usage: node backend/migrations/add-pagenumber-index.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Embedding from '../models/Embedding.js';

dotenv.config();

async function addPageNumberIndex() {
    try {
        console.log('🔧 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected');

        console.log('\n📊 Creating index on pageNumber field...');

        // Create index on pageNumber (required for Vector Search filtering)
        await Embedding.collection.createIndex(
            { pageNumber: 1 },
            {
                name: 'pagenumber_index',
                background: true
            }
        );

        console.log('✅ pageNumber index created successfully');
        console.log('\n🎯 Page-specific vector search queries will now work!\n');

        process.exit(0);
    } catch (error) {
        if (error.code === 85 || error.codeName === 'IndexOptionsConflict') {
            console.log('✅ Index already exists - no action needed\n');
            process.exit(0);
        }
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

addPageNumberIndex();