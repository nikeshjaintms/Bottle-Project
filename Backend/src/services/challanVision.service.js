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

function extractChallanNumbersNearText(
  textChunk,
  bottleName = "",
  rowWords = [],
  qtyColumnX = -1,
  qtyColumnRightBound = Infinity,
  documentLayout = 'BOX_STYLE',
  isStrict = false,
  boxColumnX = -1,
  boxColumnRightBound = Infinity,
  rateColumnX = -1,
  amountColumnX = -1,
  slNoColumnX = -1
) {
  // 0. Remove the bottle name itself so we don't extract bottle sizes (like "100" from "100 ML")
  let cleanChunk = textChunk;
  if (bottleName) {
    // Escape regex characters just in case
    const safeName = bottleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    cleanChunk = cleanChunk.replace(new RegExp(safeName, 'gi'), '');
    const dottedName = safeName.replace(/\s+/g, '[\\s.]+');
    cleanChunk = cleanChunk.replace(new RegExp(dottedName, 'gi'), '');
  }

  // Strip any volume / capacity like "50 ML", "100 ML", "30 ML", "500 GM", etc.
  cleanChunk = cleanChunk.replace(/\b\d+\s*(?:ml|gm|kg|ltr|l|g)\b/gi, '');

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

  let box = 0;
  let qty = 0, totalQty = 0;
  let found = false;

  const minBoxX = slNoColumnX !== -1 ? slNoColumnX + 15 : 0;

  // STEP 1: Explicit Box Extraction from rowWords
  if (rowWords && rowWords.length > 0) {
    for (let i = 0; i < rowWords.length; i++) {
      const w = rowWords[i];
      if (/^(box(es)?|pkgs?|packages?|cartons?|ctns?|case(s)?)$/i.test(w.text.trim())) {
        const prev = rowWords[i - 1];
        const next = rowWords[i + 1];
        if (next && /^\d+$/.test(next.text.replace(/,/g, '')) && next.x >= minBoxX) {
          box = parseInt(next.text.replace(/,/g, ''), 10);
          break;
        } else if (prev && /^\d+$/.test(prev.text.replace(/,/g, '')) && prev.x >= minBoxX) {
          box = parseInt(prev.text.replace(/,/g, ''), 10);
          break;
        }
      }
    }

    // Check box column if not found from word adjacency
    if (!box && boxColumnX !== -1) {
      const boxCandidates = rowWords.filter(w =>
        w.x >= minBoxX &&
        w.x < (boxColumnRightBound !== Infinity ? boxColumnRightBound : boxColumnX + 60) &&
        /^\d+$/.test(w.text.replace(/,/g, ''))
      );
      if (boxCandidates.length > 0) {
        box = parseInt(boxCandidates[0].text.replace(/,/g, ''), 10);
      }
    }
  }

  // STEP 2: Quantity Column Alignment (highest priority for totalQty)
  if (qtyColumnX !== -1 && rowWords && rowWords.length > 0) {
    let closestNum = -1;
    let minDiff = Infinity;

    const filteredRowWords = rowWords.filter((w, idx) => {
      const prevWord = rowWords[idx - 1];
      return !(prevWord && /^(per|unit|price)$/i.test(prevWord.text.trim()));
    });

    for (const w of filteredRowWords) {
      const cleanText = w.text.replace(/,/g, '');
      const digitMatches = cleanText.match(/\d+(?:\.\d+)?/g);
      if (digitMatches) {
        for (const matchStr of digitMatches) {
          const val = parseFloat(matchStr);
          if (numbers.includes(val)) {
            // Must be within QTY column boundaries and NOT in Amount column
            const inQtyCol = w.x >= qtyColumnX - 50 && w.x < qtyColumnRightBound - 5;
            const inAmountCol = amountColumnX !== -1 && w.x >= amountColumnX - 30;
            if (inQtyCol && !inAmountCol) {
              const diff = Math.abs(w.x - qtyColumnX);
              if (diff < minDiff) {
                minDiff = diff;
                closestNum = val;
              }
            }
          }
        }
      }
    }

    if (closestNum !== -1) {
      totalQty = closestNum;
      found = true;
    }
  }

  // STEP 3: Fallback for totalQty via UOM keywords (pcs, nos, etc.)
  if (!totalQty && rowWords && rowWords.length > 0) {
    const uomWord = rowWords.find(w => /^(ctn|no|pcs|kg|nos|box|set)$/i.test(w.text.trim()));
    if (uomWord) {
      let closestToUom = -1;
      let minUomDiff = Infinity;
      for (const w of rowWords) {
        const cleanText = w.text.replace(/,/g, '');
        const digitMatches = cleanText.match(/\d+(?:\.\d+)?/g);
        if (digitMatches) {
          for (const matchStr of digitMatches) {
            const val = parseFloat(matchStr);
            if (numbers.includes(val)) {
              const inAmountCol = amountColumnX !== -1 && w.x >= amountColumnX - 30;
              const inRateCol = rateColumnX !== -1 && Math.abs(w.x - rateColumnX) < 40;
              if (!inAmountCol && !inRateCol) {
                const diff = Math.abs(w.x - uomWord.x);
                if (diff < minUomDiff && w.x > uomWord.x - 30) {
                  minUomDiff = diff;
                  closestToUom = val;
                }
              }
            }
          }
        }
      }
      if (closestToUom !== -1) {
        totalQty = closestToUom;
        found = true;
      }
    }
  }

  // STEP 4: Mathematical relationship check if totalQty still not found
  if (!totalQty && numbers.length >= 3) {
    for (let i = numbers.length - 3; i >= 0; i--) {
      const a = numbers[i];
      const b = numbers[i + 1];
      const c = numbers[i + 2];

      if (a === 0 || b === 0 || c === 0) continue;

      if (Math.abs((a * b) - c) < 0.5 || Math.abs((a * c) - b) < 0.5 || Math.abs((b * c) - a) < 0.5) {
        let factors = [];
        let product = 0;
        if (Math.abs((a * b) - c) < 0.5) { factors = [a, b]; product = c; }
        else if (Math.abs((a * c) - b) < 0.5) { factors = [a, c]; product = b; }
        else if (Math.abs((b * c) - a) < 0.5) { factors = [b, c]; product = a; }

        // If product is huge and likely an invoice rupee amount (e.g. Rate * Qty = Amount)
        const hasRateCol = rateColumnX !== -1 || amountColumnX !== -1;
        const oneHasDecimal = factors.some(f => !Number.isInteger(f));
        if (hasRateCol || oneHasDecimal) {
          totalQty = Math.max(factors[0], factors[1]);
        } else if (documentLayout === 'BOX_STYLE') {
          if (!box) box = Math.min(factors[0], factors[1]);
          qty = Math.max(factors[0], factors[1]);
          totalQty = product;
        } else {
          totalQty = factors[0];
        }
        found = true;
        break;
      }
    }
  }

  // Final fallback for totalQty if still not found
  if (!totalQty && numbers.length > 0 && !isStrict) {
    totalQty = numbers[0];
    found = true;
  }

  // Look for explicit package and per-box packaging counts in textChunk if not found
  if (!box || !qty || box === totalQty) {
    const pkgMatch = textChunk.match(/(?:package|pkg|box|ctn|carton)[s\s]*(?:issue[es]*|no[.\s]*|count[s\s]*)?[:\s]*(\d+(?:\.\d+)?)/i);
    const contentMatch = textChunk.match(/(?:average\s*content|pcs\s*per\s*(?:box|package|pkg|ctn)|qty\s*per\s*(?:box|package|pkg|ctn)|per\s*(?:box|package|pkg|ctn))[\s\w:]*?(\d+(?:\.\d+)?)/i);
    const parsedPkg = pkgMatch ? Math.round(parseFloat(pkgMatch[1])) : 0;
    const parsedContent = contentMatch ? Math.round(parseFloat(contentMatch[1])) : 0;
    if (parsedPkg > 0 && parsedContent > 0) {
      box = parsedPkg;
      qty = parsedContent;
      if (!totalQty) totalQty = box * qty;
      found = true;
    } else if (parsedPkg > 0 && (!box || box === totalQty)) {
      box = parsedPkg;
      if (totalQty > 0) qty = parseFloat((totalQty / box).toFixed(2));
    } else if (parsedContent > 0 && !qty) {
      qty = parsedContent;
      if (totalQty > 0 && !box) box = parseFloat((totalQty / qty).toFixed(2));
    }
  }

  // Calculate or adjust qty (qty per box)
  if (box > 0 && totalQty > 0) {
    qty = parseFloat((totalQty / box).toFixed(2));
  } else if (box === 0 && documentLayout === 'SINGLE_QTY' && totalQty > 0) {
    box = 1;
    qty = totalQty;
  }

  return { box, qty, totalQty, mathMatched: found && totalQty > 0 };
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

function calculateDynamicSlope(words) {
  if (!words || words.length < 10) return 0;
  const pairs = [
    { left: /(^si$|^sl$|no\.)/i, right: /(amount|total)/i, yMin: 300, yMax: 900 },
    { left: /(consignee|buyer|bill)/i, right: /(invoice|dated|e-way)/i, yMin: 100, yMax: 600 }
  ];

  for (const pair of pairs) {
    const leftW = words.find(w => pair.left.test(w.text) && w.y >= pair.yMin && w.y <= pair.yMax && w.x < 200);
    const rightW = words.find(w => pair.right.test(w.text) && w.y >= pair.yMin && w.y <= pair.yMax && w.x > 500);
    if (leftW && rightW && Math.abs(rightW.x - leftW.x) > 300) {
      const slope = (rightW.y - leftW.y) / (rightW.x - leftW.x);
      if (Math.abs(slope) < 0.1) return slope;
    }
  }
  return 0;
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
      // Cap the drift to 15% so it can handle gentle skew without absorbing tall multi-line cells
      matchedRow.y = matchedRow.y * 0.85 + w.y * 0.15;
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
    let words = normalizeVisionWords(ocrResult.data);
    const slope = calculateDynamicSlope(words);
    if (Math.abs(slope) > 0.005) {
      words = words.map(w => ({ ...w, y: w.y - slope * w.x }));
    }
    let tolerance = 15;
    if (words.length > 0) {
      const heights = words.map(w => w.height).filter(h => typeof h === 'number' && !isNaN(h) && h > 0).sort((a, b) => a - b);
      if (heights.length > 0) {
        const medianHeight = heights[Math.floor(heights.length / 2)];
        tolerance = Math.max(7, Math.min(12, medianHeight * 0.65));
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
  let chMatch = fullText.match(/(?:challan|challn|delivery)[\s\W]*(?:n[o0]\.?|number|#|:)[\s\W]*((?=[A-Za-z0-9/-]*\d)[A-Za-z0-9/-]+)/i);
             
  // Priority 2: Fallback without "No" (e.g. "Delivery 12345")
  if (!chMatch) {
    chMatch = fullText.match(/(?:challan|challn|delivery)[\s\W]*((?=[A-Za-z0-9/-]*\d)[A-Za-z0-9/-]+)/i);
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

  let slNoColX = -1;
  let boxColX = -1;
  let boxColRightBound = Infinity;
  let descColX = -1;
  let hsnColX = -1;
  let qtyColumnX = -1;
  let qtyColumnRightBound = Infinity;
  let rateColumnX = -1;
  let amountColumnX = -1;
  let hasBoxHeader = false;
  let hasQtyHeader = false;
  let headerRowIdx = -1;
  let headerRowEndIdx = -1;

  for (let i = 0; i < Math.min(40, rows.length); i++) {
    const line = rowStrings[i];
    if (/(description|particulars|quantity|qty|pkgs|boxes)/i.test(line)) {
      headerRowIdx = i;
      break;
    }
  }

  if (headerRowIdx !== -1) {
    headerRowEndIdx = headerRowIdx;
    const headerRows = [rows[headerRowIdx]];
    if (headerRowIdx + 1 < rows.length && /(pkgs?|boxes?|cartons?|ctns?|rate|hsn|sac|uom|qty|particulars|goods)/i.test(rowStrings[headerRowIdx + 1])) {
      headerRows.push(rows[headerRowIdx + 1]);
      headerRowEndIdx = headerRowIdx + 1;
    }
    const allHeaderWords = headerRows.flatMap(r => r.words);

    for (let wIdx = 0; wIdx < allHeaderWords.length; wIdx++) {
      const w = allHeaderWords[wIdx];
      const prevW = allHeaderWords[wIdx - 1];
      const nextW = allHeaderWords[wIdx + 1];

      if (/(^sr$|^si$|^sl$)/i.test(w.text) && slNoColX === -1) slNoColX = w.x;
      if (/hsn/i.test(w.text) && hsnColX === -1) hsnColX = w.x;
      if (/(box(es)?|pkgs?|packages?|cartons?|ctns?|case(s)?)/i.test(w.text) && boxColX === -1) {
        hasBoxHeader = true;
        boxColX = w.x;
      }
      if (/(description|particulars)/i.test(w.text) && descColX === -1) descColX = w.x;
      if (/(qty|quantity|quantitiy)/i.test(w.text) && qtyColumnX === -1) {
        hasQtyHeader = true;
        qtyColumnX = w.x;
      }
      const isTaxRate = (prevW && /(gst|cgst|sgst|igst|tax)/i.test(prevW.text)) || (nextW && /%/i.test(nextW.text));
      if (/(rate|price|unit\s*price)/i.test(w.text) && !isTaxRate) {
        if (rateColumnX === -1 || (qtyColumnX !== -1 && w.x > qtyColumnX)) {
          rateColumnX = w.x;
        }
      }
      if (/(amount|taxable|total)/i.test(w.text) && (qtyColumnX === -1 || w.x > qtyColumnX + 50)) {
        if (amountColumnX === -1 || w.x > amountColumnX) {
          amountColumnX = w.x;
        }
      }
    }
  }

  if (qtyColumnX !== -1) {
    if (rateColumnX !== -1 && rateColumnX > qtyColumnX) {
      qtyColumnRightBound = rateColumnX;
    } else if (amountColumnX !== -1 && amountColumnX > qtyColumnX) {
      qtyColumnRightBound = amountColumnX;
    }
  }
  if (boxColX !== -1 && descColX !== -1 && descColX > boxColX) {
    boxColRightBound = descColX;
  }

  function hasSerialNo(row) {
    if (!row || !row.words || row.words.length === 0) return false;
    const firstWord = row.words[0];
    if (/^\d{1,3}$/.test(firstWord.text.trim())) {
      if (slNoColX !== -1 && Math.abs(firstWord.x - slNoColX) < 40) return true;
      if (descColX !== -1 && firstWord.x < descColX - 30) return true;
    }
    return false;
  }

  function isTableEnd(str) {
    return /^(total|sub\s*total|taxable\s*value|round\s*off|cgst|sgst|igst|invoice\s*value|amount\s*chargeable|declaration|terms\s*&?\s*conditions|company'?s?\s*bank|bank\s*details)/i.test(str.trim());
  }

  function checkBottleMatch(normLine, bottle) {
    const normalizedBottleName = bottle.matchName.toLowerCase()
      .replace(/(\d+)\s*(ml|gm|kg|ltr|l|g)\b/gi, '$1 $2')
      .replace(/[-_]/g, ' ')
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const bottleWords = normalizedBottleName.split(' ').filter(Boolean);

    const distinctiveWords = bottleWords.filter(w => !/^\d+$/.test(w) && !/^(ml|gm|kg|ltr|l|g)$/i.test(w));
    if (distinctiveWords.length > 0) {
      const hasDistinctive = distinctiveWords.every(w => {
        const regex = new RegExp('\\b' + w + '\\b', 'i');
        return regex.test(normLine);
      });
      if (!hasDistinctive) return false;
    }

    const allWordsPresent = bottleWords.length > 0 && bottleWords.every(w => {
      const regex = new RegExp('\\b' + w + '\\b', 'i');
      return regex.test(normLine);
    });
    const similarity = stringSimilarity.compareTwoStrings(normLine, normalizedBottleName);
    const isSafeSubstring = normalizedBottleName.length >= 4 && !/^\d+$/.test(normalizedBottleName);
    return similarity > 0.6 || (isSafeSubstring && normLine.includes(normalizedBottleName)) || allWordsPresent;
  }

  const documentLayout = (hasBoxHeader && hasQtyHeader) ? 'BOX_STYLE' : 'SINGLE_QTY';

  const unmatchedItems = [];
  
  const expandedBottles = [];
  const canonicalMap = new Map();

  (bottlePerBoxes || []).forEach(b => {
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
    if (headerRowEndIdx !== -1 && i <= headerRowEndIdx) continue;
    const row = rows[i];
    const line = rowStrings[i];
    if (isTableEnd(line)) break;
    
    let matched = false;
    let bestMatchFinancials = null;
    let matchedBottleName = "";

    const normalizedLine = line.toLowerCase()
      .replace(/(\d+)\s*(ml|gm|kg|ltr|l|g)\b/gi, '$1 $2')
      .replace(/[-_]/g, ' ')
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/kpsr/g, 'psr')
      .replace(/psr\s*0*(\d+)\s*0*(\d+)\b/g, 'psr $1 $2');

    for (const bottle of sortedBottles) {
      if (foundNames.has(bottle.plainBottleName)) continue;
      if (!checkBottleMatch(normalizedLine, bottle)) continue;

      matched = true;
      matchedBottleName = bottle.plainBottleName;

      let itemStartIdx = i;
      let itemEndIdx = i;

      // If row i does not have its own serial number, look backwards
      if (!hasSerialNo(rows[i])) {
        for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
          if (headerRowEndIdx !== -1 && j <= headerRowEndIdx) break;
          const prevLine = rowStrings[j];
          if (isTableEnd(prevLine)) break;
          const prevNorm = prevLine.toLowerCase().replace(/[-_]/g, ' ').replace(/[^\w\s]/g, '').trim();
          const hasOtherBottle = sortedBottles.some(b => b.plainBottleName !== bottle.plainBottleName && checkBottleMatch(prevNorm, b));
          if (hasOtherBottle) break;

          itemStartIdx = j;
          if (hasSerialNo(rows[j])) break; // Found start of this item
        }
      }

      // Look downwards
      for (let j = i + 1; j < Math.min(rows.length, i + 3); j++) {
        const nextLine = rowStrings[j];
        if (isTableEnd(nextLine)) break;
        if (hasSerialNo(rows[j])) break;
        const nextNorm = nextLine.toLowerCase().replace(/[-_]/g, ' ').replace(/[^\w\s]/g, '').trim();
        const hasOtherBottle = sortedBottles.some(b => b.plainBottleName !== bottle.plainBottleName && checkBottleMatch(nextNorm, b));
        if (hasOtherBottle) break;

        itemEndIdx = j;
      }

      let combinedString = "";
      let combinedWords = [];
      for (let j = itemStartIdx; j <= itemEndIdx; j++) {
        combinedString += " " + rowStrings[j];
        combinedWords = combinedWords.concat(rows[j].words);
      }
      
      bestMatchFinancials = extractChallanNumbersNearText(
        combinedString,
        bottle.matchName,
        combinedWords,
        qtyColumnX,
        qtyColumnRightBound,
        documentLayout,
        false,
        boxColX,
        boxColRightBound,
        rateColumnX,
        amountColumnX,
        slNoColX
      );

      if (bestMatchFinancials.totalQty > 0 || bestMatchFinancials.qty > 0) {
        const alreadyMatched = items.some(it =>
          it.totalQty === bestMatchFinancials.totalQty &&
          it.box === bestMatchFinancials.box &&
          bestMatchFinancials.totalQty > 0
        );
        if (!alreadyMatched) {
          const matchedBottleObj = canonicalMap.get(bottle.plainBottleName);
          items.push({
            bottleId: { 
              _id: bottle._id.toString(), 
              plainBottleName: bottle.plainBottleName,
              bottlePerBox: matchedBottleObj ? matchedBottleObj.bottlePerBox : null
            },
            bottlePerBox: bestMatchFinancials.qty || (matchedBottleObj ? matchedBottleObj.bottlePerBox : null),
            box: bestMatchFinancials.box,
            qty: bestMatchFinancials.qty || (matchedBottleObj ? matchedBottleObj.bottlePerBox : null) || 1,
            totalQty: bestMatchFinancials.totalQty,
            textLine: combinedString.trim() || line
          });
          foundNames.add(bottle.plainBottleName);
        }

        if (unmatchedItems.length > 0) {
          const lastUnmatched = unmatchedItems[unmatchedItems.length - 1];
          if (lastUnmatched.totalQty === bestMatchFinancials.totalQty && lastUnmatched.qty === bestMatchFinancials.qty) {
            unmatchedItems.pop();
          }
        }
      }
      break;
    }

    if (!matched) {
      if (isTableEnd(line)) break;

      const hasItemSignal = hasSerialNo(row) || /\b\d+\s*(?:ml|gm|kg|ltr|l|g)\b/i.test(line);
      const normalizedSkipLine = normalizeSkipText(line);

      if (!hasItemSignal) {
        let shouldSkipRow = false;
        if (skipPhrases.some(phrase => normalizedSkipLine.includes(phrase))) {
          shouldSkipRow = true;
        } else {
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
      }

      let itemStartIdx = i;
      let itemEndIdx = i;

      if (!hasSerialNo(rows[i])) {
        for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
          if (headerRowEndIdx !== -1 && j <= headerRowEndIdx) break;
          const prevLine = rowStrings[j];
          if (isTableEnd(prevLine)) break;
          itemStartIdx = j;
          if (hasSerialNo(rows[j])) break;
        }
      }

      for (let j = i + 1; j < Math.min(rows.length, i + 5); j++) {
        const nextLine = rowStrings[j];
        if (isTableEnd(nextLine)) break;
        if (hasSerialNo(rows[j])) break;
        itemEndIdx = j;
      }

      let combinedString = "";
      let combinedWords = [];
      for (let j = itemStartIdx; j <= itemEndIdx; j++) {
        combinedString += " " + rowStrings[j];
        combinedWords = combinedWords.concat(rows[j].words);
      }

      const financials = extractChallanNumbersNearText(
        combinedString,
        "",
        combinedWords,
        qtyColumnX,
        qtyColumnRightBound,
        documentLayout,
        true,
        boxColX,
        boxColRightBound,
        rateColumnX,
        amountColumnX,
        slNoColX
      );

      let finalBox = financials.box;
      let finalQty = financials.qty;
      let finalTotal = financials.totalQty;

      const contentMatch = combinedString.match(/(?:average\s*content|pcs\s*per\s*(?:box|package|pkg|ctn)|qty\s*per\s*(?:box|package|pkg|ctn)|per\s*(?:box|package|pkg|ctn))[\s\w:]*?(\d+(?:\.\d+)?)/i);
      const issueMatch = combinedString.match(/(?:package|pkg|box|ctn|carton)?[\s\w]*issue[es]*\s*[:\s]*(\d+(?:\.\d+)?)/i);
      const pkgMatch = combinedString.match(/(?:package|pkg|box|carton)[s\s]*(?:no[.\s]*|count[s\s]*)?[:\s]*(\d+(?:\.\d+)?)/i);

      const parsedContent = contentMatch ? Math.round(parseFloat(contentMatch[1])) : 0;
      const parsedIssue = issueMatch ? Math.round(parseFloat(issueMatch[1])) : (pkgMatch ? Math.round(parseFloat(pkgMatch[1])) : 0);

      if (parsedIssue > 0 && parsedContent > 0) {
        finalBox = parsedIssue;
        finalQty = parsedContent;
        if (!finalTotal) finalTotal = finalBox * finalQty;
      } else if (parsedContent > 0 && finalTotal > 0) {
        finalQty = parsedContent;
        finalBox = Math.round(finalTotal / parsedContent);
      } else if (parsedIssue > 0 && (!finalBox || finalBox === finalTotal)) {
        finalBox = parsedIssue;
        if (finalTotal > 0) finalQty = parseFloat((finalTotal / finalBox).toFixed(2));
      } else if (parsedContent > 0 && !finalQty) {
        finalQty = parsedContent;
        if (finalTotal > 0 && !finalBox) finalBox = parseFloat((finalTotal / finalQty).toFixed(2));
      }

      const descBoundLeft = slNoColX !== -1 ? slNoColX + 15 : 0;
      const descBoundRight = Math.min(
        hsnColX !== -1 ? hsnColX - 10 : Infinity,
        qtyColumnX !== -1 ? qtyColumnX - 25 : Infinity,
        rateColumnX !== -1 ? rateColumnX - 25 : Infinity,
        amountColumnX !== -1 ? amountColumnX - 25 : Infinity,
        450
      );

      // Check item rows in order for description words
      let nameGuess = "";
      for (let j = itemStartIdx; j <= itemEndIdx; j++) {
        const lineDescWords = rows[j].words.filter(w => w.x >= descBoundLeft && w.x < descBoundRight);
        const lineDescText = lineDescWords.map(w => w.text).join(' ');
        if (/\b\d+\s*(?:ml|gm|kg|ltr|l|g)\b/i.test(lineDescText)) {
          nameGuess = lineDescText;
          break;
        }
      }

      if (!nameGuess) {
        const descCandidateWords = combinedWords.filter(w => w.x >= descBoundLeft && w.x < descBoundRight);
        nameGuess = descCandidateWords.map(w => w.text).join(' ');
      }

      nameGuess = nameGuess
        .replace(/\bproduct\s*code\s*[:\s]*\S+/gi, '')
        .replace(/\bcode\s*[:\s]*\S+/gi, '')
        .replace(/\bno\.?\s*description\s*of\s*package\s*issue[es]*\s*[:\s]*[\d.]+/gi, '')
        .replace(/\baverage\s*content\s*in\s*(?:pcs|nos)\s*[:\s]*[\d.]+/gi, '')
        .replace(/\b(?:package|pkg|box|ctn|carton)[s\s]*(?:issue[es]*|no[.\s]*|count[s\s]*)?[:\s]*[\d.]+/gi, '')
        .replace(/\b(?:average\s*content|pcs\s*per\s*(?:box|package|pkg|ctn)|qty\s*per\s*(?:box|package|pkg|ctn))[\s\w:]*?[\d.]+/gi, '')
        .replace(/\([^)]*\)/g, '')
        .replace(/\bproduct\s*description\b/gi, '')
        .replace(/\bdescription\s*of\s*goods\b/gi, '')
        .replace(/\bproduct\b/gi, '')
        .replace(/\b(?:cgst|sgst|igst|utgst|tgst|tax|taxable|rate|amount|value|discount|net\s*value|total\s*value|hsn|sac)\b/gi, '')
        .replace(/[^\w\s-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      const volMatch = nameGuess.match(/\b\d+\s*(?:ml|gm|kg|ltr|l|g)\s+[a-z0-9\s-]+/i);
      if (volMatch) {
        nameGuess = volMatch[0].trim();
      }

      if (finalTotal > 0 || (finalBox > 0 && finalQty > 0)) {
        const alreadyInItems = items.some(it => it.totalQty === finalTotal && it.box === finalBox);
        if (!alreadyInItems) {
          unmatchedItems.push({
            suggestedName: nameGuess || "Unknown Item",
            box: finalBox || 1,
            qty: finalQty || 1,
            totalQty: finalTotal,
            textLine: combinedString.trim() || line
          });
        }
      }
      i = itemEndIdx;
    }
  }

  const finalUnmatchedItems = unmatchedItems.filter(u => {
    const alreadyMatched = items.some(it =>
      (it.totalQty > 0 && it.totalQty === u.totalQty && it.box === u.box) ||
      (it.totalQty > 0 && it.totalQty === u.totalQty)
    );
    if (alreadyMatched) return false;

    const norm = normalizeSkipText(u.suggestedName || '');
    if (skipPhrases.some(phrase => norm.includes(phrase))) return false;
    if (/(buyer|bill\s*to|consignee|ship\s*to|delhi|gujarat|m\/s|limited|private|transport|vehicle|lorry|gstin|pan|bank|declaration|terms)/i.test(u.suggestedName)) return false;

    return u.suggestedName && u.suggestedName.length >= 3;
  });

  return {
    deliveryNumber,
    documentDate,
    billToId: matchedCompanyId,
    billToName,
    poNo,
    poDate,
    poOrderQty,
    items,
    unmatchedItems: finalUnmatchedItems,
  };
}

module.exports = {
  parseChallanData,
  callGoogleVisionFull,
  callGoogleVisionForPdf,
  extractChallanNumbersNearText,
  extractPdfWords
};