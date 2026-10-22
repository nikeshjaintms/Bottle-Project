const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../../.env') });
const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/shayona-production';

const LacquerPlan = require('../models/LacquerPlan');
const BottlePerBox = require('../models/BottlePerBox');
const Company = require('../models/Company');
const { recomputePlainStock, computeLivePlainStock } = require('../utils/stockRecompute');

async function repairImportedRows() {
  const isCommit = process.argv.includes('--commit');
  console.log('========================================================================');
  console.log(`REPAIR IMPORTED ROWS SCRIPT`);
  console.log(`Mode: ${isCommit ? '*** COMMIT (WRITING CHANGES TO DB) ***' : 'DRY RUN (REPORT ONLY, NO CHANGES WRITTEN)'}`);
  console.log('========================================================================\n');

  await mongoose.connect(mongoURI);
  console.log('[REPAIR] Connected to MongoDB:', mongoURI);

  // 1. Find all non-deleted LacquerPlan rows with importedFromId set
  const importedRows = await LacquerPlan.find({
    importedFromId: { $ne: null, $exists: true },
    isDeleted: false
  }).lean();

  console.log(`[REPAIR] Found ${importedRows.length} total active rows with importedFromId set.`);

  const qualifyingRows = [];
  const skippedRows = [];

  for (const row of importedRows) {
    const sourceRow = await LacquerPlan.findById(row.importedFromId).lean();
    if (!sourceRow) {
      skippedRows.push({ row, reason: 'Source row not found' });
      continue;
    }

    const timeDiffMs = Math.abs(new Date(row.updatedAt).getTime() - new Date(row.createdAt).getTime());
    const isUnedited = timeDiffMs <= 5000 && !row.isEditedAfterImport;

    const rowCoated = Number(row.coatedQty) || 0;
    const rowCompleted = Number(row.coatingCompletedQty) || 0;
    const srcCoated = Number(sourceRow.coatedQty) || 0;
    const srcCompleted = Number(sourceRow.coatingCompletedQty) || 0;

    const hasCoated = rowCoated > 0 || rowCompleted > 0;
    const matchesSource = (rowCoated === srcCoated) && (rowCompleted === srcCompleted);

    if (isUnedited && hasCoated && matchesSource) {
      qualifyingRows.push({
        row,
        sourceRow,
        timeDiffMs
      });
    } else {
      let reason = [];
      if (!isUnedited) reason.push(`Edited after import (timeDiff=${timeDiffMs}ms, isEdited=${row.isEditedAfterImport})`);
      if (!hasCoated) reason.push('Coated qty already 0');
      if (!matchesSource) reason.push(`Does not match source (row=[${rowCoated}, ${rowCompleted}], src=[${srcCoated}, ${srcCompleted}])`);
      skippedRows.push({ row, reason: reason.join('; ') });
    }
  }

  console.log(`[REPAIR] Summary:`);
  console.log(`  - Total imported rows inspected: ${importedRows.length}`);
  console.log(`  - Qualifying rows matching ALL conditions: ${qualifyingRows.length}`);
  console.log(`  - Skipped rows: ${skippedRows.length}\n`);

  if (qualifyingRows.length === 0) {
    console.log('[REPAIR] No rows qualify for repair. Database is clean.');
    await mongoose.disconnect();
    return;
  }

  // Print qualifying rows
  console.log('========================================================================');
  console.log('QUALIFYING ROWS TO REPAIR:');
  console.log('========================================================================');
  console.table(qualifyingRows.map((q, idx) => ({
    '#': idx + 1,
    ID: q.row._id.toString(),
    Date: q.row.planDate ? new Date(q.row.planDate).toISOString().slice(0, 10) : 'N/A',
    Bottle: q.row.bottleName,
    OrderQty: q.row.orderQty,
    'Current Coated': q.row.coatedQty,
    'Current Completed': q.row.coatingCompletedQty,
    'Source Completed': q.sourceRow.coatingCompletedQty,
    'New Coated': 0,
    'New Balance': 0 - (Number(q.row.orderQty) || 0)
  })));

  // Export JSON backup
  const backupData = {
    exportedAt: new Date().toISOString(),
    totalRows: qualifyingRows.length,
    rows: qualifyingRows.map(q => q.row)
  };

  const backupDir = path.join(__dirname, '../../backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  const backupFileName = `imported_rows_backup_${Date.now()}.json`;
  const backupFilePath = path.join(backupDir, backupFileName);
  fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2), 'utf8');
  console.log(`\n[REPAIR] JSON Backup saved to: ${backupFilePath}`);

  // Also save a copy to brain artifact scratch directory if available
  const artifactScratchDir = 'C:/Users/Prabhat Shukla/.gemini/antigravity-ide/brain/17318dc7-b9ca-4252-be69-2b02454cd315/scratch';
  if (fs.existsSync(artifactScratchDir)) {
    fs.writeFileSync(path.join(artifactScratchDir, backupFileName), JSON.stringify(backupData, null, 2), 'utf8');
    console.log(`[REPAIR] Backup also mirrored to scratch directory.`);
  }

  if (!isCommit) {
    console.log('\n========================================================================');
    console.log('DRY RUN COMPLETE. No changes were written to the database.');
    console.log('To apply these fixes, run: node src/scripts/repairImportedRowsScript.js --commit');
    console.log('========================================================================\n');
    await mongoose.disconnect();
    return;
  }

  // If --commit, perform updates
  console.log('\n[REPAIR] Applying fixes to MongoDB...');
  const affectedPairs = new Set();

  for (const q of qualifyingRows) {
    const row = q.row;
    const orderQty = Number(row.orderQty) || 0;
    const newBalance = 0 - orderQty;

    const originalValues = row.originalImportedValues || {};
    originalValues.coatingCompletedQty = 0;
    originalValues.coatedQty = 0;
    originalValues.balanceToMake = newBalance;
    originalValues.appliedStockDeduction = 0;

    await LacquerPlan.updateOne(
      { _id: row._id },
      {
        $set: {
          coatingCompletedQty: 0,
          coatedQty: 0,
          appliedStockDeduction: 0,
          balanceToMake: newBalance,
          originalImportedValues: originalValues
        }
      }
    );

    const bottleKey = row.plainBottle || row.bottleName;
    const compKey = (row.canonicalCompanyId || row.companyId)?.toString();
    if (bottleKey && compKey) {
      affectedPairs.add(`${compKey}:::${bottleKey}`);
    }
  }

  console.log(`[REPAIR] Updated ${qualifyingRows.length} LacquerPlan documents.`);

  // Recompute plain stock for affected pairs
  console.log(`[REPAIR] Recomputing plain stock for ${affectedPairs.size} affected (company, bottle) pairs...`);
  for (const pair of affectedPairs) {
    const [compId, bottleName] = pair.split(':::');
    await recomputePlainStock(bottleName, compId);
    console.log(`  - Recomputed: ${bottleName} (Company: ${compId})`);
  }

  console.log('\n========================================================================');
  console.log('REPAIR COMPLETED SUCCESSFULLY.');
  console.log('========================================================================\n');

  // Verify stock on Date A and Date B for 20 ML SAAB and 8 ML SQ ROLL ON
  const tpp = await Company.findOne({ name: /TPP/i });
  if (tpp) {
    console.log('=== VERIFICATION OF REAL DATES FOR TPP ===');
    const saabStock20 = await computeLivePlainStock('20 ML SAAB', tpp._id, '2026-10-20');
    const saabStock21 = await computeLivePlainStock('20 ML SAAB', tpp._id, '2026-10-21');
    console.log(`20 ML SAAB Stock on 2026-10-20: ${saabStock20}`);
    console.log(`20 ML SAAB Stock on 2026-10-21: ${saabStock21}`);
    console.log(`Stocks Equal? ${saabStock20 === saabStock21 ? 'YES (PASSED)' : 'NO (MISMATCH)'}`);

    const rollOnStock20 = await computeLivePlainStock('8 ML SQ ROLL ON', tpp._id, '2026-10-20');
    const rollOnStock21 = await computeLivePlainStock('8 ML SQ ROLL ON', tpp._id, '2026-10-21');
    console.log(`\n8 ML SQ ROLL ON Stock on 2026-10-20: ${rollOnStock20}`);
    console.log(`8 ML SQ ROLL ON Stock on 2026-10-21: ${rollOnStock21}`);
  }

  await mongoose.disconnect();
}

repairImportedRows().catch(err => {
  console.error('[REPAIR] Error:', err);
  process.exit(1);
});
