import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Embedding from './backend/models/Embedding.js';

dotenv.config();

async function checkPage45() {
  try {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    const firstDoc = await mongoose.connection.db.collection('documents').findOne({});
    const documentId = firstDoc._id.toString();

    console.log(`📄 Document: ${firstDoc.originalName || firstDoc.fileName}\n`);

    // Fetch ALL chunks from Page 4 and 5
    const chunks = await Embedding.find({
      documentId: documentId,
      pageNumber: { $in: [4, 5] }
    }).lean();

    console.log(`📚 Found ${chunks.length} chunks on Pages 4-5\n`);
    console.log(`${'='.repeat(100)}\n`);

    // Group by page
    const page4 = chunks.filter(c => c.pageNumber === 4);
    const page5 = chunks.filter(c => c.pageNumber === 5);

    console.log(`📄 PAGE 4 (${page4.length} chunks):\n`);
    page4.forEach((chunk, idx) => {
      console.log(`${idx + 1}. [${chunk.chunkType.toUpperCase()}] Chunk ${chunk.chunkIndex}`);
      console.log(`   Text (first 300 chars):`);
      console.log(`   "${chunk.chunkText.substring(0, 300)}..."\n`);
    });

    console.log(`\n${'='.repeat(100)}\n`);

    console.log(`📄 PAGE 5 (${page5.length} chunks):\n`);
    page5.forEach((chunk, idx) => {
      console.log(`${idx + 1}. [${chunk.chunkType.toUpperCase()}] Chunk ${chunk.chunkIndex}`);
      console.log(`   Text (first 300 chars):`);
      console.log(`   "${chunk.chunkText.substring(0, 300)}..."\n`);
    });

    // Search for "4 years" or "programme"
    console.log(`\n${'='.repeat(100)}\n`);
    console.log(`🔍 Searching for "4 years" or "official length"...\n`);

    const relevantChunks = chunks.filter(c =>
      c.chunkText.toLowerCase().includes('4 years') ||
      c.chunkText.toLowerCase().includes('four years') ||
      c.chunkText.toLowerCase().includes('official length') ||
      c.chunkText.toLowerCase().includes('programme is')
    );

    if (relevantChunks.length > 0) {
      console.log(`✅ Found ${relevantChunks.length} chunks with relevant keywords:\n`);
      relevantChunks.forEach((chunk, idx) => {
        console.log(`${idx + 1}. [${chunk.chunkType.toUpperCase()}] Page ${chunk.pageNumber}, Chunk ${chunk.chunkIndex}`);
        console.log(`   "${chunk.chunkText}"\n`);
      });
    } else {
      console.log(`❌ No chunks found with "4 years", "four years", or "official length"`);
    }

    await mongoose.disconnect();
    console.log('\n✅ Check completed');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkPage45();
