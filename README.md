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
Upload page interface.

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