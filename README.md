# ASE - Agent Stock Exchange

> **A regulated marketplace for AI agents and trading strategies**

A modern, production-ready landing page and waitlist management system for the Agent Stock Exchange platform. Collect user signups with automated confirmation emails, comprehensive admin features, and flexible deployment options.

## ✨ Features

- **🎨 Beautiful Landing Page** - Responsive design with smooth animations and modern UI
- **📧 Waitlist Management** - Secure email collection, validation, and duplicate prevention
- **⚡ High Performance** - Optimized frontend with minimal dependencies and lazy loading
- **🚀 Multiple Deployment Options** - Cloudflare Workers, Node.js/Express, Docker, or traditional hosting
- **🔐 Production Security** - Email validation, CORS protection, admin token authentication
- **📊 Admin Dashboard** - View statistics, manage entries, send batch emails
- **💾 Persistent Storage** - Cloudflare D1 (used by Pages/Workers)
- **🌍 Global Ready** - Cloudflare CDN support for worldwide distribution

## 🚀 Quick Start

### Prerequisites
- Node.js 16+ and npm
- For email: SendGrid API key (free tier available)

### Local Development

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your configuration
nano .env

# Start development server
npm run dev
```

Open `http://localhost:3001` in your browser.

## 📦 Production Deployment

### Option 1: Node.js Server (Recommended)

```bash
# Install dependencies
npm install --production

# Start production server
NODE_ENV=production npm start

# Or with PM2 for process management
npm install -g pm2
pm2 start server.js --name "ase" --env production
pm2 save
pm2 startup
```

### Option 2: Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3001
CMD ["npm", "start"]
```

Build and run:
```bash
docker build -t ase .
docker run -p 3001:3001 --env-file .env ase
```

### Option 3: Cloudflare Pages (Frontend) + Functions (API)

```bash
npm install -g wrangler
wrangler auth
npm run pages:deploy
```

### Option 4: Traditional Hosting

- **Heroku**: `git push heroku main`
- **DigitalOcean**: Deploy via App Platform with `npm start`
- **AWS EC2**: `npm start` with security groups/firewall configured
- **Railway/Render**: Connect GitHub for auto-deploy

## 🔌 API Reference

### Public Endpoints

**POST** `/api/waitlist` - Add email to waitlist

```bash
curl -X POST http://localhost:3001/api/waitlist \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com"}'
```

**Success Response (200)**:
```json
{
  "success": true,
  "message": "Successfully added to waitlist",
  "data": {
    "id": 1704067200000,
    "email": "user@example.com",
    "created_at": "2024-01-01T12:00:00Z"
  }
}
```

**GET** `/api/health` - Health check

```bash
curl http://localhost:3001/api/health
```

Returns server status, uptime, and environment info.

### Admin Endpoints (Requires ADMIN_TOKEN)

**GET** `/api/waitlist` - List all entries

```bash
curl http://localhost:3001/api/waitlist \
  -H "x-admin-token: your-secret-token"
```

Response includes count and all entries with timestamps.

### Error Responses

| Code | Scenario |
|------|----------|
| **400** | Invalid email format |
| **409** | Email already in waitlist |
| **401** | Missing/invalid admin token |
| **500** | Server error |


## ⚙️ Configuration

All configuration via environment variables in `.env` (or the Cloudflare dashboard):

```env
# Server
NODE_ENV=production
PORT=3001

# Email Service
SENDGRID_API_KEY=sg-...your-api-key...
EMAIL_FROM=noreply@ase.com

# Security
ADMIN_TOKEN=your-super-secret-token-here

# Optional
FRONTEND_URL=https://ase.com
```

### Required Variables for Production (Cloudflare)
- `SENDGRID_API_KEY` - Get from [SendGrid](https://sendgrid.com)
- `NODE_ENV=production`
- `ADMIN_TOKEN` - Generate a random secure token (min 32 chars)

Note: the local Node.js server is intentionally simple and stores waitlist
entries in memory; the data will be lost on restart. Persistence is handled
only by the Cloudflare Pages/Workers function via the D1 database.

#### Cloudflare Functions / D1

When deploying with Cloudflare Pages/Workers you also need to bind a D1
database and (optionally) KV namespace. Example `wrangler.toml` entries:

```toml
[[d1_databases]]
binding = "DB"
database_name = "ase_waitlist"

[[kv_namespaces]]
binding = "WAITLIST_KV"
id = "<your-kv-id>"
```

The function code uses `env.DB` for D1; ensure the database exists and has
the `waitlist_users` table and has had migrations applied:

```bash
# Apply D1 migrations (creates/updates waitlist_users table)
WRANGLER_LOG_PATH=.wrangler/logs wrangler d1 migrations apply waitlist
```

For confirmation emails, set these variables in your **Cloudflare Pages project**
environment (Dashboard: Pages -> Settings -> Environment variables):

- `SENDGRID_API_KEY` (secret)
- `EMAIL_FROM` (verified sender)
- `EMAIL_FROM_NAME` (optional)
- `ADMIN_TOKEN` (secret, for GET /api/waitlist)
- `FRONTEND_URL` (optional CORS allowlist; omit to disable CORS headers)

### Optional Variables
- `PORT` - Default: 3001
- `EMAIL_FROM` - Default: noreply@ase.com
- `FRONTEND_URL` - CORS whitelist origin
- `DATABASE_PATH` - SQLite database location

## 📁 Project Structure

```
.
├── index.html              # Landing page (optimized)
├── server.js              # Express server & API routes
├── package.json           # Dependencies
├── .env.example           # Environment template
├── .env                   # Local environment (git ignored)
├── README.md              # This file
├── vercel.json            # Vercel deployment config
├── wrangler.toml          # Cloudflare Workers config
├── wrangler.json          # Cloudflare Pages config
├── functions/
│   └── api/
│       └── waitlist.js    # Cloudflare Workers function
└── node_modules/          # Dependencies (git ignored)
```

## 🔒 Security Checklist

Before deploying to production:

- [ ] Set strong `ADMIN_TOKEN` (min 32 chars, random)
- [ ] Use HTTPS/TLS on all public endpoints
- [ ] Enable CORS properly: `FRONTEND_URL=https://yourdomain.com`
- [ ] Rotate `SENDGRID_API_KEY` regularly
- [ ] Use `.env` files, never commit secrets
- [ ] Enable rate limiting on `/api/waitlist`
- [ ] Monitor `/api/health` with uptime service
- [ ] (Cloudflare) ensure D1 backups as needed
- [ ] Use environment-specific configs
- [ ] Update dependencies: `npm audit fix`

## 📊 Admin Features

### View Waitlist
```bash
curl http://localhost:3001/api/waitlist \
  -H "x-admin-token: $ADMIN_TOKEN"
```

### Health Check
```bash
curl http://localhost:3001/api/health
```

Monitor uptime and server status. Use with services like StatusPage or Better Uptime.

## 🛠️ Technology Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | HTML5, CSS3, Vanilla JavaScript |
| **Backend** | Node.js 16+, Express.js 4.18+ |
| **Database** | Cloudflare D1 |
| **Email** | SendGrid API |
| **Hosting** | Node.js, Docker, Cloudflare, Vercel |

## 📈 Performance

- **Frontend**: <100KB total assets
- **Server**: <100ms response times (typical)
- **Database**: Indexed queries for fast lookups
- **Email**: Async queue (non-blocking)

## 🚦 Health & Monitoring

Monitor your production deployment:

```bash
# Check server status
curl https://api.yourdomain.com/api/health

# View waitlist count
curl https://api.yourdomain.com/api/waitlist \
  -H "x-admin-token: $ADMIN_TOKEN" | jq '.count'

# Test email signup
curl -X POST https://api.yourdomain.com/api/waitlist \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
```

## 📞 Support & Debugging

### Common Issues

**Email not sending?**
- Verify `SENDGRID_API_KEY` is set and valid
- Check SendGrid dashboard for bounces/failures
- Review server logs: `tail -f server.log`

**Port 3001 already in use?**
```bash
lsof -i :3001
kill -9 <PID>
```

**Database locked?**
- Only applicable for local SQLite; not relevant when using Cloudflare D1

### Logs & Debugging
```bash
# See all requests
NODE_ENV=development npm run dev

# Verbose logging
DEBUG=* npm start

<!-- local database commands removed; D1 usage only -->
```

## 📚 Documentation

- **API Docs**: See API Reference section above
- **Deployment**: Run `npm start` for Node.js or see deployment options
- **Configuration**: See Configuration section above

## 🔄 Version Info

- **Version**: 1.0.0
- **Node.js**: 16+
- **Last Updated**: March 2026

## 📄 License

Private - All rights reserved 2026

---

**Made with ❤️ by the ASE Team**

Have questions? Check the logs, verify your configuration, and ensure all required environment variables are set.
