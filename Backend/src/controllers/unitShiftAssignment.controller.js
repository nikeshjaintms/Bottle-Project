const UnitShiftAssignment = require("../models/UnitShiftAssignment");
const Unit = require("../models/Unit");

// ✅ CREATE
exports.createAssignment = async (req, res) => {
  try {
    const { unitId, operatorId, shiftId } = req.body;

    if (!unitId || !operatorId || !shiftId) {
      return res.status(400).json({ message: "unitId, operatorId, and shiftId are required" });
    }

    // Check if this unit already has an assignment for this shift
    const existing = await UnitShiftAssignment.findOne({ unitId, shiftId });
    if (existing) {
      return res.status(400).json({ message: "This unit already has an operator assigned for this shift" });
    }

    const assignment = await UnitShiftAssignment.create({
      unitId,
      operatorId,
      shiftId
    });

    const populated = await UnitShiftAssignment.findById(assignment._id)
      .populate("operatorId", "name")
      .populate("shiftId", "name");

    res.status(201).json({ success: true, data: populated });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: "This unit already has an operator assigned for this shift" });
    }
    res.status(500).json({ message: err.message });
  }
};

// ✅ GET BY UNIT
exports.getAssignmentsByUnit = async (req, res) => {
  try {
    const { unitId } = req.params;
    
    const assignments = await UnitShiftAssignment.find()
        .populate("operatorId", "name")
      .populate("shiftId", "name")
      .sort({ createdAt: -1 });

    res.json({ success: true, data: assignments });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✅ DELETE
exports.deleteAssignment = async (req, res) => {
  try {
    const assignment = await UnitShiftAssignment.findByIdAndDelete(req.params.id);
    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }
    res.json({ success: true, message: "Assignment deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✅ RESOLVE ASSIGNMENT BY UNIT NUMBER AND SHIFT (FOR COATING PRODUCTION)
exports.resolveAssignment = async (req, res) => {
  try {
    const { unitNumber, shiftId } = req.query;

    if (!unitNumber || !shiftId) {
      return res.status(400).json({ message: "unitNumber and shiftId query parameters are required" });
    }

    // Safely map the number (e.g. 1) to the actual Unit document
    const unit = await Unit.findOne({ 
      name: new RegExp(`^Unit\\s+${unitNumber}$`, 'i'), 
      status: { $ne: false }, 
      isDeleted: false 
    });

    if (!unit) {
      return res.status(404).json({ message: `Active Unit ${unitNumber} not found in masters` });
    }

    // Now find the assignment
    const assignment = await UnitShiftAssignment.findOne({ unitId: unit._id, shiftId })
      .populate("operatorId")
      .populate("shiftId");

    if (!assignment) {
      return res.status(404).json({ message: `No operator is assigned to Unit ${unitNumber} for this shift` });
    }

    res.json({ success: true, data: assignment });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
