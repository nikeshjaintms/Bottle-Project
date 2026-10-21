const fs = require('fs');
const path = require('path');
const stringSimilarity = require('string-similarity');
const axios = require("axios");
const pdfParse = require("pdf-parse");

/**
 * Normalizes strings for robust matching.
 */
function normalize(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractChallanNumbersNearText(textChunk, bottleName = "", rowWords = [], qtyColumnX = -1, qtyColumnRightBound = Infinity, documentLayout = 'BOX_STYLE', isStrict = false) {
  // 0. Remove the bottle name itself so we don't extract bottle sizes (like "100" from "100 ML")
  let cleanChunk = textChunk;
  if (bottleName) {
    // Escape regex characters just in case
    const safeName = bottleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    cleanChunk = cleanChunk.replace(new RegExp(safeName, 'gi'), '');
  }

  // Explicitly strip any number that is immediately preceded by the word "per" or "PER"
  cleanChunk = cleanChunk.replace(/\bper\s*\d+/gi, '');
  cleanChunk = cleanChunk.replace(/\bper\s*[a-zA-Z]+\s*\d+/gi, '');

  // 0.5 Remove rate denominators like "/ 1000 Pcs", "per 1000", or just "1000 Pcs"
  cleanChunk = cleanChunk.replace(/\/\s*\d+\s*[a-zA-Z]*/g, '');
  cleanChunk = cleanChunk.replace(/\b1000\s*(?:pcs|nos|pieces|ctn)\b/gi, '');

  // 1. We no longer strip decimals because some invoices use 243.000 for quantities.
  // Column boundaries will safely ignore prices.
  let noDecimalChunk = cleanChunk;
  
  // 2. Remove HSN codes (usually 4 to 8 digits, typically sitting alone, often > 1000)
  noDecimalChunk = noDecimalChunk.replace(/\b\d{6,8}\b/g, '');

  let finalCleanChunk = noDecimalChunk.replace(/(\d)\s*,\s*(\d)/g, (match, p1, p2) => p1 + p2);
  finalCleanChunk = finalCleanChunk.replace(/,/g, '');

  const finalCleanChunkTokens = finalCleanChunk
    .split(/\s+/)
    .filter(tok => !(/[A-Za-z]/.test(tok) && /\d/.test(tok)))
    .join(' ');

  // Extract numbers with optional decimals
  const regex = /\d+(?:\.\d+)?/g;
  const matches = [...finalCleanChunkTokens.matchAll(regex)];
  let numbers = matches.map(m => parseFloat(m[0]));

  // Filter out any remaining massive numbers that are likely stray HSN/Product codes (e.g. 701090)
  numbers = numbers.filter(n => n < 10000000);

  let box = documentLayout === 'SINGLE_QTY' ? 1 : 0;
  let qty = 0, totalQty = 0;
  let found = false;

  // PRIORITY 1: Mathematical relationship (Box * Qty = TotalQty) - ONLY FOR BOX_STYLE
  if (documentLayout === 'BOX_STYLE' && !found && numbers.length >= 3) {
    for (let i = numbers.length - 3; i >= 0; i--) {
      const a = numbers[i];
      const b = numbers[i + 1];
      const c = numbers[i + 2];

      if (a === 0 || b === 0 || c === 0) continue;

      // Allow small floating point differences
      if (Math.abs((a * b) - c) < 0.1 || Math.abs((a * c) - b) < 0.1 || Math.abs((b * c) - a) < 0.1) {
        let factors = [];
        if (Math.abs((a * b) - c) < 0.1) { factors = [a, b]; totalQty = c; }
        else if (Math.abs((a * c) - b) < 0.1) { factors = [a, c]; totalQty = b; }
        else if (Math.abs((b * c) - a) < 0.1) { factors = [b, c]; totalQty = a; }
        
        box = Math.min(factors[0], factors[1]);
        qty = Math.max(factors[0], factors[1]);
        found = true;
        break;
      }
    }
  }

  // PRIORITY 1.5: Mathematical relationship for SINGLE_QTY (Qty * Rate = Total Amount)
  if (documentLayout === 'SINGLE_QTY' && !found && numbers.length >= 3) {
    for (let i = numbers.length - 3; i >= 0; i--) {
      const a = numbers[i];
      const b = numbers[i + 1];
      const c = numbers[i + 2];

      if (a === 0 || b === 0 || c === 0) continue;

      // Often Qty * Rate = Amount. Qty is usually a whole number or simple decimal.
      if (Math.abs((a * b) - c) < 0.5 || Math.abs((a * c) - b) < 0.5 || Math.abs((b * c) - a) < 0.5) {
        let factors = [];
        if (Math.abs((a * b) - c) < 0.5) { factors = [a, b]; }
        else if (Math.abs((a * c) - b) < 0.5) { factors = [a, c]; }
        else if (Math.abs((b * c) - a) < 0.5) { factors = [b, c]; }
        
        // QTY is usually the factor that is a whole number, or the one appearing earlier
        totalQty = factors[0];
        qty = totalQty;
        box = 1;
        found = true;
        break;
      }
    }
  }

  // PRIORITY 2: Dynamic Column Alignment (matches numbers directly under QTY header)
  if (!found && qtyColumnX !== -1 && numbers.length > 0) {
    let closestNum = -1;
    let minDiff = Infinity;
    
    // Filter out any rowWords[i] number where rowWords[i-1].text matches /^(per|unit|price)$/i
    const filteredRowWords = rowWords.filter((w, idx) => {
      const prevWord = rowWords[idx - 1];
      return !(prevWord && /^(per|unit|price)$/i.test(prevWord.text.trim()));
    });

    for (const w of filteredRowWords) {
      const cleanText = w.text.replace(/,/g, '');
      // Remove word boundaries (\b) so we can extract 2080 even if OCR crushes it into "CTN2080"
      const digitMatches = cleanText.match(/\d+/g);
      if (digitMatches) {
        for (const matchStr of digitMatches) {
          const val = parseInt(matchStr, 10);
          if (numbers.includes(val)) {
            const diff = Math.abs(w.x - qtyColumnX);
            // We just pick whichever number is closest to the QTY header's X coordinate,
            // while bounding it to the right edge of the QTY column.
            if (w.x >= qtyColumnX - 20 && w.x < qtyColumnRightBound - 5 && diff < minDiff) { 
              minDiff = diff;
              closestNum = val;
            }
          }
        }
      }
    }
    if (closestNum !== -1) {
      totalQty = closestNum;
      qty = totalQty;
      if (documentLayout === 'BOX_STYLE') box = 1;
      found = true;
    }
  }

  // PRIORITY 3: Fallback for SINGLE_QTY
  if (!found && numbers.length > 0 && documentLayout === 'SINGLE_QTY') {
    // Attempt to find UOM and the number closest to it
    const uomWord = rowWords.find(w => /^(ctn|no|pcs|kg|nos|box|set)$/i.test(w.text.trim()));
    if (uomWord) {
      let closestToUom = -1;
      let minUomDiff = Infinity;
      for (const w of rowWords) {
        const cleanText = w.text.replace(/,/g, '');
        const digitMatches = cleanText.match(/\d+/g);
        if (digitMatches) {
          for (const matchStr of digitMatches) {
            const val = parseInt(matchStr, 10);
            if (numbers.includes(val)) {
               const diff = Math.abs(w.x - uomWord.x);
               if (diff < minUomDiff && w.x > uomWord.x - 20) { // Should be to the right or very close
                 minUomDiff = diff;
                 closestToUom = val;
               }
            }
          }
        }
      }
      if (closestToUom !== -1) {
        qty = closestToUom;
        totalQty = qty;
        box = 1;
        found = true;
      }
    }
    
    // Ultimate Fallback: Just take the first number (it's almost always the QTY before the prices)
    if (!found && !isStrict) {
      qty = numbers[0];
      totalQty = qty;
      box = 1;
      found = true;
    }
  }
  
  if (documentLayout === 'BOX_STYLE') {
    // STRICT ENFORCEMENT: Box cannot go below 1. If it's missing or 0, default to 1.
    box = Math.max(1, Math.round(box || 1));
  }
  
  if (box === 1 && totalQty === 0 && qty > 0) {
      totalQty = qty;
  }
  
  // As requested, vision should ONLY detect totalQty, not qty/box or no of boxes.
  box = 0;
  qty = 0;

  return { box, qty, totalQty, mathMatched: found };
}

async function callGoogleVisionFull(imageBuffer) {
  const apiKey = process.env.VISION_API_KEY;
  if (!apiKey) {
    throw new Error("VISION_API_KEY is not configured");
  }

  const base64Image = imageBuffer.toString("base64");
  try {
    const response = await axios.post(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        requests: [
          {
            image: { content: base64Image },
            features: [{ type: "DOCUMENT_TEXT_DETECTION" }]
          }
        ]
      }
    );
    return response.data?.responses?.[0] || {};
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(`Google Vision API Error (${error.response.status}): ${error.response.data.error?.message || 'Unknown error'}`);
    }
    throw error;
  }
}

const { getSharedBrowser } = require('./sharedPuppeteer');

async function callGoogleVisionForPdf(filePath) {
  let page;
  try {
    const browser = await getSharedBrowser();
    page = await browser.newPage();
    
    // A high resolution viewport for better OCR accuracy
    await page.setViewport({ width: 1600, height: 2200, deviceScaleFactor: 1.5 });
    
    const absPath = path.resolve(filePath).replace(/\\/g, '/');
    const url = 'file:///' + absPath;
    
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 15000 });
    
    // Give PDF.js a moment to finish rendering the canvas
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const imageBuffer = await page.screenshot({ type: 'png', fullPage: false });
    
    // Now that we have a crisp image of the PDF page, we can use the regular Vision image endpoint
    return await callGoogleVisionFull(imageBuffer);
  } catch (error) {
    console.error("Puppeteer PDF rendering error:", error);
    throw new Error("Failed to render PDF to image for OCR");
  } finally {
    if (page) await page.close().catch(e => console.error("Error closing page:", e));
  }
}


/**
 * NEW: Extracts words with real X/Y positions from a PDF using pdf-parse's
 * pagerender hook (pdf.js under the hood). This is the PDF equivalent of
 * Google Vision's word-level bounding boxes — without it, pdf-parse just
 * hands back text in internal stream order, which does NOT match the
 * visual table rows for multi-column invoice layouts (Tally-style GST
 * invoices in particular split Description / Rate / Quantity onto
 * different lines even though they're the same visual row).
 */
async function extractPdfWords(pdfBuffer) {
  const words = [];

  await pdfParse(pdfBuffer, {
    pagerender: async function (pageData) {
      const textContent = await pageData.getTextContent();
      for (const item of textContent.items) {
        if (!item.str || !item.str.trim()) continue;
        // item.transform = [scaleX, skewX, skewY, scaleY, x, y] — PDF space, y grows upward
        const [, , , , x, y] = item.transform;
        // Negate y so that ascending sort = top-to-bottom (matches Vision's convention)
        words.push({ text: item.str, x, y: -y });
      }
      // pdf-parse still wants a string back per page; we don't use its .text field.
      return "";
    }
  });

  return words;
}

/**
 * Converts a Google Vision textAnnotations response into the same
 * {text, x, y} shape used for PDF words, so both paths can share one
 * row-grouping function.
 */
function normalizeVisionWords(visionResponse) {
  const textAnnotations = visionResponse.textAnnotations;
  if (!textAnnotations || textAnnotations.length < 2) return [];

  // Skip the first element (the full-block summary annotation)
  return textAnnotations.slice(1).map(w => {
    const v = w.boundingPoly.vertices;
    const y0 = v[0]?.y || 0;
    const y2 = v[2]?.y || 0;
    return {
      text: w.description,
      x: v[0]?.x || 0,
      y: (y0 + y2) / 2,
      height: Math.abs(y2 - y0)
    };
  });
}

/**
 * Groups words into visual rows by clustering on Y position within a
 * tolerance, then sorts each row left-to-right by X. This is your
 * original groupWordsIntoRows, generalized to accept plain {text,x,y}
 * words so it can be reused for both the PDF and Vision paths.
 *
 * tolerance is in source units — PDF points (~2-4) for PDFs,
 * image pixels (~15) for Vision.
 */
function groupWordsIntoRows(words, tolerance) {
  let rows = [];

  for (const w of words) {
    let matchedRow = rows.find(r => Math.abs(r.y - w.y) < tolerance);
    if (matchedRow) {
      matchedRow.words.push(w);
      // Cap the drift to 20% so it can handle gentle skew without absorbing tall multi-line cells
      matchedRow.y = matchedRow.y * 0.8 + w.y * 0.2;
    } else {
      rows.push({ y: w.y, words: [w] });
    }
  }

  rows.sort((a, b) => a.y - b.y);
  rows.forEach(r => r.words.sort((a, b) => a.x - b.x));

  return rows; // [{ y, words: [{text, x, y}, ...] }, ...]
}

function findLabelValue(rows, labelRegex, primaryKeyword, rightBoundaryRegex = null) {
  for (let i = 0; i < rows.length; i++) {
    const rowString = rows[i].words.map(w => w.text).join(' ').toLowerCase();
    if (!labelRegex.test(rowString)) continue;

    // Find the actual word object that triggered the match so we know the X coordinate
    const labelWord = rows[i].words.find(w => w.text.toLowerCase().includes(primaryKeyword.toLowerCase()));
    if (!labelWord) continue;

    let rightBound = Infinity;
    if (rightBoundaryRegex) {
      const boundaryWord = rows[i].words.find(w => rightBoundaryRegex.test(w.text.toLowerCase()));
      if (boundaryWord && boundaryWord.x > labelWord.x) {
        rightBound = boundaryWord.x;
      }
    }

    // Look at the next couple of rows for words aligned under the label
    for (let j = i + 1; j < Math.min(i + 3, rows.length); j++) {
      const candidateWords = rows[j].words.filter(
        w => w.x >= labelWord.x - 40 && w.x < rightBound - 5
      );
      if (candidateWords.length > 0) {
        return candidateWords.map(w => w.text).join('').trim();
      }
    }
  }
  return null;
}

// Helper to normalize text for skip checking: lowercase, strip punctuation, collapse spaces
function normalizeSkipText(text) {
  return text.toLowerCase().replace(/[.,:\/%-]/g, ' ').replace(/\s+/g, ' ').trim();
}

const rawSkipPhrases = [
  // PRICING / TAX COLUMNS
  "HSN", "HSN Code", "SAC",
  "UOM",
  "Unit Price", "Unit Price Per 1000 Pcs", "Rate", "Rate per 1000",
  "Net Value", "Discount", "Taxable Value",
  "CGST Rate", "CGST Rate %", "CGST Amt", "CGST Amount",
  "SGST Rate", "SGST/UTGST Rate %", "SGST Amt", "SGST/UTGST Amt",
  "IGST Rate", "IGST Amt", "IGST Amount",
  "Total Value", "Total Invoice Value", "Grand Total", "Total", "Round off",
  "Taxable value", "Assessable value", "Freight", "Pallatization/Palletization charges", "Compensation Cess", "TCS Value",
  // SHIPPING / LOGISTICS METADATA
  "Shipped To", "Ship To", "Billed To",
  "PO No", "PO Number", "P.O. No", "PO Date",
  "SO No", "SO Number", "Delivery No",
  "Transport", "Transporter", "Vehicle No", "LR No",
  "Currency Code", "Total number of line items", "Incoterm",
  // INVOICE IDENTIFIERS
  "Invoice No", "Invoice Number", "IRN Number", "IRN",
  "Acknowledgement No", "Ack No", "Acknowledgement Date", "Ack Date",
  // ADDRESS / REGISTRATION METADATA
  "Address", "Place", "Place of Supply", "State", "State Code",
  "PAN", "CIN", "C.I.N", "GSTIN", "GSTN",
  // Old skipKeywords
  "plot no", "midc", "phase", "pin", "pin code", "udyam", "uin", "block no", "dist", "mobno", "mob no", "at po", "atpost",
  "dated", "delivery note", "buyer", "dispatch", "dt", "days", "pdf", "destination", "terms of", "amount", "description of goods",
  "m/s", "pvt ltd", "sub total", "rounding", "bank", "ifsc", "account no", "branch", "rupees", "tax", "supplier", "consignee",
  "state name", "code", "certified", "signatory", "website", "floor", "road", "gujarat", "maharashtra"
];
const skipPhrases = rawSkipPhrases.map(normalizeSkipText);

const bottleMapping = require('../scripts/bottlePerBox.mapping.js');

function parseChallanData(ocrResult, companies, bottlePerBoxes) {
  let rows = [];

  if (ocrResult.data && Array.isArray(ocrResult.data)) {
  }

  if (ocrResult.type === 'pdf') {
    rows = groupWordsIntoRows(ocrResult.data, 3);
  } else if (ocrResult.type === 'vision') {
    const words = normalizeVisionWords(ocrResult.data);
    let tolerance = 15;
    if (words.length > 0) {
      const heights = words.map(w => w.height).filter(h => typeof h === 'number' && !isNaN(h) && h > 0).sort((a, b) => a - b);
      if (heights.length > 0) {
        const medianHeight = heights[Math.floor(heights.length / 2)];
        tolerance = Math.max(12, medianHeight * 0.6);
      }
    }
    rows = groupWordsIntoRows(words, tolerance);
  } else if (ocrResult.type === 'text') {
    const lines = (ocrResult.data || "").split('\n').map(l => l.trim()).filter(Boolean);
    rows = lines.map(l => ({ y: 0, words: [{ text: l, x: 0 }] }));
  }

  const rowStrings = rows.map(r => r.words.map(w => w.text).join(' '));
  const fullText = rowStrings.join('\n');

  const items = [];
  const foundNames = new Set();

  let deliveryNumber = "";
  let documentDate = "";
  let billToName = ""; // Will be assigned by our new company matcher

  // Extract Delivery / Challan / Invoice number using priority order
  // Priority 1: Strict match with "No", "Number", "#", or ":"
  let chMatch = fullText.match(/(?:challan|delivery)[\s\W]*(?:n[o0]\.?|number|#|:)[\s\W]*((?=[A-Za-z0-9/-]*\d)[A-Za-z0-9/-]+)/i);
             
  // Priority 2: Fallback without "No" (e.g. "Delivery 12345")
  if (!chMatch) {
    chMatch = fullText.match(/(?:challan|delivery)[\s\W]*((?=[A-Za-z0-9/-]*\d)[A-Za-z0-9/-]+)/i);
  }
  
  // Priority 3: Invoice / Bill / Inv label fallback (if no challan/delivery exists)
  if (!chMatch) {
    chMatch = fullText.match(/(?:invoice|inv|bill)[\s\W]*(?:n[o0]\.?|number|#|:)?[\s\W]*((?=[A-Za-z0-9/-]*\d)[A-Za-z0-9/-]+)/i);
  }
  
  // Priority 4: Generic fallback removed as per user request. We only extract explicitly labelled numbers.
  
  if (chMatch) deliveryNumber = chMatch[1].trim();

  // Find Date using a highly permissive regex across the document
  // Use negative lookbehind to ignore "PO DATE", "DUE DATE", etc.
  const dateRegexStr = "(\\d{1,2}\\s*[-./]\\s*\\d{1,2}\\s*[-./]\\s*\\d{2,4}|\\d{4}\\s*[-./]\\s*\\d{1,2}\\s*[-./]\\s*\\d{1,2}|\\d{1,2}\\s*[-./\\s]\\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\s*[-./\\s]\\s*\\d{2,4})";
  const dateMatch = fullText.match(new RegExp(`(?<!\\b(?:po|due|valid)\\s*)(?:date|dated)[\\s:]*${dateRegexStr}`, "i"))
                 || fullText.match(new RegExp(`\\b${dateRegexStr}\\b`, "i"));
  if (dateMatch) documentDate = dateMatch[1].trim();

  // Find PO Number
  let poNo = "";
  let poMatch = fullText.match(/(?:po|p\.o\.)[\s\W]*(?:no|number|#|:)[\s\W]*((?=[A-Za-z0-9/-\s]*\d)[A-Za-z0-9/-]+)/i);
  if (poMatch) poNo = poMatch[1].trim();

  // Find PO Date
  let poDate = "";
  const poDateMatch = fullText.match(new RegExp(`(?:po|p\\.o\\.)\\s*date[\\s:]*${dateRegexStr}`, "i"));
  if (poDateMatch) {
    poDate = poDateMatch[1].trim();
  }
  
  // Find PO Order Qty
  let poOrderQty = null;
  const poQtyMatch = fullText.match(/(?:po|order)[\s_]*(?:qty|quantity)[\s:=]*([\d,]+)/i);
  if (poQtyMatch) {
    poOrderQty = Number(poQtyMatch[1].replace(/,/g, ''));
  }

  if (documentDate) {
    // Clean up OCR spaces inside the date (e.g., "11 - 08 - 2023" -> "11-08-2023")
    let d = documentDate.replace(/\s+/g, '').replace(/[./]/g, '-');
    
    const parts = d.split('-');
    if (parts.length === 3) {
      let [p1, p2, p3] = parts;
      
      // If the first part is 4 digits, it's already YYYY-MM-DD
      if (p1.length === 4) {
        documentDate = d;
      } else {
        // Assume DD-MM-YYYY or DD-MMM-YYYY
        let day = p1.padStart(2, '0');
        let month = p2;
        let year = p3;
        
        if (year.length === 2) year = '20' + year;
        
        const monthMap = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
        const mKey = month.toLowerCase().substring(0, 3);
        if (monthMap[mKey]) month = monthMap[mKey];
        else month = month.padStart(2, '0');
        
        documentDate = `${year}-${month}-${day}`;
      }
    } else {
      documentDate = d;
    }
  }

  if (poDate) {
    let d = poDate.replace(/\s+/g, '').replace(/[./]/g, '-');
    const parts = d.split('-');
    if (parts.length === 3) {
      let [p1, p2, p3] = parts;
      if (p1.length === 4) {
        poDate = d;
      } else {
        let day = p1.padStart(2, '0');
        let month = p2;
        let year = p3;
        if (year.length === 2) year = '20' + year;
        const monthMap = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
        const mKey = month.toLowerCase().substring(0, 3);
        if (monthMap[mKey]) month = monthMap[mKey];
        else month = month.padStart(2, '0');
        poDate = `${year}-${month}-${day}`;
      }
    } else {
      poDate = d;
    }
  } else if (documentDate) {
    poDate = documentDate; // fallback if PO date not found
  }

  let matchedCompanyId = null;
  const sortedCompanies = [...(companies || [])].sort((a, b) => b.name.length - a.name.length);
  
  // Find where the Bill To / Invoice To label is
  let billToLabelY = -1;
  let billToLabelX = -1;
  for (let i = 0; i < Math.min(40, rows.length); i++) {
    const rowString = rows[i].words.map(w => w.text).join(' ').toLowerCase();
    if (/(bill[ed]*[\s_]*to|invoice[\s_]*to|consignee|principal[\s_]*name|buyer|m\/s|ship[\s_]*to)/i.test(rowString)) {
      billToLabelY = i;
      // Find the specific word to get its X coordinate
      const labelWord = rows[i].words.find(w => /(bill|invoice|consignee|principal|buyer|m\/s|ship)/i.test(w.text));
      if (labelWord) {
        billToLabelX = labelWord.x;
      }
      break;
    }
  }

  const allCompanyMatches = [];
  
  for (let i = 0; i < Math.min(40, rows.length); i++) {
    const rawLine = rows[i].words.map(w => w.text).join(' ').toLowerCase();
    const line = rawLine.replace(/[-_.,:]/g, ' ').replace(/[^\w\s]/g, '').trim();
    const lineNoSpaces = line.replace(/\s+/g, '');
    const cleanLine = line.replace(/\b(m s|ms|pvt|ltd|private|limited|llp|inc|co|company)\b/g, '').replace(/\s+/g, ' ').trim();

    for (const comp of sortedCompanies) {
      const normalizedComp = comp.name.toLowerCase().replace(/[-_.,:]/g, ' ').replace(/[^\w\s]/g, '').trim();
      const compNoSpaces = normalizedComp.replace(/\s+/g, '');
      const cleanComp = normalizedComp.replace(/\b(pvt|ltd|private|limited|llp|inc|co|company)\b/g, '').replace(/\s+/g, ' ').trim();
      const compWords = cleanComp.split(' ').filter(Boolean);
      
      let matched = false;
      let matchScore = 0;

      if (compWords.length === 0) {
        if (lineNoSpaces.includes(compNoSpaces)) { matched = true; matchScore = 1; }
      } else {
        const allWordsPresent = compWords.every(w => {
          const regex = new RegExp(`\\b${w}\\b`, 'i');
          return regex.test(cleanLine);
        });
        
        // Dynamic check for shuffled or partial half-words
        const lineWords = cleanLine.split(' ').filter(Boolean);
        let wordsMatched = 0;
        let partialWordsMatched = 0;
        for (const cw of compWords) {
          if (lineWords.includes(cw)) {
             wordsMatched++;
          } else if (lineWords.some(lw => lw.includes(cw) || (cw.includes(lw) && lw.length >= 3))) {
             partialWordsMatched++;
          }
        }
        const wordMatchRatio = (wordsMatched + (partialWordsMatched * 0.5)) / compWords.length;
        
        const similarity = stringSimilarity.compareTwoStrings(cleanLine, cleanComp);
        const rawSimilarity = stringSimilarity.compareTwoStrings(line, normalizedComp);
        
        matchScore = Math.max(similarity, rawSimilarity, wordMatchRatio);

        if (allWordsPresent || matchScore > 0.65 || lineNoSpaces.includes(compNoSpaces)) {
          matched = true;
          if (allWordsPresent) matchScore = Math.max(matchScore, 0.9);
          if (lineNoSpaces.includes(compNoSpaces)) matchScore = Math.max(matchScore, 0.9);
        }
      }
      
      if (matched) {
        // Find approximate X coordinate to handle multi-column layouts
        const matchingWords = rows[i].words.filter(w => compWords.some(cw => w.text.toLowerCase().includes(cw)));
        let matchX = -1;
        if (matchingWords.length > 0) {
           matchX = matchingWords[0].x;
        }
        allCompanyMatches.push({ comp, rowIdx: i, score: matchScore, matchX });
      }
    }
  }

  if (allCompanyMatches.length > 0) {
    let bestMatch = allCompanyMatches[0];
    if (billToLabelY !== -1) {
      // Find matches at or up to 5 lines below the label
      const validMatches = allCompanyMatches.filter(m => m.rowIdx >= billToLabelY - 1 && m.rowIdx <= billToLabelY + 5);
      if (validMatches.length > 0) {
        validMatches.sort((a, b) => {
          // If in a multi-column layout, pick the one directly beneath the BILLED_TO label horizontally
          if (billToLabelX !== -1 && a.matchX !== -1 && b.matchX !== -1) {
             const distXA = Math.abs(a.matchX - billToLabelX);
             const distXB = Math.abs(b.matchX - billToLabelX);
             // Lowered threshold to 30 to trigger column priority more aggressively
             if (Math.abs(distXA - distXB) > 30) {
                 return distXA - distXB; // the one horizontally closer wins
             }
          }

          // Prioritize higher score, but if scores are close, prefer the one physically closer to the label
          if (Math.abs(b.score - a.score) > 0.15) {
             return b.score - a.score;
          }
          const distA = Math.abs(a.rowIdx - billToLabelY);
          const distB = Math.abs(b.rowIdx - billToLabelY);
          return distA - distB;
        });
        bestMatch = validMatches[0];
      }
    } else {
       allCompanyMatches.sort((a, b) => b.score - a.score);
       bestMatch = allCompanyMatches[0];
    }
    matchedCompanyId = bestMatch.comp._id.toString();
    billToName = bestMatch.comp.name;
  }

  let qtyColumnX = -1;
  let qtyColumnRightBound = Infinity;
  let hasBoxHeader = false;
  let hasQtyHeader = false;
  let qtyWordUsed = null;
  for (let i = 0; i < Math.min(40, rows.length); i++) {
    const rowWords = rows[i].words;
    if (!hasBoxHeader && rowWords.some(w => /^box(es)?$/i.test(w.text.trim()))) {
      hasBoxHeader = true;
    }
    const qtyWord = rowWords.find(w => /(qty|quantity|quantitiy)/i.test(w.text));
    if (qtyWord) {
      hasQtyHeader = true;
      qtyColumnX = qtyWord.x;
      qtyWordUsed = qtyWord;
      const nextColWord = rowWords.find(w => w.x > qtyColumnX + 10 && /(unit\s*price|rate)/i.test(w.text));
      if (nextColWord) qtyColumnRightBound = nextColWord.x;
    }
  }
  const documentLayout = (hasBoxHeader && hasQtyHeader) ? 'BOX_STYLE' : 'SINGLE_QTY';


  const unmatchedItems = [];
  
  const expandedBottles = [];
  const canonicalMap = new Map();

  (bottlePerBoxes || []).forEach(b => {
    // Map by plainBottleName (the system-wide unique key)
    canonicalMap.set(b.plainBottleName, b);
    expandedBottles.push({ _id: b._id, plainBottleName: b.plainBottleName, matchName: b.plainBottleName });
  });

  Object.keys(bottleMapping).forEach(aliasName => {
    const canonicalName = bottleMapping[aliasName];
    if (aliasName !== canonicalName) {
      const canonicalBottle = canonicalMap.get(canonicalName);
      if (canonicalBottle) {
        expandedBottles.push({
          _id: canonicalBottle._id,
          plainBottleName: canonicalBottle.plainBottleName,
          matchName: aliasName
        });
      }
    }
  });

  const sortedBottles = expandedBottles.sort((a, b) => b.matchName.length - a.matchName.length);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const line = rowStrings[i];
    
    let matched = false;
    let bestMatchFinancials = null;
    let matchedBottleName = "";

    const normalizedLine = line.toLowerCase().replace(/[-_]/g, ' ').replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim()
      .replace(/kpsr/g, 'psr')
      .replace(/psr\s*0*(\d+)\s*0*(\d+)\b/g, 'psr $1 $2');

    for (const bottle of sortedBottles) {
      if (foundNames.has(bottle.plainBottleName)) continue;

      const normalizedBottleName = bottle.matchName.toLowerCase().replace(/[-_]/g, ' ').replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim()
        .replace(/psr\s*0*(\d+)\s*0*(\d+)\b/g, 'psr $1 $2');
      const bottleWords = normalizedBottleName.split(' ').filter(Boolean);
      const allWordsPresent = bottleWords.length > 0 && bottleWords.every(w => {
        const regex = new RegExp(`\\b${w}\\b`, 'i');
        return regex.test(normalizedLine);
      });

      const similarity = stringSimilarity.compareTwoStrings(normalizedLine, normalizedBottleName);
      
      // Prevent short numeric/generic names like "11" from substring matching randomly
      const isSafeSubstring = normalizedBottleName.length >= 4 && !/^\d+$/.test(normalizedBottleName);
      const isMatch = similarity > 0.6 || (isSafeSubstring && normalizedLine.includes(normalizedBottleName)) || allWordsPresent;

      if (isMatch) {
        matched = true;
        matchedBottleName = bottle.plainBottleName;
        let combinedString = "";
        let combinedWords = [];
        // Look at the line above and up to 2 lines below to catch quantities on multi-line descriptions
        const startIdx = Math.max(0, i - 1);
        for (let j = startIdx; j < Math.min(i + 3, rows.length); j++) {
          combinedString += " " + rowStrings[j];
          combinedWords = combinedWords.concat(rows[j].words);
        }
        
        bestMatchFinancials = extractChallanNumbersNearText(
          combinedString,
          bottle.matchName,
          combinedWords,
          qtyColumnX,
          qtyColumnRightBound,
          documentLayout
        );

        if (bestMatchFinancials.totalQty > 0 || bestMatchFinancials.qty > 0) {
          const matchedBottleObj = canonicalMap.get(bottle.plainBottleName);
            items.push({
            bottleId: { 
              _id: bottle._id.toString(), 
              plainBottleName: bottle.plainBottleName,
              bottlePerBox: matchedBottleObj ? matchedBottleObj.bottlePerBox : null
            },
            bottlePerBox: matchedBottleObj ? matchedBottleObj.bottlePerBox : null,
            box: bestMatchFinancials.box,
            qty: bestMatchFinancials.qty,
            totalQty: bestMatchFinancials.totalQty,
            textLine: combinedString.trim() || line
          });
          foundNames.add(bottle.plainBottleName);

          // Remove the previous row from unmatchedItems if it was just the first part of this multi-line description
          if (unmatchedItems.length > 0) {
            const lastUnmatched = unmatchedItems[unmatchedItems.length - 1];
            if (lastUnmatched.totalQty === bestMatchFinancials.totalQty && lastUnmatched.qty === bestMatchFinancials.qty) {
              unmatchedItems.pop();
            }
          }
        }
        break;
      }
    }

    if (!matched) {
      // Check if the entire row should be skipped based on metadata keywords
      const normalizedSkipLine = normalizeSkipText(line);
      let shouldSkipRow = false;
      
      // Fast exact match first
      if (skipPhrases.some(phrase => normalizedSkipLine.includes(phrase))) {
        shouldSkipRow = true;
      } else {
        // Fuzzy match fallback on phrase-length windows
        const rowWordsArr = normalizedSkipLine.split(' ');
        for (const phrase of skipPhrases) {
          const phraseWords = phrase.split(' ');
          const phraseLen = phraseWords.length;
          if (phraseLen > 0 && rowWordsArr.length >= phraseLen) {
            for (let k = 0; k <= rowWordsArr.length - phraseLen; k++) {
              const windowChunk = rowWordsArr.slice(k, k + phraseLen).join(' ');
              if (stringSimilarity.compareTwoStrings(windowChunk, phrase) > 0.8) {
                shouldSkipRow = true;
                break;
              }
            }
          } else if (phraseLen > 0 && rowWordsArr.length > 0) {
            if (stringSimilarity.compareTwoStrings(normalizedSkipLine, phrase) > 0.8) {
              shouldSkipRow = true;
            }
          }
          if (shouldSkipRow) break;
        }
      }

      if (shouldSkipRow) continue;

      const financials = extractChallanNumbersNearText(line, "", row.words, qtyColumnX, qtyColumnRightBound, documentLayout, true);
      if (financials.mathMatched && financials.totalQty > 0) {
        // STRICT FILTER: To prevent garbage address lines or legal text from being flagged as items,
        // we demand that the row contains at least one common packaging unit word.
        const looksLikeItem = /\b(kg|g|l|ml|pcs|ltr|gm|pieces|boxes|nos?|no\.|bags|ton|mt|ctn|cartons?|car|set)\b/i.test(line) || financials.mathMatched;
        const looksLikeJunk = /\b(p\.?o\.?\s*no|lorry|lr\s*no|vehicle|gstin|state code|cin|ship to|invoice to|eb52|average|certification|tower|senapati|issuee|challan|mode of transportation|time of issue|challan date|job-work)\b/i.test(line);
        
        if (looksLikeItem && !looksLikeJunk) {
          let combinedString = "";
          const startIdx = i;
          for (let j = startIdx; j < Math.min(i + 3, rows.length); j++) {
            combinedString += " " + rowStrings[j];
          }
          let nameGuess = combinedString.replace(/\b\d+(?:\.\d+)?\b/g, '').replace(/\b(kg|g|l|ml|pcs|ltr|gm|pieces|boxes|nos?|no\.|bags|ton|mt|ctn|cartons?|car|set|cgst|sgst|igst|total|tax|rate|sust|cust)\b/ig, '').replace(/[^\w\s-]/g, '').replace(/\s+/g, ' ').trim();
          unmatchedItems.push({
            suggestedName: nameGuess || "Unknown Item",
            box: financials.box,
            qty: financials.qty,
            totalQty: financials.totalQty,
            textLine: combinedString.trim() || line
          });
        }
      }
    }
  }

  return {
    deliveryNumber,
    documentDate,
    billToId: matchedCompanyId,
    billToName,
    poNo,
    poDate,
    poOrderQty,
    items,
    unmatchedItems,
  };
}

module.exports = {
  parseChallanData,
  callGoogleVisionFull,
  callGoogleVisionForPdf,
  extractChallanNumbersNearText,
  extractPdfWords
};