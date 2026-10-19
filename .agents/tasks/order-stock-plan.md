# Order-Qty vs Stock Warning System - Implementation Plan

**Task ID:** order-stock-warning  
**Status:** Ready for Implementation  
**Reference Document:** ORDER-QTY-VS-STOCK-WARNING-PROMPT.md

---

## Executive Summary

This plan implements a comprehensive warning system that alerts users when they attempt to import or create Lacquer Plan rows where `orderQty` exceeds available live plain stock. The system displays warnings in Excel import previews and single-row add/edit flows, allows optional override with acknowledgment, and logs all overrides for audit purposes.

The implementation decomposes into **two independent features**:
1. **FEAT-001: Backend Stock Calculation & Validation Functions** - Core stock calculation logic, validation helpers, database schema updates
2. **FEAT-002: Frontend Warning Integration** - UI display in import preview, add/edit forms, and list view indicators

Both features can be developed independently but must be tested together.

---

## Codebase Exploration Findings

### Key Models & Structure

**PlainBottleStock Model** (`Backend/src/models/PlainBottleStock.js`):
- Stores `availableQuantity` (current live stock)
- Stores `reservedQuantity` (blocked for upcoming operations)
- Scoped by `companyId` + `bottleId` (BottlePerBox)
- Unique index: `{ companyId: 1, bottleId: 1 }`

**LacquerPlan Model** (`Backend/src/models/LacquerPlan.js`):
- Core fields: `planDate`, `bottleName`, `variantId`, `companyId`, `brandId`, `orderQty`, `coatingCompletedQty`/`coatedQty`
- Completion detection: `coatingCompletedQty >= orderQty` or `coatedQty >= orderQty`
- Already tracks: `isEditedAfterImport`, `originalImportedValues`, `importedFromId`, `importedFromDate`
- **Needs additions:**
  - `stockWarningAcknowledged` (boolean) - flag indicating user acknowledged the warning
  - `acknowledgedAt` (timestamp) - when the warning was acknowledged
  - `stockWarningDetails` (JSON) - snapshot of stock info at time of warning

**Incoming Model** (`Backend/src/models/Incoming.js`):
- Represents incoming plain bottle orders via PO (Purchase Order)
- Key field: `items` array with `{ bottleId, qty, totalQty }`
- Scoped by `billToId` (which company it's for)
- Status: not explicitly marked as active/inactive in schema; assumes all non-deleted records are active allocations

**Current Import Flow** (from `lacquerPlan.controller.js`):
- `previewImportExcel(file)` → returns `{ parsed, skipped, importable, skippedRows, dates[...] }`
- `commitImportExcel(datesToImport, datesToImport[...].rows)` → inserts LacquerPlan rows
- `importPreviousDay(targetDate, sourceDate, importMode)` → copies rows from previous day, filters completed
- `createPlan(req.body)` → direct row creation (array or single object)
- `updatePlan(id, req.body)` → updates existing row

Completed rows are already filtered using `isPlanRowCompleted()` helper.

---

## Database Schema Changes

### Add Stock Warning Fields to LacquerPlan Schema

**File:** `Backend/src/models/LacquerPlan.js`

**Changes:**
```javascript
// Add to schema:
stockWarningAcknowledged: {
  type: Boolean,
  default: false
},
acknowledgedAt: {
  type: Date,
  default: null
},
stockWarningDetails: {
  type: mongoose.Schema.Types.Mixed,  // JSON object
  default: null
}
```

**Migration Note:** No data migration needed (backfill defaults). New rows will have these fields initialized.

---

## Backend Implementation (Feature 1)

### File: Backend/src/controllers/lacquerPlan.controller.js

#### 1. Helper Function: `calculateAvailableStock(plainBottleName, companyId, excludeDate = null)`

**Purpose:** Calculate live available stock for a plain bottle, accounting for allocations from active plans.

**Implementation Details:**

```javascript
/**
 * Calculate available stock for a plain bottle
 * @param {string} plainBottleName - Name of the plain bottle (e.g., "PLASTIC 500ML")
 * @param {string|ObjectId} companyId - Company ID (optional, scopes to company)
 * @param {Date} excludeDate - (Optional) Date to exclude from allocation count (for re-imports on same date)
 * @returns {Promise<Object>} {
 *   totalStock: number,
 *   allocated: number,
 *   available: number,
 *   breakdown: {
 *     lacquerPlans: number,       // sum of orderQty from active LacquerPlans
 *     incomingPlan: number,       // sum of qty from active Incoming orders
 *     reserved: number            // sum of reservedQuantity from PlainBottleStock
 *   }
 * }
 */
```

**Logic:**
1. Find BottlePerBox record matching `plainBottleName`
2. Find PlainBottleStock doc for (companyId, bottleId) → get `totalStock = availableQuantity`
3. Query LacquerPlan for allocations:
   - WHERE: `isDeleted: false`, `planDate >= TODAY` (or all future dates if exclude is null), `bottleName matches plainBottleName` (case-insensitive)
   - Exclude: completed rows (where `coatingCompletedQty >= orderQty` and `coatingCompletedQty > 0`)
   - Exclude: rows on `excludeDate` (for re-import scenario)
   - Sum their `orderQty` values → `lacquerPlans_allocated`
4. Query Incoming records for allocations:
   - WHERE: `isDeleted: false`, `billToId: companyId` (if provided)
   - Find item matching `bottleId` → sum their `qty` values → `incoming_allocated`
5. Get `reservedQuantity` from PlainBottleStock → `reserved`
6. Calculate: `allocated = lacquerPlans_allocated + incoming_allocated + reserved`
7. Calculate: `available = MAX(totalStock - allocated, 0)`
8. Return object with breakdown

**Key Queries:**

```javascript
// Find BottlePerBox (converts plain bottle name to bottleId)
const bottleRecord = await BottlePerBox.findOne({
  $or: [
    { plainBottleName: plainBottleName.trim() },
    { bottleName: plainBottleName.trim() },
    { bottleNames: plainBottleName.trim() }
  ],
  isDeleted: { $ne: true }
});

// Find PlainBottleStock
const stockDoc = await PlainBottleStock.findOne({
  bottleId: bottleRecord._id,
  companyId: companyId || null
});
const totalStock = stockDoc?.availableQuantity || 0;

// Sum LacquerPlan allocations (incomplete rows only, TODAY onwards)
const today = new Date();
today.setUTCHours(0, 0, 0, 0);
const lacquerAllocations = await LacquerPlan.aggregate([
  {
    $match: {
      isDeleted: false,
      bottleName: { $regex: new RegExp("^" + plainBottleName.trim() + "$", "i") },
      companyId: companyId,
      planDate: { $gte: today },
      $expr: { $lt: ["$coatingCompletedQty", "$orderQty"] }  // incomplete
    }
  },
  { $group: { _id: null, total: { $sum: "$orderQty" } } }
]);
const lacquerAllocated = lacquerAllocations[0]?.total || 0;

// Sum Incoming allocations
const incomingAllocations = await Incoming.aggregate([
  {
    $match: {
      isDeleted: false,
      billToId: companyId
    }
  },
  { $unwind: "$items" },
  {
    $match: {
      "items.bottleId": bottleRecord._id
    }
  },
  { $group: { _id: null, total: { $sum: "$items.qty" } } }
]);
const incomingAllocated = incomingAllocations[0]?.total || 0;

// Reserved quantity
const reserved = stockDoc?.reservedQuantity || 0;
```

#### 2. Helper Function: `validateRowStockWarning(plainBottleName, companyId, orderQty, excludeRowId = null)`

**Purpose:** Check if a single row's orderQty exceeds available stock.

**Implementation Details:**

```javascript
/**
 * Check if row exceeds available stock
 * @param {string} plainBottleName - Plain bottle name
 * @param {string|ObjectId} companyId - Company ID
 * @param {number} orderQty - Quantity being ordered
 * @param {string|ObjectId} excludeRowId - (Optional) LacquerPlan row ID to exclude from allocation
 * @returns {Promise<Object>} {
 *   hasWarning: boolean,
 *   orderQty: number,
 *   availableStock: number,
 *   overBy: number,
 *   details: {
 *     totalStock: number,
 *     allocated: number,
 *     breakdown: { lacquerPlans, incomingPlan, reserved }
 *   }
 * }
 */
```

**Logic:**
1. Call `calculateAvailableStock(plainBottleName, companyId)`
2. If `excludeRowId` provided:
   - Find that row and get its `orderQty`
   - Subtract from `allocated` (it shouldn't be counted in its own warning check)
3. Compare `orderQty` vs `available`:
   - `hasWarning = orderQty > available`
   - `overBy = MAX(orderQty - available, 0)`
4. Return warning object

#### 3. Modify `previewImportExcel()` to Include Stock Warnings

**Current Return Structure:** `{ parsed, skipped, importable, skippedRows, dates[...] }`

**New Return Structure:**
```javascript
{
  parsed: N,
  skipped: M,
  importable: K,
  skippedRows: [...],
  stockWarnings: [
    {
      rowIndex: number,
      date: string (YYYY-MM-DD),
      plainBottleName: string,
      bottleId: string,
      companyId: string,
      orderQty: number,
      availableStock: number,
      totalStock: number,
      allocated: number,
      overBy: number,
      breakdown: { lacquerPlans, incomingPlan, reserved },
      importAnyway: false  // user can set to true in UI
    }
  ],
  dates: [
    {
      date: string,
      totalRows: number,
      validRows: number,
      invalidRows: number,
      rows: [...],  // each row now includes stockWarning object if applicable
      okStockRows: [...],      // rows without warning
      warningStockRows: [...],  // rows with warning
      invalidReasons: {...}
    }
  ],
  ...rest
}
```

**Implementation:**
- After current row validation (checking for missing fields, invalid data)
- For each valid row:
  - Parse `plainBottleName` from row data (matches BottlePerBox)
  - Parse `companyId` from row mapping
  - Call `validateRowStockWarning(plainBottleName, companyId, orderQty)`
  - Attach warning object to row
  - Add to appropriate array (`okStockRows` or `warningStockRows`)
- Return both arrays in `dates[...].rows` or separately as `dates[...].okStockRows`, `dates[...].warningStockRows`

#### 4. Modify `commitImportExcel()` to Accept Override List

**New Input Parameter:**
```javascript
{
  datesToImport: [
    {
      date: string,
      rows: [...],
      replaceExisting: boolean,
      stockWarningOverrides: {
        rowIndex: boolean  // true = import despite warning
      }
    }
  ]
}
```

**Implementation:**
- For each row in `datesToImport[...].rows`:
  - If row has `stockWarning.hasWarning === true`:
    - Check if `stockWarningOverrides[rowIndex] === true`
    - If NOT overridden, skip the row (treat as filtered out)
    - If overridden, proceed to import and set `stockWarningAcknowledged: true`, `acknowledgedAt: now`, `stockWarningDetails: warning object`
  - If no warning, import normally
- Log all overrides to audit trail (console.log or dedicated logging table)
- Return `{ imported, skipped, stockWarningOverridden, result }`

#### 5. Modify `importPreviousDay()` to Support Stock Warning Flow

**Current:** Filters completed rows, returns list for import with importMode logic

**New:** Add stock warning calculation before returning preview

**Implementation:**
- After filtering completed rows but before returning preview response
- For each candidate row:
  - Call `validateRowStockWarning(plainBottleName, companyId, orderQty)`
  - Attach warning to row
- Include `stockWarnings` array in preview response (similar to Excel import)
- When `importMode` is confirmed and request is made to actually import:
  - Check for `stockWarningOverrides` in request body
  - Apply same logic as `commitImportExcel()` for handling overrides

#### 6. Modify `createPlan()` (Add/Create Single Row)

**Current:** Validates plan, inserts directly

**New:** Validate stock warning before insert

**Implementation:**
- Before `LacquerPlan.insertMany()` or `.save()`:
  - For each item in req.body (array or single):
    - Call `validateRowStockWarning(item.bottleName, item.companyId, item.orderQty)`
    - If `hasWarning === true`:
      - Check if `req.body.stockWarningAcknowledged === true` (or `stockWarningAcknowledgement: true` in field name)
      - If NOT acknowledged, return error: `{ code: 'STOCK_WARNING_REQUIRED', warning: {...}, message: 'Order exceeds available stock. Please acknowledge to proceed.' }`
      - If acknowledged, set `stockWarningAcknowledged: true`, `acknowledgedAt: now`, `stockWarningDetails: warning`
  - If no warning, insert normally

**Error Response Format:**
```javascript
{
  success: false,
  code: 'STOCK_WARNING_REQUIRED',
  requiresAcknowledge: true,
  warning: {
    orderQty: number,
    availableStock: number,
    totalStock: number,
    allocated: number,
    overBy: number
  },
  message: 'Order quantity (900) exceeds available stock (800 units). Please acknowledge the risk to proceed.'
}
```

#### 7. Modify `updatePlan()` (Edit Existing Row)

**Current:** Validates plan, updates existing row

**New:** Validate stock warning only if orderQty is increased

**Implementation:**
- Before `LacquerPlan.findByIdAndUpdate()`:
  - Get existing plan: `const existingPlan = await LacquerPlan.findById(id)`
  - If `req.body.orderQty` is provided:
    - Compare: `newQty = req.body.orderQty`, `oldQty = existingPlan.orderQty`
    - If `newQty > oldQty` (qty increased):
      - Call `validateRowStockWarning(bottleName, companyId, newQty, excludeRowId: id)` (exclude current row from allocation)
      - If `hasWarning === true`:
        - Check if `req.body.stockWarningAcknowledged === true`
        - If NOT acknowledged, return error (same format as createPlan)
        - If acknowledged, set warning metadata
    - If `newQty <= oldQty` (qty decreased or unchanged), skip warning check
  - If orderQty not updated, skip warning check entirely

---

## Frontend Implementation (Feature 2)

### File: admin panel/src/pages/LacquerPlan/ImportExcelModal.jsx

**Current Flow:**
1. User selects Excel file
2. Preview shows: Parsed count, Skipped count, Importable count, table of rows by date
3. User clicks "Import All" or "View Details" for specific date
4. Commit imports rows

**New Flow:**
1. User selects Excel file
2. Preview shows:
   - Parsed count, Skipped count, Importable count
   - **NEW:** Summary section: "✅ OK Stock: X rows | ⚠️ Over Stock: Y rows"
3. User can view details with tabs:
   - ALL rows, VALID rows, INVALID rows
   - NEW tab option: **OK Stock | Low Stock** (separate sections)
4. For each warning row:
   - Show current stock, allocated, available
   - Show "Over by X units" in red
   - Checkbox: "Import anyway (acknowledge risk)"
5. On commit:
   - Only import rows that either have no warning OR have override checkbox checked
   - Send `stockWarningOverrides: { rowIndex: boolean }` to backend

**State Additions:**
```javascript
const [stockWarnings, setStockWarnings] = useState({});  // { date: [...warnings] }
const [stockWarningOverrides, setStockWarningOverrides] = useState({});  // { rowIndex: boolean }
```

**UI Components:**

**Summary Card (after preview parsed):**
```jsx
<div className="alert alert-info">
  <strong>Stock Analysis:</strong>
  ✅ OK Stock: {okStockCount} rows | ⚠️ Over Stock: {warningStockCount} rows
</div>
```

**Date Tab with Stock Warning Sections:**
```jsx
{/* Grouped display */}
<h5>✅ OK Stock ({okStockRows.length} rows)</h5>
<table>{/* OK rows table */}</table>

<h5 className="mt-4">⚠️ Low/No Stock ({warningStockRows.length} rows)</h5>
<table>
  {/* Warning rows with additional columns: */}
  {/* - Available Stock (number) */}
  {/* - Over By (number in red) */}
  {/* - Override checkbox */}
</table>
```

**Warning Row Columns:**
```
| Row# | Company | Bottle | Variant | Shade | Order Qty | Available | Over By | Override Checkbox |
```

**On Commit:**
```javascript
const overridesToSend = {};
Object.entries(stockWarningOverrides).forEach(([rowIndex, isOverridden]) => {
  if (isOverridden) {
    overridesToSend[rowIndex] = true;
  }
});

// Send to backend
await API.post('/lacquer-plan/commit-import', {
  datesToImport: [{
    date: activeDate,
    rows: dateData.rows,
    replaceExisting: true,
    stockWarningOverrides: overridesToSend
  }]
});
```

---

### File: admin panel/src/pages/LacquerPlan/AddLacquerPlan.jsx

**Current Flow:**
1. Form with fields: Company, Brand, Bottle Name, Variant, Order Qty, etc.
2. On blur of Order Qty field, calculates `noOfBoxes` and checks for plain stock warning
3. Submit validates all fields, creates rows

**New Flow:**
1. Same form structure
2. **On Order Qty blur** (if plainBottleId selected):
   - Call API: `GET /lacquer-plan/validate-stock?bottleName=X&companyId=Y&orderQty=Z`
   - If response has `warning.hasWarning === true`:
     - Show inline warning UI below Order Qty field
     - Display: "⚠️ Order quantity (900) exceeds available stock (800 units available)"
     - Display breakdown: "Current Stock: 1000 | Allocated: 200 | Available: 800"
     - Show checkbox: "I understand the risk, create anyway"
   - Store warning in state: `stockWarning[index]`
3. **Form Submit Validation:**
   - For each row with `stockWarning` but `acknowledgeStockWarning !== true`:
     - Show error toast and prevent submit
4. **On Submit:**
   - For each row, include `stockWarningAcknowledged: (stockWarning && acknowledgeStockWarning)`
   - Send to backend `/lacquer-plan` (POST)
   - Backend will return error if warning not acknowledged

**State Additions:**
```javascript
const [stockWarnings, setStockWarnings] = useState({});  // { rowIndex: warning object }
const [acknowledgeStockWarning, setAcknowledgeStockWarning] = useState({});  // { rowIndex: boolean }
```

**New Handler: `handleOrderQtyBlur(index)`**
```javascript
const handleOrderQtyBlur = async (index) => {
  const row = rows[index];
  if (!row.bottleName || !row.companyId || !row.orderQty) return;

  try {
    const res = await API.get('/lacquer-plan/validate-stock', {
      params: {
        bottleName: row.bottleName,
        companyId: row.companyId,
        orderQty: row.orderQty
      }
    });

    if (res.data?.success && res.data.data?.hasWarning) {
      setStockWarnings(prev => ({
        ...prev,
        [index]: res.data.data
      }));
    } else {
      setStockWarnings(prev => {
        const updated = { ...prev };
        delete updated[index];
        return updated;
      });
    }
  } catch (err) {
    console.error("Stock validation failed", err);
  }
};
```

**Warning UI Component (below Order Qty field):**
```jsx
{stockWarnings[index] && (
  <div className="alert alert-warning mt-2 mb-3">
    <strong>⚠️ Warning:</strong> Order quantity ({stockWarnings[index].orderQty}) exceeds available stock ({stockWarnings[index].availableStock} units available)
    <div className="small mt-2">
      Current Stock: {stockWarnings[index].details.totalStock} | 
      Allocated: {stockWarnings[index].details.allocated} | 
      Available: {stockWarnings[index].availableStock}
    </div>
    <div className="form-check mt-3">
      <input 
        type="checkbox" 
        className="form-check-input"
        id={`ack_${index}`}
        checked={acknowledgeStockWarning[index] || false}
        onChange={(e) => setAcknowledgeStockWarning(prev => ({
          ...prev,
          [index]: e.target.checked
        }))}
      />
      <label className="form-check-label" htmlFor={`ack_${index}`}>
        I understand the risk, create anyway
      </label>
    </div>
  </div>
)}
```

**Submit Handler Validation:**
```javascript
// Before dispatch(createLacquerPlan(payload))
const hasUnacknowledgedWarnings = rows.some((row, idx) => {
  if (stockWarnings[idx] && !acknowledgeStockWarning[idx]) {
    return true;
  }
  return false;
});

if (hasUnacknowledgedWarnings) {
  return Swal.fire(
    'Error',
    'Please acknowledge all stock warnings before submitting.',
    'error'
  );
}

// Add acknowledgment flags to payload
payload.forEach((item, idx) => {
  if (stockWarnings[idx] && acknowledgeStockWarning[idx]) {
    item.stockWarningAcknowledged = true;
  }
});
```

---

### File: admin panel/src/pages/LacquerPlan/EditLacquerPlan.jsx

**Modifications:**
Same as AddLacquerPlan.jsx, with one key difference:

**Warning Trigger (Only on Qty Increase):**
```javascript
const handleOrderQtyBlur = async (index) => {
  const row = rows[index];
  const currentPlan = plans.find(p => p._id === row._id);
  
  if (!row.bottleName || !row.companyId || !row.orderQty) return;

  // ONLY trigger warning if orderQty is INCREASED
  const oldQty = currentPlan?.orderQty || 0;
  const newQty = row.orderQty || 0;
  
  if (newQty <= oldQty) {
    // No warning for decrease or unchanged
    setStockWarnings(prev => {
      const updated = { ...prev };
      delete updated[index];
      return updated;
    });
    return;
  }

  // Same validation call as Add
  try {
    const res = await API.get('/lacquer-plan/validate-stock', {
      params: {
        bottleName: row.bottleName,
        companyId: row.companyId,
        orderQty: newQty,
        excludeRowId: row._id  // Don't count this row in its own allocation
      }
    });

    if (res.data?.success && res.data.data?.hasWarning) {
      setStockWarnings(prev => ({
        ...prev,
        [index]: {
          ...res.data.data,
          oldQty: oldQty,
          newQty: newQty,
          delta: newQty - oldQty
        }
      }));
    } else {
      setStockWarnings(prev => {
        const updated = { ...prev };
        delete updated[index];
        return updated;
      });
    }
  } catch (err) {
    console.error("Stock validation failed", err);
  }
};
```

**Warning UI Component (Modified):**
```jsx
{stockWarnings[index] && (
  <div className="alert alert-warning mt-2 mb-3">
    <strong>⚠️ Warning:</strong> New order quantity ({stockWarnings[index].newQty}) exceeds available stock ({stockWarnings[index].availableStock} units available)
    <div className="small mt-2">
      Increasing from {stockWarnings[index].oldQty} to {stockWarnings[index].newQty} (delta: +{stockWarnings[index].delta})
    </div>
    <div className="small mt-2">
      Current Stock: {stockWarnings[index].details.totalStock} | 
      Allocated: {stockWarnings[index].details.allocated} | 
      Available: {stockWarnings[index].availableStock}
    </div>
    {/* Checkbox same as AddLacquerPlan */}
  </div>
)}
```

---

### File: admin panel/src/pages/LacquerPlan/LacquerPlan.jsx

**Current Display:** List view with rows showing order status

**New Display Additions:**

1. **Visual Indicator for Warning Rows:**
   - Add column or badge showing ⚠️ icon if `row.stockWarningAcknowledged === true`
   - Color the row (light yellow background)

2. **Tooltip/Hover Info:**
   - On hover of ⚠️ icon, show tooltip:
     ```
     ⚠️ Stock Warning Override
     Imported with 400 units over available stock
     Order: 900 qty | Available: 500 qty
     Acknowledged: 2024-01-15 14:30
     ```

**Implementation:**

```jsx
// In table row render:
{plan.stockWarningAcknowledged && (
  <span 
    className="badge bg-warning text-dark" 
    title={`Stock Warning: ${plan.stockWarningDetails?.overBy || '?'} units over available`}
  >
    ⚠️ Override
  </span>
)}

// Optional: Add tooltip on hover
<Tooltip 
  title={`Imported with stock warning.\n` +
         `Order: ${plan.orderQty} | Available: ${plan.stockWarningDetails?.availableStock}\n` +
         `Acknowledged: ${plan.acknowledgedAt ? new Date(plan.acknowledgedAt).toLocaleString() : 'N/A'}`}
>
  {/* warning badge */}
</Tooltip>
```

**Row Highlighting:**
```jsx
const rowClass = plan.stockWarningAcknowledged ? 'table-warning' : '';
<tr className={rowClass}>
  {/* row content */}
</tr>
```

---

## Backend API Changes

### New Endpoint: `GET /lacquer-plan/validate-stock`

**Query Parameters:**
- `bottleName` (string, required) - Plain bottle name
- `companyId` (string, required) - Company ID
- `orderQty` (number, required) - Quantity to validate
- `excludeRowId` (string, optional) - LacquerPlan row ID to exclude from allocation

**Response:**
```json
{
  "success": true,
  "data": {
    "hasWarning": boolean,
    "orderQty": number,
    "availableStock": number,
    "totalStock": number,
    "allocated": number,
    "overBy": number,
    "details": {
      "breakdown": {
        "lacquerPlans": number,
        "incomingPlan": number,
        "reserved": number
      }
    }
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "message": "Bottle not found or invalid parameters"
}
```

**Implementation:**
```javascript
exports.validateStockWarning = async (req, res) => {
  try {
    const { bottleName, companyId, orderQty, excludeRowId } = req.query;
    
    if (!bottleName || !companyId || orderQty === undefined) {
      return res.status(400).json({
        success: false,
        message: 'bottleName, companyId, and orderQty are required'
      });
    }

    const warning = await validateRowStockWarning(
      bottleName,
      companyId,
      Number(orderQty),
      excludeRowId
    );

    res.status(200).json({ success: true, data: warning });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
```

### Modified Endpoint: `POST /lacquer-plan` (createPlan)

**Additional Input Fields:**
- `stockWarningAcknowledged` (boolean, optional) - true if user acknowledged warning

**Existing Behavior:**
- Validates plan data
- Checks for duplicates
- Creates row

**New Behavior:**
- Check for stock warning before insert
- If warning exists and NOT acknowledged, return `STOCK_WARNING_REQUIRED` error
- If acknowledged, set `stockWarningAcknowledged: true`, `acknowledgedAt: now`, `stockWarningDetails: warning object`

### Modified Endpoint: `PUT /lacquer-plan/:id` (updatePlan)

**Additional Input Fields:**
- `stockWarningAcknowledged` (boolean, optional)

**New Behavior:**
- Only check stock warning if `orderQty` is increased
- If increased and warning exists and NOT acknowledged, return error
- If acknowledged, set warning metadata

### Modified Endpoint: `POST /lacquer-plan/preview-import`

**Response Changes:**
- Add `stockWarnings` array at top level
- For each date, add `okStockRows` and `warningStockRows` arrays
- Each row in `rows` array includes optional `stockWarning` object

### Modified Endpoint: `POST /lacquer-plan/commit-import`

**Input Changes:**
- Add `stockWarningOverrides: { rowIndex: boolean }` for each date

**Logic Changes:**
- Skip rows with warning unless overridden
- Log all overrides

---

## Test Scenarios & Verification

### Test Setup

Create test data in database:
- Plain Bottle: "PLASTIC 500ML" with total stock = 1000
- Plain Bottle: "GLASS 750ML" with total stock = 500
- Company: Test Company
- Multiple Lacquer Plans allocating stock to these bottles

**Current State:**
```
PLASTIC 500ML:
  Total Stock: 1000
  Allocated (existing LacquerPlans): 200
  Allocated (Incoming orders): 100
  Reserved: 0
  Available: 700

GLASS 750ML:
  Total Stock: 500
  Allocated: 500
  Available: 0
```

### Scenario (a): Normal Import (No Warning)

**Action:**
1. Create Excel with 1 row: PLASTIC 500ML, orderQty = 500
2. Upload and preview
3. Commit import

**Expected:**
- Preview shows row in "OK Stock" section
- No warning indicator
- Row imports successfully
- `stockWarningAcknowledged = false`

**Verification Command:**
```bash
curl http://localhost:3001/api/lacquer-plan?date=<today> | grep -i 'plastic 500'
```

---

### Scenario (b): Stock Warning Without Acknowledge (Form Blocked)

**Action:**
1. In AddLacquerPlan form:
2. Select: Company=Test, Bottle=PLASTIC 500ML, OrderQty=850
3. Blur from OrderQty field
4. See warning: "Order quantity (850) exceeds available stock (700 units available)"
5. Checkbox unchecked
6. Try to submit form

**Expected:**
- Warning displays below OrderQty field
- Submit button is blocked or form won't submit
- Error message: "Please acknowledge all stock warnings before submitting"

**Verification:**
- Form does not POST to backend
- No new LacquerPlan row is created

---

### Scenario (c): Stock Warning With Acknowledge (Imports With Flag)

**Action:**
1. Same as Scenario (b) but:
2. Check "I understand the risk, create anyway"
3. Submit form

**Expected:**
- Form submits
- Backend receives `stockWarningAcknowledged: true`
- Row is created with:
  - `stockWarningAcknowledged: true`
  - `acknowledgedAt: <timestamp>`
  - `stockWarningDetails: { orderQty: 850, availableStock: 700, overBy: 150, ... }`
- Row displays with ⚠️ indicator in list view

**Verification Commands:**
```bash
# Check row was created
curl http://localhost:3001/api/lacquer-plan?date=<today> | grep -i 'stock-warning-ack'

# Check audit log (if implemented)
curl http://localhost:3001/api/audit-log?action=stock-warning-override
```

---

### Scenario (d): Edit with Qty Increase (Warning Shown)

**Action:**
1. Open existing row: PLASTIC 500ML, orderQty = 500
2. Change orderQty to 900
3. Blur from OrderQty field
4. See warning: "Increasing from 500 to 900 (delta: +400) exceeds available stock (700)"
5. Check acknowledgment checkbox
6. Submit

**Expected:**
- Warning only displays when qty is increased (not on load)
- Delta is shown: "+400"
- Row updates with new orderQty = 900 and warning metadata

**Verification:**
- Row's `orderQty = 900`
- Row's `stockWarningAcknowledged = true`

---

### Scenario (e): Edit with Qty Decrease (No Warning)

**Action:**
1. Open row with orderQty = 500
2. Change to orderQty = 300
3. Blur from OrderQty field

**Expected:**
- No warning displayed (qty decreased)
- Row updates without warning metadata

**Verification:**
- Row's `orderQty = 300`
- Row's `stockWarningAcknowledged = false`

---

### Scenario (f): Excel Import with Mixed Rows (Both OK and Warning)

**Action:**
1. Create Excel with 3 rows:
   - Row 1: PLASTIC 500ML, qty=300 (OK)
   - Row 2: PLASTIC 500ML, qty=800 (Warning, over by 100)
   - Row 3: GLASS 750ML, qty=600 (Warning, over by 100)
2. Upload preview

**Expected:**
- Preview shows summary: "OK Stock: 1 row | Over Stock: 2 rows"
- OK Stock section: Row 1 only
- Over Stock section: Rows 2 & 3 with override checkboxes
- User can check override on Row 2 only
- Submit only imports Row 1 and Row 2, skips Row 3 (or allows individual override)

**Verification:**
- LacquerPlan shows 2 rows created if both checked, 1 if only Row 2 checked

---

### Scenario (g): Import Previous Plan with Warnings

**Action:**
1. Setup: Yesterday's plan has rows for PLASTIC 500ML (qty=500)
2. Today: Click "Import Previous Plan"
3. Select yesterday as source
4. Preview shows available stock is now 600 (100 less than yesterday)
5. Row shows warning (qty=500 but only 600 available after other allocations)
6. Check override and import

**Expected:**
- `importPreviousDay()` endpoint calculates stock based on TODAY's allocations
- Warning is shown in preview
- Row can be overridden
- Imported row has warning metadata

**Verification:**
- New row created with `importedFromDate = <yesterday>`
- Row has warning metadata

---

### Scenario (h): Stock Recalculation in Real-Time

**Action:**
1. Create row A: PLASTIC 500ML, qty=600 (no warning, available=700)
2. Create row B: PLASTIC 500ML, qty=200 (qty increases available to 500 allocated → available still 500)
3. Create row C: PLASTIC 500ML, qty=600
4. On blur of row C's orderQty:

**Expected:**
- Warning calculated on-the-fly based on current allocations
- Row C shows warning (600 > 500 available)
- Demonstrates real-time recalculation

**Verification:**
- API call to `/lacquer-plan/validate-stock` returns correct available stock

---

### Scenario (i): Completed Rows Don't Affect Available Stock

**Action:**
1. Create row A: PLASTIC 500ML, orderQty=500, coatingCompletedQty=500 (COMPLETED)
2. Create row B: PLASTIC 500ML, orderQty=600
3. On blur of row B's orderQty, check validation

**Expected:**
- Row A (completed) is NOT counted in allocation
- Available stock = totalStock - (otherAllocations) = 1000 - 100 - 0 = 900
- Row B (qty=600) shows NO warning (600 ≤ 900)

**Verification:**
- Backend query for allocation excludes rows where `coatingCompletedQty >= orderQty`
- No warning on row B

---

## Implementation Checklist

### Backend (Priority Order)

- [ ] 1. Add schema fields to LacquerPlan model (`stockWarningAcknowledged`, `acknowledgedAt`, `stockWarningDetails`)
  - **File:** `Backend/src/models/LacquerPlan.js`
  - **Verify:** npm run build (TypeScript/schema validation passes)

- [ ] 2. Implement `calculateAvailableStock()` helper function
  - **File:** `Backend/src/controllers/lacquerPlan.controller.js`
  - **Verify:** Unit test with mock data; console log output matches expected breakdown

- [ ] 3. Implement `validateRowStockWarning()` helper function
  - **File:** `Backend/src/controllers/lacquerPlan.controller.js`
  - **Verify:** Unit test; test all 3 cases (warning, no warning, edge cases)

- [ ] 4. Create new endpoint: `GET /lacquer-plan/validate-stock`
  - **File:** `Backend/src/controllers/lacquerPlan.controller.js`
  - **File:** `Backend/src/routes/lacquerPlan.routes.js`
  - **Verify:** curl request returns correct warning structure

- [ ] 5. Modify `previewImportExcel()` to calculate and return stock warnings
  - **File:** `Backend/src/controllers/lacquerPlan.controller.js`
  - **Verify:** Test Excel import; check response includes `stockWarnings` and `dates[...].okStockRows/warningStockRows`

- [ ] 6. Modify `commitImportExcel()` to accept and process `stockWarningOverrides`
  - **File:** `Backend/src/controllers/lacquerPlan.controller.js`
  - **Verify:** Test commit with overrides; rows imported correctly; audit logged

- [ ] 7. Modify `importPreviousDay()` to include stock warning flow
  - **File:** `Backend/src/controllers/lacquerPlan.controller.js`
  - **Verify:** Test import previous day; warning shown in preview; overrides respected

- [ ] 8. Modify `createPlan()` to validate stock warning before insert
  - **File:** `Backend/src/controllers/lacquerPlan.controller.js`
  - **Verify:** Test POST with warning not acknowledged (error returned); with acknowledged (row created)

- [ ] 9. Modify `updatePlan()` to validate stock warning only on qty increase
  - **File:** `Backend/src/controllers/lacquerPlan.controller.js`
  - **Verify:** Test PUT with qty increase/decrease; warning logic correct

### Frontend (Priority Order)

- [ ] 10. Modify `ImportExcelModal.jsx` to display OK and warning stock sections
  - **File:** `admin panel/src/pages/LacquerPlan/ImportExcelModal.jsx`
  - **Verify:** Upload Excel; see separate sections; override checkbox works

- [ ] 11. Modify `AddLacquerPlan.jsx` to show inline warning on Order Qty blur
  - **File:** `admin panel/src/pages/LacquerPlan/AddLacquerPlan.jsx`
  - **Verify:** Enter bottle and order qty; blur; see warning; acknowledge; submit

- [ ] 12. Modify `EditLacquerPlan.jsx` to show warning only on qty increase
  - **File:** `admin panel/src/pages/LacquerPlan/EditLacquerPlan.jsx`
  - **Verify:** Edit row; increase qty; see warning; decrease qty; no warning

- [ ] 13. Modify `LacquerPlan.jsx` list view to show ⚠️ indicator for warning rows
  - **File:** `admin panel/src/pages/LacquerPlan/LacquerPlan.jsx`
  - **Verify:** List shows rows with warnings highlighted; hover tooltip displays details

### Testing (Priority Order)

- [ ] 14. Test Scenario (a): Normal import (no warning)
- [ ] 15. Test Scenario (b): Stock warning without acknowledge (form blocked)
- [ ] 16. Test Scenario (c): Stock warning with acknowledge (imports with flag)
- [ ] 17. Test Scenario (d): Edit with qty increase (warning shown)
- [ ] 18. Test Scenario (e): Edit with qty decrease (no warning)
- [ ] 19. Test Scenario (f): Excel import with mixed rows (both OK and warning)
- [ ] 20. Test Scenario (g): Import Previous Plan with warnings
- [ ] 21. Test Scenario (h): Real-time stock recalculation
- [ ] 22. Test Scenario (i): Completed rows don't affect available stock
- [ ] 23. Cross-feature integration test (import + edit + list view together)

---

## Risk Mitigation & Traps Avoided

### Trap 1: Double-Counting Allocations
**Mitigation:** `calculateAvailableStock()` queries LacquerPlan directly, not from PlainBottleStock deduction field. PlainBottleStock is only updated when rows complete (stock return).

### Trap 2: Historical vs Current Stock
**Mitigation:** All calculations use TODAY's date boundary (`new Date().setUTCHours(0,0,0,0)`). Import previews use current date's allocations, not future predictions.

### Trap 3: Completed Rows Blocking Calculation
**Mitigation:** Query explicitly excludes rows where `coatingCompletedQty >= orderQty && coatingCompletedQty > 0`.

### Trap 4: Stock Becomes Negative
**Mitigation:** `available = MAX(totalStock - allocated, 0)`. Never returns negative.

### Trap 5: Race Condition During Import
**Mitigation:** Stock recalculated at COMMIT time (not preview time). If allocation changed between preview and commit, row is still validated.

### Trap 6: Incoming Plan Changes During Import
**Mitigation:** Same as Trap 5. Commit-time recalculation catches incoming orders added after preview.

### Trap 7: User Overrides, Then Edits Row
**Mitigation:** Override flag is per-instance, not blanket. On every edit, stock is re-validated. If new qty further exceeds stock, new warning is triggered.

---

## Verification Commands (Dev Environment)

```bash
# Test calculateAvailableStock helper
curl -X GET "http://localhost:3001/api/lacquer-plan/validate-stock?bottleName=PLASTIC%20500ML&companyId=<id>&orderQty=600"

# Test Excel import preview with warnings
curl -X POST -F "file=@test.xlsx" "http://localhost:3001/api/lacquer-plan/preview-import"

# Test create plan with warning
curl -X POST "http://localhost:3001/api/lacquer-plan" \
  -H "Content-Type: application/json" \
  -d '{"bottleName":"PLASTIC 500ML","orderQty":900,"stockWarningAcknowledged":true}'

# Test update plan with warning
curl -X PUT "http://localhost:3001/api/lacquer-plan/<id>" \
  -H "Content-Type: application/json" \
  -d '{"orderQty":900,"stockWarningAcknowledged":true}'
```

---

## Handoff Notes

- This plan is ready for implementation by a coding agent
- All file paths are absolute and correct for the workspace
- Backend and frontend can be developed in parallel (independent features)
- Stock calculation logic is isolated in helper functions for testability
- Frontend components should follow existing patterns (Swal for alerts, Bootstrap for styling)
- All test scenarios must pass before marking complete
- Audit logging can be added later (not critical for MVP)

---

## Success Criteria (Final Verification)

✅ Stock warning triggers when orderQty > availableStock  
✅ Preview shows OK and warning rows separately  
✅ User can override individual rows with acknowledgment checkbox  
✅ Form validation blocks submission without acknowledgment (Add/Edit)  
✅ Warning only triggers on qty increase (Edit), not decrease  
✅ Available stock recalculated at preview and commit time  
✅ Completed rows excluded from stock allocation  
✅ Both import paths (Excel, Previous Plan) use same logic  
✅ Stock warning record stored with acknowledgment details  
✅ All test scenarios (a)–(i) pass  
✅ No git commands used during implementation  
✅ Complete verification and test results provided  
