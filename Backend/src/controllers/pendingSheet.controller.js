const PendingSheet = require("../models/PendingSheet");

exports.createRecord = async (req, res) => {
  try {
    if (Array.isArray(req.body)) {
      const records = await PendingSheet.insertMany(req.body);
      return res.status(201).json({ success: true, data: records });
    } else {
      const record = new PendingSheet(req.body);
      await record.save();
      return res.status(201).json({ success: true, data: record });
    }
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.getRecords = async (req, res) => {
  try {
    const records = await PendingSheet.find({ isDeleted: false })
      .populate("brandId", "name")
      .sort({ date: -1 });
    res.status(200).json({ success: true, data: records });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.getRecordById = async (req, res) => {
  try {
    const record = await PendingSheet.findById(req.params.id)
      .populate("brandId", "name");
    if (!record || record.isDeleted) {
      return res.status(404).json({ success: false, message: "Record not found" });
    }
    res.status(200).json({ success: true, data: record });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.updateRecord = async (req, res) => {
  try {
    const record = await PendingSheet.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!record || record.isDeleted) {
      return res.status(404).json({ success: false, message: "Record not found" });
    }
    res.status(200).json({ success: true, data: record });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.deleteRecord = async (req, res) => {
  try {
    const record = await PendingSheet.findByIdAndUpdate(req.params.id, { isDeleted: true }, { new: true });
    if (!record) {
      return res.status(404).json({ success: false, message: "Record not found" });
    }
    res.status(200).json({ success: true, message: "Record deleted successfully" });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
