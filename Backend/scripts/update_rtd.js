const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '../src/controllers/readyToDispatch.controller.js');
let content = fs.readFileSync(filePath, 'utf8');

// Replace Option A and Option B blocks in createFromPlan
const searchStart = `      if (action === "CLOSE_ENTIRE_ORDER") {`;
const searchEnd = `          if (planRow.bottleName) {
            await recomputePlainStock(planRow.bottleName, planRow.canonicalCompanyId || planRow.companyId, req.user?._id);
          }
        }
      }`;

const startIndex = content.indexOf(searchStart);
const endIndex = content.indexOf(searchEnd);

if (startIndex === -1 || endIndex === -1) {
  console.error('Could not locate Option A / Option B block in readyToDispatch.controller.js');
  process.exit(1);
}

const replacementBlock = `      if (action === "CLOSE_ENTIRE_ORDER") {
        cancelledQty = Math.max(0, originalOrder - totalCoated);
        planRow.readyToDispatch = {
          sheetId: sheet._id,
          lineId: variantLineId,
          sentAt: new Date(),
        };
        planRow.sentToReadyQty = newAlreadySent;
        planRow.productionStatus = "CLOSED";
        planRow.isClosed = true;
        planRow.isSoftRemoved = true;
        planRow.softRemovedAt = new Date();
        planRow.softRemovedBy = performedBy;
        planRow.closedAt = new Date();
        planRow.closedBy = performedBy;
        planRow.cancelledQty = cancelledQty;

        const auditNote = cancelledQty > 0
          ? \`Sent \${sendQty} to Ready To Dispatch; cancelled remaining \${cancelledQty}\`
          : \`Sent \${sendQty} to Ready To Dispatch; order completed.\`;

        planRow.orderHistory = planRow.orderHistory || [];
        planRow.orderHistory.push({
          date: new Date(),
          originalOrder: originalOrder,
          updatedOrder: totalCoated,
          totalOrder: totalCoated,
          notes: auditNote
        });

        planRow.qtyEntries = planRow.qtyEntries || [];
        planRow.qtyEntries.push({
          type: 'orderQty',
          subType: 'order',
          qty: totalCoated - originalOrder,
          runningTotal: totalCoated,
          note: auditNote,
          at: new Date(),
          by: performedBy
        });

        planRow.productionAudit = planRow.productionAudit || [];
        planRow.productionAudit.push({
          action: "CLOSE_ENTIRE_ORDER",
          originalOrderQty: originalOrder,
          quantityCoated: totalCoated,
          quantitySentToReady: sendQty,
          quantityCancelledOrClosed: cancelledQty,
          quantityRemainingAfterSplit: 0,
          sourcePlanId: planRow._id,
          sheetId: sheet._id,
          lineId: variantLineId,
          performedAt: new Date(),
          performedBy,
          performedByUserId,
          notes: auditNote
        });

        await planRow.save();
      } else if (action === "SPLIT_REMAINING_ORDER") {
        remainingOrderQty = Math.max(0, originalOrder - totalCoated);

        if (remainingOrderQty <= 0) {
          // No remaining quantity to split, close the order
          planRow.readyToDispatch = {
            sheetId: sheet._id,
            lineId: variantLineId,
            sentAt: new Date(),
          };
          planRow.sentToReadyQty = newAlreadySent;
          planRow.productionStatus = "CLOSED";
          planRow.isClosed = true;
          planRow.isSoftRemoved = true;
          planRow.softRemovedAt = new Date();
          planRow.softRemovedBy = performedBy;
          planRow.closedAt = new Date();
          planRow.closedBy = performedBy;
          planRow.cancelledQty = 0;
          await planRow.save();
        } else {
          const splitNote = \`Sent \${totalCoated} to Ready To Dispatch; remaining \${remainingOrderQty} kept\`;

          // 1. Create archived sibling historical record for the completed portion with stockAllocation intact
          const planObj = planRow.toObject();
          delete planObj._id;
          delete planObj.createdAt;
          delete planObj.updatedAt;

          const dispatchedDoc = new LacquerPlan({
            ...planObj,
            _id: new mongoose.Types.ObjectId(),
            orderQty: totalCoated,
            orderQtyInitial: totalCoated,
            coatingCompletedQty: totalCoated,
            coatedQty: totalCoated,
            balanceToMake: 0,
            sentToReadyQty: newAlreadySent,
            readyToDispatch: {
              sheetId: sheet._id,
              lineId: variantLineId,
              sentAt: new Date(),
            },
            isClosed: true,
            productionStatus: "CLOSED",
            isArchived: true,
            isSibling: true,
            siblingOf: planRow._id,
            appliedStockDeduction: totalCoated,
            stockAllocation: planRow.stockAllocation || [],
            productionAudit: [{
              action: "SPLIT_REMAINING_ORDER",
              originalOrderQty: originalOrder,
              quantityCoated: totalCoated,
              quantitySentToReady: sendQty,
              quantityCancelledOrClosed: 0,
              quantityRemainingAfterSplit: remainingOrderQty,
              sourcePlanId: planRow._id,
              sheetId: sheet._id,
              lineId: variantLineId,
              performedAt: new Date(),
              performedBy,
              performedByUserId,
              notes: splitNote
            }]
          });
          await dispatchedDoc.save();

          // Link ReadyToDispatch line to the dispatched historical doc
          for (const grp of sheet.groups) {
            for (const line of grp.variantLines) {
              if (line._id.toString() === variantLineId.toString()) {
                line.sourcePlanId = dispatchedDoc._id;
                break;
              }
            }
          }
          await sheet.save();

          // 2. Update visible active planRow with remaining production
          const boxQty = Number(planRow.boxQty) || 0;
          const recalculatedNoOfBoxes = boxQty > 0 ? Math.ceil(remainingOrderQty / boxQty) : planRow.noOfBoxes;

          planRow.orderQty = remainingOrderQty;
          planRow.orderQtyInitial = remainingOrderQty;
          planRow.coatingCompletedQty = 0;
          planRow.coatedQty = 0;
          planRow.balanceToMake = 0 - remainingOrderQty;
          planRow.noOfBoxes = recalculatedNoOfBoxes;
          planRow.sentToReadyQty = 0;
          planRow.readyToDispatch = null;
          planRow.appliedStockDeduction = 0;
          planRow.stockAllocation = [];
          planRow.stockAllocationInitial = [];
          planRow.qtyEntries = [];
          planRow.carriedFromCoatedQty = 0;
          planRow.productionStatus = "ACTIVE";
          planRow.isClosed = false;
          planRow.isArchived = false;
          planRow.isSoftRemoved = false;

          planRow.orderHistory = planRow.orderHistory || [];
          planRow.orderHistory.push({
            date: new Date(),
            originalOrder: originalOrder,
            updatedOrder: remainingOrderQty,
            totalOrder: remainingOrderQty,
            notes: splitNote
          });

          planRow.qtyEntries = planRow.qtyEntries || [];
          planRow.qtyEntries.push({
            type: 'orderQty',
            subType: 'order',
            qty: remainingOrderQty,
            runningTotal: remainingOrderQty,
            note: splitNote,
            at: new Date(),
            by: performedBy
          });

          planRow.productionAudit = planRow.productionAudit || [];
          planRow.productionAudit.push({
            action: "SPLIT_REMAINING_ORDER",
            originalOrderQty: originalOrder,
            quantityCoated: totalCoated,
            quantitySentToReady: sendQty,
            quantityCancelledOrClosed: 0,
            quantityRemainingAfterSplit: remainingOrderQty,
            sourcePlanId: planRow._id,
            dispatchedPlanId: dispatchedDoc._id,
            sheetId: sheet._id,
            lineId: variantLineId,
            performedAt: new Date(),
            performedBy,
            performedByUserId,
            notes: splitNote
          });

          await planRow.save();

          if (planRow.bottleName) {
            await recomputePlainStock(planRow.bottleName, planRow.canonicalCompanyId || planRow.companyId, req.user?._id);
          }
        }
      }`;

content = content.substring(0, startIndex) + replacementBlock + content.substring(endIndex + searchEnd.length);
fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully updated readyToDispatch.controller.js');
