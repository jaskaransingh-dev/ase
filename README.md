# ASE - Agent Stock Exchange

> **A regulated marketplace for AI agents and trading strategies**

This MVP is a waitlist landing page for the Agent Stock Exchange (ASE) platform. It features a modern, responsive landing page that collects user signups and sends automated confirmation emails.

## 🎯 Features

- **Beautiful Landing Page** - Mobile-responsive design with smooth animations
- **Waitlist Management** - Secure email collection and storage
- **Automated Emails** - SendGrid integration for confirmation emails
- **Multiple Deployment Options** - Cloudflare Pages, Node.js, or traditional VPS
- **Admin Dashboard Ready** - Endpoints to view and manage waitlist entries
- **Production-Ready** - Built with security and scalability in mind

## 🚀 Quick Start

### Prerequisites
- Node.js 14+
- npm or yarn

### Local Development

1. **Clone and install:**
```bash
npm install
```

2. **Configure environment:**
```bash
cp .env.example .env
# Edit .env with your SendGrid API key
```

3. **Start the server:**
```bash
npm run dev
```

Visit `http://localhost:3001` in your browser

## 📦 Deployment

### Cloudflare Pages (Recommended)

The easiest way to deploy with a free global CDN:

```bash
npm install -g wrangler
wrangler auth
npm run pages:deploy
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed instructions.

### Traditional Node.js Hosting

Deploy to Heroku, DigitalOcean, AWS, or any Node.js hosting:

```bash
npm start
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed setup.

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/waitlist` | Add email to waitlist |
| GET | `/api/waitlist` | Get all entries (admin) |
| GET | `/api/stats` | Get statistics (admin) |
| GET | `/api/health` | Health check |
| POST | `/api/send-batch-emails` | Send pending emails (admin) |

### Example: Add to Waitlist

```bash
curl -X POST http://localhost:3001/api/waitlist \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","name":"Jane Smith"}'
```

Response:
```json
{
  "success": true,
  "message": "Successfully added to waitlist",
  "data": {
    "id": 1,
    "email": "user@example.com",
    "name": "Jane Smith",
    "created_at": "2026-03-11T10:30:45Z",
    "status": "pending"
  }
}
```

## 🔧 Configuration

All configuration is done via environment variables in `.env`:

```env
# Email (SendGrid)
SENDGRID_API_KEY=your-api-key-here
EMAIL_FROM=noreply@ase.com

# Server
PORT=3001
NODE_ENV=production

# Admin authentication (optional)
ADMIN_TOKEN=your-secret-token
```

## 📊 Admin Features

### View Waitlist
```bash
curl http://localhost:3001/api/waitlist?token=your-secret-token
```

### View Statistics
```bash
curl http://localhost:3001/api/stats?token=your-secret-token
```

### Send Batch Emails
```bash
curl -X POST http://localhost:3001/api/send-batch-emails \
  -H "x-admin-token: your-secret-token"
```

## 🛠️ Technology Stack

- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Backend**: Node.js, Express.js
- **Database**: SQLite (local) or Cloudflare KV (Pages)
- **Email**: SendGrid API
- **Hosting**: Cloudflare Pages / Node.js / VPS

## 📁 Project Structure

```
.
├── index.html              # Landing page
├── server.js              # Express server
├── db.js                  # Database layer
├── emailService.js        # Email handling
├── package.json           # Dependencies
├── .env.example           # Environment template
├── DEPLOYMENT.md          # Deployment guide
├── README.md              # This file
├── functions/
│   └── api/waitlist.js    # Cloudflare Pages function
├── wrangler.toml          # Cloudflare config
└── vercel.json            # Vercel config (optional)
```

## 🔒 Security Notes

- Email validation on both client and server
- Unique email constraint prevents duplicates
- Optional admin token authentication
- CORS configured for security
- SQLite database with prepared statements (SQL injection safe)
- HTTPS recommended for production

## 📈 Next Steps

This MVP focuses on waitlist collection. To build the full ASE platform:

1. **User Authentication** - Login/signup system
2. **Dashboard** - Agent management and analytics
3. **Agent Marketplace** - Deploy and trade AI agents
4. **Smart Contracts** - On-chain performance tracking
5. **Payment System** - Profit distribution
6. **Compliance Tools** - KYC/AML integration

## 📚 Documentation

- [DEPLOYMENT.md](./DEPLOYMENT.md) - Complete deployment guide
- [API Documentation](./API.md) - Detailed endpoint reference
- See `.env.example` for all configuration options

## 📧 Support

For issues or questions:
- Email: hello@ase.com
- Create an issue on GitHub

## 📄 License

Private - All rights reserved 2026

---

**Made with ❤️ by the ASE Team**
### JavaScript/Fetch
```javascript
async function joinWaitlist(email, name) {
  const response = await fetch('http://localhost:3001/api/waitlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, name })
  });
  return response.json();
}

joinWaitlist('user@example.com', 'Jane Smith');
```

## File Structure

```
├── server.js          # Main Express server & routes
├── db.js              # SQLite database module
├── emailService.js    # Email sending service
├── package.json       # Dependencies
├── .env.example       # Example environment variables
├── waitlist.db        # SQLite database (auto-created)
└── README.md          # This file
```

## Error Handling

- **400**: Invalid email format
- **409**: Email already in waitlist
- **500**: Server error

## Development Tips

1. **Testing endpoints locally**: Use tools like Postman, Insomnia, or cURL
2. **View database**: Use a SQLite viewer tool or VS Code SQLite extension
3. **Debug emails**: Check server logs for email sending status

## Deployment

For production deployment:

1. Add authentication to admin endpoints (`/api/waitlist`, `/api/send-batch-emails`)
2. Use a production-grade email service (SendGrid, Mailgun, AWS SES)
3. Configure CORS properly for your frontend domain
4. Use environment-specific `.env` files
5. Set up database backups
6. Enable HTTPS/TLS

## Support

For issues or questions, check the logs and ensure:
- Email credentials are correct
- SQLite file has proper write permissions
- Port 3001 is not in use
- Node.js version is 14+
# ase
