# Project Structure & File Guide

Complete reference for all files in the ASE MVP project.

## 📁 Root Level Files

### Landing Page & Frontend

| File | Purpose |
|------|---------|
| `index.html` | Main landing page - Beautiful, responsive design with hero, features, how-it-works, and waitlist form |
| `DEPLOYMENT.md` | Complete deployment guide for all platforms (Cloudflare, Node.js, VPS) |
| `QUICKSTART.md` | 5-minute quick start guide for getting the project running |
| `SETUP.md` | Detailed configuration guide for SendGrid and deployment |
| `API.md` | Complete API documentation with examples for all endpoints |

### Backend Core Files

| File | Purpose |
|------|---------|
| `server.js` | Express.js server - Main backend, handles all API routes and serves landing page |
| `db.js` | SQLite database layer - Manages waitlist storage and queries |
| `emailService.js` | Email handler - Sends confirmation emails via SendGrid or SMTP |
| `package.json` | Node.js dependencies and scripts - npm install uses this |

### Configuration Files

| File | Purpose |
|------|---------|
| `.env.example` | Template for environment variables - Copy to `.env` and fill in your keys |
| `.env` | Your actual environment variables - **Never commit this to Git** |
| `.gitignore` | Files to ignore when committing to Git (includes `.env`, node_modules) |
| `wrangler.toml` | Cloudflare Pages configuration - For Pages Functions deployment |
| `wrangler.json` | Alternative Cloudflare configuration format |
| `vercel.json` | Vercel deployment configuration (for Vercel alternative) |

### Documentation

| File | Purpose |
|------|---------|
| `README.md` | Project overview, quick start, features, and tech stack |
| `API.md` | Comprehensive API documentation with curl examples |
| `SETUP.md` | Step-by-step setup guide (SendGrid, local dev, deployment options) |
| `DEPLOYMENT.md` | Detailed deployment guide for production |
| `QUICKSTART.md` | 5-minute quick start for impatient devs |

## 📂 Directories

### `/functions` - Cloudflare Pages Functions

For serverless deployment on Cloudflare Pages:

| File | Purpose |
|------|---------|
| `functions/api/waitlist.js` | Cloudflare Pages Function - Handles POST /api/waitlist on Pages |

This file is automatically executed by Cloudflare Pages when requests come to `/api/waitlist`.

## 🔧 Configuration & Environment Variables

### `.env` Example

```env
# Email Service Configuration
EMAIL_SERVICE=sendgrid
SENDGRID_API_KEY=SG.xxxxxxxxxxxxx
EMAIL_FROM=noreply@ase.com

# Server Configuration  
PORT=3001
NODE_ENV=production

# Optional Admin Authentication
ADMIN_TOKEN=your-secret-admin-token

# Optional Cloudflare
CLOUDFLARE_API_TOKEN=xxx
CLOUDFLARE_ACCOUNT_ID=xxx
CLOUDFLARE_KV_NAMESPACE_ID=xxx
```

## 📊 Database Schema

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

**File:** `waitlist.db` (auto-created in root directory)

## 🚀 API Endpoints

All endpoints are handled by `server.js`:

```
POST   /api/waitlist           ← server.js line 31
GET    /api/waitlist           ← server.js line 79
GET    /api/stats              ← server.js line 140
GET    /api/health             ← server.js line 104
POST   /api/send-batch-emails  ← server.js line 120
GET    /                       ← server.js line 187 (serves index.html)
```

## 📋 Dependencies (package.json)

### Main Dependencies
- `express` - Web framework
- `sqlite3` - Database
- `nodemailer` - Email sending
- `cors` - Cross-origin requests
- `body-parser` - JSON parsing
- `dotenv` - Environment variables

### Dev Dependencies
- `nodemon` - Auto-restart server on file changes

## 🔐 Security

### Sensitive Files (Never commit)
- `.env` - Contains API keys
- `waitlist.db` - Contains user data
- `.env.production` - Production keys

### Already in .gitignore
- `node_modules/`
- `.env`
- `*.db`
- `.DS_Store`

## 📚 How to Read This Project

### For First-Time Setup
1. Read `README.md` - Overview
2. Read `QUICKSTART.md` - Get running in 5 minutes
3. Read `SETUP.md` - Detailed configuration

### For Deployment
1. Read `DEPLOYMENT.md` - All deployment options
2. Choose your platform (Cloudflare, Heroku, etc.)
3. Follow the specific instructions

### For API Integration
1. Read `API.md` - Complete endpoint reference
2. See curl examples for each endpoint
3. Check response formats

### For Development
1. Read `server.js` - Main backend logic
2. Read `db.js` - Database operations
3. Read `emailService.js` - Email sending
4. Read `index.html` - Frontend form handling

## 🔄 Request Flow

### User Joins Waitlist

```
1. User fills form in index.html
2. Form.submit() calls fetch() to POST /api/waitlist
3. server.js POST /api/waitlist handler receives request
4. Handler validates email
5. db.js stores email in SQLite
6. emailService.js sends confirmation email via SendGrid
7. Server responds with success
8. Frontend shows success message
```

### Admin Views Waitlist

```
1. Admin calls GET /api/waitlist?token=secret
2. server.js validates token matches ADMIN_TOKEN
3. db.js retrieves all emails from SQLite
4. Server returns JSON list
5. Admin displays in their app
```

## 🛠️ File Modification Guide

### Change Landing Page Copy
Edit: `index.html` (lines 407-410, 450-470, 540-560)

### Change Email Template
Edit: `emailService.js` (function `getWaitlistEmailTemplate()`)

### Add New API Endpoint
Edit: `server.js` (add new app.post/get route)
Edit: `db.js` (add new database method if needed)

### Change Email Service
Edit: `.env` (set EMAIL_SERVICE)
Edit: `emailService.js` (update constructor)

### Deploy to New Platform
1. Read `DEPLOYMENT.md`
2. Follow platform-specific instructions
3. Copy environment variables

## 📈 File Size & Performance

| File | Size | Purpose |
|------|------|---------|
| `index.html` | ~20KB | Landing page (compressed ~6KB) |
| `server.js` | ~6KB | Backend logic |
| `db.js` | ~3KB | Database layer |
| `emailService.js` | ~4KB | Email service |
| `waitlist.db` | ~10KB | Database (grows with signups) |
| Total | ~47KB | Entire project |

Browser loads ~20KB total (compressed).

## 🔍 Key Code Sections

### Form Submission (index.html)

```javascript
// Lines 710-750 in index.html
form.addEventListener('submit', async (e) => {
  // Handles form submission and API call
});
```

### Create Account in Database (db.js)

```javascript
addEmail(email, name) {
  // Validates unique constraint
  // Inserts into waitlist table
  // Returns new record
}
```

### Send Confirmation Email (emailService.js)

```javascript
async sendWaitlistConfirmation(email, name) {
  // Creates HTML email template
  // Sends via SendGrid SMTP
  // Returns success/failure
}
```

### API Handler (server.js)

```javascript
app.post('/api/waitlist', async (req, res) => {
  // Validates input
  // Calls db.addEmail()
  // Calls emailService.send()
  // Returns JSON response
});
```

## 🚀 Deployment Checklist

- [ ] `.env` configured with SendGrid API key
- [ ] SendGrid account created and sender email verified
- [ ] All dependencies installed (`npm install`)
- [ ] Server runs locally (`npm run dev`)
- [ ] Landing page loads at `http://localhost:3001`
- [ ] Waitlist form works
- [ ] Confirmation email arrives
- [ ] Choose deployment platform
- [ ] Deploy to chosen platform
- [ ] Add custom domain
- [ ] Test production endpoint
- [ ] Monitor SendGrid dashboard

## 📞 Support Resources

| Resource | Link | For |
|----------|------|-----|
| SendGrid Docs | https://docs.sendgrid.com | Email configuration |
| Cloudflare Docs | https://developers.cloudflare.com/pages | Pages deployment |
| Node.js Docs | https://nodejs.org/docs | Backend development |
| Express Docs | https://expressjs.com | Web framework |
| SQLite Docs | https://www.sqlite.org/docs.html | Database |

---

**Everything you need is documented. Happy building! 🎉**
