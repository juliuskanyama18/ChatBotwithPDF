import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

async function checkDatabase() {
  try {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // Check documents collection
    const documents = await mongoose.connection.db.collection('documents').find({}).toArray();
    console.log(`📄 Documents in database: ${documents.length}\n`);

    if (documents.length > 0) {
      const doc = documents[0];
      console.log(`First document:`);
      console.log(`  ID: ${doc._id}`);
      console.log(`  Name: ${doc.originalName || doc.fileName}`);
      console.log(`  Type: ${doc.fileType}`);
      console.log(`  Page Count: ${doc.pageCount}`);
      console.log(`  Uploaded: ${doc.uploadedAt}\n`);
    }

    // Check embeddings collection
    const embeddingsCount = await mongoose.connection.db.collection('embeddings').countDocuments();
    console.log(`🔢 Total embeddings: ${embeddingsCount}\n`);

    if (embeddingsCount > 0) {
      // Sample a few embeddings
      const sampleEmbeddings = await mongoose.connection.db.collection('embeddings')
        .find({})
        .limit(5)
        .toArray();

      console.log(`Sample embeddings:`);
      sampleEmbeddings.forEach((emb, idx) => {
        console.log(`\n${idx + 1}.`);
        console.log(`   Document ID: ${emb.documentId}`);
        console.log(`   Chunk Type: ${emb.chunkType}`);
        console.log(`   Page Number: ${emb.pageNumber}`);
        console.log(`   Chunk Index: ${emb.chunkIndex}`);
        console.log(`   Text Preview: "${(emb.chunkText || '').substring(0, 80)}..."`);
        console.log(`   Has Embedding: ${emb.embedding ? 'Yes' : 'No'} (length: ${emb.embedding?.length || 0})`);
      });

      // Group by document ID
      const groupedByDoc = await mongoose.connection.db.collection('embeddings')
        .aggregate([
          {
            $group: {
              _id: '$documentId',
              count: { $sum: 1 },
              types: { $addToSet: '$chunkType' }
            }
          }
        ]).toArray();

      console.log(`\n\n📊 Embeddings grouped by document:`);
      groupedByDoc.forEach(group => {
        console.log(`\n   Document ID: ${group._id}`);
        console.log(`   Total chunks: ${group.count}`);
        console.log(`   Chunk types: ${group.types.join(', ')}`);
      });
    } else {
      console.log('⚠️  No embeddings found in database!');
      console.log('   This means documents have not been processed yet.');
    }

    await mongoose.disconnect();
    console.log('\n\n✅ Check completed');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkDatabase();
