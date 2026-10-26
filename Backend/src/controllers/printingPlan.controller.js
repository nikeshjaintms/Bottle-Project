const PrintingPlan = require("../models/PrintingPlan");
const LacquerPlan = require("../models/LacquerPlan");
const CoatingProduction = require("../models/CoatingProduction");
const Production = require("../models/Production");
const BottleSpec = require("../models/Bottlespecs");
const Brand = require("../models/Brand");
const BottlePerBox = require("../models/BottlePerBox");
const PlainBottleStock = require("../models/PlainBottleStock");
const { recomputePlainStock } = require("../utils/stockRecompute");
const { isPrintingProcess } = require("../utils/processRouting");

// Helper to find PlainBottleStock for a bottle, optionally scoped to a company
const findPlainBottleStockDoc = async (bottleName, companyId = null) => {
  if (!bottleName) return null;
  const result = await recomputePlainStock(bottleName, companyId);
  return result?.stockDoc || null;
};

// Helper to calculate coated stock for a non-PLAIN coating shade
// Formula: stock(coatingShade, company, date D) = 
//   Σ Lacquer Coating Completed (date ≤ D) 
//   - Σ Printing Ready qty of non-PLAIN rows with same coatingShade (date ≤ D)
const calculateCoatedStock = async (coatingShade, companyId, planDate = null) => {
  if (!coatingShade || coatingShade.trim().toUpperCase() === 'PLAIN') return 0;
  
  // 1. Sum Lacquer Coating Completed for this shade
  const lacquerQuery = {
    companyId: companyId,
    isDeleted: false,
    coatingShade: { $regex: new RegExp("^" + coatingShade.trim() + "$", "i") }
  };
  if (planDate) {
    const endOfDay = new Date(planDate);
    endOfDay.setUTCHours(23, 59, 59, 999);
    lacquerQuery.planDate = { $lte: endOfDay };
  }
  
  const lacquerRecords = await LacquerPlan.find(lacquerQuery).lean();
  let totalLacquerCoated = 0;
  for (const lp of lacquerRecords) {
    const c1 = Number(lp.coatingCompletedQty) || 0;
    const c2 = Number(lp.coatedQty) || 0;
    totalLacquerCoated += Math.max(c1, c2);
  }
  
  // 2. Sum Printing Ready for this shade (non-deleted)
  const printingQuery = {
    companyId: companyId,
    isDeleted: false,
    coatingShade: { $regex: new RegExp("^" + coatingShade.trim() + "$", "i") }
  };
  if (planDate) {
    const endOfDay = new Date(planDate);
    endOfDay.setUTCHours(23, 59, 59, 999);
    printingQuery.planDate = { $lte: endOfDay };
  }
  
  const printingRecords = await PrintingPlan.find(printingQuery).lean();
  let totalPrintingReady = 0;
  for (const pp of printingRecords) {
    totalPrintingReady += (pp.producedQty || 0);
  }
  
  return Math.max(0, totalLacquerCoated - totalPrintingReady);
};

// Stock sync helper for PLAIN shade Printing Plans
const syncPrintingPlanStockDeduction = async (planDocOrId, newProducedQty, userId = null) => {
  let plan = typeof planDocOrId === 'object' && planDocOrId._id ? planDocOrId : await PrintingPlan.findById(planDocOrId);
  if (!plan) return;

  const isPlainShade = (plan.coatingShade || "").trim().toUpperCase() === "PLAIN";
  if (!isPlainShade) return;

  const targetDeduction = (newProducedQty !== undefined && newProducedQty !== null)
    ? (Number(newProducedQty) || 0)
    : (Number(plan.producedQty) || 0);

  plan.appliedStockDeduction = targetDeduction;
  await PrintingPlan.findByIdAndUpdate(plan._id, { $set: { appliedStockDeduction: targetDeduction } });

  await recomputePlainStock(plan.bottleName, plan.companyId, userId);
};

// Revert applied stock deduction completely (e.g. on soft delete)
const revertPrintingPlanStockDeduction = async (planDocOrId, userId = null) => {
  let plan = typeof planDocOrId === 'object' && planDocOrId._id ? planDocOrId : await PrintingPlan.findById(planDocOrId);
  if (!plan) return;

  plan.appliedStockDeduction = 0;
  await PrintingPlan.findByIdAndUpdate(plan._id, { $set: { appliedStockDeduction: 0 } });

  const isPlainShade = (plan.coatingShade || "").trim().toUpperCase() === "PLAIN";
  if (isPlainShade && plan.bottleName) {
    await recomputePlainStock(plan.bottleName, plan.companyId, userId);
  }
};

// Helper to get all rows marked as sent to Ready To Dispatch before target date
// Returns a Set of Printing Plan IDs that have been sent
// This is used to skip sent rows during import (similar to completed rows)
const getSentToDispatchPrintingRows = async (targetDate = null, includeTargetDate = false) => {
  const query = {
    isDeleted: false,
    readyToDispatch: { $exists: true, $ne: null } // Only rows with the readyToDispatch mark
  };

  if (targetDate) {
    const target = new Date(targetDate);
    if (includeTargetDate) {
      const endOfTarget = new Date(target);
      endOfTarget.setUTCHours(23, 59, 59, 999);
      query.planDate = { $lte: endOfTarget };
    } else {
      const startOfTarget = new Date(target);
      startOfTarget.setUTCHours(0, 0, 0, 0);
      query.planDate = { $lt: startOfTarget };
    }
  }

  const sentPlans = await PrintingPlan.find(query).select('_id bottleName brandId printingToBeDone coatingShade').lean();
  
  // Build a set of identifiers (using bottle + brand + shade combo for matching)
  const sentSet = new Set();
  sentPlans.forEach(p => {
    const key = `${String(p.bottleName || '').trim().toUpperCase()}|${String(p.brandId || '')}|${String(p.printingToBeDone || '').trim().toUpperCase()}|${String(p.coatingShade || '').trim().toUpperCase()}`;
    sentSet.add(key);
  });
  
  return sentSet;
};

// Create Printing Plan Manually
exports.createPlan = async (req, res) => {
  try {
    const plansToInsert = Array.isArray(req.body) ? req.body : [req.body];
    
    // Duplicate check
    for (const item of plansToInsert) {
       if (item.planDate && item.brandId && item.bottleName) {
           const startOfDay = new Date(item.planDate);
           startOfDay.setUTCHours(0,0,0,0);
           const endOfDay = new Date(item.planDate);
           endOfDay.setUTCHours(23,59,59,999);
           
           const duplicateQuery = {
              planDate: { $gte: startOfDay, $lte: endOfDay },
              brandId: item.brandId,
              bottleName: { $regex: new RegExp("^" + item.bottleName.trim() + "$", "i") },
              printingToBeDone: item.printingToBeDone || "",
              isDeleted: false
           };
           if (item.coatingShade) {
             duplicateQuery.coatingShade = { $regex: new RegExp("^" + item.coatingShade.trim() + "$", "i") };
           }
           const duplicate = await PrintingPlan.findOne(duplicateQuery);
           
           if (duplicate) {
              throw new Error(`A Printing Plan for Bottle "${item.bottleName}" with variant "${item.printingToBeDone}" and shade "${item.coatingShade || 'PLAIN'}" already exists for this date. Auto-generated entries from Lacquer Plan cannot be added manually again.`);
           }
       }
    }

    for (const item of plansToInsert) {
      let effectiveCompanyId = item.companyId;
      if (!effectiveCompanyId && item.brandId) {
        const bDoc = await Brand.findById(item.brandId);
        if (bDoc && bDoc.companyId) {
          effectiveCompanyId = bDoc.companyId;
          item.companyId = effectiveCompanyId;
        }
      }
      const isPlainShade = (item.coatingShade || "").trim().toUpperCase() === "PLAIN";
      if (isPlainShade) {
        if (item.plainBottleStock === undefined || item.plainBottleStock === null || item.plainBottleStock === 0) {
          const stockDoc = await findPlainBottleStockDoc(item.bottleName, effectiveCompanyId);
          item.plainBottleStock = stockDoc?.availableQuantity || 0;
        }
        const oQty = Number(item.orderQty) || 0;
        const prod = Number(item.producedQty) || 0;
        item.balanceToMake = Math.max(0, oQty - prod);
      } else {
        // For non-PLAIN shades: balanceToMake = orderQty - producedQty (stock does not enter formula)
        const oQty = Number(item.orderQty) || 0;
        const prod = Number(item.producedQty) || 0;
        item.balanceToMake = Math.max(0, oQty - prod);
      }
    }

    if (Array.isArray(req.body)) {
      const plans = await PrintingPlan.insertMany(plansToInsert);
      for (const p of plans) {
        await syncPrintingPlanStockDeduction(p, p.producedQty, req.user?._id);
      }
      return res.status(201).json({ success: true, data: plans });
    } else {
      // Single item: compute balanceToMake before saving
      const isPlainShade = (req.body.coatingShade || "").trim().toUpperCase() === "PLAIN";
      const orderQty = Number(req.body.orderQty) || 0;
      const producedQty = Number(req.body.producedQty) || 0;
      req.body.balanceToMake = Math.max(0, orderQty - producedQty);
      
      const plan = new PrintingPlan(req.body);
      await plan.save();
      await syncPrintingPlanStockDeduction(plan, plan.producedQty, req.user?._id);
      return res.status(201).json({ success: true, data: plan });
    }
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Get Plans
exports.getPlans = async (req, res) => {
  try {
    const { date, month, fromDate, toDate, search, companyId } = req.query;
    let query = { isDeleted: false };
    
    if (companyId) {
      const companyBrands = await Brand.find({ companyId }).select('_id');
      query.$or = [
         { companyId: companyId },
         { brandId: { $in: companyBrands.map(b => b._id) } }
      ];
    }
    
    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setUTCHours(0,0,0,0);
      const endOfDay = new Date(date);
      endOfDay.setUTCHours(23,59,59,999);
      query.planDate = { $gte: startOfDay, $lte: endOfDay };
    } else if (fromDate || toDate) {
      query.planDate = {};
      if (fromDate) {
        const start = new Date(fromDate);
        start.setUTCHours(0,0,0,0);
        query.planDate.$gte = start;
      }
      if (toDate) {
        const end = new Date(toDate);
        end.setUTCHours(23,59,59,999);
        query.planDate.$lte = end;
      }
    } else if (month) {
      const [year, m] = month.split('-');
      const startOfMonth = new Date(Date.UTC(year, m - 1, 1));
      const endOfMonth = new Date(Date.UTC(year, m, 0, 23, 59, 59, 999));
      query.planDate = { $gte: startOfMonth, $lte: endOfMonth };
    }

    if (search) {
       query.bottleName = { $regex: search, $options: 'i' };
    }

    const plans = await PrintingPlan.find(query)
      .populate({
        path: 'brandId',
        select: 'name companyId',
        populate: {
          path: 'companyId',
          select: 'name'
        }
      })
      .populate("itemId")
      .populate("companyId", "name")
      .sort({ planDate: 1 })
      .lean();
      
    // Resolve parent LacquerPlan status for non-manual rows
    const lacquerPlanIds = plans
      .map(p => p.lacquerPlanId)
      .filter(id => id != null);

    const activeLacquerPlans = lacquerPlanIds.length > 0
      ? await LacquerPlan.find({ _id: { $in: lacquerPlanIds }, isDeleted: false })
          .select('_id process isDeleted')
          .lean()
      : [];

    const activeLpMap = new Map(
      activeLacquerPlans.map(lp => [lp._id.toString(), lp])
    );

    const orphanIdsToClean = [];

    // Filter out rows whose parent LacquerPlan was deleted, missing, or does not qualify for printing (e.g. process is 'C')
    const validPlans = plans.filter(plan => {
      if (plan.lacquerPlanId != null) {
        const parentLp = activeLpMap.get(plan.lacquerPlanId.toString());
        if (!parentLp || parentLp.isDeleted || !isPrintingProcess(parentLp.process)) {
          orphanIdsToClean.push(plan._id);
          return false;
        }
        plan.lacquerPlanId = parentLp;
      }
      return true;
    });

    if (orphanIdsToClean.length > 0) {
      PrintingPlan.updateMany(
        { _id: { $in: orphanIdsToClean } },
        { $set: { isDeleted: true } }
      ).exec().catch(err => console.error("Error auto-cleaning orphan printing plans:", err));
    }

    // Augment plans with computed fields
    const augmentedPlans = await Promise.all(validPlans.map(async (plan) => {
      let coatedStockAvailable = 0;
      let producedQty = 0;
      
      let specId = plan.itemId ? (plan.itemId._id || plan.itemId) : null;
      if (!specId && plan.bottleName) {
        let spec = await BottleSpec.findOne({ bottleName: plan.bottleName, isDeleted: false });
        if (!spec) {
          const selectedPlainBottle = await BottlePerBox.findOne({
            $or: [
              { plainBottleName: plan.bottleName.trim() },
              { bottleName: plan.bottleName.trim() },
              { bottleNames: plan.bottleName.trim() }
            ],
            isDeleted: false
          });
          if (selectedPlainBottle && Array.isArray(selectedPlainBottle.bottleNames) && selectedPlainBottle.bottleNames.length > 0) {
            spec = await BottleSpec.findOne({
              bottleName: { $in: selectedPlainBottle.bottleNames },
              brandId: plan.brandId?._id || plan.brandId,
              isDeleted: false
            });
          }
        }
        if (spec) specId = spec._id;
      }

      // 1. Fetch coatedStockAvailable for display
      const isPlainShade = (plan.coatingShade || "").trim().toUpperCase() === "PLAIN";
      if (isPlainShade) {
        const stockDoc = await findPlainBottleStockDoc(plan.bottleName, plan.companyId?._id || plan.companyId);
        if (stockDoc) {
          coatedStockAvailable = stockDoc.availableQuantity || 0;
        }
      } else {
        // For non-PLAIN: calculate live coated stock from Lacquer - Printing
        coatedStockAvailable = await calculateCoatedStock(plan.coatingShade, plan.companyId?._id || plan.companyId, plan.planDate);
      }
      
      // Use user-provided producedQty
      producedQty = plan.producedQty || 0;
      
      // For PLAIN shade: balanceToMake = orderQty - producedQty
      // For non-PLAIN shade: balanceToMake = orderQty - producedQty (stock never enters formula)
      const orderQty = plan.orderQty || 0;
      const balanceToMake = Math.max(0, orderQty - producedQty);
      
      let companyName = null;
      if (plan.brandId && plan.brandId.companyId) {
         companyName = plan.brandId.companyId.name;
      } else if (plan.companyId) {
         companyName = plan.companyId.name;
      }
      
      // Extract plain bottle name (without text-color suffix) from BottlePerBox master
      let plainBottleName = plan.plainBottle || plan.bottleName || '';
      if (plan.bottleName && !plan.plainBottle) {
        // Try to resolve from BottlePerBox master if not already set
        // BottlePerBox is the source of truth for plain bottle names
        const bpb = await BottlePerBox.findOne({
          $or: [
            { plainBottleName: { $regex: new RegExp("^" + plan.bottleName.trim() + "$", "i") } },
            { bottleName: { $regex: new RegExp("^" + plan.bottleName.trim() + "$", "i") } },
            { bottleNames: { $regex: new RegExp("^" + plan.bottleName.trim() + "$", "i") } }
          ],
          isDeleted: false
        }).select('plainBottleName').lean();
        if (bpb) {
          plainBottleName = bpb.plainBottleName;
        }
      }
      
      return {
        ...plan,
        plainBottleStock: isPlainShade ? effectiveStock : plan.plainBottleStock,
        plainBottleName,
        coatedStockAvailable,
        producedQty,
        balanceToMake,
        companyName
      };
    }));

    res.status(200).json({ success: true, data: augmentedPlans });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Get Plan by ID
exports.getPlanById = async (req, res) => {
  try {
    const plan = await PrintingPlan.findById(req.params.id)
      .populate("brandId", "name")
      .populate("itemId")
      .lean();
    if (!plan || plan.isDeleted) {
      return res.status(404).json({ success: false, message: "Plan not found" });
    }
    
    let producedQty = plan.producedQty || 0;
    
    // For non-PLAIN: balanceToMake = orderQty - producedQty (stock never enters formula)
    // For PLAIN: balanceToMake = orderQty - producedQty
    const orderQty = plan.orderQty || 0;
    const balanceToMake = Math.max(0, orderQty - producedQty);
    
    res.status(200).json({ success: true, data: { ...plan, balanceToMake, producedQty } });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Update Plan
exports.updatePlan = async (req, res) => {
  try {
    const existingPlan = await PrintingPlan.findById(req.params.id);
    if (!existingPlan || existingPlan.isDeleted) {
      return res.status(404).json({ success: false, message: "Plan not found" });
    }

    const updateData = { ...req.body };
    updateData.isEditedAfterImport = true;
    updateData.lastEditedAt = new Date();

    if (!existingPlan.originalImportedValues) {
      updateData.originalImportedValues = {
        orderQty: existingPlan.orderQty,
        producedQty: existingPlan.producedQty,
        balanceToMake: existingPlan.balanceToMake,
        boxQty: existingPlan.boxQty,
        noOfBoxes: existingPlan.noOfBoxes,
        dispatchBalance: existingPlan.dispatchBalance,
        soldQty: existingPlan.soldQty,
        readyBoxes: existingPlan.readyBoxes,
        plainBottleStock: existingPlan.plainBottleStock,
        remarks: existingPlan.remarks,
        printingToBeDone: existingPlan.printingToBeDone,
        printingVariant: existingPlan.printingVariant,
        textColor: existingPlan.textColor,
        coatingShade: existingPlan.coatingShade
      };
    }

    const isPlainShade = (existingPlan.coatingShade || req.body.coatingShade || "").trim().toUpperCase() === "PLAIN";

    // 1. Sync live PlainBottleStock inventory deduction if coatingShade is PLAIN and producedQty is updated
    if (req.body.producedQty !== undefined && isPlainShade) {
      await syncPrintingPlanStockDeduction(existingPlan, req.body.producedQty, req.user?._id);
    }

    // 2. If producedQty changed, apply delta deduction to shared stock pool for (companyId, bottleName, coatingShade)
    if (req.body.producedQty !== undefined) {
      const prevProduced = Number(existingPlan.producedQty) || 0;
      const newProduced = Number(req.body.producedQty) || 0;
      const delta = newProduced - prevProduced;

      if (delta !== 0) {
        const planBottle = (existingPlan.bottleName || '').trim();
        const planComp = existingPlan.companyId;
        const planShade = (existingPlan.coatingShade || '').trim();
        if (planBottle && planComp && existingPlan.planDate) {
          const startOfDay = new Date(existingPlan.planDate);
          startOfDay.setUTCHours(0, 0, 0, 0);
          const endOfDay = new Date(existingPlan.planDate);
          endOfDay.setUTCHours(23, 59, 59, 999);

          // Update other rows in the same (bottle, coatingShade, company, planDate) pool
          await PrintingPlan.updateMany(
            {
              _id: { $ne: existingPlan._id },
              planDate: { $gte: startOfDay, $lte: endOfDay },
              companyId: planComp,
              bottleName: { $regex: new RegExp("^" + planBottle + "$", "i") },
              coatingShade: { $regex: new RegExp("^" + planShade + "$", "i") },
              isDeleted: false
            },
            { $inc: { plainBottleStock: -delta } }
          );

          // Recompute balanceToMake for sibling rows
          const siblingRows = await PrintingPlan.find({
            _id: { $ne: existingPlan._id },
            planDate: { $gte: startOfDay, $lte: endOfDay },
            companyId: planComp,
            bottleName: { $regex: new RegExp("^" + planBottle + "$", "i") },
            coatingShade: { $regex: new RegExp("^" + planShade + "$", "i") },
            isDeleted: false
          });
          for (const sib of siblingRows) {
            const sStock = sib.plainBottleStock || 0;
            const sProd = sib.producedQty || 0;
            const sBal = sProd > 0 ? (sStock - sProd) : sStock;
            await PrintingPlan.findByIdAndUpdate(sib._id, { $set: { balanceToMake: sBal } });
          }

          // Adjust current row's plainBottleStock by delta if not explicitly supplied in request
          if (updateData.plainBottleStock === undefined) {
            updateData.plainBottleStock = Math.max(0, (existingPlan.plainBottleStock || 0) - delta);
          }
        }
      }
    }

    // 3. Sync plainBottleStock across all rows sharing same (companyId, bottleName, coatingShade) if explicitly updated
    if (req.body.plainBottleStock !== undefined && req.body.plainBottleStock !== null) {
      const planBottle = (existingPlan.bottleName || '').trim();
      const planComp = existingPlan.companyId;
      const planShade = (existingPlan.coatingShade || '').trim();
      if (planBottle && planComp && existingPlan.planDate) {
        const startOfDay = new Date(existingPlan.planDate);
        startOfDay.setUTCHours(0, 0, 0, 0);
        const endOfDay = new Date(existingPlan.planDate);
        endOfDay.setUTCHours(23, 59, 59, 999);

        await PrintingPlan.updateMany(
          {
            _id: { $ne: existingPlan._id },
            planDate: { $gte: startOfDay, $lte: endOfDay },
            companyId: planComp,
            bottleName: { $regex: new RegExp("^" + planBottle + "$", "i") },
            coatingShade: { $regex: new RegExp("^" + planShade + "$", "i") },
            isDeleted: false
          },
          { $set: { plainBottleStock: req.body.plainBottleStock } }
        );

        const otherRows = await PrintingPlan.find({
          _id: { $ne: existingPlan._id },
          planDate: { $gte: startOfDay, $lte: endOfDay },
          companyId: planComp,
          bottleName: { $regex: new RegExp("^" + planBottle + "$", "i") },
          coatingShade: { $regex: new RegExp("^" + planShade + "$", "i") },
          isDeleted: false
        });
        for (const r of otherRows) {
          const rShade = (r.coatingShade || "").trim().toUpperCase();
          if (rShade === "PLAIN") {
            const rOrder = Number(r.orderQty) || 0;
            const rProd = Number(r.producedQty) || 0;
            const rBal = Math.max(0, rOrder - rProd);
            await PrintingPlan.findByIdAndUpdate(r._id, { $set: { balanceToMake: rBal } });
          } else {
            const rStock = Number(req.body.plainBottleStock) || 0;
            const rProd = Number(r.producedQty) || 0;
            const rBal = rProd > 0 ? (rStock - rProd) : rStock;
            await PrintingPlan.findByIdAndUpdate(r._id, { $set: { balanceToMake: rBal } });
          }
        }
      }
    }

    if (isPlainShade) {
      const finalOrder = updateData.orderQty !== undefined ? Number(updateData.orderQty) : Number(existingPlan.orderQty || 0);
      const finalProd = updateData.producedQty !== undefined ? Number(updateData.producedQty) : Number(existingPlan.producedQty || 0);
      updateData.balanceToMake = Math.max(0, finalOrder - finalProd);
    } else {
      // For non-PLAIN: balanceToMake = orderQty - producedQty (stock never enters formula)
      const finalOrder = updateData.orderQty !== undefined ? Number(updateData.orderQty) : Number(existingPlan.orderQty || 0);
      const finalProd = updateData.producedQty !== undefined ? Number(updateData.producedQty) : Number(existingPlan.producedQty || 0);
      updateData.balanceToMake = Math.max(0, finalOrder - finalProd);
    }

    const plan = await PrintingPlan.findByIdAndUpdate(
      req.params.id,
      updateData,
      { returnDocument: 'after', runValidators: true }
    );
    if (!plan || plan.isDeleted) {
      return res.status(404).json({ success: false, message: "Plan not found" });
    }

    if (isPlainShade) {
      await syncPrintingPlanStockDeduction(plan, plan.producedQty, req.user?._id);
    }

    res.status(200).json({ success: true, data: plan });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Delete Plan
exports.deletePlan = async (req, res) => {
  try {
    const plan = await PrintingPlan.findByIdAndUpdate(req.params.id, { isDeleted: true }, { returnDocument: 'after' });
    if (!plan) {
      return res.status(404).json({ success: false, message: "Plan not found" });
    }
    await revertPrintingPlanStockDeduction(plan, req.user?._id);
    res.status(200).json({ success: true, message: "Plan deleted successfully" });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Get computed stats for frontend form
exports.getComputedStats = async (req, res) => {
  try {
    const { bottleName, brandId, coatingShade, companyId } = req.query;
    let coatedStockAvailable = 0;
    let producedQty = 0;

    let effectiveCompanyId = companyId;
    if (!effectiveCompanyId && brandId) {
      const bDoc = await Brand.findById(brandId);
      if (bDoc && bDoc.companyId) {
        effectiveCompanyId = bDoc.companyId;
      }
    }

    const isPlainShade = (coatingShade || "").trim().toUpperCase() === "PLAIN";

    if (isPlainShade) {
      // 1. PLAIN shade draws directly from shared plain stock (PlainBottleStock master ledger)
      if (bottleName) {
        const stock = await findPlainBottleStockDoc(bottleName, effectiveCompanyId);
        if (stock) {
          coatedStockAvailable = stock.availableQuantity || 0;
        }
      }

      // Also fetch printed qty if bottle and brand exist
      if (bottleName && brandId) {
        let spec = await BottleSpec.findOne({ bottleName, isDeleted: false });
        if (!spec) {
          const selectedPlainBottle = await BottlePerBox.findOne({
            $or: [
              { plainBottleName: bottleName.trim() },
              { bottleName: bottleName.trim() },
              { bottleNames: bottleName.trim() }
            ],
            isDeleted: false
          });
          if (selectedPlainBottle && Array.isArray(selectedPlainBottle.bottleNames) && selectedPlainBottle.bottleNames.length > 0) {
            spec = await BottleSpec.findOne({
              bottleName: { $in: selectedPlainBottle.bottleNames },
              brandId: brandId,
              isDeleted: false
            });
          }
        }
        if (spec) {
          const printRecords = await Production.find({
            bottleSpecId: spec._id,
            brandId,
            isDeleted: false
          });
          producedQty = printRecords.reduce((sum, rec) => sum + (rec.totalPrinted || 0), 0);
        }
      }
    } else {
      // 2. Coloured shades (anything other than PLAIN): stock = Lacquer Coating Completed - Printing Ready of same shade
      coatedStockAvailable = await calculateCoatedStock(coatingShade, effectiveCompanyId);
    }
    
    res.status(200).json({
      success: true,
      data: {
        coatedStockAvailable,
        plainStock: isPlainShade ? coatedStockAvailable : undefined,
        producedQty
      }
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
// Import Previous Day
exports.importPreviousDay = async (req, res) => {
  try {
    const { targetDate, sourceDate, importMode } = req.body;
    if (!targetDate) return res.status(400).json({ success: false, message: "Target date is required" });
    
    let prev;
    if (sourceDate) {
      prev = new Date(sourceDate);
    } else {
      const current = new Date(targetDate);
      prev = new Date(current);
      prev.setUTCDate(prev.getUTCDate() - 1);
    }
    
    const startOfPrevDay = new Date(prev);
    startOfPrevDay.setUTCHours(0,0,0,0);
    const endOfPrevDay = new Date(prev);
    endOfPrevDay.setUTCHours(23,59,59,999);
    
    const oldPlans = await PrintingPlan.find({
      isDeleted: false,
      planDate: { $gte: startOfPrevDay, $lte: endOfPrevDay }
    }).lean();
    
    if (!oldPlans || oldPlans.length === 0) {
      return res.status(404).json({ success: false, message: "No plans found for the source date" });
    }
    
    const startOfTargetDay = new Date(targetDate);
    startOfTargetDay.setUTCHours(0,0,0,0);
    const endOfTargetDay = new Date(targetDate);
    endOfTargetDay.setUTCHours(23,59,59,999);

    const existingTargetPlans = await PrintingPlan.find({
      isDeleted: false,
      planDate: { $gte: startOfTargetDay, $lte: endOfTargetDay }
    }).lean();

    // Helper to detect if a plan row was edited after its initial import
    const isPlanEdited = (p) => {
      if (!p) return false;
      if (p.isEditedAfterImport) return true;
      if (p.originalImportedValues) {
        const orig = p.originalImportedValues;
        for (const k of Object.keys(orig)) {
          if (orig[k] !== undefined && p[k] !== undefined && String(orig[k]) !== String(p[k])) {
            return true;
          }
        }
      }
      if (p.updatedAt && p.createdAt) {
        const diffMs = new Date(p.updatedAt).getTime() - new Date(p.createdAt).getTime();
        if (diffMs > 5000) return true;
      }
      return false;
    };

    const editedCount = oldPlans.filter(p => isPlanEdited(p)).length;
    const hasEditedPlans = editedCount > 0;

    // If source day's plans were edited and user hasn't explicitly chosen importMode yet, prompt for confirmation
    if (hasEditedPlans && !importMode) {
      return res.status(200).json({
        success: true,
        requiresConfirmation: true,
        hasEditedPlans: true,
        editedCount,
        totalPlans: oldPlans.length,
        message: `The source plan has ${editedCount} manually edited entry(s). Please choose whether to import with changes or without changes.`
      });
    }

    // Helper to check if a Printing Plan row is completed
    const isPrintingPlanRowCompleted = (item) => {
      if (!item) return false;
      const order = Number(item.orderQty) || 0;
      const produced = Number(item.producedQty) || 0;
      if (order <= 0 || produced <= 0) return false;
      return produced >= order;
    };

    // Determine candidate values for each source plan based on importMode
    const candidatePlans = oldPlans.map(p => {
      const { _id, createdAt, updatedAt, __v, ...rest } = p;
      let values = { ...rest };

      // If user selected 'without_changes', revert to original as-imported values
      if (importMode === 'without_changes' && p.originalImportedValues) {
        const orig = p.originalImportedValues;
        if (orig.orderQty !== undefined) values.orderQty = orig.orderQty;
        if (orig.producedQty !== undefined) values.producedQty = orig.producedQty;
        if (orig.balanceToMake !== undefined) values.balanceToMake = orig.balanceToMake;
        if (orig.boxQty !== undefined) values.boxQty = orig.boxQty;
        if (orig.noOfBoxes !== undefined) values.noOfBoxes = orig.noOfBoxes;
        if (orig.dispatchBalance !== undefined) values.dispatchBalance = orig.dispatchBalance;
        if (orig.soldQty !== undefined) values.soldQty = orig.soldQty;
        if (orig.readyBoxes !== undefined) values.readyBoxes = orig.readyBoxes;
        if (orig.plainBottleStock !== undefined) values.plainBottleStock = orig.plainBottleStock;
        if (orig.remarks !== undefined) values.remarks = orig.remarks;
        if (orig.printingToBeDone !== undefined) values.printingToBeDone = orig.printingToBeDone;
        if (orig.printingVariant !== undefined) values.printingVariant = orig.printingVariant;
        if (orig.textColor !== undefined) values.textColor = orig.textColor;
        if (orig.coatingShade !== undefined) values.coatingShade = orig.coatingShade;
      }

      return {
        sourcePlan: p,
        values
      };
    });

    // Get sent-to-dispatch rows set for filtering
    const sentSet = await getSentToDispatchPrintingRows(prev, false);

    // Skip any combination that is already completed OR sent to ready-to-dispatch
    const openCandidates = candidatePlans.filter(c => {
      if (isPrintingPlanRowCompleted(c.values)) return false;
      
      // Check if this row has been sent to Ready To Dispatch
      const key = `${String(c.values.bottleName || '').trim().toUpperCase()}|${String(c.values.brandId || '')}|${String(c.values.printingToBeDone || '').trim().toUpperCase()}|${String(c.values.coatingShade || '').trim().toUpperCase()}`;
      if (sentSet.has(key)) return false; // Skip sent rows
      
      return true;
    });

    const newPlansData = await Promise.all(openCandidates.map(async (c) => {
      const finalValues = { ...c.values };
      const isPlain = (finalValues.coatingShade || "").trim().toUpperCase() === "PLAIN";
      if (isPlain && (!finalValues.plainBottleStock || finalValues.plainBottleStock === 0)) {
        const stockDoc = await findPlainBottleStockDoc(finalValues.bottleName, finalValues.companyId);
        finalValues.plainBottleStock = stockDoc?.availableQuantity || 0;
        const prod = Number(finalValues.producedQty) || 0;
        finalValues.balanceToMake = prod > 0 ? (finalValues.plainBottleStock - prod) : finalValues.plainBottleStock;
      }

      const snapshot = {
        orderQty: finalValues.orderQty,
        producedQty: finalValues.producedQty,
        balanceToMake: finalValues.balanceToMake,
        boxQty: finalValues.boxQty,
        noOfBoxes: finalValues.noOfBoxes,
        dispatchBalance: finalValues.dispatchBalance,
        soldQty: finalValues.soldQty,
        readyBoxes: finalValues.readyBoxes,
        plainBottleStock: finalValues.plainBottleStock,
        remarks: finalValues.remarks,
        printingToBeDone: finalValues.printingToBeDone,
        printingVariant: finalValues.printingVariant,
        textColor: finalValues.textColor,
        coatingShade: finalValues.coatingShade
      };

      return {
        ...finalValues,
        appliedStockDeduction: 0,
        planDate: new Date(targetDate),
        isEditedAfterImport: false,
        lastEditedAt: null,
        originalImportedValues: snapshot
      };
    }));

    const plansToInsert = newPlansData.filter(newP => {
      return !existingTargetPlans.some(existP => 
        String(existP.bottleName || '').trim().toUpperCase() === String(newP.bottleName || '').trim().toUpperCase() &&
        String(existP.brandId || '') === String(newP.brandId || '') &&
        String(existP.printingToBeDone || '').trim().toUpperCase() === String(newP.printingToBeDone || '').trim().toUpperCase() &&
        String(existP.coatingShade || '').trim().toUpperCase() === String(newP.coatingShade || '').trim().toUpperCase()
      );
    });

    let newPlans = [];
    if (plansToInsert.length > 0) {
      newPlans = await PrintingPlan.insertMany(plansToInsert);
      for (const plan of newPlans) {
        const isPlain = (plan.coatingShade || "").trim().toUpperCase() === "PLAIN";
        if (isPlain) {
          await syncPrintingPlanStockDeduction(plan, plan.producedQty, req.user?._id);
        }
      }
    }
    
    res.status(200).json({ 
      success: true, 
      data: newPlans,
      skippedCompletedCount: oldPlans.length - openCandidates.length,
      importMode: importMode || 'normal'
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
