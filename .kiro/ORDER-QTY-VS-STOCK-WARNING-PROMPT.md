# Lacquer Plan: Test & Implement Order-Qty vs Stock Warning

**Status:** Ready for Implementation

**Prerequisites:**
- Completed-Row Filter workflow (prior task) must be completed
- 5-file backup will be created before this work begins
- No other agents should be editing lacquerPlan.controller.js or related UI components during this task

---

## Goal

Implement and test a **warning system** that alerts users when they attempt to import or create Lacquer Plan rows where **orderQty exceeds available live plain stock**. The warning should:

1. Prevent accidental over-ordering
2. Display in both Excel import preview and single-row creation/edit flows
3. Provide the user with current stock levels
4. Allow optional override ("Import anyway") if the over-order is intentional
5. Log the override for audit trail

The system must check **live plain stock** from the stock table (not historical data, not lacquer coating stock).

---

## Definition: "Stock Warning Trigger"

A row triggers a **stock warning** when:
- **orderQty > availableLiveStock** (for that Plain Bottle)
- Available Live Stock = Total Stock − (Allocated to Earlier/Today's Plans + Orders in Transit + Reserved)
- Warning applies to **new imports** and **edited existing rows** where orderQty is increased

**Examples:**
- ✅ Plain Bottle PLASTIC 500ML has 800 units in stock, orderQty = 500 → **NO warning** (500 ≤ 800)
- ⚠️ Plain Bottle PLASTIC 500ML has 800 units in stock, orderQty = 900 → **WARNING** (900 > 800)
- ⚠️ Plain Bottle PLASTIC 500ML has 800 units available (after prior allocations), orderQty = 850 → **WARNING** (850 > 800 available)
- ⚠️ Plain Bottle PLASTIC 500ML has 0 units in stock, orderQty = 1 → **WARNING** (1 > 0)

---

## Stock Calculation

### Live Plain Stock Formula
```
Available Live Stock = Total Stock − Allocated
Where:
  Total Stock = Current inventory of Plain Bottle (from plain_stock table)
  Allocated = Sum of all orderQty in active Lacquer Plans for that Plain Bottle
            + On-order quantities from Incoming Plan
            + Reserved quantities (if applicable)
```

### Allocation Tracking
- Count **all active Lacquer Plans** (status != 'cancelled', 'completed', or archived)
- Count **current date and future dates only** (date >= TODAY)
- Count **Incoming Plan rows** for that Plain Bottle (active status)
- **Exclude** rows that are marked as completed (coatedQty ≥ orderQty)

### Important: Daily Recalculation
Stock availability changes as:
- Lacquer Plans are created/edited/deleted
- Incoming Plan rows are added/removed
- New day begins (date-based boundaries shift)
- Rows transition from incomplete to completed

The warning must use **current calculation** at the moment of import/create/edit, not cached values.

---

## Warning Display Locations

### Location 1: Excel Import Preview
**File:** `ImportExcelModal.jsx` (frontend)

**Behavior:**
- After parsing Excel and filtering completed rows
- Calculate available stock for each importable row's Plain Bottle
- Group rows by stock warning status:
  - ✅ **OK Stock:** rows where orderQty ≤ available stock
  - ⚠️ **Low/No Stock:** rows where orderQty > available stock

**Display:**
```
Parsed: N | Skipped (Completed): M | Importable: K

[Table of OK Stock Rows]
  Company | Plain Bottle | Brand | Variant | Shade | Order Qty | Available Stock | Status
  ...

[SEPARATOR]

⚠️ WARNING: X rows exceed available stock
[Table of Low/No Stock Rows]
  Company | Plain Bottle | Brand | Variant | Shade | Order Qty | Available Stock | ⚠️ Over By
  ...
  [Checkbox] Import anyway (acknowledge risk)
```

**User Action:**
- If checkbox is checked for a row, import it despite warning
- If not checked, exclude it from import (treated like a skipped row)
- Show summary: "Y rows will import with low stock warning"

### Location 2: Single Row Creation (Add Lacquer Plan)
**File:** `AddLacquerPlan.jsx` (frontend)

**Behavior:**
- When user fills in orderQty field and moves focus away
- Calculate available stock for selected Plain Bottle
- If orderQty > available stock, show inline warning

**Display:**
```
Order Qty: [Input field]

⚠️ WARNING: Order quantity (900) exceeds available stock (800 units available)
Current Stock: 1000 | Allocated: 200 | Available: 800
[Checkbox] I understand the risk, import anyway
```

**User Action:**
- If checkbox checked, allow form submission
- If not checked, show error state (form can't submit)

### Location 3: Single Row Edit (Edit Lacquer Plan)
**File:** `EditLacquerPlan.jsx` (frontend)

**Behavior:**
- Same as Location 2
- Only trigger if orderQty is **increased** from current value
- If orderQty is decreased or unchanged, no warning needed

**Display:**
```
Order Qty: [Input field showing 500, user changes to 900]

⚠️ WARNING: New order quantity (900) exceeds available stock (800 units available)
Current Stock: 1000 | Allocated: 200 | Available: 800
Increasing from 500 to 900 (delta: +400)
[Checkbox] I understand the risk, update anyway
```

**User Action:**
- Same as Location 2

### Location 4: List View Context Menu
**File:** `LacquerPlan.jsx` (frontend)

**Behavior (Optional Audit Display):**
- When user hovers over or clicks a row marked with ⚠️ stock warning icon
- Show tooltip or small modal with:
  - Current order quantity
  - Available stock at time of import
  - Override status (if acknowledged)

---

## Backend Implementation (lacquerPlan.controller.js)

### Function 1: calculateAvailableStock(plainBottleId, excludeDate = null)
```
Purpose: Get live available stock for a Plain Bottle
Input:
  - plainBottleId: ID of the Plain Bottle
  - excludeDate: (optional) date to exclude from allocation count (for re-imports)
Returns:
  {
    totalStock: number,
    allocated: number,
    available: number,
    breakdown: {
      lacquerPlans: number,
      incomingPlan: number,
      reserved: number
    }
  }

Logic:
1. Query plain_stock table → totalStock
2. Sum all lacquerPlan rows for plainBottleId where:
   - date >= TODAY
   - status NOT IN (cancelled, completed, archived)
   - coatedQty < orderQty (incomplete rows only)
   - Add to allocated
3. Sum incomingPlan rows for plainBottleId where:
   - status = active
   - Add to allocated
4. Query reserved table if exists → add to allocated
5. available = totalStock - allocated
6. Return object with breakdown
```

### Function 2: validateRowStockWarning(plainBottleId, orderQty, excludeRowId = null)
```
Purpose: Check if row order exceeds available stock
Input:
  - plainBottleId: ID of the Plain Bottle
  - orderQty: quantity being ordered
  - excludeRowId: (optional) current row ID to exclude from allocation calc (for edit mode)
Returns:
  {
    hasWarning: boolean,
    orderQty: number,
    availableStock: number,
    overBy: number,
    details: {
      totalStock: number,
      allocated: number,
      breakdown: {...}
    }
  }

Logic:
1. If excludeRowId provided, subtract that row's orderQty from allocated
2. stock = calculateAvailableStock(plainBottleId)
3. hasWarning = orderQty > stock.available
4. overBy = Math.max(0, orderQty - stock.available)
5. Return object
```

### Function 3: previewImportExcel (modified)
**Current:** Returns `{ parsed, skipped, importable, skippedRows }`
**New:** Also include stock warnings

```
Returns:
  {
    parsed: N,
    skipped: M,
    importable: K,
    skippedRows: [...],
    stockWarnings: [
      {
        rowIndex: number,
        plainBottleId: string,
        plainBottleName: string,
        orderQty: number,
        availableStock: number,
        overBy: number,
        importAnyway: false  // user can set to true
      }
    ],
    okStockRows: [...],
    warningStockRows: [...]
  }
```

### Function 4: commitImportExcel (modified)
**New:** Accept override list for stock warnings

```
Input:
  {
    ...existing params,
    stockWarningOverrides: {
      rowIndex: boolean  // true = import anyway despite warning
    }
  }

Logic:
1. Filter skipped rows (as before for completion)
2. For each remaining row, check stock warning
3. If stock warning exists AND NOT in overrides AND override not true → skip it
4. If stock warning exists AND in overrides AND override = true → import it (log override)
5. If no warning OR warning overridden → import normally
6. Return:
   {
     imported: N,
     skipped: M,
     stockWarningOverridden: K,
     result: { imported rows }
   }
```

### Function 5: importPreviousDay (modified)
**Current:** Filters completed rows
**New:** Also filters for stock warnings

```
Same as previewImportExcel + commitImportExcel flow:
1. Get previous day's rows
2. Filter completed rows
3. Calculate stock warnings for each remaining row
4. Return preview with warnings
5. After user confirms, apply stock warning overrides
6. Import rows
```

### Function 6: addLacquerPlan / editLacquerPlan (modified)
**New:** Validate before creating/updating

```
Before saving row:
1. Call validateRowStockWarning(plainBottleId, orderQty)
2. If hasWarning = true AND request.body.acknowledgeStockWarning !== true:
   - Return error: { code: 'STOCK_WARNING', warning: {...}, requiresAcknowledge: true }
3. If hasWarning = true AND acknowledgeStockWarning = true:
   - Save row with metadata: { stockWarningAcknowledged: true, acknowledgedAt: timestamp }
4. If no warning:
   - Save row normally
```

---

## Frontend Implementation

### ImportExcelModal.jsx (modified)
```
State additions:
  - stockWarnings: array
  - stockWarningOverrides: object (rowIndex → boolean)

Display logic:
1. Show preview counts: "Parsed N | Skipped M | Importable K"
2. Split rows into two groups:
   - OK Stock (green indicator)
   - Low/No Stock (yellow/red indicator with override checkbox)
3. For each low stock row:
   - Show Plain Bottle, Brand, Variant, Shade
   - Show Order Qty vs Available Stock
   - Show "Over by X units"
   - Checkbox: "Import anyway (acknowledge risk)"
4. Summary: "Y rows will import with acknowledged stock warnings"
5. Commit button disabled unless all warnings either:
   - Have override checkbox checked, OR
   - Don't exist (filtered out earlier)

On commit:
  - Send stockWarningOverrides to backend
  - Backend validates and imports
```

### AddLacquerPlan.jsx (modified)
```
State additions:
  - orderQty: number
  - stockWarning: object | null
  - acknowledgeStockWarning: boolean

Handlers:
  - onOrderQtyChange: 
    1. Update orderQty state
    2. If plainBottleId selected: call API validateRowStockWarning()
    3. If warning returned: set stockWarning state
  - onOrderQtyBlur:
    1. If stockWarning exists: display warning UI
  - onCheckboxChange (acknowledge):
    1. Set acknowledgeStockWarning state

Display:
  - Below Order Qty input field:
    ```
    ⚠️ WARNING: [Text]
    Current Stock: X | Allocated: Y | Available: Z
    [Checkbox] I understand the risk
    ```
  - Submit button enabled only if:
    - orderQty > 0 AND
    - (!stockWarning OR acknowledgeStockWarning = true)

On submit:
  - Send acknowledgeStockWarning in request body
  - Show success/error message
```

### EditLacquerPlan.jsx (modified)
```
Same as AddLacquerPlan.jsx, but:
  - Only show warning if orderQty is INCREASED (newOrderQty > currentOrderQty)
  - Display delta: "Increasing from X to Y (delta: +Z)"
  - No warning if orderQty decreased or unchanged
```

### LacquerPlan.jsx (modified)
```
List view changes:
  - Add visual indicator (⚠️) to rows with acknowledged stock warnings
  - Show row color: yellow/orange for stock warning rows
  - On hover/click: show tooltip with stock details
    "Imported with 400 units over available stock (900 qty vs 500 available)"
```

---

## Test Data & Scenarios

### Test Setup
Create Lacquer Plan rows with these Plain Bottles:

| Plain Bottle | Total Stock | Current Allocated | Available |
|--------------|-------------|-------------------|-----------|
| PLASTIC 500ML | 1000 | 200 | 800 |
| GLASS 750ML | 500 | 500 | 0 |
| PLASTIC 1L | 2000 | 1500 | 500 |

### Test Scenarios

| Scenario | Action | Order Qty | Available | Expected |
|----------|--------|-----------|-----------|----------|
| **(a)** | Create row | 500 | 800 | ✅ No warning, import normally |
| **(b)** | Create row | 850 | 800 | ⚠️ Warning, over by 50 units |
| **(c)** | Create row + acknowledge | 850 | 800 | ✅ Import with override flag |
| **(d)** | Create row, no acknowledge | 900 | 800 | ❌ Form can't submit, error |
| **(e)** | Edit row, increase qty | 600→900 | 800 | ⚠️ Warning, over by 100 units |
| **(f)** | Edit row, decrease qty | 600→400 | 800 | ✅ No warning (decreasing) |
| **(g)** | Import Excel, mixed stock | Various | Various | ✅ Show both OK and warning rows, allow selective override |
| **(h)** | Import Excel, all rows over stock | Various | Various | ✅ All rows show warning, user can override all or cancel |
| **(i)** | Import Previous Plan + stock warning | 900 | 800 | ✅ Show preview with warning, allow override before import |

---

## Testing Workflow

### Phase 1: Setup & Preparation
1. Create backup of files:
   - Backend/src/controllers/lacquerPlan.controller.js
   - admin panel/src/pages/LacquerPlan/AddLacquerPlan.jsx
   - admin panel/src/pages/LacquerPlan/EditLacquerPlan.jsx
   - admin panel/src/pages/LacquerPlan/ImportExcelModal.jsx
   - admin panel/src/pages/LacquerPlan/LacquerPlan.jsx

2. Verify test data:
   - Create Plain Bottles with known stock levels
   - Create Lacquer Plan rows to establish allocations
   - Verify stock calculations are accurate

### Phase 2: Implement Backend Functions
1. **calculateAvailableStock()** in lacquerPlan.controller.js
   - Query plain_stock table
   - Sum allocated from active Lacquer Plans (incomplete only)
   - Sum allocated from Incoming Plan
   - Return breakdown object

2. **validateRowStockWarning()** in lacquerPlan.controller.js
   - Call calculateAvailableStock()
   - Compare orderQty vs available
   - Return warning object with details

3. **Modify previewImportExcel()** and **commitImportExcel()**
   - Add stock warning calculation
   - Filter based on overrides
   - Return warning details in preview
   - Log overrides in commit

4. **Modify importPreviousDay()**
   - Same stock warning flow as Excel import

5. **Modify addLacquerPlan() / editLacquerPlan()**
   - Validate stock warning before save
   - Require acknowledgment flag
   - Log warning acknowledgment

### Phase 3: Implement Frontend Components
1. **ImportExcelModal.jsx**
   - Parse stock warnings from preview response
   - Display two sections: OK Stock | Low Stock
   - Show override checkboxes
   - Send overrides on commit

2. **AddLacquerPlan.jsx**
   - Add Order Qty input handler
   - Call stock validation API on blur
   - Display warning UI with checkbox
   - Disable submit until warning acknowledged

3. **EditLacquerPlan.jsx**
   - Same as Add, but only warn on increase
   - Show delta in warning message

4. **LacquerPlan.jsx**
   - Add ⚠️ indicator to rows with warnings
   - Add hover tooltip with stock details

### Phase 4: Test with Scenarios (a)–(i)
1. **Start backend & frontend**

2. **Scenario (a): Normal import (no warning)**
   - Create row: PLASTIC 500ML, orderQty = 500
   - Expected: No warning, row saves
   - Verify: Row appears in list without ⚠️ indicator

3. **Scenario (b): Stock warning (no acknowledge)**
   - Try to create row: PLASTIC 500ML, orderQty = 850
   - Expected: Warning shown, form can't submit
   - Verify: Error message clear, user can't proceed

4. **Scenario (c): Stock warning + acknowledge**
   - Create row: PLASTIC 500ML, orderQty = 850
   - Check "I understand the risk"
   - Expected: Row saves with acknowledgment
   - Verify: Row appears in list with ⚠️ indicator

5. **Scenario (d): Edit with increase**
   - Edit existing row from 600 to 900 qty
   - Expected: Warning shown, only appears if qty increased
   - Verify: No warning if qty decreased in same edit

6. **Scenario (e): Excel import (mixed)**
   - Create test Excel with rows having various quantities
   - Import to day with known stock levels
   - Expected: Preview shows OK and warning sections
   - Verify: Can override individual rows

7. **Scenario (f): Import Previous Plan**
   - Setup day D with various rows
   - On day D+1, click "Import Previous Plan" → select D
   - Expected: Preview shows stock warnings (same as Excel)
   - Verify: Can override before import

8. **Scenario (g): Stock changes during planning**
   - Create row (a) with no warning
   - Add incoming order (new plan) allocating more stock
   - Create row (b) → now shows warning
   - Expected: Available stock recalculated in real time

9. **Scenario (h): Completed row doesn't affect stock**
   - Create row with orderQty = 1000, coatedQty = 1000 (completed)
   - Create new row with same Plain Bottle
   - Expected: Completed row NOT counted in allocation
   - Verify: New row's available stock doesn't include completed row's allocation

---

## Data Structure: Stock Warning Record

### In Database (add field to lacquerPlan table)
```sql
ALTER TABLE lacquerPlan ADD COLUMN (
  stockWarningAcknowledged BOOLEAN DEFAULT FALSE,
  acknowledgedAt TIMESTAMP DEFAULT NULL,
  stockWarningDetails JSON DEFAULT NULL
);

Where stockWarningDetails = {
  orderQty: number,
  availableStock: number,
  overBy: number,
  totalStock: number,
  allocated: number
}
```

### In Request/Response
```json
{
  "warning": {
    "hasWarning": true,
    "orderQty": 900,
    "availableStock": 800,
    "overBy": 100,
    "details": {
      "totalStock": 1000,
      "allocated": 200,
      "breakdown": {
        "lacquerPlans": 100,
        "incomingPlan": 100,
        "reserved": 0
      }
    }
  },
  "requiresAcknowledge": true
}
```

---

## Known Traps (Handle These)

### Trap 1: Double-Counting Allocations
**Problem:** A row's orderQty counted twice (once in plain_stock allocation, once in lacquerPlan allocation).

**Solution:** Query allocation from lacquerPlan table only, not from both sources. Update plain_stock only when Lacquer Plan completes (coatedQty → stock return).

### Trap 2: Historical vs Current Stock
**Problem:** Using previous day's stock levels instead of current.

**Solution:** Always calculate from TODAY's data. If import is for future date D, still use TODAY's allocations (don't predict future).

### Trap 3: Completed Rows Blocking Calculation
**Problem:** Completed rows (coatedQty ≥ orderQty) still count toward allocation, making available stock too low.

**Solution:** Exclude completed rows from allocation query:
```
WHERE coatedQty < orderQty
```

### Trap 4: Stock Becomes Negative
**Problem:** Available stock calculation returns negative number instead of 0.

**Solution:** Always return `MAX(available, 0)` and note when stock is over-allocated.

### Trap 5: Race Condition During Import
**Problem:** Two concurrent imports both see 500 available stock, both import 600, total allocation becomes 1100 (over).

**Solution:** At commit time (not preview time), re-validate stock. If allocation has changed, either:
- Show warning again (ask user to confirm), OR
- Reduce import qty automatically

For this task, recommend: **preview is informational, commit is definitive**. Recalculate at commit.

### Trap 6: Incoming Plan Changes During Import
**Problem:** Incoming order added after preview but before commit, stock availability changes.

**Solution:** Recalculate at commit time (see Trap 5).

### Trap 7: User Overrides Stock Warning, Then Edits Row
**Problem:** Row created with override, user edits and increases qty further, warning not re-triggered.

**Solution:** On every edit, re-validate stock. Override flag is per-instance, not blanket.

---

## Verification Checklist

### Phase 1: Backend Implementation
- [ ] `calculateAvailableStock()` function exists and tested with known data
- [ ] `validateRowStockWarning()` function returns correct warning object
- [ ] `previewImportExcel()` includes stock warnings in response
- [ ] `commitImportExcel()` accepts and processes overrides
- [ ] `importPreviousDay()` includes stock warning flow
- [ ] `addLacquerPlan()` validates and requires acknowledgment
- [ ] `editLacquerPlan()` only warns on qty increase
- [ ] Stock calculations exclude completed rows
- [ ] Stock calculations use TODAY's date boundary

### Phase 2: Frontend Implementation
- [ ] `ImportExcelModal.jsx` displays OK and warning sections separately
- [ ] Override checkboxes work (state persists, sent to backend)
- [ ] `AddLacquerPlan.jsx` shows warning on Order Qty blur
- [ ] Acknowledgment checkbox blocks form submission
- [ ] `EditLacquerPlan.jsx` only warns on qty increase
- [ ] `LacquerPlan.jsx` shows ⚠️ indicator on warning rows
- [ ] Tooltip displays stock details on hover

### Phase 3: Testing
- [ ] Scenario (a): No warning for normal quantity ✅
- [ ] Scenario (b): Warning for over-order, no submit ✅
- [ ] Scenario (c): Can override and import with warning ✅
- [ ] Scenario (d): Form error without acknowledgment ✅
- [ ] Scenario (e): Edit warning only on increase ✅
- [ ] Scenario (f): Excel import shows mixed rows ✅
- [ ] Scenario (g): Import Previous Plan shows warnings ✅
- [ ] Scenario (h): Stock recalculates in real time ✅
- [ ] Scenario (i): Completed rows don't affect stock ✅

### Phase 4: Audit & Documentation
- [ ] Code changes table: files, functions, line numbers
- [ ] Screenshots: import preview with warnings, form validation
- [ ] Test results: all scenarios passed
- [ ] Data structure: database schema changes documented
- [ ] Sync verification: no unintended side effects on other plans
- [ ] Git status: only 5 files modified (no git commands used)

---

## Files to Modify

1. **Backend/src/controllers/lacquerPlan.controller.js**
   - Add `calculateAvailableStock()`
   - Add `validateRowStockWarning()`
   - Modify `previewImportExcel()`
   - Modify `commitImportExcel()`
   - Modify `importPreviousDay()`
   - Modify `addLacquerPlan()`
   - Modify `editLacquerPlan()`

2. **admin panel/src/pages/LacquerPlan/ImportExcelModal.jsx**
   - Update preview display with stock warnings
   - Add override checkboxes
   - Update commit handler

3. **admin panel/src/pages/LacquerPlan/AddLacquerPlan.jsx**
   - Add stock validation on Order Qty change
   - Display warning UI
   - Add acknowledgment checkbox
   - Block submit until acknowledged

4. **admin panel/src/pages/LacquerPlan/EditLacquerPlan.jsx**
   - Same as Add, but only warn on qty increase

5. **admin panel/src/pages/LacquerPlan/LacquerPlan.jsx**
   - Add ⚠️ indicator to rows
   - Add hover tooltip

---

## Constraints

- ❌ **No git commands** (no commit, stash, checkout, restore, reset, clean)
- ❌ **Don't modify:** Printing Plan, Incoming Plan, Dispatch Plan, plain_stock calculation
- ✅ **Do modify:** Only the 5 files listed above
- ✅ **Create backup first** (5 files)
- ✅ **Use real test data** (from database or provided Excel)
- ✅ **Log all overrides** for audit trail

---

## Success Criteria

1. ✅ Stock warning triggers when orderQty > availableStock
2. ✅ Preview shows OK and warning rows separately
3. ✅ User can override individual rows with acknowledgment checkbox
4. ✅ Form validation blocks submission without acknowledgment (Add/Edit)
5. ✅ Warning only triggers on qty increase (Edit), not decrease
6. ✅ Available stock recalculated at preview and commit time
7. ✅ Completed rows excluded from stock allocation
8. ✅ Both import paths (Excel, Previous Plan) use same logic
9. ✅ Stock warning record stored with acknowledgment details
10. ✅ All test scenarios (a)–(i) pass
11. ✅ No git commands used
12. ✅ Complete verification and test results provided

---

## Handoff Notes

This task builds on the completed-row filter workflow. Stock warnings and completed-row filtering are orthogonal:
- **Completed filter:** Prevents re-importing already-finished rows
- **Stock warning:** Prevents over-ordering beyond available inventory

Both apply independently during import. A row can be:
- Completed (skip) → not shown in warning section
- Over-stock but not completed → shown in warning section
- Under-stock and incomplete → shown in OK section

The stock warning system must coexist cleanly with the completed-row filter without double-filtering or side effects.

**Ready: YES** ✅
