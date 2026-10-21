const SgLabelTwoTemplate = require('../models/SgLabelTwoTemplate');
const puppeteer = require('puppeteer');

// Create a new template
exports.createTemplate = async (req, res) => {
  try {
    const template = new SgLabelTwoTemplate(req.body);
    await template.save();
    res.status(201).json({ message: 'Template created successfully', template });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Template with this name already exists' });
    }
    res.status(500).json({ message: 'Error creating template', error: error.message });
  }
};

// Get all templates
exports.getTemplates = async (req, res) => {
  try {
    const templates = await SgLabelTwoTemplate.find();
    res.json(templates);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching templates', error: error.message });
  }
};

// Get a single template
exports.getTemplate = async (req, res) => {
  try {
    const template = await SgLabelTwoTemplate.findById(req.params.id);
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }
    res.json(template);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching template', error: error.message });
  }
};

// Update a template
exports.updateTemplate = async (req, res) => {
  try {
    const template = await SgLabelTwoTemplate.findByIdAndUpdate(
      req.params.id,
      req.body,
      { returnDocument: 'after', runValidators: true }
    );
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }
    res.json({ message: 'Template updated successfully', template });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Template with this name already exists' });
    }
    res.status(500).json({ message: 'Error updating template', error: error.message });
  }
};

// Delete a template
exports.deleteTemplate = async (req, res) => {
  try {
    const template = await SgLabelTwoTemplate.findByIdAndDelete(req.params.id);
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }
    res.json({ message: 'Template deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting template', error: error.message });
  }
};

// Toggle template status
exports.toggleTemplateStatus = async (req, res) => {
  try {
    const template = await SgLabelTwoTemplate.findById(req.params.id);
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }
    template.status = !template.status;
    await template.save();
    res.json({ message: 'Status toggled successfully', status: template.status });
  } catch (error) {
    res.status(500).json({ message: 'Error toggling status', error: error.message });
  }
};

// Generate PDF
exports.generatePdf = async (req, res) => {
  try {
    const { templateId, parsedElements } = req.body;

    const template = await SgLabelTwoTemplate.findById(templateId);
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    let elementsHtml = parsedElements.map(el => {
      let content = el.content;
      if (el.type === 'barcode') {
        content = `<svg class="barcode" jsbarcode-value="${content}" jsbarcode-width="1.5" jsbarcode-height="${el.height - 20}" jsbarcode-fontSize="12" jsbarcode-margin="0" jsbarcode-background="transparent" jsbarcode-displayValue="true"></svg>`;
      }
      return `
        <div style="
          position: absolute;
          left: ${el.x}px;
          top: ${el.y}px;
          width: ${el.width}px;
          height: ${el.height}px;
          font-size: ${el.fontSize}px;
          font-weight: ${el.fontWeight};
          font-family: ${el.fontFamily};
          color: ${el.color};
          text-align: ${el.textAlign};
          transform: rotate(${el.rotation}deg);
          z-index: ${el.zIndex};
          display: flex;
          align-items: center;
          justify-content: ${el.textAlign === 'center' ? 'center' : el.textAlign === 'right' ? 'flex-end' : 'flex-start'};
          overflow: hidden;
        ">
          ${content}
        </div>
      `;
    }).join('');

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
                position: relative;
            }
            .label-container {
                width: 284px;
                height: 95px;
                position: relative;
                transform-origin: top left;
                transform: scale(1);
            }
          </style>
          <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
        </head>
        <body>
          <div class="label-container">
            ${elementsHtml}
          </div>
          <script>
            JsBarcode(".barcode").init();
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

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Length': pdfBuffer.length
    });
    res.send(pdfBuffer);

  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ message: 'Error generating PDF', error: error.message });
  }
};
