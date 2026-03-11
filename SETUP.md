# Setup & Configuration Guide

Complete guide to configure and deploy ASE.

## Prerequisites

- Node.js 14+ ([Download](https://nodejs.org/))
- npm 6+ (comes with Node.js)
- SendGrid account (free tier available)
- Text editor (VS Code recommended)

## Step 1: SendGrid Setup

SendGrid handles all email delivery. It's free for up to 100 emails/day.

### 1.1 Create SendGrid Account

1. Go to [sendgrid.com](https://sendgrid.com)
2. Click "Sign Up Free"
3. Fill in your information
4. Verify your email
5. Complete account setup

### 1.2 Get API Key

1. Login to SendGrid dashboard
2. Go to **Settings** → **API Keys**
3. Click **Create API Key**
4. Choose **Full Access**
5. Name it "ASE Waitlist"
6. Copy the key (you won't see it again!)
7. Keep it safe - never commit to Git

### 1.3 Verify Sender Email

1. Go to **Sender Authentication** → **Single Sender Verification**
2. Click **Create New Sender**
3. Enter your email details:
   - **From Email Address**: noreply@ase.com (or your domain)
   - **From Name**: Agent Stock Exchange
   - **Reply To Email**: hello@ase.com
4. Verify by clicking the link in the email you receive
5. Done! You can now send emails

## Step 2: Local Setup

### 2.1 Install Dependencies

```bash
npm install
```

This installs:
- `express` - Web framework
- `sqlite3` - Database
- `nodemailer` - Email library
- `cors` - Cross-origin requests
- `body-parser` - JSON parsing
- `dotenv` - Environment variables
- `nodemon` - Auto-restart development

### 2.2 Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your SendGrid API key:

```env
EMAIL_SERVICE=sendgrid
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
EMAIL_FROM=noreply@ase.com
PORT=3001
NODE_ENV=development
```

### 2.3 Test Locally

```bash
npm run dev
```

Visit `http://localhost:3001` in your browser. You should see the landing page.

### 2.4 Test the Waitlist

Open browser console and run:

```javascript
fetch('/api/waitlist', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'test@example.com',
    name: 'Test User'
  })
}).then(r => r.json()).then(console.log)
```

You should see a success response. Check your test email's inbox for the confirmation.

## Step 3: Deployment

Choose one of these options:

### Option A: Cloudflare Pages (Recommended)

**Pros:**
- Free forever
- Global CDN
- No ops needed
- Automatic HTTPS
- Serverless scaling

**Setup:**

1. **Install Wrangler:**
   ```bash
   npm install -g @cloudflare/wrangler
   ```

2. **Authenticate:**
   ```bash
   wrangler auth
   ```

3. **Create KV namespace:**
   ```bash
   wrangler kv:namespace create WAITLIST_KV
   ```

4. **Update `wrangler.toml`:**
   ```toml
   [[kv_namespaces]]
   binding = "WAITLIST_KV"
   id = "your-namespace-id"
   ```

5. **Deploy:**
   ```bash
   wrangler pages publish --project-name=ase-agent-exchange
   ```

6. **Add environment variables in Cloudflare dashboard:**
   - Go to Pages → Your Project → Settings → Environment Variables
   - Add `SENDGRID_API_KEY`
   - Add `EMAIL_FROM`

### Option B: Heroku

**Pros:**
- Easy GitHub integration
- Free for up to 1000 hours/month
- Good for beginners

**Setup:**

1. **Create Heroku account** at [heroku.com](https://heroku.com)

2. **Install Heroku CLI:**
   ```bash
   brew install heroku
   heroku login
   ```

3. **Create app:**
   ```bash
   heroku create ase-agent-exchange
   ```

4. **Set environment variables:**
   ```bash
   heroku config:set SENDGRID_API_KEY=SG.xxxxx
   heroku config:set EMAIL_FROM=noreply@ase.com
   heroku config:set NODE_ENV=production
   ```

5. **Deploy:**
   ```bash
   git push heroku main
   ```

6. **View logs:**
   ```bash
   heroku logs --tail
   ```

### Option C: DigitalOcean App Platform

**Pros:**
- $12/month for always-on deployment
- Easy to scale
- Good performance

**Setup:**

1. Create DigitalOcean account
2. Create new App
3. Connect GitHub repo
4. Set build command: `npm install`
5. Set run command: `npm start`
6. Add environment variables
7. Deploy

### Option D: AWS EC2

**Pros:**
- Highly customizable
- Scalable
- Enterprise-ready

**Setup:**

1. Launch EC2 instance (Ubuntu 20.04)
2. SSH into instance
3. Install Node.js:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```
4. Clone your repo:
   ```bash
   git clone <your-repo>
   cd agent-exchange
   npm install
   ```
5. Create `.env` file
6. Install PM2:
   ```bash
   sudo npm install -g pm2
   pm2 start server.js --name "ase"
   pm2 save
   pm2 startup
   ```
7. Set up Nginx:
   ```bash
   sudo apt-get install nginx
   # Configure upstream to http://localhost:3001
   sudo systemctl start nginx
   ```
8. Set up SSL with Let's Encrypt:
   ```bash
   sudo apt-get install certbot python3-certbot-nginx
   sudo certbot --nginx -d your-domain.com
   ```

## Step 4: Custom Domain

### For Cloudflare Pages:

1. Go to Cloudflare Pages Dashboard
2. Select your project
3. Go to **Settings** → **Domains**
4. Add your custom domain
5. Follow DNS instructions

### For Heroku:

1. Go to app settings
2. Add domain under **Domains**
3. Update your domain registrar's DNS

### For DigitalOcean:

1. Go to App settings
2. Add domain
3. Update DNS at your registrar

## Step 5: Monitor & Maintain

### Check Health

```bash
curl https://your-domain.com/api/health
```

Should return:
```json
{
  "status": "ok",
  "service": "ASE - Agent Stock Exchange Waitlist",
  ...
}
```

### View Waitlist (Admin)

```bash
curl https://your-domain.com/api/waitlist?token=your-secret-token
```

### Send Batch Emails

```bash
curl -X POST https://your-domain.com/api/send-batch-emails \
  -H "X-Admin-Token: your-secret-token"
```

### View SendGrid Stats

1. Login to SendGrid
2. Go to **Analytics** → **Overview**
3. See delivery stats, bounces, etc.

## Troubleshooting

### Problem: "SENDGRID_API_KEY is not set"

**Solution:** Make sure your `.env` file has:
```env
SENDGRID_API_KEY=SG.xxxxxxxxxxxxx
```

And you've restarted the server.

### Problem: Emails not sending

**Check:**
1. Is SendGrid API key correct?
2. Is sender email verified in SendGrid?
3. Check SendGrid dashboard for bounces
4. Check spam folder
5. Check server logs for errors

### Problem: Form submission fails

**Check:**
1. Is server running? `curl http://localhost:3001/api/health`
2. Check browser console for errors
3. Check network tab to see API response
4. Check server logs

### Problem: Database locked

**Solution:**
1. Stop the server: `Ctrl+C`
2. Delete `waitlist.db`
3. Restart server: `npm run dev`

## Security Checklist

Before going to production:

- [ ] Set `NODE_ENV=production`
- [ ] Use strong `ADMIN_TOKEN`
- [ ] Enable HTTPS (automatic on Cloudflare/Heroku)
- [ ] Set up domain SSL certificate
- [ ] Keep dependencies updated
- [ ] Never commit `.env` to Git
- [ ] Add `.env` to `.gitignore`
- [ ] Review CORS settings
- [ ] Monitor SendGrid dashboard
- [ ] Set up alerts for errors
- [ ] Back up database regularly

## Scaling Tips

As you grow:

1. **Use CDN** - Enable Cloudflare cache
2. **Monitor** - Set up error tracking (Sentry)
3. **Database** - Move to managed database (Cloud SQL, Aurora)
4. **Email** - Monitor SendGrid usage
5. **Load** - Use load balancer if needed

## Next Steps

1. ✅ Set up SendGrid
2. ✅ Deploy to your chosen platform
3. ✅ Connect custom domain
4. ⬜ Share landing page link
5. ⬜ Monitor signups
6. ⬜ Plan MVP launch
7. ⬜ Build full platform

## Need Help?

- **SendGrid Docs:** https://docs.sendgrid.com
- **Cloudflare Docs:** https://developers.cloudflare.com/pages
- **Node.js Docs:** https://nodejs.org/docs
- **Email:** hello@ase.com

---

**You're all set! Launch your waitlist! 🚀**
