const mongoose = require('../node_modules/mongoose');

async function inspectCollections() {
  await mongoose.connect('mongodb://localhost:27017/shayona-production');
  const db = mongoose.connection.db;

  console.log('=== STEP 1 RAW DRIVER INSPECTION ===\n');

  for (const colName of ['incomings', 'dispatches', 'shrenoincomings']) {
    const col = db.collection(colName);
    const total = await col.countDocuments({});
    console.log(`--- Collection: ${colName} (Total: ${total}) ---`);
    
    // Check if any marker fields exist across the collection
    const sampleDocs = await col.find({}).toArray();
    
    const withExplicitMarker = sampleDocs.filter(d => 
      d.isImported !== undefined || 
      d.importBatchId !== undefined || 
      d.source !== undefined || 
      d.importedAt !== undefined
    );

    console.log(`Docs with explicit marker (isImported / importBatchId / source / importedAt): ${withExplicitMarker.length}`);
    
    // Group by created timestamp proximity (within 3 seconds) or createdBy or presence of import-specific signatures
    // In incoming: poDate/poNo/poOrderQty or images === [] or deliveryNumber patterns or bursts
    console.log(`Detailed analysis of all docs:`);
    sampleDocs.forEach((d, idx) => {
      console.log(`[${idx+1}] ID: ${d._id}`);
      console.log(`    createdAt: ${d.createdAt}, updatedAt: ${d.updatedAt}`);
      console.log(`    docDate: ${d.documentDate || d.date}, deliveryNo/challan: ${d.deliveryNumber || d.challanNo}`);
      console.log(`    poNo: ${d.poNo}, poDate: ${d.poDate}, poOrderQty: ${d.poOrderQty}`);
      console.log(`    createdBy: ${d.createdBy}, isDeleted: ${d.isDeleted}`);
      console.log(`    itemsCount: ${d.items ? d.items.length : 0}, items: ${JSON.stringify(d.items)}`);
    });
    console.log('\n');
  }

  // Also check if any import log collection exists
  const collections = await db.listCollections().toArray();
  console.log('All collections:', collections.map(c => c.name));

  process.exit(0);
}

inspectCollections().catch(err => {
  console.error(err);
  process.exit(1);
});
