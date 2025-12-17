import dotenv from 'dotenv';
import OpenAI from 'openai';
import mongoose from 'mongoose';
import Embedding from './backend/models/Embedding.js';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function testSpellingVariants() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // Get document ID (you'll need to replace with actual ID)
    const firstDoc = await mongoose.connection.db.collection('documents').findOne({});
    const documentId = firstDoc._id.toString();

    console.log(`📄 Testing document: ${documentId}\n`);

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

      // Search in MongoDB
      const results = await Embedding.aggregate([
        {
          $match: {
            documentId: documentId,
            chunkType: 'TEXT'
          }
        },
        {
          $addFields: {
            similarity: {
              $let: {
                vars: {
                  dotProduct: {
                    $reduce: {
                      input: { $range: [0, { $size: '$embedding' }] },
                      initialValue: 0,
                      in: {
                        $add: [
                          '$$value',
                          {
                            $multiply: [
                              { $arrayElemAt: ['$embedding', '$$this'] },
                              { $arrayElemAt: [queryEmbedding, '$$this'] }
                            ]
                          }
                        ]
                      }
                    }
                  }
                },
                in: '$$dotProduct'
              }
            }
          }
        },
        { $sort: { similarity: -1 } },
        { $limit: 5 }
      ]);

      console.log(`📊 Top 5 Results:\n`);
      results.forEach((result, idx) => {
        const passThreshold = result.similarity >= 0.35 ? '✅ PASS' : '❌ FAIL';
        console.log(`${idx + 1}. ${passThreshold} | Similarity: ${result.similarity.toFixed(4)} | Page ${result.pageNumber}`);
        console.log(`   Text: "${result.chunkText.substring(0, 100)}..."`);
        console.log('');
      });

      const topScore = results[0]?.similarity || 0;
      console.log(`🎯 Best Match: ${topScore.toFixed(4)} (threshold: 0.35)`);

      if (topScore < 0.35) {
        console.log(`⚠️  WOULD FAIL: Score below threshold!`);
      } else {
        console.log(`✅ WOULD PASS: Score above threshold`);
      }
    }

    await mongoose.disconnect();
    console.log('\n✅ Test completed');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testSpellingVariants();
