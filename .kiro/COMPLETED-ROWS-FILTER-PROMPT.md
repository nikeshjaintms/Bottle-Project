# Lacquer Plan: Test & Implement Completed-Row Filter for Import

**Status:** Ready for Next Workflow (after rebuild wf_021c8a359507a68e completes)

**Prerequisites:**
- Rebuild workflow (wf_021c8a359507a68e) must be completed
- 5-file backup will be created before this work begins
- No other agents should be editing lacquerPlan.controller.js or ImportExcelModal.jsx during this task

---

## Goal

Test and verify that completed rows are **not imported** into later days via both import paths (Excel import and Import Previous Plan). A completed row is one where **coatedQty ≥ orderQty** (Balance to Make ≥ 0).

The audit already found completion-checking code (`isPlanRowCompleted`, `getCompletedCombinationsSet`, `getPlanCombinationKeys`) but with inconsistent completion clauses in different places. Unify them, use real test data, and verify the behavior works end-to-end.

---

## Definition: "Completed"

A row is **completed** when:
- **coatedQty ≥ orderQty** with **orderQty > 0**
- Balance to Make = Coated − Order ≥ 0
- Examples:
  - ✅ Coated 1000, Order 1000 → Balance 0 → **COMPLETED**
  - ✅ Coated 1200, Order 1000 → Balance 200 → **COMPLETED** (over-completion)
  - ❌ Coated 100, Order 1000 → Balance −900 → **NOT completed**
  - ❌ Coated 0, Order 0 → **NOT completed** (no valid order)
  - ❌ Coated 0, Order 100 → Balance −100 → **NOT completed**

---

## Import Behavior

### Rule 1: Single Row Identity
Row identity = **company + Plain Bottle + brand + variant + coating shade**

Example: **ABC Co., PLASTIC 500ML (Plain Bottle), BEARDO brand, VAR1 variant, TR RED shade**

When a row is completed today, that exact combination doesn't import tomorrow.

### Rule 2: Bottle-Level Skipping
If **every row** of a Plain Bottle (within a company) would be skipped as completed, the **entire Plain Bottle** is skipped—no empty group, no stock-only row.

Example: ABC Co. has only BEARDO PLASTIC 500ML and it's completed → Plain Bottle doesn't appear tomorrow at all.

### Rule 3: Partial Bottle Skipping
If a Plain Bottle has multiple brands/variants and only some are completed, only the incomplete ones import.

Example: ABC Co. PLASTIC 500ML has BEARDO (completed) and MAJESTIC (incomplete) → tomorrow only MAJESTIC appears.

### Rule 4: Both Import Paths
- **Excel Import** (previewImportExcel / commitImportExcel)
- **Import Previous Plan** (importPreviousDay)

Both must apply the same completed-row filter in both preview and commit stages.

### Rule 5: No Printing Rows for Skipped Lacquer Rows
The Lacquer → Printing sync (`syncPrintingPlanForLacquerPlan`) must NOT run for rows that are skipped as completed.

### Rule 6: Completion Lookup
Compare against the **most recent earlier occurrence** of the row's combination (dates before the target date). Skip only if that earlier one is completed.

Do NOT skip based on a completed row from a later date or the same target date.

---

## Known Traps (Handle These)

### Trap 1: "0 of 0 Rows" Problem
An earlier version made imports show 0 rows, requiring a revert. Fix this:
1. Parse the Excel file first
2. **Then** apply the completed-row filter to parsed rows
3. Show three separate numbers in preview:
   - **Parsed:** N (total rows extracted from Excel)
   - **Skipped (completed):** M (rows filtered out)
   - **Importable:** K = N − M

If completion lookup fails (DB error), **don't silently drop rows**: show all rows with a warning.

### Trap 2: Shade Spelling Variants
Data may have inconsistent formatting in `coatingShade`: `TR .BROWN`, `TR.BROWN`, `TR BROWN`, `TR BLACK + RED` vs `TR BLACK+RED`.

**Solution:** Normalize the combination key consistently (case, spaces, dots, plus signs) on both storage and comparison sides. A completed row must still match its original.

The key should normalize: company + Plain Bottle + brand + variant + coatingShade (normalized)

### Trap 3: Genuinely New Order After Completion
A real re-order for the same combination on a later date should NOT be skipped.

**Solution:** In the preview, list skipped rows with:
- Reason: "Completed on <date>"
- Per-row **"Import anyway"** checkbox

User can manually override if it's a new order.

### Trap 4: Don't Skip by Wrong Date Context
- **Skip:** Row completed on DATE < TARGET_DATE
- **Don't skip:** Row completed on DATE = TARGET_DATE or DATE > TARGET_DATE

---

## Test Data

Use **real Lacquer import Excel** from the repo (if not present, ask the user; don't invent one).

On a test date D, create a plan with all these scenarios:

| Scenario | Setup | Expected Result |
|----------|-------|---|
| **(a)** | Row: coated = order exactly (e.g., 1000, 1000) | ❌ **Don't import** to D+1 |
| **(b)** | Row: over-completed (e.g., coated 1200, order 1000) | ❌ **Don't import** to D+1 |
| **(c)** | Row: partially coated (e.g., coated 100, order 1000) | ✅ **Do import** to D+1 |
| **(d)** | Row: zero coated (e.g., coated 0, order 100) | ✅ **Do import** to D+1 |
| **(e)** | Plain Bottle: only one row and it's completed | ❌ **Plain Bottle doesn't appear** at all in D+1 |
| **(f)** | Plain Bottle: two brands, one completed (BEARDO), one incomplete (MAJESTIC) | ✅ **Only incomplete brand** (MAJESTIC) imports to D+1 |

---

## Testing Workflow

### Phase 1: Setup & Preparation
1. Create backup of 5 Lacquer files:
   - Backend/src/controllers/lacquerPlan.controller.js
   - admin panel/src/pages/LacquerPlan/AddLacquerPlan.jsx
   - admin panel/src/pages/LacquerPlan/EditLacquerPlan.jsx
   - admin panel/src/pages/LacquerPlan/ImportExcelModal.jsx
   - admin panel/src/pages/LacquerPlan/LacquerPlan.jsx

2. Unify completion functions:
   - Audit existing: `isPlanRowCompleted`, `getCompletedCombinationsSet`, `getPlanCombinationKeys`
   - Consolidate into one `isPlanRowCompleted(plan)` function (already exists per audit)
   - Verify it's used consistently across:
     - Excel import preview
     - Excel import commit
     - Import Previous Plan preview
     - Import Previous Plan commit
     - List view COMPLETED badge

### Phase 2: Implement Completed-Row Filter
1. **In lacquerPlan.controller.js previewImportExcel:**
   - Parse Excel → get Parsed count (N)
   - For each parsed row, check `isPlanRowCompleted()` against most recent earlier occurrence
   - Build skipped rows list with reasons
   - Return: `{ parsed: N, skipped: M, importable: K, skippedRows: [...], completedGroupKeys: Set }`
   - Preview shows three numbers + skipped rows table + "Import anyway" checkboxes

2. **In lacquerPlan.controller.js commitImportExcel:**
   - Filter using same logic as preview
   - Skip rows returned as completed
   - Don't create Printing rows for skipped Lacquer rows (check syncPrintingPlanForLacquerPlan call)
   - Return result with counts

3. **In lacquerPlan.controller.js importPreviousDay:**
   - Apply same filter to previous day's rows before importing
   - Skip completed rows
   - Show preview with counts + skipped rows
   - After user confirms, commit without skipped rows

4. **In ImportExcelModal.jsx:**
   - Display preview showing: **Parsed N | Skipped M | Importable K**
   - Show table of skipped rows with reason and "Import anyway" checkbox
   - If any row checked "Import anyway", include it in commit (override completion check for that row)
   - Handle case where parsing succeeds but show Parsed > 0 always (never "0 of 0")

### Phase 3: Test with Scenarios (a)–(f)
1. Start backend & frontend
2. Create test Lacquer Plan on day D with all 6 scenarios
3. **Via Excel Import:**
   - Export D's data (or create test Excel with those rows)
   - Import to D+1: Verify preview shows correct Parsed/Skipped/Importable
   - Check skipped rows have reason "Completed on D"
   - Test "Import anyway" for one row: confirm it imports
   - Commit: Verify D+1 has correct rows (c, d, f incomplete brand only; no a, b, e)

4. **Via Import Previous Plan:**
   - On D+1, click Import Previous Plan → select D
   - Verify same preview (Parsed/Skipped/Importable)
   - Commit: Verify D+1 has correct rows

5. **Edit & Re-import:**
   - On D, edit row (a) to reduce coated below order (make it incomplete)
   - Re-import D to D+1 (or fresh D+2): Verify row (a) now imports
   - Edit row (a) back to completed: Re-import again, verify it's skipped

6. **Shade Variants:**
   - Create two rows: one with `TR .BROWN`, one with `TR BROWN`
   - Mark first as completed, import to next day
   - Verify both are matched (or both skipped if correctly normalized)

### Phase 4: Verification
1. **Code changes table:**
   - What was before vs. what changed
   - File and function names
   - Line numbers

2. **Preview logs/screenshots:**
   - Excel import preview: show Parsed/Skipped/Importable numbers
   - Skipped rows table with reasons
   - Verify Parsed is never 0
   - Import Previous Plan preview (same)

3. **Test results table:**
   - Scenarios (a)–(f): what was created, what was imported, what was skipped
   - Day D+1 final list: rows present, rows missing

4. **Sync & Stock Verification:**
   - List's COMPLETED badge uses same `isPlanRowCompleted` function: ✅ confirmed
   - Live plain stock unchanged: ✅ confirmed
   - Lacquer → Printing sync: ✅ no Printing rows created for skipped Lacquer rows

5. **Files & Git:**
   - List files changed
   - Confirm: 0 git commands used (only direct edits)

---

## Key Code Functions to Review/Unify

### Already Exists (per audit)
- `isPlanRowCompleted(plan)` — checks coated >= order
- `getCompletedCombinationsSet(plans)` — returns set of completed row combinations
- `getPlanCombinationKeys(plan)` — generates key for row identity

### To Consolidate
1. Use `isPlanRowCompleted()` consistently everywhere
2. Normalize keys in `getPlanCombinationKeys()` (case, spaces, dots, plus signs)
3. Apply in all four import stages: preview (both paths) + commit (both paths)

### To Add/Modify
1. **previewImportExcel** — return `{ parsed, skipped, importable, skippedRows, importableRows }`
2. **commitImportExcel** — accept overrides (rows to import anyway) + filter out others
3. **importPreviousDay** — add completion filter + preview before commit
4. **ImportExcelModal.jsx** — display 3-number preview + skipped table + checkboxes

---

## Constraints

- ❌ **No git commands** (no commit, stash, checkout, restore, reset, clean)
- ❌ **Don't touch:** Printing Plan, Incoming Plan, Dispatch Plan
- ✅ **Do touch:** Only the 5 Lacquer files listed above
- ✅ **Create backup first** (5 files)

---

## Success Criteria

1. ✅ Completed rows (coatedQty ≥ orderQty, orderQty > 0) are **not imported** to later days
2. ✅ Bottles with all rows completed **don't appear** in later days
3. ✅ Partial bottle skipping works (incomplete brands import, completed ones don't)
4. ✅ Preview shows three counts: Parsed | Skipped | Importable (never "0 of 0")
5. ✅ Skipped rows listed with reason + "Import anyway" override works
6. ✅ Shade variants normalized and matched correctly
7. ✅ Both import paths use same completion logic
8. ✅ Lacquer → Printing sync skips completed rows (no Printing rows created)
9. ✅ List COMPLETED badge uses same function
10. ✅ All tests pass with real Excel data
11. ✅ No git commands used
12. ✅ Complete verification table provided

---

## Handoff to Workflow

Send this prompt to the next workflow **after** wf_021c8a359507a68e completes.

Use `run_workflow` with `workflowPrompt` containing this entire spec, or a reference to this file.

**Ready: YES** ✅

