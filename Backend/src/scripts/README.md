# Bottle Per Box & Bottle Name Deduplication

## 1. What This System Is and Why It Exists
Over time, identical bottle names were entered with slight variations across the system (e.g., extra spaces, hyphen variations, or typos like "TS10HB" vs "TS 10 HB"). This resulted in the duplication of entries in the `BottleSpec` collection. 

This module provides a unified deduplication mapping and seeding process. It creates a single source of truth for "Bottle Per Box" configurations (the `BottlePerBox` master module) using corrected, canonical bottle names, and provides a script to fix historical misspellings across the `BottleSpec` collection. The downstream models (like `Variant`, `CoatingProduction`, and `Production`) rely on references to `BottleSpec`, so fixing `BottleSpec` intrinsically corrects the naming cascade system-wide.

## 2. Deduplication Logic

The logic applies exactly three passes to raw names:

**PASS 1 — Whitespace normalization (automatic, safe):**
Trims leading/trailing spaces and collapses multiple spaces into one, for every name. Merges any names that become identical after this.

**PASS 2 — Confirmed space/hyphen/no-space equivalence groups (explicit list only):**
- "TS10HB", "TS 10 HB", "TS10 HB" → canonical: "TS 10 HB"
- "TS12HB", "TS 12 HB" → canonical: "TS 12 HB"
- "NPR-202", "NPR 202" → canonical: "NPR 202"
- "8ML SQ ROLL ON", "8 ML SQ ROLL ON", "8 ML SQ ROLLON" → canonical: "8 ML SQ ROLL ON"
- "750 ML - WATER BOTTLE", "750 ML WATER BOTTLE" → canonical: "750 ML WATER BOTTLE"

**PASS 3 — Confirmed typo merges (explicit list only):**
- "50 ML HAMMER" → "50 ML HAMAR"
- "30 ML MAFIA" → "30 ML MAFIYA"
- "50 ML CHAPLIN" → "50 ML CHEPLIN"
- "100 ML XTREAM" / "100 ML XTREAME" → "100 ML EXTREAM"
- "30 ML VODDO" → "30 ML VOODOO"
- "100 ML RISEUP" → "100 ML RISE UP MAN"
- "BM-350" → "BS 350"

**HARD RULE (applies across all passes):**
A bracket-suffixed name (e.g., `-(GOLD FOIL)`, `-(BLACK ORG)`) is ALWAYS a separate, distinct bottle name from its base name and from every other suffix variant. Never merge a suffixed name with its base or with a differently-suffixed sibling.

*Note: Pass 2 and Pass 3 are hand-confirmed explicit lists, NOT generic fuzzy-match rules. Extending them later requires explicitly adding keys and re-reviewing.*

## 3. Files Involved
1. **`bottlePerBox.mapping.js`**: An auto-generated JS object mapping every distinct raw `bottleName` currently found in `BottleSpecs` to its exact canonical name, following the rules above.
2. **`seedBottlePerBox.js`**: Iterates over the canonical names from the mapping and safely upserts them into the `BottlePerBox` master collection. Leaves the `bottlePerBox` count as `null`.
3. **`applyBottleNameCorrections.js`**: Scans the `BottleSpecs` collection and applies `updateMany` for each mapping entry where the raw name differs from the canonical name, fixing typos in historical data.
4. **`../models/BottlePerBox.js`**: Updated schema which now includes a `pre-save` hook for trimming and a `unique` index on `bottleName` to prevent future duplicates.

## 4. Execution Order (CRITICAL)

Run these scripts from the `src/scripts` directory using Node.js:

1. **`node seedBottlePerBox.js`**
   - **What it does**: Creates the canonical BottlePerBox master list. The canonical list MUST exist before any mapping is applied to historical documents.
   - **Check**: Ensure it outputs the correct number of canonical names processed and newly created.

2. **`node applyBottleNameCorrections.js`**
   - **What it does**: Corrects all raw `bottleName` misspellings across the `BottleSpecs` collection based on the mapping file.
   - **Check**: Verify the terminal output to ensure it successfully modifies the misspellings. 

*Note: You do not need to modify the `/bottle-per-box` frontend view. It reads the accurate, configured data as expected.*

## 5. ⚠️ Running Against Production
Before running this in the live production database:
1. **Full Backup**: Backup the `BottleSpecs`, `BottlePerBox`, `Variants`, `CoatingProduction`, and `Production` collections.
2. **Dry Run**: Run the scripts against a restored local copy of production data first.
3. **Sign-off**: Verify `bottlePerBox.mapping.js` manually to ensure no unwanted merges occurred.
4. **Low Traffic**: Run during off-peak hours.
5. **Final Check**: After running `applyBottleNameCorrections.js`, check the frontend to ensure existing configs, specs, variants, and logs match up accurately.
