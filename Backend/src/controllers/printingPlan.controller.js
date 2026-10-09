const PrintingPlan = require("../models/PrintingPlan");
const LacquerPlan = require("../models/LacquerPlan");
const CoatingProduction = require("../models/CoatingProduction");
const Production = require("../models/Production");
const BottleSpec = require("../models/Bottlespecs");
const Brand = require("../models/Brand");

// Create Printing Plan Manually
exports.createPlan = async (req, res) => {
  try {
    if (Array.isArray(req.body)) {
      const plans = await PrintingPlan.insertMany(req.body);
      return res.status(201).json({ success: true, data: plans });
    } else {
      const plan = new PrintingPlan(req.body);
      await plan.save();
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
      
    // Augment plans with computed fields
    const augmentedPlans = await Promise.all(plans.map(async (plan) => {
      let coatedStockAvailable = 0;
      let producedQty = 0;
      
      let specId = plan.itemId ? (plan.itemId._id || plan.itemId) : null;
      if (!specId && plan.bottleName) {
        const spec = await BottleSpec.findOne({ bottleName: plan.bottleName, isDeleted: false });
        if (spec) specId = spec._id;
      }

      // 1. Fetch coatedStockAvailable (from LacquerPlan's coatingDoneQty logic)
      if (specId && plan.brandId) {
        // We match CoatingProduction using coatingSpecId, brandId, and coatingShade
        const coatingRecords = await CoatingProduction.find({
          coatingSpecId: specId,
          brandId: plan.brandId._id || plan.brandId,
          coatingShade: plan.coatingShade || "",
          isDeleted: false
        });
        
        coatedStockAvailable = coatingRecords.reduce((sum, rec) => sum + (rec.actualQuantity || 0), 0);
      }
      
      // 2. Fetch cumulative producedQty (Printing)
      // Since Production has bottleSpecId and brandId
      if (specId && plan.brandId) {
        const printRecords = await Production.find({
          bottleSpecId: specId,
          brandId: plan.brandId._id || plan.brandId,
          isDeleted: false
        });
        
        producedQty = printRecords.reduce((sum, rec) => sum + (rec.totalPrinted || 0), 0);
      }
      
      const balanceToMake = (plan.orderQty || 0) - producedQty;
      
      let companyName = null;
      if (plan.brandId && plan.brandId.companyId) {
         companyName = plan.brandId.companyId.name;
      } else if (plan.companyId) {
         companyName = plan.companyId.name;
      }
      
      return {
        ...plan,
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
      .populate("itemId");
    if (!plan || plan.isDeleted) {
      return res.status(404).json({ success: false, message: "Plan not found" });
    }
    res.status(200).json({ success: true, data: plan });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Update Plan
exports.updatePlan = async (req, res) => {
  try {
    const plan = await PrintingPlan.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!plan || plan.isDeleted) {
      return res.status(404).json({ success: false, message: "Plan not found" });
    }
    res.status(200).json({ success: true, data: plan });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Delete Plan
exports.deletePlan = async (req, res) => {
  try {
    const plan = await PrintingPlan.findByIdAndUpdate(req.params.id, { isDeleted: true }, { new: true });
    if (!plan) {
      return res.status(404).json({ success: false, message: "Plan not found" });
    }
    res.status(200).json({ success: true, message: "Plan deleted successfully" });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Get computed stats for frontend form
exports.getComputedStats = async (req, res) => {
  try {
    const { bottleName, brandId, coatingShade } = req.query;
    let coatedStockAvailable = 0;
    let producedQty = 0;

    if (bottleName && brandId) {
      const spec = await BottleSpec.findOne({ bottleName, isDeleted: false });
      if (spec) {
        // Fetch coatedStockAvailable
        const coatingRecords = await CoatingProduction.find({
          coatingSpecId: spec._id,
          brandId,
          coatingShade: coatingShade || "",
          isDeleted: false
        });
        
        coatedStockAvailable = coatingRecords.reduce((sum, rec) => sum + (rec.actualQuantity || 0), 0);
        
        // Fetch producedQty
        const printRecords = await Production.find({
          bottleSpecId: spec._id,
          brandId,
          isDeleted: false
        });
        
        producedQty = printRecords.reduce((sum, rec) => sum + (rec.totalPrinted || 0), 0);
      }
    }
    
    res.status(200).json({ success: true, data: { coatedStockAvailable, producedQty } });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
// Import Previous Day
exports.importPreviousDay = async (req, res) => {
  try {
    const { targetDate, sourceDate } = req.body;
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
    
    const newPlansData = oldPlans.map(p => {
      const { _id, createdAt, updatedAt, __v, ...rest } = p;
      return {
        ...rest,
        planDate: new Date(targetDate)
      };
    });
    
    const newPlans = await PrintingPlan.insertMany(newPlansData);
    
    res.status(200).json({ success: true, data: newPlans });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
