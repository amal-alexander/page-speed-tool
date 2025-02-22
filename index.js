require('dotenv').config(); // Load environment variables from .env file

const express = require('express');
const multer = require('multer');
const path = require('path');
const axios = require('axios');
const XLSX = require('xlsx');

const app = express();
const upload = multer({ dest: '/tmp/uploads/' });

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Validate URL
const isValidUrl = (url) => {
  try {
    new URL(url);
    return true;
  } catch (err) {
    return false;
  }
};

// Fetch PageSpeed metrics
const getPageSpeedData = async (url) => {
  const apiKey = process.env.API_KEY; // Use environment variable
  if (!isValidUrl(url)) {
    console.error('Error: Invalid URL provided');
    return null;
  }

  const encodedUrl = encodeURIComponent(url);
  try {
    const response = await axios.get(
      `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodedUrl}&key=${apiKey}`
    );

    if (response.data && response.data.lighthouseResult) {
      const metrics = {
        'Performance Score': response.data.lighthouseResult.categories.performance.score,
        'First Contentful Paint': response.data.lighthouseResult.audits['first-contentful-paint'].displayValue,
        'Speed Index': response.data.lighthouseResult.audits['speed-index'].displayValue,
        'Largest Contentful Paint': response.data.lighthouseResult.audits['largest-contentful-paint'].displayValue,
        'Time to Interactive': response.data.lighthouseResult.audits['interactive'].displayValue,
        'Total Blocking Time': response.data.lighthouseResult.audits['total-blocking-time'].displayValue,
        'Cumulative Layout Shift': response.data.lighthouseResult.audits['cumulative-layout-shift'].displayValue,
        'INP': response.data.lighthouseResult.audits['interaction-to-next-paint'] ? response.data.lighthouseResult.audits['interaction-to-next-paint'].displayValue : 'N/A'
      };
      return metrics;
    } else {
      console.error('Error: Unexpected response format');
      return null;
    }
  } catch (error) {
    console.error('Error:', error.message);
    return null;
  }
};

// Handle file upload
app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }

  // Validate file type
  if (!req.file.mimetype.includes('sheet') && !req.file.mimetype.includes('excel')) {
    return res.status(400).send('Invalid file type. Upload an Excel file.');
  }

  try {
    // Read the uploaded Excel file
    const workbook = XLSX.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const urls = XLSX.utils.sheet_to_json(sheet);

    // Process each URL
    const results = [];
    for (let i = 0; i < urls.length; i++) {
      const row = urls[i];
      if (row.URL) {
        console.log(`Processing URL ${i + 1}/${urls.length}: ${row.URL}`);
        const metrics = await getPageSpeedData(row.URL);
        if (metrics) {
          results.push({ URL: row.URL, ...metrics });
        }
      } else {
        console.error('Error: Missing URL in row', row);
      }
    }

    // Generate a new Excel file with results
    const newWorkbook = XLSX.utils.book_new();
    const newSheet = XLSX.utils.json_to_sheet(results);
    XLSX.utils.book_append_sheet(newWorkbook, newSheet, 'Results');
    const outputFilePath = path.join('/tmp', 'results.xlsx');
    XLSX.writeFile(newWorkbook, outputFilePath);

    // Send the results file for download
    res.download(outputFilePath, 'PageSpeedResults.xlsx', (err) => {
      if (err) {
        console.error('Error downloading file:', err);
        res.status(500).send('Error downloading file.');
      }
    });
  } catch (error) {
    console.error('Error processing file:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Start the server
const PORT = process.env.PORT || 3000; // Use environment variable for port
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

module.exports = app;