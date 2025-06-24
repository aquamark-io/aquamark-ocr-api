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

// Require Bearer token middleware
app.use((req, res, next) => {
  const authHeader = req.headers['authorization'];
  const expectedKey = process.env.AQUAMARK_API_KEY;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization token.' });
  }

  const token = authHeader.split(' ')[1];
  if (token !== expectedKey) {
    return res.status(403).json({ error: 'Invalid API key.' });
  }

  next();
});

// 📜 Optional: Add state disclaimer if applicable
const stateInput = (req.body.state || "").toLowerCase().replace(/\s/g, "");
const stateMap = {
  ca: "License and Disclosure required",
  california: "License and Disclosure required",
  ct: "Registration and Disclosure required",
  connecticut: "Registration and Disclosure required",
  fl: "Comply with Broker Code of Conduct",
  florida: "Comply with Broker Code of Conduct",
  ga: "Disclosure required",
  georgia: "Disclosure required",
  ks: "Disclosure required",
  kansas: "Disclosure required",
  mo: "Registration required",
  missouri: "Registration required",
  ny: "Provider will supply broker commission disclosure",
  newyork: "Provider will supply broker commission disclosure",
  ut: "Provider will supply broker commission disclosure",
  utah: "Provider will supply broker commission disclosure",
  va: "Registration required",
  virginia: "Registration required",
};
const disclaimer = stateMap[stateInput];
if (disclaimer) {
  res.setHeader("X-State-Disclaimer", disclaimer);
}

app.post('/watermark', upload.single('pdf'), async (req, res) => {
  try {
    const { user_email, state } = req.body;
    const pdfFile = req.file;

    if (!user_email || !pdfFile) {
      return res.status(400).json({ error: 'Missing user_email or file' });
    }

    // Fetch logo from Supabase
    const logoFileName = `${user_email}.png`;
    const { data } = supabase
      .storage
      .from('wholesale.logos')
      .getPublicUrl(logoFileName);

    const logoRes = await axios.get(data.publicUrl, { responseType: 'arraybuffer' });
    const logoBytes = logoRes.data;

    // Load PDF
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

    // Optional: attach disclaimer header if state is present
    if (state) {
      const disclaimerText = STATE_DISCLAIMERS[state.toUpperCase()] || STATE_DISCLAIMERS.DEFAULT;
      res.setHeader('X-State-Disclaimer', disclaimerText);
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=watermarked.pdf');
    res.send(Buffer.from(finalBytes));
  } catch (err) {
    console.error('OCR API error:', err);
    res.status(500).json({ error: 'Failed to watermark document' });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Aquamark OCR API running on port ${PORT}`);
});
