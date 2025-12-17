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

async function testSpellingVariants() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // Get document ID
    const firstDoc = await mongoose.connection.db.collection('documents').findOne({});
    const documentId = firstDoc._id.toString();

    console.log(`📄 Testing document: ${documentId}`);
    console.log(`   Document name: ${firstDoc.originalName || firstDoc.fileName}\n`);

    // Fetch all TEXT embeddings from this document (case-insensitive)
    const allEmbeddings = await Embedding.find({
      documentId: documentId,
      chunkType: { $regex: /^text$/i }
    }).lean();

    console.log(`📚 Found ${allEmbeddings.length} text chunks in database\n`);

    // Test both spelling variants
    const queries = [
      "What is the official length of the Information Systems Engineering program?",
      "What is the official length of the Information Systems Engineering programme?"
    ];

    for (const query of queries) {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`🔍 Query: "${query}"`);
      console.log(`${'='.repeat(80)}\n`);

      // Generate embedding for query
      const embeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: query,
      });

      const queryEmbedding = embeddingResponse.data[0].embedding;

      // Calculate similarities
      const results = allEmbeddings.map(chunk => ({
        ...chunk,
        similarity: cosineSimilarity(queryEmbedding, chunk.embedding)
      }));

      // Sort by similarity
      results.sort((a, b) => b.similarity - a.similarity);

      // Show top 5
      console.log(`📊 Top 5 Results:\n`);
      results.slice(0, 5).forEach((result, idx) => {
        const passThreshold = result.similarity >= 0.35 ? '✅ PASS' : '❌ FAIL';
        console.log(`${idx + 1}. ${passThreshold} | Similarity: ${result.similarity.toFixed(4)} | Page ${result.pageNumber}`);
        console.log(`   Text: "${result.chunkText.substring(0, 120)}..."`);
        console.log('');
      });

      const topScore = results[0]?.similarity || 0;
      console.log(`🎯 Best Match: ${topScore.toFixed(4)} (threshold: 0.35)`);

      if (topScore < 0.35) {
        console.log(`❌ WOULD FAIL: Score ${topScore.toFixed(4)} is below threshold 0.35`);
        console.log(`   Difference: ${(0.35 - topScore).toFixed(4)} below threshold`);
      } else {
        console.log(`✅ WOULD PASS: Score above threshold`);
      }
    }

    await mongoose.disconnect();
    console.log('\n\n✅ Test completed');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testSpellingVariants();
