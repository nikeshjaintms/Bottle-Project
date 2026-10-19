const SgLabel = require("../models/SgLabel");
const Variant = require("../models/Variant");
const Company = require("../models/Company");
const Brand = require("../models/Brand");
const BottleSpec = require("../models/Bottlespecs");
const puppeteer = require('puppeteer');

exports.generateSgLabelPdf = async (req, res) => {
  try {
    const { labelData, printQty = 1, dtStr = '', type = '', includeBrand = false } = req.body;

    if (!labelData) {
      return res.status(400).json({ success: false, message: "Label data is required" });
    }

    // labelData is now a Variant object or SgLabel object
    let bottleNameStr = labelData.customBottleName || labelData.bottleSpecId?.bottleName || '';
    let variantName = labelData.customVariantName || labelData.variantName || '';
    
    // Helper to safely strip (code) or (size) using regex
    const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const code = labelData.bottleSpecId?.code;
    if (code) {
      const codeRegex = new RegExp(`[- ]*\\(${escapeRegExp(code)}\\)`, 'gi');
      bottleNameStr = bottleNameStr.replace(codeRegex, '').trim();
    }

    const size = labelData.variantSize || labelData.variantId?.variantSize || labelData.size;
    if (size) {
      const sizeRegex = new RegExp(`[- ]*\\(${escapeRegExp(size)}\\)`, 'gi');
      variantName = variantName.replace(sizeRegex, '').trim();
    }
    const detectedTextColor = type === 'Coating' ? '' : (labelData.detectedTextColor || '');
    const coatingShade = labelData.coatingShade || '';
    const brandNameStr = includeBrand ? (labelData.customBrandName || labelData.bottleSpecId?.brandId?.name || labelData.brandId?.name || labelData.brandName || '') : '';
    
    const leftSide = [bottleNameStr, coatingShade].filter(Boolean).join('-');
    const rightSide = [
      brandNameStr, 
      variantName, 
      (detectedTextColor && detectedTextColor !== 'Not Detected' ? detectedTextColor : '')
    ].filter(Boolean).join('-');
    
    const plainText = `${leftSide}- ${rightSide}..`;
    const len = plainText.length;

    // Use non-breaking hyphen to prevent line break on original hyphens in bottle name
    const bottleNameHtml = bottleNameStr.replace(/-/g, '&#8209;');
    
    const leftSideHtml = [bottleNameHtml, coatingShade].filter(Boolean).join('-&#8203;');
    const rightSideHtml = [
      brandNameStr,
      variantName,
      (detectedTextColor && detectedTextColor !== 'Not Detected' ? detectedTextColor : '')
    ].filter(Boolean).join('-&#8203;');

    const fullTextHtml = `${leftSideHtml}-&#8203; ${rightSideHtml}..`;
    // We will dynamically scale the font size using client-side JavaScript inside the generated PDF.

    const singleLabel = `
      <div class="label">
        <div class="inner-content" style="width: 100%;">
          <div style="width: 100%; line-height: 1.1; word-wrap: break-word;">${fullTextHtml}</div>
          <div style="width: 100%; text-align: right; margin-top: 2px;">SGDPL ${dtStr}</div>
        </div>
      </div>
    `;

    const labelContent = singleLabel.repeat(parseInt(printQty, 10) || 1);

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            @page {
                size: 75mm 25mm;
                margin: 0;
            }
            html, body {
                width: 75mm;
                height: 25mm;
                margin: 0;
                padding: 0;
                background: #fff;
            }
            .label {
                width: 75mm !important;
                height: 25mm !important;
                min-width: 75mm !important;
                max-width: 75mm !important;
                min-height: 25mm !important;
                max-height: 25mm !important;
                margin: 0;
                padding: 0 5mm;
                box-sizing: border-box;
                display: flex;
                flex-direction: column;
                justify-content: center;
                overflow: hidden;
                font-family: Arial, sans-serif;
                font-weight: 900;
                text-transform: uppercase;
                color: #000;
                page-break-after: always;
            }
            .label:last-child {
                page-break-after: auto;
            }
          </style>
        </head>
        <body>
          ${labelContent}
          <script>
            document.querySelectorAll('.label').forEach(label => {
               const inner = label.querySelector('.inner-content');
               let fontSize = 19;
               label.style.fontSize = fontSize + 'pt';
               
               const style = window.getComputedStyle(label);
               const paddingY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
               const availableHeight = label.clientHeight - paddingY;
               
               while (inner.scrollHeight > availableHeight && fontSize > 5) {
                 fontSize -= 0.5;
                 label.style.fontSize = fontSize + 'pt';
               }
            });
          </script>
        </body>
      </html>
    `;

    const browser = await puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      width: '75mm',
      height: '25mm',
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
      printBackground: true,
      preferCSSPageSize: true
    });

    await browser.close();

    const bName = (bottleNameStr || 'bottle').replace(/[\s/\\|:]+/g, '-');
    const cShade = (coatingShade || '').replace(/[\s/\\|:]+/g, '-');
    const vName = (variantName || '').replace(/[\s/\\|:]+/g, '-');
    const dlName = `${bName}${cShade ? `-${cShade}` : ''}${vName ? `-${vName}` : ''}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${dlName}"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error("PDF Generation Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getSgLabels = async (req, res) => {
  try {
    const { page = 1, limit = 10, pagination = "true", search = "", companyId = "", brandId = "", bottleId = "", variantId = "" } = req.query;

    const query = { isDeleted: { $ne: true }, isHiddenInSgLabel: { $ne: true } };

    if (variantId) {
      query._id = variantId;
    } else if (bottleId) {
      query.bottleSpecId = bottleId;
    } else if (brandId) {
      const specs = await BottleSpec.find(query);
      query.bottleSpecId = { $in: specs.map(s => s._id) };
    } else if (companyId) {
      const brands = await Brand.find(query);
      const specs = await BottleSpec.find(query);
      query.bottleSpecId = { $in: specs.map(s => s._id) };
    }

    const populateOpts = {
      path: "bottleSpecId",
      populate: {
        path: "brandId",
        populate: { path: "companyId" }
      }
    };

    // 1. Fetch Auto-Imported Variants
    let variants = await Variant.find(query)
        .populate(populateOpts)
      .sort({ createdAt: -1 }).lean();

    const mappedVariants = variants.map(v => ({
      ...v,
      isCustom: false
    }));

    // 2. Fetch Custom SG Labels (and map query filters)
    const customQuery = { isDeleted: false };
    if (variantId) customQuery.variantId = variantId;
    if (bottleId) customQuery.bottleId = bottleId;
    if (brandId || companyId) {
       // already resolved bottleSpecIds from brandId/companyId in the query above
       if (query.bottleSpecId) customQuery.bottleId = query.bottleSpecId;
    }

    const customLabels = await SgLabel.find(query)
        .populate({
        path: "bottleId",
        populate: {
          path: "brandId",
          populate: { path: "companyId" }
        }
      })
      .populate("variantId")
      .sort({ createdAt: -1 }).lean();

    const mappedCustom = customLabels.map(cl => ({
      _id: cl._id,
      isCustom: true,
      bottleSpecId: cl.bottleId,
      variantName: cl.customVariantName || cl.variantId?.variantName,
      customVariantName: cl.customVariantName,
      customBottleName: cl.customBottleName,
      customBrandName: cl.customBrandName,
      variantSize: cl.variantId?.variantSize,
      coatingShade: cl.coatingShade,
      detectedTextColor: cl.detectedTextColor,
      status: cl.status !== false, // Ensure missing defaults to true
      originalSgLabel: cl
    }));

    const customVariantIds = customLabels
      .map(cl => cl.variantId?._id?.toString())
      .filter(Boolean);

    const filteredVariants = mappedVariants.filter(
      v => !customVariantIds.includes(v._id.toString())
    );

    // 3. Merge them
    let items = [...mappedCustom, ...filteredVariants];

    if (search && search.trim() !== "") {
      const searchWord = search.trim();
      
      const searchTokens = searchWord.split(/[\W_]+/).filter(Boolean);
      let regexStr = "";
      
      if (searchTokens.length > 0) {
        const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        regexStr = searchTokens.map(escapeRegExp).join('[\\W_]+');
      } else {
        regexStr = searchWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }
      
      const wholeWordRegex = new RegExp(`(?:^|\\W)${regexStr}(?:\\W|$)`, "i");

      items = items.filter((item) => {
        const bottleName = item.bottleSpecId?.bottleName || item.customBottleName || "";
        const variantName = item.variantName || item.customVariantName || "";
        const brandName = item.bottleSpecId?.brandId?.name || item.customBrandName || "";
        
        return (
          wholeWordRegex.test(bottleName) ||
          wholeWordRegex.test(variantName) ||
          wholeWordRegex.test(brandName)
        );
      });
    }

    const total = items.length;

    if (pagination === "false") {
      return res.json({ success: true, data: items, total });
    }

    let parsedPage = 1;
    if (page && page !== '') {
      parsedPage = parseInt(page) || 1;
      res.cookie('sgLabelsPage', parsedPage, { maxAge: 86400000, httpOnly: true });
    } else if (req.cookies.sgLabelsPage) {
      parsedPage = parseInt(req.cookies.sgLabelsPage) || 1;
    }

    const parsedLimit = parseInt(limit) || 10;
    const skip = (parsedPage - 1) * parsedLimit;

    const paginatedItems = items.slice(skip, skip + parsedLimit);

    res.json({
      success: true,
      data: paginatedItems,
      total,
      page: parsedPage,
      limit: parsedLimit,
      totalPages: Math.ceil(total / parsedLimit),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getSgLabelById = async (req, res) => {
  try {
    const sgLabel = await SgLabel.findOne({ _id: req.params.id, isDeleted: false })
      .populate({
        path: "bottleId",
        populate: {
          path: "brandId",
          populate: { path: "companyId" }
        }
      })
      .populate("variantId");
      
    if (!sgLabel) {
      return res.status(404).json({ success: false, message: "SG Label not found" });
    }
    res.json({ success: true, data: sgLabel });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createSgLabel = async (req, res) => {
  try {
    if (typeof req.body.status === 'string') {
      req.body.status = req.body.status === 'active';
    }
    if (!req.body.bottleId) req.body.bottleId = null;
    if (!req.body.variantId) req.body.variantId = null;
    
    const { bottleId, variantId, coatingShade } = req.body;
    
    const existingLabel = await SgLabel.findOne({
      bottleId: bottleId || null,
      variantId: variantId || null,
      coatingShade: coatingShade || "",
      isDeleted: false,
      $and: [
        req.body.customBottleName ? { customBottleName: req.body.customBottleName } : { $or: [{ customBottleName: "" }, { customBottleName: null }, { customBottleName: { $exists: false } }] },
        req.body.customBrandName ? { customBrandName: req.body.customBrandName } : { $or: [{ customBrandName: "" }, { customBrandName: null }, { customBrandName: { $exists: false } }] },
        req.body.customVariantName ? { customVariantName: req.body.customVariantName } : { $or: [{ customVariantName: "" }, { customVariantName: null }, { customVariantName: { $exists: false } }] },
        req.body.detectedTextColor ? { detectedTextColor: req.body.detectedTextColor } : { $or: [{ detectedTextColor: "" }, { detectedTextColor: null }, { detectedTextColor: { $exists: false } }] }
      ]
    });

    if (existingLabel) {
      return res.status(400).json({ success: false, message: "SG Label with this combination already exists" });
    }

    const newSgLabel = new SgLabel(req.body);
    await newSgLabel.save();
    
    if (newSgLabel.variantId && req.body.hideVariant !== false) {
      await Variant.findByIdAndUpdate(newSgLabel.variantId, { isHiddenInSgLabel: true });
    }

    res.status(201).json({ success: true, message: "SG Label created successfully", data: newSgLabel });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateSgLabel = async (req, res) => {
  try {
    if (typeof req.body.status === 'string') {
      req.body.status = req.body.status === 'active';
    }
    if (!req.body.bottleId) req.body.bottleId = null;
    if (!req.body.variantId) req.body.variantId = null;
    
    const { bottleId, variantId, coatingShade } = req.body;
    
    const existingLabel = await SgLabel.findOne({
      bottleId: bottleId || null,
      variantId: variantId || null,
      coatingShade: coatingShade || "",
      isDeleted: false,
      _id: { $ne: req.params.id },
      $and: [
        req.body.customBottleName ? { customBottleName: req.body.customBottleName } : { $or: [{ customBottleName: "" }, { customBottleName: null }, { customBottleName: { $exists: false } }] },
        req.body.customBrandName ? { customBrandName: req.body.customBrandName } : { $or: [{ customBrandName: "" }, { customBrandName: null }, { customBrandName: { $exists: false } }] },
        req.body.customVariantName ? { customVariantName: req.body.customVariantName } : { $or: [{ customVariantName: "" }, { customVariantName: null }, { customVariantName: { $exists: false } }] },
        req.body.detectedTextColor ? { detectedTextColor: req.body.detectedTextColor } : { $or: [{ detectedTextColor: "" }, { detectedTextColor: null }, { detectedTextColor: { $exists: false } }] }
      ]
    });

    if (existingLabel) {
      return res.status(400).json({ success: false, message: "SG Label with this combination already exists" });
    }

    const updatedSgLabel = await SgLabel.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
    if (!updatedSgLabel) {
      return res.status(404).json({ success: false, message: "SG Label not found" });
    }
    res.json({ success: true, message: "SG Label updated successfully", data: updatedSgLabel });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteSgLabel = async (req, res) => {
  try {
    const deletedSgLabel = await SgLabel.findByIdAndUpdate(req.params.id, { isDeleted: true }, { returnDocument: 'after' });
    if (!deletedSgLabel) {
      return res.status(404).json({ success: false, message: "SG Label not found" });
    }
    if (deletedSgLabel.variantId) {
      await Variant.findByIdAndUpdate(deletedSgLabel.variantId, { isHiddenInSgLabel: true });
    }
    res.json({ success: true, message: "SG Label deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.toggleStatus = async (req, res) => {
  try {
    const sgLabel = await SgLabel.findById(req.params.id);
    if (!sgLabel) {
      return res.status(404).json({ success: false, message: "SG Label not found" });
    }
    sgLabel.status = !sgLabel.status;
    await sgLabel.save();
    res.json({ success: true, message: `SG Label marked as ${sgLabel.status ? 'Active' : 'Inactive'}` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.hideVariantFromSgLabel = async (req, res) => {
  try {
    await Variant.findByIdAndUpdate(req.params.id, { isHiddenInSgLabel: true });
    res.json({ success: true, message: "Variant hidden from SG Labels" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
