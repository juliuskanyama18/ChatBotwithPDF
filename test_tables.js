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

async function testTables() {
  try {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    const firstDoc = await mongoose.connection.db.collection('documents').findOne({});
    const documentId = firstDoc._id.toString();

    console.log(`📄 Document: ${firstDoc.originalName || firstDoc.fileName}\n`);

    // Fetch TABLE chunks
    const tableEmbeddings = await Embedding.find({
      documentId: documentId,
      chunkType: { $regex: /^table$/i }
    }).lean();

    console.log(`📊 Found ${tableEmbeddings.length} table chunks\n`);

    const query = "What is the official length of the Information Systems Engineering programme?";

    console.log(`🔍 Query: "${query}"\n`);
    console.log(`${'='.repeat(80)}\n`);

    // Generate embedding
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: query,
    });

    const queryEmbedding = embeddingResponse.data[0].embedding;

    // Calculate similarities for tables
    const results = tableEmbeddings.map(chunk => ({
      ...chunk,
      similarity: cosineSimilarity(queryEmbedding, chunk.embedding)
    }));

    results.sort((a, b) => b.similarity - a.similarity);

    console.log(`📊 Top 10 TABLE Results:\n`);
    results.slice(0, 10).forEach((result, idx) => {
      const passThreshold030 = result.similarity >= 0.30 ? '✅' : '❌';
      const passThreshold035 = result.similarity >= 0.35 ? '✅' : '❌';

      console.log(`${idx + 1}. [0.30: ${passThreshold030}] [0.35: ${passThreshold035}] | ${result.similarity.toFixed(4)} | Page ${result.pageNumber}`);
      console.log(`   Text: "${result.chunkText.substring(0, 150)}..."`);
      console.log('');
    });

    const topScore = results[0]?.similarity || 0;
    console.log(`🎯 Best TABLE Match: ${topScore.toFixed(4)}`);
    console.log(`   Threshold 0.30: ${topScore >= 0.30 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Threshold 0.35: ${topScore >= 0.35 ? '✅ PASS' : '❌ FAIL'}`);

    await mongoose.disconnect();
    console.log('\n✅ Test completed');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testTables();
