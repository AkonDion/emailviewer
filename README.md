# Email Viewer

A production-ready email .eml file viewer with HTML rendering and attachment support.

## Features

- ✅ **HTML Email Rendering** - View emails exactly as they appear to recipients
- ✅ **Text & HTML Tabs** - Switch between plain text and HTML views
- ✅ **Attachment Support** - Download PDFs, images, and other attachments
- ✅ **Image Previews** - Thumbnail previews for image attachments
- ✅ **UTF-8 Encoding** - Proper handling of special characters and non-breaking spaces
- ✅ **Responsive Design** - Works on desktop and mobile devices
- ✅ **REST API** - Upload .eml files via HTTP POST requests

## Quick Start

### Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the server:**
   ```bash
   npm start
   ```

3. **Upload an email:**
   ```bash
   curl -X POST -F "file=@your-email.eml" http://localhost:3000/upload
   ```

4. **View the email:**
   Open the returned `viewUrl` in your browser.

### Railway Deployment

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template)

**Manual Deployment:**
1. Install Railway CLI: `npm install -g @railway/cli`
2. Login: `railway login`
3. Initialize: `railway init`
4. Deploy: `railway up`

**Environment Variables:**
- `NODE_ENV=production`
- `ALLOWED_ORIGINS=https://yourdomain.com` (optional, for CORS)

**Production Usage:**
```bash
# Replace with your Railway URL
curl -X POST -F "file=@your-email.eml" https://your-app.railway.app/upload
```

## API Endpoints

### POST /upload
Upload a .eml file for viewing.

**Request:**
- Content-Type: `multipart/form-data`
- Field: `file` (the .eml file)

**Response:**
```json
{
  "success": true,
  "emailId": "email_1234567890_abc123",
  "viewUrl": "http://localhost:3000/view/email_1234567890_abc123",
  "message": "Email processed successfully"
}
```

### GET /view/:id
View a processed email.

**Response:**
- HTML page with email content, attachments, and interactive viewer

### GET /
API documentation and status.

### GET /health
Health check endpoint for monitoring.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-01-06T18:30:00.000Z",
  "environment": "production",
  "uptime": 123.45
}
```

## Integration Examples

### n8n Workflow
Use the HTTP Request node with:
- **Method:** POST
- **URL:** `http://localhost:3000/upload`
- **Body:** Form-Data with `file` field

### cURL
```bash
curl -X POST -F "file=@email.eml" http://localhost:3000/upload
```

### JavaScript/Node.js
```javascript
const FormData = require('form-data');
const fs = require('fs');
const fetch = require('node-fetch');

const form = new FormData();
form.append('file', fs.createReadStream('email.eml'));

const response = await fetch('http://localhost:3000/upload', {
  method: 'POST',
  body: form
});

const result = await response.json();
console.log('View URL:', result.viewUrl);
```

## Technical Details

- **Email Parser:** Custom implementation supporting nested multipart emails
- **Encoding:** Full UTF-8 support with quoted-printable decoding
- **Storage:** In-memory storage (emails auto-expire after 100 uploads)
- **Security:** iframe sandbox for safe HTML rendering
- **Performance:** Optimized for production use

## Requirements

- Node.js 14+
- Express.js
- Multer (file uploads)
- CORS support

## License

MIT