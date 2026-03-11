# ASE - Agent Stock Exchange MVP Deployment Guide

## Overview

This MVP features a complete waitlist landing page integrated with Cloudflare Pages for email functionality and global distribution. The application can run locally with Node.js or be deployed to Cloudflare Pages for serverless hosting.

## Quick Start

### Local Development

1. **Install dependencies:**
```bash
npm install
```

2. **Configure environment variables:**
```bash
cp .env.example .env
```

Edit `.env` with your configuration:
- `SENDGRID_API_KEY`: Your SendGrid API key for email delivery
- `EMAIL_FROM`: The email address that will send confirmations
- `PORT`: Server port (default: 3001)

3. **Run the development server:**
```bash
npm run dev
```

The server will start on `http://localhost:3001`

## Deployment Options

### Option 1: Deploy to Cloudflare Pages (Recommended)

Cloudflare Pages provides:
- **Free global CDN** - Your landing page served from edge locations worldwide
- **Serverless Functions** - Handle API requests without server management
- **KV Storage** - Persistent waitlist storage
- **Email Integration** - SendGrid integration for confirmation emails
- **SSL/TLS** - Automatic HTTPS
- **Analytics** - Built-in analytics

#### Prerequisites
- Cloudflare account (free tier supported)
- Wrangler CLI installed (`npm install -g wrangler`)

#### Deployment Steps

1. **Install Wrangler globally:**
```bash
npm install -g @cloudflare/wrangler
```

2. **Authenticate with Cloudflare:**
```bash
wrangler auth
```

3. **Create a KV namespace for waitlist storage:**
```bash
wrangler kv:namespace create "WAITLIST_KV"
```

Note the namespace ID and update `wrangler.toml`:
```toml
[[kv_namespaces]]
binding = "WAITLIST_KV"
id = "your-kv-namespace-id"
```

4. **Set up environment variables in Cloudflare:**

   Go to Cloudflare Dashboard → Pages → Your Project → Settings → Environment Variables

   Add:
   - `SENDGRID_API_KEY`: Your SendGrid API key
   - `FROM_EMAIL`: Your sender email
   - `ENVIRONMENT`: "production"

5. **Deploy to Pages:**

   **Option A: Git integration (recommended)**
   - Push your code to GitHub
   - Go to Pages in Cloudflare Dashboard
   - Select "Connect to Git"
   - Authorize GitHub and select your repository
   - Set build command: `npm run build`
   - Set build directory: `.` (current directory)
   - Deploy

   **Option B: Direct deployment with Wrangler**
   ```bash
   wrangler pages publish --project-name=ase-agent-exchange
   ```

6. **Connect your domain:**
   - In Cloudflare Pages settings, add your custom domain
   - Update DNS records as shown in Cloudflare dashboard

#### Testing Cloudflare Deployment Locally

```bash
npm run pages:dev
```

This starts a local Cloudflare Pages environment for testing.

### Option 2: Traditional VPS Deployment (Node.js)

For platforms like DigitalOcean, AWS EC2, Heroku, etc.

1. **Install Node.js 14+** on your server

2. **Clone or upload the project:**
```bash
git clone <your-repo>
cd agent-exchange
npm install
```

3. **Set environment variables:**
```bash
export SENDGRID_API_KEY="your-key"
export EMAIL_FROM="noreply@ase.com"
export PORT=3001
export NODE_ENV=production
```

4. **Run with process manager (PM2):**
```bash
npm install -g pm2
pm2 start server.js --name "ase-waitlist"
pm2 save
pm2 startup
```

5. **Set up reverse proxy (Nginx):**
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

6. **Set up SSL with Let's Encrypt:**
```bash
sudo certbot --nginx -d your-domain.com
```

## Architecture

### Frontend
- **Static HTML/CSS/JavaScript** - Pure vanilla JS for lightweight landing page
- **Responsive Design** - Mobile-first, works on all devices
- **Form Validation** - Client-side validation with server-side fallback

### Backend

#### Option 1: Cloudflare Pages Functions
```
/functions/api/waitlist.js - Handles POST /api/waitlist requests
- Validates email
- Stores in KV storage
- Sends confirmation via SendGrid
```

#### Option 2: Express.js Server
```
GET  /              - Serves landing page
POST /api/waitlist  - Add to waitlist + send confirmation
GET  /api/waitlist  - Get all entries (admin)
GET  /api/health    - Health check
POST /api/send-batch-emails - Bulk send pending emails
```

### Database
- **Cloudflare KV** (Pages) - Distributed key-value store
- **SQLite** (Node.js) - Local relational database

### Email Service
- **SendGrid** - Reliable email delivery with tracking
- Automatic confirmation emails
- Batch email capability

## API Endpoints

### Add to Waitlist
```
POST /api/waitlist
Content-Type: application/json

{
  "email": "user@example.com",
  "name": "John Doe"
}

Response (200):
{
  "success": true,
  "message": "Successfully added to waitlist",
  "data": {
    "email": "user@example.com",
    "name": "John Doe",
    "created_at": "2026-03-11T10:30:45Z",
    "status": "pending",
    "email_sent": true
  }
}
```

### Get Waitlist (Admin)
```
GET /api/waitlist

Response (200):
{
  "data": [
    {
      "email": "user@example.com",
      "name": "John Doe",
      "created_at": "2026-03-11T10:30:45Z",
      "status": "pending",
      "email_sent": true,
      "email_sent_at": "2026-03-11T10:30:46Z"
    }
  ],
  "count": 1
}
```

### Health Check
```
GET /api/health

Response (200):
{
  "status": "ok",
  "service": "ASE - Agent Stock Exchange Waitlist"
}
```

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `SENDGRID_API_KEY` | Yes | SendGrid API key for email delivery |
| `EMAIL_FROM` | Yes | Sender email address |
| `PORT` | No | Server port (default: 3001) |
| `NODE_ENV` | No | Set to "production" for production |
| `CLOUDFLARE_API_TOKEN` | Optional | For additional Cloudflare features |

## Monitoring & Analytics

### Cloudflare Pages Analytics
- Navigate to Pages Dashboard → Analytics
- View traffic, status codes, and performance metrics
- Monitor function invocations and errors

### Local Logs
- Check `/var/log/pm2/` for PM2 logs
- Use `pm2 logs` to view real-time logs
- Monitor email delivery in SendGrid dashboard

## Scaling Considerations

### For increasing traffic:
1. **Cloudflare Pages** - Already serves from global edge
2. **Database** - KV storage automatically scales
3. **Email** - SendGrid handles high volume

### Performance optimization:
1. Enable Cloudflare caching
2. Minify static assets
3. Use Cloudflare Workers for additional processing
4. Implement rate limiting on `/api/waitlist`

## Troubleshooting

### Emails not sending
1. Verify `SENDGRID_API_KEY` is correct
2. Check SendGrid API dashboard for bounce/block list
3. Verify `EMAIL_FROM` is a valid sender identity in SendGrid
4. Check spam folder

### Form submission fails
1. Check browser console for errors
2. Verify API endpoint is accessible
3. Check CORS headers in response
4. Review server logs

### KV storage issues
1. Verify namespace binding in `wrangler.toml`
2. Check Cloudflare dashboard for KV quota
3. Use Cloudflare Pages Analytics to debug

## Next Steps for Full Platform

This MVP focuses on waitlist collection. To build the full platform:

1. **User Authentication** - Implement login system
2. **Agent Management** - Deployment and management UI
3. **Dashboard** - Performance tracking and analytics
4. **Smart Contracts** - On-chain integration for transparency
5. **Payment Processing** - Capital allocation and profit distribution
6. **Compliance Engine** - KYC/AML integration

## Support

For issues or questions:
- Email: hello@ase.com
- GitHub Issues: [your-repo]/issues

## License

Private - All rights reserved 2026
