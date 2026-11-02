const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '../src/controllers/lacquerPlan.controller.js');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add computeReadyActions helper right above exports.getPlans
const computeReadyActionsFn = `
/**
 * Computes readyActions for Process C rows.
 * Frontend only renders what the server returns; no eligibility logic in frontend.
 */
function computeReadyActions(plan) {
  const isProcessC = String(plan.process || '').trim().toUpperCase() === 'C';
  if (!isProcessC || plan.isSoftRemoved || plan.isArchived || plan.isSibling) {
    return {
      visible: false,
      enabled: false,
      isProcessC,
      coatedQty: 0,
      sentQty: 0,
      sendableQty: 0,
      orderQty: 0,
      remainingQty: 0,
      options: []
    };
  }

  const coated = Number(plan.coatingCompletedQty ?? plan.coatedQty ?? 0);
  const sentQty = Number(plan.sentToReadyQty || 0);
  const sendable = Math.max(0, coated - sentQty);
  const order = Number(plan.orderQty || 0);
  const remaining = Math.max(0, order - coated);
  const isClosed = Boolean(plan.isClosed || plan.productionStatus === 'CLOSED' || plan.isSoftRemoved);

  if (isClosed) {
    return {
      visible: false,
      enabled: false,
      isProcessC: true,
      isClosed: true,
      coatedQty: coated,
      sentQty,
      sendableQty: 0,
      orderQty: order,
      remainingQty: 0,
      options: []
    };
  }

  const options = [];
  if (sendable > 0) {
    if (remaining > 0) {
      options.push({
        key: 'CLOSE_ENTIRE_ORDER',
        title: 'Option A: Close Entire Order & Dispatch',
        description: \`Send \${sendable} to Ready To Dispatch and close the order. This row will be removed from the list, and remaining \${remaining} will be cancelled.\`
      });
      options.push({
        key: 'SPLIT_REMAINING_ORDER',
        title: 'Option B: Dispatch Completed & Keep Remaining',
        description: \`Send \${sendable} to Ready To Dispatch. This row stays with Order Qty \${remaining} and Coating Completed 0.\`
      });
    } else {
      options.push({
        key: 'CLOSE_ENTIRE_ORDER',
        title: 'Dispatch Completed Quantity',
        description: \`Send \${sendable} to Ready To Dispatch and mark order completed.\`
      });
    }
  }

  return {
    visible: true,
    enabled: true,
    isProcessC: true,
    isClosed: false,
    coatedQty: coated,
    sentQty,
    sendableQty: sendable,
    orderQty: order,
    remainingQty: remaining,
    options
  };
}
exports.computeReadyActions = computeReadyActions;
`;

if (!content.includes('function computeReadyActions(')) {
  content = content.replace('// Get Plans\nexports.getPlans = async', computeReadyActionsFn + '\n// Get Plans\nexports.getPlans = async');
}

// 2. In getPlans: update query filter and attach readyActions
content = content.replace(
  /let query = \{ isDeleted: false, isArchived: \{ \$ne: true \} \};/g,
  'let query = { isDeleted: false, isArchived: { $ne: true }, isSoftRemoved: { $ne: true }, isSibling: { $ne: true } };'
);

// 3. In getPlansPaginated: attach readyActions to augmentedRow
const augSearch = `coatedQty,
          balanceToMake,
          status: isCompleted,
          sentToReadyQty: row.sentToReadyQty || 0,
          usedFrom: rowUsedFrom,
          usedFromTooltip: rowUsedFromTooltip
        };`;

const augReplace = `coatedQty,
          balanceToMake,
          status: isCompleted,
          sentToReadyQty: row.sentToReadyQty || 0,
          usedFrom: rowUsedFrom,
          usedFromTooltip: rowUsedFromTooltip,
          readyActions: computeReadyActions(row)
        };`;

if (content.includes(augSearch)) {
  content = content.replace(augSearch, augReplace);
}

// 4. In getPlans: map readyActions on non-paginated and paginated plans
content = content.replace(
  'return res.status(200).json({ success: true, data: filteredPlans, total });',
  'return res.status(200).json({ success: true, data: filteredPlans.map(p => ({ ...p, readyActions: computeReadyActions(p) })), total });'
);
content = content.replace(
  'data: paginatedPlans,',
  'data: paginatedPlans.map(p => ({ ...p, readyActions: computeReadyActions(p) })),'
);

// 5. Replace importPreviousDay with the updated auto-send and completion rules
const importStart = 'exports.importPreviousDay = async (req, res) => {';
const importEnd = 'Computes full chronological history for a Lacquer Plan row';

const idxStart = content.indexOf(importStart);
const idxEnd = content.indexOf(importEnd);

if (idxStart === -1 || idxEnd === -1) {
  console.error('Could not locate importPreviousDay block', { idxStart, idxEnd });
  process.exit(1);
}

// Find the start of the comment before importEnd
const commentBeforeHistory = content.lastIndexOf('/**', idxEnd);

const updatedImportFunction = `// Import Previous Day
exports.importPreviousDay = async (req, res) => {
  try {
    const { targetDate, sourceDate, importMode } = req.body;
    if (!targetDate) return res.status(400).json({ success: false, message: 'Target date is required' });

    const { syncLacquerPlanReadyToDispatch } = require('./readyToDispatch.controller');

    let prev;
    if (sourceDate) {
      prev = new Date(sourceDate);
    } else {
      const current = new Date(targetDate);
      prev = new Date(current);
      prev.setUTCDate(prev.getUTCDate() - 1);
    }

    const startOfPrevDay = new Date(prev);
    startOfPrevDay.setUTCHours(0, 0, 0, 0);
    const endOfPrevDay = new Date(prev);
    endOfPrevDay.setUTCHours(23, 59, 59, 999);

    const oldPlans = await LacquerPlan.find({
      isDeleted: false,
      isArchived: { $ne: true },
      isSoftRemoved: { $ne: true },
      isSibling: { $ne: true },
      planDate: { $gte: startOfPrevDay, $lte: endOfPrevDay }
    }).populate('brandId', 'name').populate('variantId', 'variantName').lean();

    if (!oldPlans || oldPlans.length === 0) {
      return res.status(404).json({ success: false, message: 'No plans found for previous day' });
    }

    const startOfTargetDay = new Date(targetDate);
    startOfTargetDay.setUTCHours(0, 0, 0, 0);
    const endOfTargetDay = new Date(targetDate);
    endOfTargetDay.setUTCHours(23, 59, 59, 999);

    const existingTargetPlans = await LacquerPlan.find({
      isDeleted: false,
      isArchived: { $ne: true },
      isSoftRemoved: { $ne: true },
      isSibling: { $ne: true },
      planDate: { $gte: startOfTargetDay, $lte: endOfTargetDay }
    }).populate('brandId', 'name').populate('variantId', 'variantName').lean();

    // Check if target date already has rows imported from source date
    const hasExistingImport = existingTargetPlans.some(p =>
      (p.importedFromId && oldPlans.some(op => op._id.toString() === p.importedFromId.toString())) ||
      (p.importedFromDate && (new Date(p.importedFromDate).toISOString().split('T')[0] === new Date(sourceDate || prev).toISOString().split('T')[0]))
    );

    // If target date already contains an import from source date and user hasn't chosen mode, prompt
    if (hasExistingImport && !importMode) {
      return res.status(200).json({
        success: true,
        requiresConfirmation: true,
        hasExistingImport: true,
        message: 'This date already has imports from that source date. Choose how to proceed.'
      });
    }

    // Separate open candidates (unfinished) and completed candidates
    const openCandidates = oldPlans.filter(p => !isPreviousDaySourcePlanCompleted(p));
    const completedCandidates = oldPlans.filter(p => isPreviousDaySourcePlanCompleted(p));

    // Handle completed rows: do NOT carry forward.
    // For Process C completed rows: auto-send to Ready To Dispatch (idempotent, once only)
    let completedSentCount = 0;
    let notCarriedCount = 0;

    for (const cp of completedCandidates) {
      const isProcessC = String(cp.process || '').trim().toUpperCase() === 'C';
      const coated = Number(cp.coatingCompletedQty ?? cp.coatedQty ?? 0);
      const sentQty = Number(cp.sentToReadyQty || 0);
      const sendable = Math.max(0, coated - sentQty);

      if (isProcessC && sendable > 0) {
        try {
          await syncLacquerPlanReadyToDispatch(cp._id);
          completedSentCount++;
        } catch (rtdErr) {
          console.error(\`Failed to auto-send completed plan \${cp._id} to Ready To Dispatch:\`, rtdErr);
          notCarriedCount++;
        }
      } else {
        notCarriedCount++;
      }
    }

    // Format source date string for history
    const srcDateObj = new Date(sourceDate || prev);
    const day = String(srcDateObj.getUTCDate()).padStart(2, '0');
    const month = String(srcDateObj.getUTCMonth() + 1).padStart(2, '0');
    const year = srcDateObj.getUTCFullYear();
    const sourceDateFormatted = \`\${day}-\${month}-\${year}\`;

    const newPlansData = openCandidates.map(p => {
      const { _id, createdAt, updatedAt, __v, ...rest } = p;
      let values = { ...rest };

      // If user selected without_changes, revert to original as-imported values if present
      if (importMode === 'without_changes' && p.originalImportedValues) {
        const orig = p.originalImportedValues;
        if (orig.orderQty !== undefined) values.orderQty = orig.orderQty;
        if (orig.boxQty !== undefined) values.boxQty = orig.boxQty;
        if (orig.noOfBoxes !== undefined) values.noOfBoxes = orig.noOfBoxes;
        if (orig.remarks !== undefined) values.remarks = orig.remarks;
        if (orig.process !== undefined) values.process = orig.process;
      }

      const originalOrder = Number(values.orderQty) || 0;
      const sourceCoated = Number(p.coatingCompletedQty ?? p.coatedQty ?? 0);
      const remainingOrder = Math.max(0, originalOrder - sourceCoated);
      const boxQty = Number(values.boxQty) || 0;
      const recalculatedNoOfBoxes = (boxQty > 0 && remainingOrder > 0)
        ? Math.ceil(remainingOrder / boxQty)
        : (remainingOrder === 0 ? 0 : values.noOfBoxes);
      const recalculatedBalanceToMake = 0 - remainingOrder;

      const historyNote = \`Carried from \${sourceDateFormatted}: order \${originalOrder}, coated \${sourceCoated}\`;

      const snapshot = {
        orderQty: remainingOrder,
        coatingCompletedQty: 0,
        coatedQty: 0,
        balanceToMake: recalculatedBalanceToMake,
        boxQty: values.boxQty,
        noOfBoxes: recalculatedNoOfBoxes,
        dispatchPendingQty: values.dispatchPendingQty,
        dispatchBalance: values.dispatchBalance,
        soldQty: values.soldQty,
        plainStock: values.plainStock,
        remarks: values.remarks,
        process: values.process
      };

      return {
        ...values,
        orderQty: remainingOrder,
        orderQtyInitial: remainingOrder,
        noOfBoxes: recalculatedNoOfBoxes,
        coatingCompletedQty: 0,
        coatedQty: 0,
        balanceToMake: recalculatedBalanceToMake,
        appliedStockDeduction: 0,
        stockAllocation: [],
        stockAllocationInitial: [],
        coatedQtyInitial: 0,
        qtyEntries: [{
          type: 'orderQty',
          subType: 'order',
          qty: remainingOrder,
          runningTotal: remainingOrder,
          note: historyNote,
          at: new Date(),
          by: req.user?.username || req.user?.name || req.user?.email || 'System'
        }],
        orderHistory: [{
          date: new Date(),
          originalOrder: remainingOrder,
          updatedOrder: remainingOrder,
          totalOrder: remainingOrder,
          notes: historyNote
        }],
        carriedFromCoatedQty: sourceCoated,
        stockSources: (p.stockSources && p.stockSources.length > 0)
          ? p.stockSources
          : (p.companyId ? [p.companyId] : []),
        planDate: new Date(targetDate),
        isEditedAfterImport: false,
        lastEditedAt: null,
        originalImportedValues: snapshot,
        importedFromId: p._id,
        importedFromDate: sourceDate || prev,
        productionStatus: 'ACTIVE',
        isClosed: false,
        isSoftRemoved: false,
        isArchived: false,
        isSibling: false,
        cancelledQty: 0,
        sentToReadyQty: 0,
        readyToDispatch: null
      };
    }).filter(c => c.orderQty > 0);

    let newPlans = [];
    const alreadyImportedSourceIds = new Set(
      existingTargetPlans
        .filter(p => p.importedFromId)
        .map(p => p.importedFromId.toString())
    );

    if (importMode === 'with_changes' && hasExistingImport) {
      for (const candidate of newPlansData) {
        const existingImport = existingTargetPlans.find(p =>
          p.importedFromId?.toString() === candidate.importedFromId.toString()
        );

        if (existingImport) {
          const hasTargetProgress = Number(existingImport.coatingCompletedQty || existingImport.coatedQty || 0) > 0 ||
            (Array.isArray(existingImport.qtyEntries) && existingImport.qtyEntries.length > 0) ||
            Number(existingImport.sentToReadyQty || 0) > 0;
          const isTargetEdited = existingImport.isEditedAfterImport === true;

          if (hasTargetProgress || isTargetEdited) {
            // PRESERVE target day's manually entered production progress and manually edited data
            await LacquerPlan.updateOne(
              { _id: existingImport._id },
              {
                $set: {
                  importedFromDate: candidate.importedFromDate,
                  carriedFromCoatedQty: candidate.carriedFromCoatedQty
                }
              }
            );
          } else {
            // Target has no progress and was not edited: update with source remaining values
            await LacquerPlan.updateOne(
              { _id: existingImport._id },
              {
                $set: {
                  orderQty: candidate.orderQty,
                  orderQtyInitial: candidate.orderQty,
                  coatingCompletedQty: 0,
                  coatedQty: 0,
                  balanceToMake: candidate.balanceToMake,
                  boxQty: candidate.boxQty,
                  noOfBoxes: candidate.noOfBoxes,
                  dispatchPendingQty: candidate.dispatchPendingQty,
                  dispatchBalance: candidate.dispatchBalance,
                  soldQty: candidate.soldQty,
                  plainStock: candidate.plainStock,
                  remarks: candidate.remarks,
                  process: candidate.process,
                  importedFromDate: candidate.importedFromDate,
                  carriedFromCoatedQty: candidate.carriedFromCoatedQty,
                  originalImportedValues: candidate.originalImportedValues
                }
              }
            );
            const updP = await LacquerPlan.findById(existingImport._id);
            if (updP) {
              await syncPrintingPlanForLacquerPlan(updP, req.user?._id);
            }
          }
          alreadyImportedSourceIds.add(candidate.importedFromId.toString());
        }
      }

      // Add only new rows (not already imported)
      const plansToInsert = newPlansData.filter(newP =>
        !alreadyImportedSourceIds.has(newP.importedFromId.toString())
      );

      if (plansToInsert.length > 0) {
        await assignGroupsAndSequences(plansToInsert);
        newPlans = await LacquerPlan.insertMany(plansToInsert);
        for (const plan of newPlans) {
          await syncLacquerPlanStockDeduction(plan, plan.coatingCompletedQty ?? plan.coatedQty, req.user?._id);
          await createPrintingPlanIfApplicable(plan);
        }
      }
    } else if (importMode === 'without_changes' && hasExistingImport) {
      // Only add rows that haven't been imported yet; keep existing target records untouched
      const plansToInsert = newPlansData.filter(newP =>
        !alreadyImportedSourceIds.has(newP.importedFromId.toString())
      );

      if (plansToInsert.length > 0) {
        await assignGroupsAndSequences(plansToInsert);
        newPlans = await LacquerPlan.insertMany(plansToInsert);
        for (const plan of newPlans) {
          await syncLacquerPlanStockDeduction(plan, plan.coatingCompletedQty ?? plan.coatedQty, req.user?._id);
          await createPrintingPlanIfApplicable(plan);
        }
      }
    } else {
      // First import: insert rows that are not already imported by source plan ID
      const plansToInsert = newPlansData.filter(newP =>
        !existingTargetPlans.some(existP =>
          existP.importedFromId && existP.importedFromId.toString() === newP.importedFromId.toString()
        )
      );

      if (plansToInsert.length > 0) {
        await assignGroupsAndSequences(plansToInsert);
        newPlans = await LacquerPlan.insertMany(plansToInsert);
        for (const plan of newPlans) {
          await syncLacquerPlanStockDeduction(plan, plan.coatingCompletedQty ?? plan.coatedQty, req.user?._id);
          await createPrintingPlanIfApplicable(plan);
        }
      }
    }

    // Calculate stock warnings for candidate plans (for preview response)
    const stockWarnings = [];
    for (const candidate of newPlansData) {
      if (!candidate.bottleName || !candidate.companyId || !candidate.orderQty) {
        continue;
      }

      try {
        const warning = await validateRowStockWarning(
          candidate.bottleName,
          candidate.companyId,
          candidate.orderQty,
          null,
          candidate.planDate || targetDate
        );

        if (warning.hasWarning) {
          stockWarnings.push({
            sourcePlanId: candidate.importedFromId,
            bottleName: candidate.bottleName,
            orderQty: warning.orderQty,
            availableStock: warning.availableStock,
            overBy: warning.overBy,
            details: warning.details
          });
        }
      } catch (err) {
        console.error('Stock warning calculation error for import:', err);
      }
    }

    const carriedCount = newPlans.length;
    const summaryMsg = \`\${carriedCount} rows carried, \${completedSentCount} completed rows sent to Ready To Dispatch, \${notCarriedCount} not carried\`;

    res.status(200).json({
      success: true,
      data: newPlans,
      carriedCount,
      completedSentCount,
      notCarriedCount,
      skippedCount: alreadyImportedSourceIds ? alreadyImportedSourceIds.size : 0,
      skippedCompletedCount: oldPlans.length - openCandidates.length,
      importMode: importMode || 'normal',
      message: summaryMsg,
      stockWarnings,
      hasStockWarnings: stockWarnings.length > 0
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
`;

// Find the comment before importPreviousDay
const commentBeforeImport = content.lastIndexOf('// Import Previous Day', idxStart);
const actualStart = commentBeforeImport !== -1 ? commentBeforeImport : idxStart;

content = content.substring(0, actualStart) + updatedImportFunction + '\n\n' + content.substring(commentBeforeHistory);
fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully updated lacquerPlan.controller.js');
