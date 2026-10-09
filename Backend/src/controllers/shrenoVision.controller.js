const fs = require("fs");
const Company = require("../models/Company");
const BottlePerBox = require("../models/BottlePerBox");
const { parseChallanData, callGoogleVisionFull, callGoogleVisionForPdf, extractPdfWords } = require("../services/challanVision.service");

exports.parseShrenoChallan = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: "At least one file required" });
    }

    const companies = await Company.find();
    const bottlePerBoxes = await BottlePerBox.find();
    const ItemType = require("../models/ItemType");
    const itemTypes = await ItemType.find({ isDeleted: false });

    let finalData = {
      deliveryNumber: null,
      documentDate: null,
      poNo: null,
      poDate: null,
      poOrderQty: null,
      items: [],
      unmatchedItems: []
    };

    const fileUrls = [];

    for (const file of req.files) {
      const filePath = file.path;
      const fileBuffer = fs.readFileSync(filePath);
      const mimeType = file.mimetype;
      fileUrls.push(`/uploads/incoming/${file.filename}`);

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

      const parsedData = parseChallanData(ocrResult, companies, bottlePerBoxes);
      
      if (!finalData.deliveryNumber && parsedData.deliveryNumber) finalData.deliveryNumber = parsedData.deliveryNumber;
      if (!finalData.documentDate && parsedData.documentDate) finalData.documentDate = parsedData.documentDate;
      if (!finalData.poNo && parsedData.poNo) finalData.poNo = parsedData.poNo;
      if (!finalData.poDate && parsedData.poDate) finalData.poDate = parsedData.poDate;
      if (finalData.poOrderQty == null && parsedData.poOrderQty != null) finalData.poOrderQty = parsedData.poOrderQty;

      const processItem = (item) => {
        let detectedItemType = null;
        let detectedConfig = "";
        
        if (item.textLine) {
          const safeTextLine = String(item.textLine);
          const textLineLower = safeTextLine.toLowerCase();
          
          // 1. Detect ItemType
          const sortedTypes = [...itemTypes].filter(it => it && typeof it.name === 'string').sort((a, b) => b.name.length - a.name.length);
          
          // Pass 1: Strict word boundary match
          for (const it of sortedTypes) {
            const matchName = it.name.trim();
            const regex = new RegExp(`\\b${matchName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
            if (regex.test(safeTextLine)) {
              detectedItemType = it;
              break;
            }
          }
          
          // Pass 2: Fuzzy match if strict fails
          if (!detectedItemType) {
            for (const it of sortedTypes) {
              const cleanMatch = it.name.toLowerCase().replace(/[^a-z0-9]/g, '');
              const cleanLine = textLineLower.replace(/[^a-z0-9]/g, '');
              
              // OCR typo fallbacks
              if (cleanMatch === 'bulk' && cleanLine.includes('rulk')) {
                detectedItemType = it;
                break;
              }
              
              if (cleanMatch.length > 1 && cleanLine.includes(cleanMatch)) {
                detectedItemType = it;
                break;
              }
            }
          }
          
          // 2. Detect Configuration (e.g., "2PC", "2PC/16", "64x1")
          const configParts = [];
          
          // Match things like 2PC, 2PC/16, 4 PC
          const pcMatch = safeTextLine.match(/\b\d+\s*(?:PC|PCS|P\.C\.|Pcs)(?:\s*\/\s*\d+)?\b/i);
          if (pcMatch) configParts.push(pcMatch[0].toUpperCase().replace(/\s+/g, ''));
          
          const boxMatch = safeTextLine.match(/\b\d+\s*[xX*]\s*\d+\b/);
          if (boxMatch) configParts.push(boxMatch[0].toUpperCase().replace(/\s+/g, ''));
          
          const isGP = detectedItemType && typeof detectedItemType.name === 'string' && detectedItemType.name.toLowerCase().trim() === 'gp';
          const isBulk = detectedItemType && typeof detectedItemType.name === 'string' && detectedItemType.name.toLowerCase().trim() === 'bulk';

          if (configParts.length > 0) {
            detectedConfig = configParts.join(', ');
          } else if (!isGP && !isBulk) {
            let tempConfig = safeTextLine
              .replace(/\b\d+(?:\.\d+)?\b/g, '')
              .replace(/\b(kg|g|l|ml|pcs|ltr|gm|pieces|boxes|nos?|no\.|bags|ton|mt|ctn|cartons?|car|set|cgst|sgst|igst|total|tax|rate|sust|cust)\b/ig, '')
              .replace(/[^\w\s-]/g, '')
              .replace(/\s+/g, ' ')
              .trim();
              
            if (detectedItemType && typeof detectedItemType.name === 'string') {
              const typeRegex = new RegExp(`\\b${detectedItemType.name.trim()}\\b`, 'i');
              tempConfig = tempConfig.replace(typeRegex, '').replace(/\s+/g, ' ').trim();
            }

            const matchNumber = tempConfig.match(/\d/);
            if (matchNumber) {
              detectedConfig = tempConfig.slice(matchNumber.index);
            } else {
              detectedConfig = tempConfig;
            }
          }
        }
        
        return {
          ...item,
          itemType: detectedItemType ? detectedItemType._id.toString() : null,
          itemTypeName: detectedItemType ? detectedItemType.name : "",
          configuration: detectedConfig
        };
      };

      if (parsedData.unmatchedItems && parsedData.unmatchedItems.length > 0) {
        const processedUnmatched = parsedData.unmatchedItems.map(processItem);
        finalData.unmatchedItems.push(...processedUnmatched);
      }
    
      if (parsedData.items && parsedData.items.length > 0) {
        const processedItems = parsedData.items.map(processItem);
        finalData.items.push(...processedItems);
      }
    } // End of req.files loop

    if (finalData.items.length === 0 && finalData.unmatchedItems.length === 0 && !finalData.deliveryNumber) {
      return res.status(400).json({ success: false, message: "Could not extract any useful data from the provided files." });
    }

    res.json({ success: true, ...finalData, fileUrls });

    } catch (err) {
      console.error("PARSE SHRENO CHALLAN ERROR:", err.message);
      res.status(500).json({ success: false, message: err.message });
    }
};
