const fs = require('fs');

// Decode quoted-printable content
function decodeQuotedPrintable(text) {
  // First, remove soft line breaks
  let decoded = text.replace(/=\r?\n/g, '');
  
  // Handle UTF-8 sequences properly
  // Look for =C2=A0 (non-breaking space) and other UTF-8 sequences
  decoded = decoded.replace(/=C2=A0/g, '\u00A0'); // Non-breaking space
  decoded = decoded.replace(/=C2=A9/g, '\u00A9'); // Copyright symbol
  decoded = decoded.replace(/=C2=AE/g, '\u00AE'); // Registered trademark
  decoded = decoded.replace(/=C2=B0/g, '\u00B0'); // Degree symbol
  decoded = decoded.replace(/=C2=A2/g, '\u00A2'); // Cent symbol
  decoded = decoded.replace(/=C2=A3/g, '\u00A3'); // Pound symbol
  decoded = decoded.replace(/=C2=A5/g, '\u00A5'); // Yen symbol
  decoded = decoded.replace(/=C2=A7/g, '\u00A7'); // Section symbol
  decoded = decoded.replace(/=C2=B1/g, '\u00B1'); // Plus-minus symbol
  decoded = decoded.replace(/=C2=B6/g, '\u00B6'); // Pilcrow symbol
  decoded = decoded.replace(/=C2=B7/g, '\u00B7'); // Middle dot
  decoded = decoded.replace(/=C2=BB/g, '\u00BB'); // Right double angle
  decoded = decoded.replace(/=C2=AB/g, '\u00AB'); // Left double angle
  
  // Handle other single-byte sequences
  decoded = decoded.replace(/=([0-9A-F]{2})/g, (match, hex) => {
    const charCode = parseInt(hex, 16);
    // Skip problematic bytes that cause encoding issues
    if (charCode === 0xC2 || charCode === 0xC3) {
      return ''; // Skip these bytes that cause Â characters
    }
    return String.fromCharCode(charCode);
  });
  
  return decoded;
}

// Parse multipart content recursively
function parseMultipart(content, boundary) {
  const parts = content.split(boundary);
  const results = {
    text: '',
    html: '',
    attachments: []
  };
  
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    
    if (part.trim() === '' || part.trim() === '--') {
      continue;
    }
    
    const lines = part.split(/\r?\n/);
    let headers = {};
    let bodyStart = -1;
    
    // Parse headers
    for (let j = 0; j < lines.length; j++) {
      const line = lines[j];
      
      // Skip empty lines at the beginning
      if (line.trim() === '' && Object.keys(headers).length === 0) {
        continue;
      }
      
      if (line.trim() === '') {
        bodyStart = j + 1;
        break;
      }
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex).trim().toLowerCase();
        const value = line.substring(colonIndex + 1).trim();
        headers[key] = value;
      }
    }
    
    // If no empty line found, the body starts after the last header
    if (bodyStart === -1) {
      bodyStart = lines.length;
    }
    
    const body = bodyStart > 0 ? lines.slice(bodyStart).join('\n') : '';
    const contentType = headers['content-type'] || '';
    const transferEncoding = headers['content-transfer-encoding'] || '';
    
    // Decode content
    let decodedBody = body;
    if (transferEncoding.toLowerCase() === 'quoted-printable') {
      decodedBody = decodeQuotedPrintable(body);
    } else if (transferEncoding.toLowerCase() === 'base64') {
      try {
        decodedBody = Buffer.from(body, 'base64').toString('utf8');
      } catch (e) {
        decodedBody = body;
      }
    }
    
    // Handle nested multipart
    if (contentType.includes('multipart')) {
      const nestedBoundary = contentType.match(/boundary="([^"]+)"/)?.[1] || 
                            contentType.match(/boundary=([^;\s]+)/)?.[1] || '';
      if (nestedBoundary) {
        // The boundary in the email body has 4 dashes, not 2
        const nestedCleanBoundary = `----${nestedBoundary.substring(2)}`;
        const nestedResults = parseMultipart(body, nestedCleanBoundary);
        results.text = nestedResults.text || results.text;
        results.html = nestedResults.html || results.html;
        results.attachments.push(...nestedResults.attachments);
      }
    } else if (contentType.includes('text/plain')) {
      results.text = decodedBody;
    } else if (contentType.includes('text/html')) {
      results.html = decodedBody;
    } else if (headers['content-disposition']?.includes('attachment') || 
               contentType.includes('application/') || 
               contentType.includes('image/') || 
               contentType.includes('video/') || 
               contentType.includes('audio/')) {
      const filename = headers['content-disposition']?.match(/filename="([^"]+)"/)?.[1] || 
                     headers['content-disposition']?.match(/filename=([^;\s]+)/)?.[1] || 
                     'attachment';
      
      let attachmentContent = decodedBody;
      if (transferEncoding.toLowerCase() === 'base64') {
        attachmentContent = body; // Keep as base64 for data URLs
      } else {
        attachmentContent = Buffer.from(decodedBody).toString('base64');
      }
      
      results.attachments.push({
        filename,
        contentType: contentType.split(';')[0] || 'application/octet-stream',
        size: decodedBody.length,
        content: attachmentContent
      });
    }
  }
  
  return results;
}

// Main email parser
function parseEmail(emlContent) {
  const lines = emlContent.split('\n');
  const headers = {};
  let bodyStart = -1;
  
  // Parse headers
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') {
      bodyStart = i + 1;
      break;
    }
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim().toLowerCase();
      const value = line.substring(colonIndex + 1).trim();
      headers[key] = value;
    }
  }
  
  const body = bodyStart > 0 ? lines.slice(bodyStart).join('\n') : '';
  
  // Parse addresses
  const parseAddresses = (addrStr) => {
    if (!addrStr) return [];
    return addrStr.split(',').map(addr => {
      const match = addr.match(/<([^>]+)>/) || addr.match(/([^<\s]+@[^>\s]+)/);
      return match ? match[1].trim() : addr.trim();
    });
  };
  
  if (headers['content-type'] && headers['content-type'].includes('multipart')) {
    const boundary = headers['content-type'].match(/boundary="([^"]+)"/)?.[1] || 
                   headers['content-type'].match(/boundary=([^;\s]+)/)?.[1] || '';
    
    if (boundary) {
      const cleanBoundary = boundary.startsWith('--') ? boundary : `--${boundary}`;
      const multipartResults = parseMultipart(body, cleanBoundary);
      
      return {
        from: parseAddresses(headers['from'] || '')[0] || 'Unknown',
        to: parseAddresses(headers['to'] || ''),
        subject: headers['subject'] || 'No Subject',
        date: new Date(headers['date'] || Date.now()),
        text: multipartResults.text,
        html: multipartResults.html,
        attachments: multipartResults.attachments
      };
    }
  }
  
  // Simple single-part email
  const transferEncoding = headers['content-transfer-encoding'] || '';
  let decodedBody = body;
  
  if (transferEncoding.toLowerCase() === 'quoted-printable') {
    decodedBody = decodeQuotedPrintable(body);
  } else if (transferEncoding.toLowerCase() === 'base64') {
    try {
      decodedBody = Buffer.from(body, 'base64').toString('utf8');
    } catch (e) {
      decodedBody = body;
    }
  }
  
  return {
    from: parseAddresses(headers['from'] || '')[0] || 'Unknown',
    to: parseAddresses(headers['to'] || ''),
    subject: headers['subject'] || 'No Subject',
    date: new Date(headers['date'] || Date.now()),
    text: headers['content-type']?.includes('text/html') ? '' : decodedBody,
    html: headers['content-type']?.includes('text/html') ? decodedBody : '',
    attachments: []
  };
}

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const API_TOKEN = process.env.API_TOKEN || 'b5f8266764783f93d5a735ff11898ec657888047f97998c076a6a6fb3a694118';

// Middleware
const corsOptions = {
  origin: NODE_ENV === 'production' 
    ? process.env.ALLOWED_ORIGINS?.split(',') || ['https://emailviewer-production.up.railway.app']
    : true,
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.use(express.json());

// API Token Authentication Middleware
const authenticateToken = (req, res, next) => {
  // Skip authentication for health check, root endpoint, and view endpoint
  if (req.path === '/health' || req.path === '/' || req.path.startsWith('/view/')) {
    return next();
  }
  
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
  
  if (!token) {
    return res.status(401).json({ 
      error: 'Access denied. API token required.',
      hint: 'Include Authorization header: Bearer YOUR_TOKEN'
    });
  }
  
  if (token !== API_TOKEN) {
    return res.status(403).json({ 
      error: 'Invalid API token.',
      hint: 'Check your API token and try again'
    });
  }
  
  next();
};

// In-memory storage for emails
const emailStore = new Map();

// Generate unique ID
function generateEmailId() {
  return 'email_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (file.originalname.endsWith('.eml')) {
      cb(null, true);
    } else {
      cb(new Error('Only .eml files are allowed'), false);
    }
  }
});

// No static files needed - API only

// Health check endpoint for Railway
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    uptime: process.uptime()
  });
});

// Upload endpoint
app.post('/upload', authenticateToken, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const emlContent = req.file.buffer.toString('utf8');
    const parsedData = parseEmail(emlContent);
    
    const emailId = generateEmailId();
    const emailData = {
      id: emailId,
      from: parsedData.from || 'Unknown',
      to: parsedData.to || [],
      subject: parsedData.subject || 'No Subject',
      date: parsedData.date || new Date(),
      text: parsedData.text || '',
      html: parsedData.html || '',
      attachments: parsedData.attachments || [],
      createdAt: new Date()
    };

    emailStore.set(emailId, emailData);
    
    // Clean up old emails
    if (emailStore.size > 100) {
      const oldestKey = emailStore.keys().next().value;
      emailStore.delete(oldestKey);
    }

    const viewUrl = `${req.protocol}://${req.get('host')}/view/${emailId}`;
    
    res.json({
      success: true,
      emailId,
      viewUrl,
      message: 'Email processed successfully'
    });

  } catch (error) {
    console.error('Error processing email:', error);
    res.status(500).json({
      error: 'Failed to process email file',
      details: error.message
    });
  }
});


// Download attachment endpoint
app.get('/download/:emailId/:attachmentIndex', (req, res) => {
  const { emailId, attachmentIndex } = req.params;
  const emailData = emailStore.get(emailId);
  
  if (!emailData) {
    return res.status(404).send('Email not found');
  }
  
  const attachment = emailData.attachments[parseInt(attachmentIndex)];
  if (!attachment) {
    return res.status(404).send('Attachment not found');
  }
  
  const buffer = Buffer.from(attachment.content, 'base64');
  res.setHeader('Content-Type', attachment.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${attachment.filename}"`);
  res.setHeader('Content-Length', buffer.length);
  res.send(buffer);
});

// View email endpoint
app.get('/view/:id', (req, res) => {
  const emailId = req.params.id;
  const emailData = emailStore.get(emailId);
  
  if (!emailData) {
    return res.status(404).send(`
      <!DOCTYPE html>
      <html>
      <head><title>Email Not Found</title></head>
      <body>
        <h1>Email Not Found</h1>
        <p>The requested email could not be found or may have expired.</p>
        <a href="/">← Back to Upload</a>
      </body>
      </html>
    `);
  }

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const escapeHtml = (text) => {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(emailData.subject)}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: #f1f3f4;
            color: #1a1a1a;
            min-height: 100vh;
            line-height: 1.6;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: #ffffff;
            min-height: 100vh;
            box-shadow: 0 0 20px rgba(0,0,0,0.1);
        }
        .email-header {
            background: #ffffff;
            border-bottom: 2px solid #e1e5e9;
            overflow: hidden;
        }
        
        .header-toggle {
            background: #ffffff;
            padding: 1rem 2rem;
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
            transition: background-color 0.2s ease;
        }
        
        .header-toggle:hover {
            background: #f8f9fa;
        }
        
        .header-title {
            color: #1a1a1a;
            font-weight: 600;
            font-size: 0.95rem;
        }
        
        .toggle-icon {
            color: #5f6368;
            font-size: 0.8rem;
            transition: transform 0.2s ease;
        }
        
        .header-content {
            padding: 2rem;
        }
        .email-meta {
            display: grid;
            gap: 1.5rem;
        }
        .email-field {
            display: flex;
            align-items: flex-start;
            gap: 1rem;
        }
        .email-field label {
            font-weight: 600;
            color: #5f6368;
            min-width: 80px;
            font-size: 0.9rem;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .email-field span {
            color: #1a1a1a;
            word-break: break-word;
            font-size: 0.95rem;
            font-weight: 500;
        }
        .attachments-list {
            display: flex;
            flex-direction: column;
            gap: 0.25rem;
        }
        .attachment-link {
            color: #1a73e8;
            text-decoration: none;
            font-size: 0.9rem;
        }
        .attachment-link:hover {
            text-decoration: underline;
        }
        .content-tabs {
            display: flex;
            border-bottom: 2px solid #e1e5e9;
            background: #ffffff;
        }
        .tab-btn {
            background: none;
            border: none;
            padding: 1rem 2rem;
            font-size: 0.9rem;
            font-weight: 600;
            color: #5f6368;
            cursor: pointer;
            border-bottom: 2px solid transparent;
            transition: all 0.2s ease;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .tab-btn:hover {
            color: #1a1a1a;
            background: #f8f9fa;
        }
        .tab-btn.active {
            color: #1a73e8;
            border-bottom-color: #1a73e8;
        }
        .content-area {
            min-height: 600px;
        }
        .content-panel {
            display: none;
            padding: 1.5rem;
            background: #ffffff;
        }
        .content-panel.active {
            display: block;
        }
        .content-panel pre {
            white-space: pre-wrap;
            word-wrap: break-word;
            font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
            font-size: 0.85rem;
            line-height: 1.5;
            color: #1a1a1a;
            background: #f8f9fa;
            padding: 1.5rem;
            border-radius: 6px;
            border: 1px solid #e1e5e9;
        }
        .no-content {
            color: #5f6368;
            font-style: italic;
            text-align: center;
            padding: 3rem;
            font-size: 0.9rem;
        }
        .download-btn {
            background: #1a73e8;
            color: #ffffff;
            border: 1px solid #1a73e8;
            padding: 0.75rem 1.5rem;
            border-radius: 6px;
            font-size: 0.85rem;
            font-weight: 600;
            cursor: pointer;
            text-decoration: none;
            display: inline-block;
            transition: all 0.2s ease;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .download-btn:hover {
            background: #1557b0;
            border-color: #1557b0;
            color: #ffffff;
        }
        .attachment-unsupported {
            color: #a3a3a3;
            font-style: italic;
            text-align: center;
            padding: 2rem;
            background: #1a1a1a;
            border-radius: 6px;
            border: 1px solid #404040;
        }
        .back-btn {
            background: #262626;
            color: #a3a3a3;
            border: 1px solid #404040;
            padding: 1rem 2rem;
            border-radius: 6px;
            font-size: 0.9rem;
            font-weight: 500;
            cursor: pointer;
            text-decoration: none;
            display: inline-block;
            margin: 2rem;
            transition: all 0.2s ease;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .back-btn:hover {
            background: #404040;
            color: #e5e5e5;
            border-color: #525252;
        }
        iframe {
            background: #ffffff;
            border-radius: 6px;
            border: 1px solid #404040;
        }
        @media (max-width: 768px) {
            .email-field {
                flex-direction: column;
                gap: 0.5rem;
            }
            .email-field label {
                min-width: auto;
            }
            .attachment-item {
                flex-direction: column;
                align-items: flex-start;
                gap: 1rem;
            }
            .download-btn {
                align-self: flex-end;
            }
            .container {
                margin: 0;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="email-header">
            <div class="header-toggle" onclick="toggleHeader()">
                <span class="header-title">Email Details</span>
                <span class="toggle-icon" id="toggleIcon">▼</span>
            </div>
            <div class="header-content" id="headerContent" style="display: none;">
                <div class="email-meta">
                    <div class="email-field">
                        <label>From</label>
                        <span>${escapeHtml(emailData.from)}</span>
                    </div>
                    <div class="email-field">
                        <label>To</label>
                        <span>${escapeHtml(emailData.to.join(', '))}</span>
                    </div>
                    <div class="email-field">
                        <label>Subject</label>
                        <span>${escapeHtml(emailData.subject)}</span>
                    </div>
                    <div class="email-field">
                        <label>Date</label>
                        <span>${new Date(emailData.date).toLocaleString()}</span>
                    </div>
                    ${emailData.attachments && emailData.attachments.length > 0 ? `
                    <div class="email-field">
                        <label>Attachments</label>
                        <div class="attachments-list">
                            ${emailData.attachments.map((attachment, index) => `
                                <a href="/download/${emailId}/${index}" 
                                   class="attachment-link">
                                    ${escapeHtml(attachment.filename)} (${formatFileSize(attachment.size)})
                                </a>
                            `).join('')}
                        </div>
                    </div>
                    ` : ''}
                </div>
            </div>
        </div>

        <div class="content-tabs">
            <button class="tab-btn active" onclick="showTab('text')">Text</button>
            <button class="tab-btn" onclick="showTab('html')">HTML</button>
        </div>
        
        <div class="content-area">
            <div id="textContent" class="content-panel active">
                ${emailData.text ? `<pre>${escapeHtml(emailData.text)}</pre>` : '<p class="no-content">No text content available</p>'}
            </div>
            <div id="htmlContent" class="content-panel">
                ${emailData.html ? `<iframe srcdoc="${escapeHtml(emailData.html)}" style="width: 90%; max-width: 700px; height: 800px; border: 1px solid #e1e5e9; border-radius: 8px; margin: 0 auto; display: block;" sandbox="allow-same-origin"></iframe>` : '<p class="no-content">No HTML content available</p>'}
            </div>
        </div>

    </div>

    <script>
        function showTab(tabName) {
            document.querySelectorAll('.content-panel').forEach(panel => {
                panel.classList.remove('active');
            });
            
            document.querySelectorAll('.tab-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            
            document.getElementById(tabName + 'Content').classList.add('active');
            event.target.classList.add('active');
        }
        
        function toggleHeader() {
            const content = document.getElementById('headerContent');
            const icon = document.getElementById('toggleIcon');
            
            if (content.style.display === 'none') {
                content.style.display = 'block';
                icon.textContent = '▲';
            } else {
                content.style.display = 'none';
                icon.textContent = '▼';
            }
        }
    </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// Root endpoint - API documentation
app.get('/', (req, res) => {
  res.json({
    name: 'Email Viewer API',
    version: '1.0.0',
    description: 'A production-ready email .eml file viewer with HTML rendering and attachment support',
    authentication: {
      type: 'Bearer Token',
      header: 'Authorization: Bearer YOUR_API_TOKEN',
      note: 'Required for all endpoints except / and /health'
    },
    endpoints: {
      'POST /upload': {
        description: 'Upload a .eml file for viewing',
        authentication: 'Required',
        contentType: 'multipart/form-data',
        field: 'file (the .eml file)',
        response: {
          success: 'boolean',
          emailId: 'string',
          viewUrl: 'string',
          message: 'string'
        }
      },
      'GET /view/:id': {
        description: 'View a processed email with HTML rendering and attachments',
        authentication: 'Required',
        parameters: {
          id: 'Email ID returned from upload'
        }
      }
    },
    usage: {
      curl: 'curl -X POST -H "Authorization: Bearer YOUR_TOKEN" -F "file=@email.eml" http://localhost:3000/upload',
      javascript: `
const formData = new FormData();
formData.append('file', file);
const response = await fetch('/upload', { 
  method: 'POST', 
  headers: { 'Authorization': 'Bearer YOUR_TOKEN' },
  body: formData 
});
const result = await response.json();
window.open(result.viewUrl, '_blank');
      `
    }
  });
});

app.listen(PORT, () => {
  console.log(`Email viewer server running on port ${PORT}`);
  if (NODE_ENV === 'production') {
    console.log(`Production server is live!`);
  } else {
    console.log(`Visit: http://localhost:${PORT}`);
  }
});
