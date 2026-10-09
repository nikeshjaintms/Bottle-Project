const fs = require("fs");
const RawMaterial = require("../models/RawMaterial");
const { parseInvoiceData, callGoogleVisionFull, callGoogleVisionForPdf, extractPdfWords } = require("../services/invoiceVision.service");

exports.parseInvoice = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: "At least one file required" });
    }

    const rawMaterials = await RawMaterial.find();
    
    let finalData = {
      deliveryNumber: null,
      documentDate: null,
      poNo: null,
      poDate: null,
      items: [],
      unmatchedItems: []
    };

    const fileUrls = [];

    for (const file of req.files) {
      const filePath = file.path;
      const fileBuffer = fs.readFileSync(filePath);
      const mimeType = file.mimetype;
      fileUrls.push("/uploads/" + file.filename);

      let ocrResult = null;

      if (mimeType === "application/pdf") {
        const words = await extractPdfWords(fileBuffer);
        if (words && words.length > 0) {
          ocrResult = { type: 'pdf', data: words };
        } else {
          const visionResult = await callGoogleVisionForPdf(filePath);
          ocrResult = { type: 'vision', data: visionResult };
        }
      } else {
        const visionResult = await callGoogleVisionFull(fileBuffer);
        ocrResult = { type: 'vision', data: visionResult };
      }

      if (!ocrResult || !ocrResult.data || (Array.isArray(ocrResult.data) && ocrResult.data.length === 0)) {
        continue;
      }

      const parsedData = parseInvoiceData(ocrResult, rawMaterials);

      if (parsedData.deliveryNumber && !finalData.deliveryNumber) finalData.deliveryNumber = parsedData.deliveryNumber;
      if (parsedData.documentDate && !finalData.documentDate) finalData.documentDate = parsedData.documentDate;
      if (parsedData.poNo && !finalData.poNo) finalData.poNo = parsedData.poNo;
      if (parsedData.poDate && !finalData.poDate) finalData.poDate = parsedData.poDate;
      
      if (parsedData.items && parsedData.items.length > 0) {
        finalData.items = [...finalData.items, ...parsedData.items];
      }
      if (parsedData.unmatchedItems && parsedData.unmatchedItems.length > 0) {
        finalData.unmatchedItems = [...finalData.unmatchedItems, ...parsedData.unmatchedItems];
      }
    }

    res.json({ success: true, ...finalData, fileUrls });

  } catch (err) {
    console.error("PARSE INVOICE ERROR:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};