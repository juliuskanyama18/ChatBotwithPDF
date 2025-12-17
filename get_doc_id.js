/**
 * Get document ID for testing
 * Run: node get_doc_id.js
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Document from './backend/models/Document.js';

dotenv.config();

async function getDocId() {
    try {
        await mongoose.connect(process.env.MONGO_URI);

        const docs = await Document.find()
            .select('_id originalName createdAt')
            .sort({ createdAt: -1 })
            .limit(5)
            .lean();

        console.log('\n📄 Recent documents:\n');
        docs.forEach((doc, i) => {
            console.log(`${i + 1}. ${doc.originalName}`);
            console.log(`   ID: ${doc._id}`);
            console.log(`   Uploaded: ${doc.createdAt}\n`);
        });

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

getDocId();