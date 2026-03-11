# ASE API Documentation

## Base URL

- **Local**: `http://localhost:3001`
- **Production**: `https://your-domain.com`

## Authentication

Optional admin endpoints use token-based authentication. Pass the token as:
- Query parameter: `?token=YOUR_TOKEN`
- Header: `X-Admin-Token: YOUR_TOKEN`

## Endpoints

### 1. Add to Waitlist

Join the waitlist by providing an email address.

**Request:**
```
POST /api/waitlist
Content-Type: application/json

{
  "email": "user@example.com",
  "name": "John Doe"
}
```

**Parameters:**
- `email` (required, string): User's email address
- `name` (optional, string): User's full name

**Success Response (200):**
```json
{
  "success": true,
  "message": "Successfully added to waitlist",
  "data": {
    "id": 1,
    "email": "user@example.com",
    "name": "John Doe",
    "created_at": "2026-03-11T10:30:45Z",
    "status": "pending"
  }
}
```

**Error Responses:**
```json
// 400 - Invalid email
{
  "error": "Valid email is required"
}

// 409 - Email already exists
{
  "error": "Email already in waitlist"
}

// 500 - Server error
{
  "error": "Internal server error"
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3001/api/waitlist \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "name": "Jane Smith"
  }'
```

**JavaScript Example:**
```javascript
const response = await fetch('/api/waitlist', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    name: 'Jane Smith'
  })
});

const data = await response.json();
console.log(data);
```

---

### 2. Get All Waitlist Entries

Retrieve all waitlist entries (admin only).

**Request:**
```
GET /api/waitlist?token=YOUR_ADMIN_TOKEN
```

**Headers:**
- `X-Admin-Token: YOUR_ADMIN_TOKEN` (alternative to query parameter)

**Success Response (200):**
```json
{
  "data": [
    {
      "id": 1,
      "email": "user1@example.com",
      "name": "John Doe",
      "created_at": "2026-03-11T10:30:45Z",
      "status": "pending",
      "email_sent": true,
      "email_sent_at": "2026-03-11T10:30:46Z"
    },
    {
      "id": 2,
      "email": "user2@example.com",
      "name": "Jane Smith",
      "created_at": "2026-03-11T11:45:30Z",
      "status": "pending",
      "email_sent": false,
      "email_sent_at": null
    }
  ],
  "count": 2,
  "timestamp": "2026-03-11T12:00:00Z"
}
```

**Error Responses:**
```json
// 401 - Unauthorized
{
  "error": "Unauthorized"
}

// 500 - Server error
{
  "error": "Internal server error"
}
```

**cURL Example:**
```bash
curl http://localhost:3001/api/waitlist?token=your-secret-token
```

---

### 3. Get Waitlist Statistics

Get summary statistics about the waitlist (admin only).

**Request:**
```
GET /api/stats?token=YOUR_ADMIN_TOKEN
```

**Success Response (200):**
```json
{
  "total": 42,
  "email_sent": 40,
  "email_pending": 2,
  "timestamp": "2026-03-11T12:00:00Z"
}
```

**cURL Example:**
```bash
curl http://localhost:3001/api/stats?token=your-secret-token
```

---

### 4. Health Check

Simple health check endpoint.

**Request:**
```
GET /api/health
```

**Success Response (200):**
```json
{
  "status": "ok",
  "service": "ASE - Agent Stock Exchange Waitlist",
  "timestamp": "2026-03-11T12:00:00Z",
  "environment": "production",
  "uptime": 3600.5
}
```

**cURL Example:**
```bash
curl http://localhost:3001/api/health
```

---

### 5. Send Batch Emails

Send confirmation emails to all pending waitlist entries (admin only).

**Request:**
```
POST /api/send-batch-emails
X-Admin-Token: YOUR_ADMIN_TOKEN
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Sent 5 emails, 0 failed",
  "sent": 5,
  "failed": 0,
  "total": 5,
  "timestamp": "2026-03-11T12:00:00Z"
}
```

**Error Responses:**
```json
// 401 - Unauthorized
{
  "error": "Unauthorized"
}

// 500 - Server error
{
  "error": "Internal server error"
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3001/api/send-batch-emails \
  -H "X-Admin-Token: your-secret-token"
```

**JavaScript Example:**
```javascript
const response = await fetch('/api/send-batch-emails', {
  method: 'POST',
  headers: {
    'X-Admin-Token': 'your-secret-token'
  }
});

const data = await response.json();
console.log(`Sent ${data.sent} emails`);
```

---

## HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Bad Request (invalid input) |
| 401 | Unauthorized (invalid token) |
| 405 | Method Not Allowed |
| 409 | Conflict (email already exists) |
| 500 | Internal Server Error |

---

## Rate Limiting

Currently no rate limiting is implemented. For production, consider:
- Limiting to 1 request per IP per minute on `/api/waitlist`
- Implementing CAPTCHA on the form
- Using Cloudflare rate limiting

---

## Email Content

When a user joins the waitlist, they receive an automated confirmation email with:
- Welcome message
- Overview of ASE features
- Timeline for early access
- Contact information

---

## Database Schema

```sql
CREATE TABLE waitlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'pending',
  email_sent BOOLEAN DEFAULT 0,
  email_sent_at DATETIME
);
```

---

## Environment Variables

```env
# Email Configuration
SENDGRID_API_KEY=your-sendgrid-api-key
EMAIL_FROM=noreply@ase.com

# Server Configuration
PORT=3001
NODE_ENV=production

# Optional: Admin Authentication
ADMIN_TOKEN=your-secret-admin-token
```

---

## Webhooks (Future)

Webhook support planned for:
- `waitlist.new_signup` - Fired when a new user joins
- `waitlist.email_sent` - Fired when confirmation email is sent
- `waitlist.email_failed` - Fired when email fails to send

---

## Rate Limiting (Future)

Rate limits will be implemented as:
- 10 requests per minute per IP on signup endpoint
- 100 requests per hour on admin endpoints
- 1000 requests per hour for API tokens

---

## Pagination (Future)

The waitlist endpoint will support pagination:

```
GET /api/waitlist?page=1&limit=50&token=YOUR_TOKEN

Response:
{
  "data": [...],
  "count": 50,
  "total": 237,
  "page": 1,
  "pages": 5,
  "next_page": 2
}
```

---

## Search & Filtering (Future)

Search and filter options:

```
GET /api/waitlist?search=john&sent=false&token=YOUR_TOKEN
```

---

## Support

For API issues or questions:
- Email: api-support@ase.com
- GitHub Issues: [your-repo]/issues
