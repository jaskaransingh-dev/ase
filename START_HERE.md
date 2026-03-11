# ⚡ GET STARTED IN 5 MINUTES

Copy-paste your way to a live waitlist.

---

## Step 1: SendGrid Setup (2 minutes)

1. Go to https://sendgrid.com
2. Click "Sign Up Free"
3. Complete registration
4. Verify your email
5. Go to **Settings → API Keys**
6. Click **Create API Key**
7. Copy the key (format: `SG.xxxxxxxxxxxxx`)
8. Save it somewhere safe

---

## Step 2: Configure Your App (1 minute)

```bash
# 1. Copy the template
cp .env.example .env

# 2. Open .env in your editor
# 3. Replace this line:
#    SENDGRID_API_KEY=SG.xxxxxxxxxxxxx
# 4. Paste your SendGrid API key
# 5. Save the file
```

---

## Step 3: Install & Run (2 minutes)

```bash
# Install dependencies (one time)
npm install

# Start the server
npm run dev
```

You should see:
```
🚀 ASE Waitlist Server Running
🌐 Listening on: http://localhost:3001
```

Open your browser and go to: **http://localhost:3001**

---

## Step 4: Test It! (0 minutes)

1. Fill in the form with a test email
2. Click "Join Waitlist"
3. Check your email inbox
4. See the beautiful confirmation email!

**Congratulations! Your waitlist works! 🎉**

---

## Step 5: Deploy to Production (3-5 minutes)

Pick ONE:

### Option A: Cloudflare Pages (Easiest & Free)

```bash
# Install Wrangler
npm install -g @cloudflare/wrangler

# Login to Cloudflare
wrangler auth

# Create KV namespace
wrangler kv:namespace create "WAITLIST_KV"

# Copy the ID from the output and update wrangler.toml

# Deploy!
wrangler pages publish --project-name=ase-agent-exchange
```

Your site is live at: `https://ase-agent-exchange.pages.dev`

### Option B: Heroku (Easy & Free Tier)

```bash
# Install Heroku CLI
brew install heroku

# Login
heroku login

# Create app
heroku create ase-agent-exchange

# Set your API key
heroku config:set SENDGRID_API_KEY=SG.xxxxxxxxxxxxx

# Deploy
git push heroku main
```

Your site is live at: `https://ase-agent-exchange.herokuapp.com`

---

## Step 6: Connect Your Domain (2 minutes)

**For Cloudflare Pages:**
1. Go to Cloudflare Dashboard
2. Pages → Your Project → Settings → Domains
3. Add your domain
4. Update DNS as shown

**For Heroku:**
1. App Settings → Domains
2. Add your custom domain
3. Update DNS at your registrar

---

## 🎉 You're Live!

Share your URL! Your landing page is now collecting signups.

---

## What's Working?

✅ Beautiful landing page  
✅ Responsive design (mobile-friendly)  
✅ Working waitlist form  
✅ Automatic confirmation emails  
✅ Database storing signups  
✅ Admin API endpoints  
✅ Global CDN (if using Cloudflare)  

---

## View Your Signups (Admin)

```bash
# Check your database
curl http://localhost:3001/api/waitlist

# Or in production:
curl https://your-domain.com/api/waitlist?token=YOUR_ADMIN_TOKEN
```

Replace `YOUR_ADMIN_TOKEN` with your `ADMIN_TOKEN` from `.env`.

---

## Customize It

### Change the landing page copy
Edit `index.html` and look for:
- Line 407: Hero headline
- Line 408: Hero description
- Line 450-470: Value propositions
- Line 540-560: Features

### Change the colors
Edit `index.html` CSS section (lines 19-400)
Main color: `#0f172a`

### Change the email
Edit `emailService.js` function `getWaitlistEmailTemplate()`

---

## Common Issues

### Emails not sending?
1. Check your `.env` file for the API key
2. Verify it starts with `SG.`
3. Go to SendGrid dashboard → Email Activity
4. Check spam folder
5. Verify sender email in SendGrid settings

### Form not working?
1. Check browser console (F12) for errors
2. Make sure server is running (`npm run dev`)
3. Check that API endpoint is accessible

### Can't deploy?
1. Make sure `.env` is NOT committed to Git
2. Add environment variables in the deployment platform
3. Check deployment logs for errors

---

## Next Steps

✅ Landing page is live  
✅ Collecting signups  
✅ Sending confirmation emails  

Now:
1. Share your landing page URL
2. Monitor signups (check database)
3. Watch email delivery (SendGrid dashboard)
4. Plan your MVP launch
5. Start building the full platform

---

## Need More Details?

- **Setup help?** → Read `SETUP.md`
- **Deployment help?** → Read `DEPLOYMENT.md`
- **API questions?** → Read `API.md`
- **File reference?** → Read `PROJECT_STRUCTURE.md`
- **Full checklist?** → Read `LAUNCH_CHECKLIST.md`

---

## Support

Email: hello@ase.com

---

**That's it! You're done! 🚀**
