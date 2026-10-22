# Implementation Plan: Data Validation Error Tracking for Incoming Import Functions

## Overview
Add comprehensive data validation error tracking to incoming import functions (`parseTppIncoming` and `parseShrenoIncoming`) to match the pattern established in lacquer import functions. This enables users to see which specific data is missing for each invalid row in the import preview.

---

## Current State Analysis

### 1. Current Error Tracking in Incoming Import Functions

**Location:** `Backend/src/controllers/incomingImport.js`

#### parseTppIncoming Function (7-column TPP/Default format)
- **Current implementation:** Minimal error tracking
- **Current errors:** Only basic missing field checks
  - "MISSING DATE" (date validation)
  - "INVALID DATE" (date parsing)
  - "MISSING CHALLAN" (optional field tracking)
  - "INVALID BOX" (numeric parsing)
  - "INVALID QTY" (numeric parsing)
  - "INVALID TOTAL QTY" (numeric parsing)
  - "MISSING QUANTITY" (aggregate validation)
  - Bottle name validation errors
  - Opening balance quantity validation
- **Problem:** Error tracking is sparse; no detailed reasons like "INVALID BOX" don't explain what went wrong

#### parseShrenoIncoming Function (10-column SHRENO format)
- **Current implementation:** Slightly more comprehensive than TPP
- **Current errors:** PO field validation added
  - "MISSING PO DATE"
  - "INVALID PO DATE"
  - "MISSING PO NUMBER"
  - "MISSING PO QUANTITY"
  - "INVALID PO QUANTITY"
  - Plus all the same incoming date/challan/quantity errors as TPP
- **Problem:** Same sparse tracking; doesn't match lacquer import's detailed error pattern

### 2. Lacquer Import Error Tracking Pattern (Reference)

**Location:** `Backend/src/controllers/lacquerPlan.controller.js` (lines 2365-2747)

#### Error Tracking Structure:
```javascript
let invalidReasons = {};  // Object mapping error reason to count

// During row processing:
if (!parsedRow.isValid) {
  dateInvalidRows++;
  parsedRow.errors.forEach(err => {
    invalidReasons[err] = (invalidReasons[err] || 0) + 1;
  });
}

// In response:
result.dates.push({
  date: planDateStr,
  totalRows: dateTotalRows,
  validRows: dateValidRows,
  invalidRows: dateInvalidRows,
  invalidReasons,  // Aggregated error reason counts
  rows: dateRows
});
```

#### Error Messages in Lacquer:
- `"MISSING BOTTLE NAME"` - bottle not provided
- `"UNMATCHED BOTTLE NAME: <name>"` - bottle provided but not in master
- `"COLUMN SHIFT DETECTED: Bottle Per Box cannot be negative"` - data validation issue

#### Pattern Benefits:
1. Each record tracks `.errors` as an array of strings
2. `invalidReasons` object aggregates error counts across all invalid rows
3. Response includes both row-level errors AND sheet-level invalidReasons summary
4. Clear, descriptive error messages (specific missing field or validation failure)

---

## Validation Checks Required

### TPP/Default Format Validations (7 columns)

| Field | Column | Validation | Error Message |
|-------|--------|-----------|----------------|
| Serial No | A | Non-empty, numeric | "MISSING SR.NO" / "INVALID SR.NO" |
| Date | B | Valid date format | "MISSING DATE" / "INVALID DATE" |
| Challan No | C | Optional but tracked | "MISSING CHALLAN" (if empty) |
| Bottle Name | D | Must exist or be "OLD STOCK" | "MISSING BOTTLE" / "INVALID BOTTLE NAME" |
| No. of Box | E | Numeric, >= 0 | "INVALID BOX" |
| Qty | F | Numeric, >= 0 | "INVALID QTY" |
| Total Qty | G | Numeric, >= 0 | "INVALID TOTAL QTY" |
| **Aggregate** | - | At least one quantity present | "MISSING QUANTITY" |
| **Aggregate** | - | Opening balance qty > 0 | "OPENING BALANCE QUANTITY MUST BE > 0" |

### SHRENO Format Validations (10 columns)

| Field | Column | Validation | Error Message |
|-------|--------|-----------|----------------|
| SR.NO | A | Non-empty, numeric | "MISSING SR.NO" / "INVALID SR.NO" |
| PO Date | B | Valid date format (optional for SHRENO) | "MISSING PO DATE" / "INVALID PO DATE" |
| PO No | C | Optional but tracked | "MISSING PO NUMBER" |
| PO Order Qty | D | Numeric, >= 0 | "MISSING PO QUANTITY" / "INVALID PO QUANTITY" |
| Description | E | Optional (can be "OLD STOCK") | - |
| Incoming Date | F | Valid date format | "MISSING DATE" / "INVALID DATE" |
| Challan No | G | Optional but tracked | "MISSING CHALLAN" |
| No. of Box | H | Numeric, >= 0 | "INVALID BOX" |
| Qty | I | Numeric, >= 0 | "INVALID QTY" |
| Incoming Qty | J | Numeric, >= 0 | "INVALID INCOMING QTY" |
| **Aggregate** | - | At least one quantity present | "MISSING QUANTITY" |
| **Aggregate** | - | Opening balance qty > 0 | "OPENING BALANCE QUANTITY MUST BE > 0" |

---

## Implementation Details

### 1. Enhance parseTppIncoming Error Tracking

**File:** `Backend/src/controllers/incomingImport.js`

**Changes:**
- Keep existing `.errors` array structure in record object
- Enhance error messages to be more specific and actionable
- Add missing error checks:
  - Serial number validation (required, numeric)
  - Better box/qty/total validation messages (distinguish between missing and invalid)
- Update error messages to match lacquer pattern:
  - Use ALL_CAPS with descriptive names
  - Include specific reason (e.g., "INVALID BOX" not just missing/invalid)

**Current error flow example:**
```javascript
if (isNaN(record.noOfBox)) {
  record.errors.push("INVALID BOX");
}
```

**Ensure:** Each error string is unique and descriptive enough to categorize in `invalidReasons` object.

### 2. Enhance parseShrenoIncoming Error Tracking

**File:** `Backend/src/controllers/incomingImport.js`

**Changes:**
- Same error structure enhancements as TPP
- Ensure PO field errors are consistent with TPP quantity field errors
- Add any missing validations for SHRENO-specific fields

### 3. Build invalidReasons Object in importPreview Response

**File:** `Backend/src/controllers/incomingImport.js` in `importPreview` function

**Changes:**
- In the import preview, for each sheet, build an `invalidReasons` object (similar to lacquer)
- Aggregate error counts from all invalid records in that sheet
- Include in sheet summary response

**Current code location:** Lines ~697-725 (sheetSummary construction)

**Existing pattern to follow:**
```javascript
// Build invalid reasons
for (const record of incomingRecords) {
  if (!record.isValid) {
    for (const err of record.errors) {
      sheetSummary.invalidReasons[err] = (sheetSummary.invalidReasons[err] || 0) + 1;
    }
  }
}
```

**This code already exists!** Just need to ensure error messages are properly categorized.

### 4. Verify Response Structure Includes Error Details

**File:** `Backend/src/controllers/incomingImport.js` in `importPreview` function

**Current response includes:**
```javascript
return res.status(200).json({
  success: true,
  data: {
    fileName: req.file.originalname,
    companyName: resolvedCompany.name,
    companyId: resolvedCompany._id ? resolvedCompany._id.toString() : null,
    detectedCompanies: detectedFormatsList.length > 0 ? detectedFormatsList : ['TPP'],
    totalRows: allRecords.reduce((acc, s) => acc + s.totalRows, 0),
    validRows: allRecords.reduce((acc, s) => acc + s.validRows, 0),
    invalidRows: allRecords.reduce((acc, s) => acc + s.invalidRows, 0),
    sheets: allRecords  // Each sheet has invalidReasons object
  }
});
```

**Status:** Response structure already properly includes `sheets[].invalidReasons`

### 5. Ensure Error Messages Are Clear and Descriptive

**Error Message Standards to Follow:**

1. **Missing Fields:** `"MISSING <FIELD_NAME>"` (e.g., "MISSING DATE", "MISSING CHALLAN")
2. **Invalid/Malformed:** `"INVALID <FIELD_NAME>"` (e.g., "INVALID DATE", "INVALID BOX")
3. **Special Cases:** Specific reason (e.g., "OPENING BALANCE QUANTITY MUST BE > 0")
4. **All caps:** Consistent with lacquer pattern for UI clarity

**Apply to:**
- parseTppIncoming (line ~150-230)
- parseShrenoIncoming (line ~300-430)

---

## Detailed Changes Mapping

### parseTppIncoming - Changes Required

**Current Issues:**
1. No SR.NO validation
2. Generic error messages that don't aggregate well
3. Missing proper categorization of numeric field errors

**Specific Changes:**

1. **Add SR.NO Validation** (line ~180)
   - Check: `srNo` is non-empty
   - Check: `srNo` is numeric
   - Error: "MISSING SR.NO" / "INVALID SR.NO"

2. **Enhance Date Validation** (line ~195-200)
   - Check: Date is provided
   - Check: Date is parseable
   - Errors: "MISSING DATE" / "INVALID DATE FORMAT"

3. **Enhance Quantity Field Validation** (line ~210-230)
   - For each field (noOfBox, qty, totalQty), add specific error
   - Separate "missing" from "invalid" cases
   - Check aggregate: "MISSING QUANTITY" if all three are missing/invalid

4. **Bottle Name Validation** (line ~185)
   - Check: Bottle is provided or is "OLD STOCK"
   - Error: "MISSING BOTTLE"

### parseShrenoIncoming - Changes Required

**Current Issues:**
1. Same as TPP + PO field validation is already present but could be enhanced
2. No SR.NO validation

**Specific Changes:**

1. **Add SR.NO Validation** (line ~330)
   - Same as TPP

2. **Enhance PO Validations** (line ~360-390)
   - Current implementation checks for missing/invalid
   - Ensure error messages are clear:
     - "MISSING PO DATE", "INVALID PO DATE"
     - "MISSING PO NUMBER"
     - "MISSING PO QUANTITY", "INVALID PO QUANTITY"

3. **Enhance Incoming Date Validation** (line ~395-400)
   - Consistent with TPP

4. **Enhance Quantity Validations** (line ~410-430)
   - Same pattern as TPP

---

## Verification Strategy

### Unit Test Requirements

**Test File:** `Backend/tests/controllers/incomingImport.test.js` (create if doesn't exist)

**Test Coverage:**

1. **parseTppIncoming Error Scenarios:**
   - Missing SR.NO → generates "MISSING SR.NO" error
   - Invalid SR.NO (non-numeric) → generates "INVALID SR.NO" error
   - Missing Date → generates "MISSING DATE" error
   - Invalid Date format → generates "INVALID DATE FORMAT" error
   - Missing Bottle → generates "MISSING BOTTLE" error
   - Missing Challan → generates "MISSING CHALLAN" error
   - Invalid Box (non-numeric) → generates "INVALID BOX" error
   - Invalid Qty (non-numeric) → generates "INVALID QTY" error
   - All quantities missing → generates "MISSING QUANTITY" error
   - Valid row → errors array is empty

2. **parseShrenoIncoming Error Scenarios:**
   - All TPP tests above
   - Missing PO Date → generates "MISSING PO DATE" error
   - Invalid PO Date → generates "INVALID PO DATE" error
   - Missing PO Number → generates "MISSING PO NUMBER" error
   - Missing PO Quantity → generates "MISSING PO QUANTITY" error
   - Invalid PO Quantity → generates "INVALID PO QUANTITY" error

3. **importPreview Response:**
   - Response includes sheet-level `invalidReasons` object
   - Each sheet's `invalidReasons` has count of each error type
   - Total invalid row count matches sum of per-sheet invalid counts
   - Each record with errors has non-empty `.errors` array

### Integration Test Requirements

1. **Import Preview with Mixed Valid/Invalid Rows:**
   - Upload file with TPP format
   - Verify response shows separate counts for each error type
   - Verify row-level errors are captured
   - Verify sheet-level invalidReasons aggregates correctly

2. **Import Preview with SHRENO Format:**
   - Upload file with SHRENO format detected
   - Verify PO field errors appear in invalidReasons
   - Verify incoming date/quantity errors also tracked

### Manual Testing Scenarios

1. **Scenario 1:** Upload TPP file with rows missing dates
   - Expected: "MISSING DATE" appears in invalidReasons count
   - UI displays: "MISSING DATE: 3 rows" (if 3 rows affected)

2. **Scenario 2:** Upload TPP file with invalid numeric boxes
   - Expected: "INVALID BOX" appears in invalidReasons count

3. **Scenario 3:** Upload SHRENO file with missing PO dates
   - Expected: "MISSING PO DATE" appears in invalidReasons count

4. **Scenario 4:** Mixed errors in single file
   - Expected: Multiple error types in invalidReasons
   - Example: {"MISSING DATE": 2, "INVALID BOX": 1, "MISSING CHALLAN": 3}

---

## Acceptance Criteria

1. ✓ `parseTppIncoming` generates clear, descriptive error messages for all validation failures
2. ✓ `parseShrenoIncoming` generates clear, descriptive error messages for all validation failures
3. ✓ Each error message is unique and categorizable (used as key in `invalidReasons`)
4. ✓ Import preview response includes `invalidReasons` object per sheet
5. ✓ `invalidReasons` aggregates error counts correctly across all invalid rows
6. ✓ Row-level `.errors` array populated with all applicable errors
7. ✓ Error messages follow pattern: "MISSING <FIELD>" or "INVALID <FIELD>"
8. ✓ Response includes both row-level errors AND sheet-level aggregated counts
9. ✓ All validation checks from requirements met (see table above)
10. ✓ Tests verify error tracking for both TPP and SHRENO formats
11. ✓ UI can display which data is missing using invalidReasons (e.g., show "MISSING DATE: 5 rows")

---

## Notes & Considerations

1. **No Changes to Lacquer Import:** Per user request, lacquer import functions remain untouched
2. **Error Message Consistency:** All error messages should match the ALL_CAPS descriptive pattern
3. **Backward Compatibility:** Response structure already supports invalidReasons; we're just populating it better
4. **OLD STOCK Special Case:** Opening balance rows don't require date/challan; ensure error checking skips these
5. **Error Precedence:** Some rows may have multiple errors (e.g., missing date AND invalid box); all should be tracked
6. **UI Benefit:** With this data, UI can show "VALID ROWS: 10 | INVALID ROWS: 5 | Missing Date: 3 | Invalid Box: 2" breakdown
