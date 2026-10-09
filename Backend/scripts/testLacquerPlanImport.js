#!/usr/bin/env node

/**
 * Lacquer Plan Import Testing Script
 * 
 * Usage:
 *   node testLacquerPlanImport.js [options]
 * 
 * Options:
 *   --generate-sample      Generate a sample test Excel file
 *   --file <path>          Use existing Excel file for testing
 *   --output <path>        Output path for generated test file (default: ./test-lacquer-plan.xlsx)
 *   --validate             Run validation tests
 *   --verbose              Show detailed output
 */

const fs = require('fs');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  generateSample: args.includes('--generate-sample'),
  file: null,
  output: './test-lacquer-plan.xlsx',
  validate: args.includes('--validate'),
  verbose: args.includes('--verbose')
};

// Extract values
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--file' && i + 1 < args.length) {
    options.file = args[i + 1];
  }
  if (args[i] === '--output' && i + 1 < args.length) {
    options.output = args[i + 1];
  }
}

const testGenerator = require('../src/utils/generateTestExcel');
const gujaratiMapping = require('../src/utils/gujaratiHeaderMapping');

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║   Lacquer Plan Excel Import - Testing Script                  ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

// ============================================================================
// STEP 1: Generate Sample Test File
// ============================================================================
if (options.generateSample) {
  console.log('📝 Generating sample test Excel file...\n');
  
  try {
    const outputPath = testGenerator.generateAndSaveTestExcel(options.output, {
      startDate: new Date(2026, 8, 1),  // September 2026
      numDays: 3,
      rowsPerDay: 25,
      numCompanies: 2
    });
    
    console.log(`✅ Test file generated successfully!`);
    console.log(`   📁 Location: ${outputPath}\n`);
    
    if (options.verbose) {
      console.log('   File contains:');
      console.log('   - 3 sheets (dates: 01.09.26, 02.09.26, 03.09.26)');
      console.log('   - 2 company sections per sheet');
      console.log('   - 25 product rows per date');
      console.log('   - All Gujarati headers exactly as specified\n');
    }
  } catch (error) {
    console.error('❌ Failed to generate test file:');
    console.error(`   ${error.message}\n`);
    process.exit(1);
  }
}

// ============================================================================
// STEP 2: Validate Header Mapping
// ============================================================================
console.log('🔍 Validating Gujarati Header Mapping...\n');

const allHeaders = gujaratiMapping.getAllGujaratiHeaders();
const mappingRef = gujaratiMapping.getMappingReference();

console.log(`   Total Gujarati Headers: ${allHeaders.length}`);
console.log(`   Mapping Reference:\n`);

mappingRef.forEach((map, idx) => {
  const required = map.isRequired ? '✓ REQ' : '  ✗ OPT';
  console.log(`   ${idx + 1}. [${required}] ${map.gujarati}`);
  console.log(`      └─ English: "${map.english}"`);
  console.log(`      └─ Property: "${map.property}"`);
});

console.log('\n');

// ============================================================================
// STEP 3: Test Header Detection
// ============================================================================
console.log('🧪 Testing Gujarati Header Detection...\n');

const testHeaders = [
  'નંબર',
  'પ્રોડક્ટ નામ',
  'કલર',
  'BRAND',
  'પ્રક્રિયા'
];

console.log('   Input Headers:');
testHeaders.forEach(h => {
  console.log(`   - "${h}"`);
});

console.log('\n   Detection Results:\n');

const detected = gujaratiMapping.detectGujaratiHeaders(testHeaders);
const detectedCount = Object.keys(detected).length;

Object.entries(detected).forEach(([gujarati, info]) => {
  console.log(`   ✅ "${gujarati}" (Column: ${info.columnIndex})`);
  console.log(`      → English: "${info.englishHeader}"`);
  console.log(`      → Property: "${info.appProperty}"`);
});

console.log(`\n   Detection Summary: ${detectedCount}/${testHeaders.length} headers matched\n`);

// ============================================================================
// STEP 4: Validation Tests
// ============================================================================
if (options.validate && options.file) {
  console.log('✔️  Running validation tests...\n');
  
  if (!fs.existsSync(options.file)) {
    console.error(`❌ Test file not found: ${options.file}\n`);
    process.exit(1);
  }
  
  console.log('   Note: Full validation requires running the import preview API');
  console.log('   Steps to validate:');
  console.log('   1. Start the backend server');
  console.log('   2. Upload the test file using the admin panel');
  console.log('   3. Verify preview shows correct English column headers');
  console.log('   4. Verify Gujarati detection badges appear on rows');
  console.log('   5. Import and verify database values\n');
}

// ============================================================================
// STEP 5: Display Test Instructions
// ============================================================================
console.log('📋 Next Steps for Full Testing:\n');

console.log('1️⃣  Generate Test File (if not already done):');
console.log(`    node testLacquerPlanImport.js --generate-sample\n`);

console.log('2️⃣  Start Backend Server:');
console.log(`    npm start (in Backend directory)\n`);

console.log('3️⃣  Open Admin Panel:');
console.log(`    http://localhost:3000 (or your configured URL)\n`);

console.log('4️⃣  Test Import Process:');
console.log(`    - Go to Lacquer Plan section`);
console.log(`    - Click "Import Lacquer Plan from Excel"`);
console.log(`    - Select the generated test file`);
console.log(`    - Review preview (should show Gujarati detection badges)`);
console.log(`    - Import and verify database values\n`);

console.log('5️⃣  Verify Results:');
console.log(`    - Check preview columns use English names (e.g., "Coating Shade")`);
console.log(`    - Verify "GJ" badges appear on detected rows`);
console.log(`    - Confirm all optional fields properly imported`);
console.log(`    - Validate database values match preview\n`);

// ============================================================================
// Testing Checklist
// ============================================================================
console.log('✓ Testing Checklist:\n');

const checklist = [
  'Gujarati headers detected correctly',
  'English column names displayed in preview',
  'Detection method shown (GJ badge for Gujarati)',
  'All fields extracted with correct values',
  'Bottle names and variants parsed correctly',
  'Company sections identified and labeled',
  'Quantity fields preserved as imported',
  'Optional fields optional (no error if blank)',
  'Total rows excluded from import',
  'Blank rows skipped',
  'Preview summary shows detection statistics',
  'Import successful without errors',
  'Database values match preview',
  'Multiple dates handled correctly',
  'Unmatched bottles show warning (not error)'
];

checklist.forEach((item, idx) => {
  console.log(`  ☐ ${idx + 1}. ${item}`);
});

console.log('\n');
console.log('✨ For more detailed testing guide, see: Backend/src/utils/importTestingGuide.md\n');

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║   Ready for Testing!                                           ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');
