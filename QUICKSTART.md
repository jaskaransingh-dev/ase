# Quick Start Guide

Get the ASE waitlist live in 5 minutes!

## Option 1: Local Development (2 minutes)

### 1. Install
```bash
npm install
```

### 2. Configure
```bash
cp .env.example .env
```

Edit `.env` and add your SendGrid API key:
```env
SENDGRID_API_KEY=SG.xxxxxxxxxxxxx
```

### 3. Run
```bash
npm run dev
```

### 4. Visit
Open `http://localhost:3001` in your browser

✅ **Done!** Your landing page is live.

---

## Option 2: Deploy to Cloudflare Pages (3 minutes)

### 1. Install Wrangler
```bash
npm install -g @cloudflare/wrangler
```

### 2. Authenticate
```bash
wrangler auth
```

### 3. Create KV Namespace
```bash
wrangler kv:namespace create "WAITLIST_KV"
```

Copy the ID and update `wrangler.toml`:
```toml
[[kv_namespaces]]
binding = "WAITLIST_KV"
id = "your-id-here"
```

### 4. Deploy
```bash
wrangler pages publish --project-name=ase-agent-exchange
```

✅ **Done!** Your site is live at `your-project.pages.dev`

---

## Option 3: Deploy to Heroku (4 minutes)

### 1. Install Heroku CLI
```bash
brew install heroku/brew/heroku
heroku login
```

### 2. Create App
```bash
heroku create ase-agent-exchange
```

### 3. Set Environment Variables
```bash
heroku config:set SENDGRID_API_KEY=SG.xxxxxxxxxxxxx
heroku config:set EMAIL_FROM=noreply@ase.com
```

### 4. Deploy
```bash
git push heroku main
```

✅ **Done!** Your site is live at `ase-agent-exchange.herokuapp.com`

---

## Test the API

### Add Someone to Waitlist
```bash
curl -X POST http://localhost:3001/api/waitlist \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","name":"Test User"}'
```

Expected response:
```json
{
  "success": true,
  "message": "Successfully added to waitlist",
  "data": {...}
}
```

### View Waitlist (Admin)
```bash
# Set ADMIN_TOKEN=secret in .env first
curl http://localhost:3001/api/waitlist?token=secret
```

### Check Health
```bash
curl http://localhost:3001/api/health
```

---

## Customize the Landing Page

Edit `index.html` to change:
- **Hero headline**: Line ~407
- **Hero description**: Line ~408
- **Value propositions**: Lines ~450-470
- **Features**: Lines ~540-560
- **Colors**: Lines ~19-400 (CSS section)

---

## Send Emails

### Automatically (on signup)
- Emails are sent automatically when someone joins the waitlist
- Check SendGrid dashboard for delivery status

### Manually (batch)
```bash
curl -X POST http://localhost:3001/api/send-batch-emails \
  -H "X-Admin-Token: secret"
```

---

## Next Steps

1. ✅ Landing page is live
2. ⬜ Connect custom domain
3. ⬜ Set up email confirmation in SendGrid
4. ⬜ Monitor signups in the database
5. ⬜ Launch marketing campaign

---

## Troubleshooting

**Emails not sending?**
- Verify SENDGRID_API_KEY in `.env`
- Check SendGrid dashboard for errors
- Verify EMAIL_FROM is a verified sender in SendGrid

**Form not submitting?**
- Check browser console for errors
- Verify API endpoint is accessible
- Check server logs

**Pages deployment failing?**
- Ensure `wrangler.toml` is configured correctly
- Check KV namespace binding
- Run `wrangler pages dev --local` to test locally

---

## Need Help?

- Email: hello@ase.com
- Docs: Read [DEPLOYMENT.md](./DEPLOYMENT.md) and [API.md](./API.md)
- Issues: Check GitHub issues

---

**Happy launching! 🚀**
