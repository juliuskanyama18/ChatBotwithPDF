import dotenv from 'dotenv';
import OpenAI from 'openai';
import mongoose from 'mongoose';
import Embedding from './backend/models/Embedding.js';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Calculate cosine similarity
function cosineSimilarity(vec1, vec2) {
  let dotProduct = 0;
  let mag1 = 0;
  let mag2 = 0;

  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    mag1 += vec1[i] * vec1[i];
    mag2 += vec2[i] * vec2[i];
  }

  mag1 = Math.sqrt(mag1);
  mag2 = Math.sqrt(mag2);

  return dotProduct / (mag1 * mag2);
}

async function testCorrectModel() {
  try {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    const firstDoc = await mongoose.connection.db.collection('documents').findOne({});
    const documentId = firstDoc._id.toString();

    console.log(`📄 Document: ${firstDoc.originalName || firstDoc.fileName}\n`);

    // Fetch ALL embeddings
    const allEmbeddings = await Embedding.find({
      documentId: documentId
    }).lean();

    console.log(`📚 Found ${allEmbeddings.length} total chunks\n`);

    const queries = [
      "What is the official length of the Information Systems Engineering program?",
      "What is the official length of the Information Systems Engineering programme?"
    ];

    for (const query of queries) {
      console.log(`\n${'='.repeat(100)}`);
      console.log(`🔍 Query: "${query}"`);
      console.log(`${'='.repeat(100)}\n`);

      // Use the SAME model as the backend (text-embedding-3-small, NOT ada-002)
      const embeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-3-small',  // ✅ CORRECT MODEL
        input: query,
      });

      const queryEmbedding = embeddingResponse.data[0].embedding;

      // Calculate similarities
      const results = allEmbeddings.map(chunk => ({
        ...chunk,
        similarity: cosineSimilarity(queryEmbedding, chunk.embedding)
      }));

      results.sort((a, b) => b.similarity - a.similarity);

      // Show top 10
      console.log(`📊 Top 10 Results (ALL chunk types):\n`);
      results.slice(0, 10).forEach((result, idx) => {
        const passThreshold = result.similarity >= 0.35 ? '✅ PASS 0.35' : '❌ FAIL 0.35';
        const chunkType = (result.chunkType || 'text').toUpperCase().padEnd(6);

        console.log(`${(idx + 1).toString().padStart(2)}. [${chunkType}] ${passThreshold} | ${result.similarity.toFixed(4)} | Page ${result.pageNumber}`);
        console.log(`    "${result.chunkText.substring(0, 100)}..."`);
        console.log('');
      });

      const topScore = results[0]?.similarity || 0;
      const topChunk = results[0];

      console.log(`🎯 Best Match:`);
      console.log(`   Similarity: ${topScore.toFixed(4)}`);
      console.log(`   Chunk Type: ${(topChunk?.chunkType || 'text').toUpperCase()}`);
      console.log(`   Page: ${topChunk?.pageNumber}`);
      console.log(`   Status: ${topScore >= 0.35 ? '✅ WOULD PASS' : '❌ WOULD FAIL'} (threshold 0.35)`);

      if (topScore < 0.35) {
        console.log(`   Difference: ${(0.35 - topScore).toFixed(4)} below threshold`);
      }

      // Check for Page 5 chunk specifically
      const page5Chunk = results.find(r => r.pageNumber === 5 && r.chunkType === 'text');
      if (page5Chunk) {
        console.log(`\n   📄 Page 5 TEXT chunk (contains "4 years"):`);
        console.log(`      Similarity: ${page5Chunk.similarity.toFixed(4)}`);
        console.log(`      Rank: #${results.indexOf(page5Chunk) + 1}`);
        console.log(`      Status: ${page5Chunk.similarity >= 0.35 ? '✅ PASS' : '❌ FAIL'}`);
      }
    }

    await mongoose.disconnect();
    console.log('\n\n✅ Test completed');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testCorrectModel();
