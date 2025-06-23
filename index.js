// index.js - Aquamark OCR Integration API
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const { PDFDocument, degrees } = require('pdf-lib');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

const upload = multer({ storage: multer.memoryStorage() });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Simple disclaimer map
const STATE_DISCLAIMERS = {
  CA: 'California compliance: Broker disclosures required.',
  NY: 'New York law requires funder-broker transparency.',
  TX: 'Texas compliance: No misrepresentation permitted.',
  DEFAULT: 'Aquamark compliance notice: Broker disclosure applies.'
};

app.post('/watermark', upload.single('pdf'), async (req, res) => {
  try {
    const { user_email, state } = req.body;
    const pdfFile = req.file;

    if (!user_email || !state || !pdfFile) {
      return res.status(400).json({ error: 'Missing user_email, state, or file' });
    }

    const logoFileName = `${user_email}.png`;
    const { data } = supabase.storage
      .from('wholesale_logos')
      .getPublicUrl(logoFileName);

    const logoRes = await axios.get(data.publicUrl, { responseType: 'arraybuffer' });
    const logoBytes = logoRes.data;

    const pdfDoc = await PDFDocument.load(pdfFile.buffer, { ignoreEncryption: true });
    const logoImage = await pdfDoc.embedPng(logoBytes);
    const pages = pdfDoc.getPages();

    for (const page of pages) {
      const { width, height } = page.getSize();

      const cols = 5, rows = 5;
      const spacingX = width / cols;
      const spacingY = height / rows;
      const logoWidth = 80;
      const logoHeight = (logoWidth / logoImage.width) * logoImage.height;

      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const x = i * spacingX + 30;
          const y = j * spacingY + 40;
          page.drawImage(logoImage, {
            x, y,
            width: logoWidth,
            height: logoHeight,
            opacity: 0.25,
            rotate: degrees(45)
          });
        }
      }
    }

    const finalBytes = await pdfDoc.save();
    const disclaimer = STATE_DISCLAIMERS[state] || STATE_DISCLAIMERS.DEFAULT;

    res.setHeader('X-State-Disclaimer', disclaimer);
    res.json({
      success: true,
      disclaimer,
      file: Buffer.from(finalBytes).toString('base64')
    });
  } catch (err) {
    console.error('OCR API error:', err);
    res.status(500).json({ error: 'Failed to watermark document' });
  }
});

app.listen(PORT, () => {
  console.log(`Aquamark OCR API running on port ${PORT}`);
});
