const DeliveryChallan = require("../models/DeliveryChallan");
const Company = require("../models/Company");
const CompanyAddress = require("../models/CompanyAddress");
const { generateChallanHtml } = require("../templates/deliveryChallanHtml");
const { generateMcnoreChallanHtml } = require("../templates/mcnoreChallanHtml");
const { generateShrenoChallanHtml } = require("../templates/shrenoChallanHtml");
const { getSharedBrowser } = require("../services/sharedPuppeteer");

// Helper to calculate total boxes from an expression or string
function parseBoxCount(boxStr) {
  if (!boxStr) return 0;
  const str = String(boxStr).trim();
  // If format is like "60+(1*28)", the total boxes is 60 + 1 = 61 boxes
  const match = str.match(/^(\d+)\s*\+\s*\((\d+)\s*\*\s*(\d+)\)$/);
  if (match) {
    return parseInt(match[1]) + parseInt(match[2]);
  }
  // If simple integer
  const num = parseInt(str);
  return isNaN(num) ? 0 : num;
}

// ✅ CREATE CHALLAN
exports.createChallan = async (req, res) => {
  try {
    const {
      challanType = "shayoona",
      poMode = "without_po",
      taxInvoiceNo = "",
      taxInvoiceDate = "",
      poNo = "",
      poDate = "",
      challanNo,
      challanDate,
      challanTime,
      buyersOrderNo,
      dispatchThrough,
      transporter,
      lrNo,
      vehicleNo,
      companyId,
      billedToAddressId,
      billedTo,
      shippedToAddressId,
      shippedTo,
      items = [],
      glassBottleValue,
      jobWorkChargesValue,
      sgst,
      cgst,
      igst,
      grandTotalValue,
      checkedBy,
      checkedDate,
      checkedTime,
      remarks,
    } = req.body;

    if (!challanNo || !challanNo.trim()) {
      return res.status(400).json({ success: false, message: "Delivery Challan No is required" });
    }

    let targetCompanyId = companyId;
    if (!targetCompanyId && challanType === "mcnore") {
      const mcnoreComp = await Company.findOne({ name: { $regex: /mcn/i } });
      if (mcnoreComp) targetCompanyId = mcnoreComp._id;
    }
    if (!targetCompanyId && (challanType === "sherno" || challanType === "shreno")) {
      const shrenoComp = await Company.findOne({ name: { $regex: /shreno|sherno/i } });
      if (shrenoComp) targetCompanyId = shrenoComp._id;
    }

    if (!targetCompanyId) {
      return res.status(400).json({ success: false, message: "Company is required" });
    }

    // Lookup company name
    let companyName = "";
    const comp = await Company.findById(targetCompanyId);
    if (comp) companyName = comp.name;

    const isMcnoreChallan = challanType === "mcnore" ||
      (companyName && companyName.toLowerCase().includes("mcn")) ||
      (comp && comp.name && comp.name.toLowerCase().includes("mcn"));

    const isShernoChallan = challanType === "sherno" || challanType === "shreno" ||
      (companyName && companyName.toLowerCase().includes("shreno")) ||
      (companyName && companyName.toLowerCase().includes("sherno")) ||
      (comp && comp.name && comp.name.toLowerCase().includes("shreno")) ||
      (comp && comp.name && comp.name.toLowerCase().includes("sherno"));

    const finalChallanType = isMcnoreChallan ? "mcnore" : (isShernoChallan ? "sherno" : (challanType || "shayona"));

    // Check duplicate challanNo for this challanType
    const existing = await DeliveryChallan.findOne({
      challanType: finalChallanType,
      challanNo: challanNo.trim(),
      isDeleted: { $ne: true },
    });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: `Delivery Challan No "${challanNo}" already exists.`,
      });
    }

    // Snapshot Billed To Address if provided
    let billedToSnapshot = billedTo || {};
    if (billedToAddressId && (!billedToSnapshot.addressLine1 || !billedToSnapshot.name)) {
      const addr = await CompanyAddress.findById(billedToAddressId);
      if (addr) {
        billedToSnapshot = {
          name: comp ? comp.name : "",
          addressTitle: addr.addressTitle,
          addressLine1: addr.addressLine1,
          addressLine2: addr.addressLine2,
          city: addr.city,
          state: addr.state || "GUJARAT",
          stateCode: addr.gstNo ? addr.gstNo.substring(0, 2) : "24",
          pincode: addr.pincode,
          gstNo: addr.gstNo,
          contactPerson: addr.contactPerson,
          contactPhone: addr.contactPhone,
        };
      }
    }

    // Snapshot Shipped To Address if provided
    let shippedToSnapshot = shippedTo || {};
    if (shippedToAddressId && (!shippedToSnapshot.addressLine1 || !shippedToSnapshot.name)) {
      const addr = await CompanyAddress.findById(shippedToAddressId);
      if (addr) {
        shippedToSnapshot = {
          name: comp ? comp.name : "",
          addressTitle: addr.addressTitle,
          addressLine1: addr.addressLine1,
          addressLine2: addr.addressLine2,
          city: addr.city,
          state: addr.state || "GUJARAT",
          stateCode: addr.gstNo ? addr.gstNo.substring(0, 2) : "24",
          pincode: addr.pincode,
          gstNo: addr.gstNo,
          contactPerson: addr.contactPerson,
          contactPhone: addr.contactPhone,
        };
      }
    }

    // Compute totals
    let totalBoxes = 0;
    let totalQuantity = 0;

    const formattedItems = (items || []).map((it) => {
      const bCount = it.boxCount !== undefined && it.boxCount !== null ? Number(it.boxCount) : parseBoxCount(it.box);
      totalBoxes += bCount;
      const itTotal = Number(it.total) || (Number(it.unit) * bCount) || 0;
      totalQuantity += itTotal;

      return {
        title: it.title || "",
        description: it.description || "",
        box: String(it.box || ""),
        boxCount: bCount,
        unit: Number(it.unit) || 1,
        total: itTotal,
        hsn: it.hsn || "",
        materialCode: it.materialCode || "",
        rate: Number(it.rate) || 0,
        taxableValue: Number(it.taxableValue) || 0,
        jobWorkRate: Number(it.jobWorkRate) || 0,
        jobWorkTaxableValue: Number(it.jobWorkTaxableValue) || 0,
        remarks: it.remarks || "",
      };
    });

    const challan = await DeliveryChallan.create({
      challanType: finalChallanType,
      poMode: poMode || (isMcnoreChallan ? "with_po" : "without_po"),
      taxInvoiceNo: taxInvoiceNo || "",
      taxInvoiceDate: taxInvoiceDate || "",
      poNo: poNo || "",
      poDate: poDate || "",
      challanNo: challanNo.trim(),
      challanDate: challanDate ? new Date(challanDate) : new Date(),
      challanTime: challanTime || "",
      buyersOrderNo: buyersOrderNo || "",
      dispatchThrough: dispatchThrough || "",
      transporter: transporter || dispatchThrough || "",
      lrNo: lrNo || "",
      vehicleNo: vehicleNo || "",
      companyId: targetCompanyId,
      companyName,
      billedToAddressId: billedToAddressId || null,
      billedTo: billedToSnapshot,
      shippedToAddressId: shippedToAddressId || null,
      shippedTo: shippedToSnapshot,
      items: formattedItems,
      totalBoxes,
      totalQuantity,
      glassBottleValue: Number(glassBottleValue) || 0,
      jobWorkChargesValue: Number(jobWorkChargesValue) || 0,
      sgst: Number(sgst) || 0,
      cgst: Number(cgst) || 0,
      igst: Number(igst) || 0,
      grandTotalValue: Number(grandTotalValue) || 0,
      checkedBy: checkedBy || "",
      checkedDate: checkedDate || "",
      checkedTime: checkedTime || "",
      remarks: remarks || "",
      createdBy: req.user?._id || null,
    });

    const populated = await challan.populate("companyId", "name");

    res.status(201).json({
      success: true,
      message: "Delivery Challan created successfully",
      data: populated,
    });
  } catch (err) {
    console.error("CREATE DELIVERY CHALLAN ERROR:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ GET NEXT CHALLAN NO
exports.getNextChallanNo = async (req, res) => {
  try {
    const { challanType = "shayoona" } = req.query;

    const query = { isDeleted: { $ne: true } };
    if (challanType === "sherno" || challanType === "shreno") {
      query.$or = [
        { challanType: { $in: ["sherno", "shreno"] } },
        { companyName: { $regex: /shreno|sherno/i } },
      ];
    } else if (challanType === "mcnore") {
      query.$or = [
        { challanType: "mcnore" },
        { companyName: { $regex: /mcn/i } },
      ];
    } else {
      query.challanType = challanType;
    }

    const lastChallan = await DeliveryChallan.findOne(query).sort({ createdAt: -1 });

    let nextNo = challanType === "mcnore" ? 955 : (challanType === "sherno" || challanType === "shreno" ? 944 : 806);
    if (lastChallan && lastChallan.challanNo) {
      const numMatch = lastChallan.challanNo.match(/(\d+)/);
      if (numMatch) {
        nextNo = parseInt(numMatch[1]) + 1;
      }
    }

    res.json({ success: true, nextNo: String(nextNo) });
  } catch (err) {
    console.error("GET NEXT CHALLAN NO ERROR:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ GET CHALLANS (Search + Filter + Pagination)
exports.getChallans = async (req, res) => {
  try {
    let {
      page = 1,
      limit = 10,
      search = "",
      pagination = "true",
      challanType = "shayoona",
      companyId,
    } = req.query;

    const parsedPage = parseInt(page) || 1;
    const parsedLimit = parseInt(limit) || 10;
    const skip = (parsedPage - 1) * parsedLimit;

    let filter = {
      isDeleted: { $ne: true },
    };

    if (challanType === "sherno" || challanType === "shreno") {
      filter.$or = [
        { challanType: { $in: ["sherno", "shreno"] } },
        { companyName: { $regex: /shreno|sherno/i } },
        { "billedTo.name": { $regex: /shreno|sherno/i } },
      ];
    } else if (challanType === "mcnore") {
      filter.$or = [
        { challanType: "mcnore" },
        { companyName: { $regex: /mcn/i } },
        { "billedTo.name": { $regex: /mcn/i } },
      ];
    } else {
      filter.challanType = challanType;
    }

    if (companyId) {
      filter.companyId = companyId;
    }

    if (search && search.trim() !== "") {
      const searchConditions = [
        { challanNo: { $regex: search, $options: "i" } },
        { companyName: { $regex: search, $options: "i" } },
        { vehicleNo: { $regex: search, $options: "i" } },
        { buyersOrderNo: { $regex: search, $options: "i" } },
        { lrNo: { $regex: search, $options: "i" } },
        { "items.title": { $regex: search, $options: "i" } },
        { "items.description": { $regex: search, $options: "i" } },
      ];

      if (filter.$or) {
        const typeOr = filter.$or;
        delete filter.$or;
        filter.$and = [
          { $or: typeOr },
          { $or: searchConditions },
        ];
      } else {
        filter.$or = searchConditions;
      }
    }

    let query = DeliveryChallan.find(filter)
      .populate("companyId", "name")
      .populate("createdBy", "name")
      .sort({ createdAt: -1 });

    if (pagination !== "false") {
      query = query.skip(skip).limit(parsedLimit);
    }

    const challans = await query;
    const total = await DeliveryChallan.countDocuments(filter);

    if (pagination === "false") {
      return res.json({ success: true, data: challans, total });
    }

    res.json({
      success: true,
      data: challans,
      page: parsedPage,
      totalPages: Math.ceil(total / parsedLimit) || 1,
      total,
    });
  } catch (err) {
    console.error("GET CHALLANS ERROR:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ GET CHALLAN BY ID
exports.getChallanById = async (req, res) => {
  try {
    const challan = await DeliveryChallan.findOne({
      _id: req.params.id,
      isDeleted: { $ne: true },
    })
      .populate("companyId", "name")
      .populate("billedToAddressId")
      .populate("shippedToAddressId")
      .populate("createdBy", "name");

    if (!challan) {
      return res.status(404).json({ success: false, message: "Delivery Challan not found" });
    }

    res.json({ success: true, data: challan });
  } catch (err) {
    console.error("GET CHALLAN BY ID ERROR:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ UPDATE CHALLAN
exports.updateChallan = async (req, res) => {
  try {
    const body = { ...req.body };

    if (body.challanNo) {
      const existing = await DeliveryChallan.findOne({
        _id: { $ne: req.params.id },
        challanType: body.challanType || "shayoona",
        challanNo: body.challanNo.trim(),
        isDeleted: { $ne: true },
      });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: `Delivery Challan No "${body.challanNo}" already exists.`,
        });
      }
      body.challanNo = body.challanNo.trim();
    }

    if (body.companyId) {
      const comp = await Company.findById(body.companyId);
      if (comp) body.companyName = comp.name;
    }

    if (body.items) {
      let totalBoxes = 0;
      let totalQuantity = 0;
      body.items = body.items.map((it) => {
        const bCount = it.boxCount !== undefined && it.boxCount !== null ? Number(it.boxCount) : parseBoxCount(it.box);
        totalBoxes += bCount;
        const itTotal = Number(it.total) || (Number(it.unit) * bCount) || 0;
        totalQuantity += itTotal;
        return {
          title: it.title || "",
          description: it.description || "",
          box: String(it.box || ""),
          boxCount: bCount,
          unit: Number(it.unit) || 1,
          total: itTotal,
          hsn: it.hsn || "",
          materialCode: it.materialCode || "",
          rate: Number(it.rate) || 0,
          taxableValue: Number(it.taxableValue) || 0,
          jobWorkRate: Number(it.jobWorkRate) || 0,
          jobWorkTaxableValue: Number(it.jobWorkTaxableValue) || 0,
          remarks: it.remarks || "",
        };
      });
      body.totalBoxes = totalBoxes;
      body.totalQuantity = totalQuantity;
    }

    const updated = await DeliveryChallan.findByIdAndUpdate(req.params.id, body, {
      returnDocument: "after",
    })
      .populate("companyId", "name")
      .populate("billedToAddressId")
      .populate("shippedToAddressId");

    if (!updated) {
      return res.status(404).json({ success: false, message: "Delivery Challan not found" });
    }

    res.json({
      success: true,
      message: "Delivery Challan updated successfully",
      data: updated,
    });
  } catch (err) {
    console.error("UPDATE CHALLAN ERROR:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ RENDER CHALLAN HTML (FOR BROWSER VIEW / PREVIEW)
exports.renderChallanHtml = async (req, res) => {
  try {
    const challan = await DeliveryChallan.findById(req.params.id)
      .populate("companyId", "name")
      .populate("billedToAddressId")
      .populate("shippedToAddressId");

    if (!challan || challan.isDeleted) {
      return res.status(404).send("<h2>Delivery Challan not found</h2>");
    }

    const isMcnore = challan.challanType === "mcnore" ||
      (challan.companyName && challan.companyName.toLowerCase().includes("mcn")) ||
      (challan.companyId && challan.companyId.name && challan.companyId.name.toLowerCase().includes("mcn"));

    const isShreno = challan.challanType === "shreno" ||
      (challan.companyName && challan.companyName.toLowerCase().includes("shreno")) ||
      (challan.companyId && challan.companyId.name && challan.companyId.name.toLowerCase().includes("shreno")) ||
      (challan.billedTo && challan.billedTo.name && challan.billedTo.name.toLowerCase().includes("shreno"));

    const html = isMcnore
      ? generateMcnoreChallanHtml(challan)
      : isShreno
      ? generateShrenoChallanHtml(challan)
      : generateChallanHtml(challan);
    res.setHeader("Content-Type", "text/html");
    return res.send(html);
  } catch (err) {
    console.error("RENDER CHALLAN HTML ERROR:", err);
    return res.status(500).send(`<h2>Error generating Challan HTML: ${err.message}</h2>`);
  }
};

// ✅ DOWNLOAD CHALLAN PDF (SERVER-SIDE HIGH QUALITY PUPPETEER PDF WITH PAGINATION)
exports.downloadChallanPdf = async (req, res) => {
  try {
    const challan = await DeliveryChallan.findById(req.params.id)
      .populate("companyId", "name")
      .populate("billedToAddressId")
      .populate("shippedToAddressId");

    if (!challan || challan.isDeleted) {
      return res.status(404).json({ success: false, message: "Delivery Challan not found" });
    }

    const isMcnore = challan.challanType === "mcnore" ||
      (challan.companyName && challan.companyName.toLowerCase().includes("mcn")) ||
      (challan.companyId && challan.companyId.name && challan.companyId.name.toLowerCase().includes("mcn"));

    const isShreno = challan.challanType === "shreno" ||
      (challan.companyName && challan.companyName.toLowerCase().includes("shreno")) ||
      (challan.companyId && challan.companyId.name && challan.companyId.name.toLowerCase().includes("shreno")) ||
      (challan.billedTo && challan.billedTo.name && challan.billedTo.name.toLowerCase().includes("shreno"));

    const html = isMcnore
      ? generateMcnoreChallanHtml(challan)
      : isShreno
      ? generateShrenoChallanHtml(challan)
      : generateChallanHtml(challan);
    const browser = await getSharedBrowser();
    const page = await browser.newPage();

    try {
      await page.setContent(html, { waitUntil: "networkidle0" });

      const pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
        preferCSSPageSize: true,
        margin: {
          top: "10mm",
          bottom: "10mm",
          left: "10mm",
          right: "10mm",
        },
      });

      const filename = `Delivery_Challan_${challan.challanNo || "Shayona"}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      return res.end(pdfBuffer);
    } finally {
      await page.close();
    }
  } catch (err) {
    console.error("DOWNLOAD CHALLAN PDF ERROR:", err);
    return res.status(500).json({ success: false, message: `PDF Generation Failed: ${err.message}` });
  }
};

// ✅ DELETE CHALLAN
exports.deleteChallan = async (req, res) => {
  try {
    const deleted = await DeliveryChallan.findByIdAndUpdate(
      req.params.id,
      { isDeleted: true },
      { new: true }
    );

    if (!deleted) {
      return res.status(404).json({ success: false, message: "Delivery Challan not found" });
    }

    res.json({ success: true, message: "Delivery Challan deleted successfully" });
  } catch (err) {
    console.error("DELETE CHALLAN ERROR:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};
