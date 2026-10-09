const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB using your standard environment variable
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/shayona-production";

const run = async () => {
  try {
    console.log(`Connecting to database...`);
    await mongoose.connect(MONGODB_URI);
    console.log("Successfully connected to database.\n");

    const collectionName = 'plainbottlestocks';
    const indexName = 'bottleSpecId_1';

    console.log(`Attempting to drop legacy index '${indexName}' from collection '${collectionName}'...`);
    
    try {
      await mongoose.connection.collection(collectionName).dropIndex(indexName);
      console.log(`✅ SUCCESS: Legacy index '${indexName}' was successfully dropped.`);
      console.log(`You will no longer get the duplicate key error for bottleSpecId: null.`);
    } catch (indexErr) {
      if (indexErr.code === 27) {
        console.log(`✅ SUCCESS: The index '${indexName}' does not exist on this collection. No action needed.`);
      } else {
        console.error(`❌ ERROR dropping index:`, indexErr.message);
      }
    }

  } catch (error) {
    console.error("❌ Database connection error:", error.message);
  } finally {
    await mongoose.disconnect();
    console.log("\nDatabase disconnected. Exiting.");
    process.exit(0);
  }
};

run();
