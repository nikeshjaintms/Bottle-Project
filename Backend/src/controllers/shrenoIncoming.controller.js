const ShrenoIncoming = require('../models/ShrenoIncoming');

exports.createShrenoIncoming = async (req, res) => {
  try {
    const existing = await ShrenoIncoming.findOne({ challanNo: req.body.challanNo, isDeleted: false });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Challan Number already exists' });
    }

    let createData = { ...req.body };
    if (createData.items && typeof createData.items === 'string') {
        createData.items = JSON.parse(createData.items);
    }



    let images = [];
    if (req.files && req.files.length > 0) {
      images = req.files.map(file => `/uploads/incoming/${file.filename}`);
    }

    const shrenoIncoming = new ShrenoIncoming({
      ...createData,
      images: images
    });
    await shrenoIncoming.save();
    res.status(201).json({ success: true, data: shrenoIncoming });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getShrenoIncomings = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '' } = req.query;
    const skip = (page - 1) * limit;

    let query = { isDeleted: false };
    if (search) {
      query.challanNo = { $regex: search, $options: 'i' };
    }

    // if pagination=false
    if (req.query.pagination === 'false') {
      const incomings = await ShrenoIncoming.find(query)
        .populate('items.plainBottle')
        .populate('items.itemType')
        .sort({ createdAt: -1 });
      return res.status(200).json({ success: true, data: incomings });
    }

    const incomings = await ShrenoIncoming.find(query)
      .populate('items.plainBottle')
      .populate('items.itemType')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await ShrenoIncoming.countDocuments(query);

    res.status(200).json({
      success: true,
      data: incomings,
      total,
      totalPages: Math.ceil(total / limit),
      page: parseInt(page)
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getShrenoIncomingById = async (req, res) => {
  try {
    const shrenoIncoming = await ShrenoIncoming.findById(req.params.id)
      .populate('items.plainBottle')
      .populate('items.itemType');
    
    if (!shrenoIncoming || shrenoIncoming.isDeleted) {
      return res.status(404).json({ success: false, message: 'Shreno Incoming not found' });
    }
    res.status(200).json({ success: true, data: shrenoIncoming });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateShrenoIncoming = async (req, res) => {
  try {
    if (req.body.challanNo) {
      const existing = await ShrenoIncoming.findOne({ challanNo: req.body.challanNo, _id: { $ne: req.params.id }, isDeleted: false });
      if (existing) {
        return res.status(400).json({ success: false, message: 'Challan Number already exists' });
      }
    }

    let updateData = { ...req.body };
    if (updateData.items && typeof updateData.items === 'string') {
        updateData.items = JSON.parse(updateData.items);
    }



    if (req.files && req.files.length > 0) {
      updateData.images = req.files.map(file => `/uploads/incoming/${file.filename}`);
    }

    const shrenoIncoming = await ShrenoIncoming.findByIdAndUpdate(
      req.params.id,
      updateData,
      { returnDocument: 'after', runValidators: true }
    ).populate('items.plainBottle').populate('items.itemType');

    if (!shrenoIncoming) {
      return res.status(404).json({ success: false, message: 'Shreno Incoming not found' });
    }
    res.status(200).json({ success: true, data: shrenoIncoming });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteShrenoIncoming = async (req, res) => {
  try {
    const shrenoIncoming = await ShrenoIncoming.findByIdAndUpdate(
      req.params.id,
      { isDeleted: true },
      { returnDocument: 'after' }
    );
    if (!shrenoIncoming) {
      return res.status(404).json({ success: false, message: 'Shreno Incoming not found' });
    }
    res.status(200).json({ success: true, message: 'Shreno Incoming deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
