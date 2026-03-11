const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();

const db = require('./db');
const emailService = require('./emailService');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: ['http://localhost:3001', 'http://localhost:3000', process.env.FRONTEND_URL || '*'],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '.')));

// ──────────────────────────────────────────────────────────────
// ROUTES
// ──────────────────────────────────────────────────────────────

/**
 * POST /api/waitlist
 * Add an email to the waitlist and send confirmation email
 * 
 * Request body:
 * {
 *   "email": "user@example.com",
 *   "name": "John Doe"
 * }
 */
app.post('/api/waitlist', async (req, res) => {
  try {
    const { email, name } = req.body;

    // Validation
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email is required' });
    }

    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Add to database
    const result = await db.addEmail(email, name || '');

    // Send confirmation email
    try {
      await emailService.sendWaitlistConfirmation(email, name || 'there');
      await db.markEmailSent(result.id);
      console.log(`✉️  Waitlist confirmation sent to ${email}`);
    } catch (emailError) {
      console.warn(`⚠️  Could not send email to ${email}:`, emailError.message);
      // Don't fail the API call if email fails - record is still in DB
    }

    res.json({
      success: true,
      message: 'Successfully added to waitlist',
      data: {
        id: result.id,
        email: result.email,
        name: result.name,
        created_at: result.created_at,
        status: result.status,
      },
    });
  } catch (error) {
    if (error.message.includes('already in waitlist') || error.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Email already in waitlist' });
    }
    console.error('❌ Error adding to waitlist:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/waitlist
 * Get all waitlist entries (admin endpoint)
 * Note: In production, add authentication middleware here
 */
app.get('/api/waitlist', async (req, res) => {
  try {
    // Optional: Add simple token authentication
    const token = req.query.token || req.headers['x-admin-token'];
    if (process.env.ADMIN_TOKEN && token !== process.env.ADMIN_TOKEN) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const emails = await db.getAllEmails();
    res.json({
      data: emails,
      count: emails.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error fetching waitlist:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/health
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'ASE - Agent Stock Exchange Waitlist',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime()
  });
});

/**
 * POST /api/send-batch-emails
 * Send emails to all pending waitlist entries
 * Note: In production, add authentication middleware here
 */
app.post('/api/send-batch-emails', async (req, res) => {
  try {
    // Optional: Add simple token authentication
    const token = req.query.token || req.headers['x-admin-token'];
    if (process.env.ADMIN_TOKEN && token !== process.env.ADMIN_TOKEN) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const pendingEmails = await db.getEmails('pending', false);

    if (pendingEmails.length === 0) {
      return res.json({
        message: 'No pending emails to send',
        sent: 0,
        failed: 0
      });
    }

    let sent = 0;
    let failed = 0;

    for (const entry of pendingEmails) {
      try {
        await emailService.sendWaitlistConfirmation(entry.email, entry.name || 'there');
        await db.markEmailSent(entry.id);
        sent++;
        console.log(`✓ Email sent to ${entry.email}`);
      } catch (emailError) {
        console.error(`✗ Failed to send to ${entry.email}:`, emailError.message);
        failed++;
      }
    }

    res.json({
      success: true,
      message: `Sent ${sent} emails, ${failed} failed`,
      sent,
      failed,
      total: pendingEmails.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error in batch email send:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/stats
 * Get waitlist statistics
 */
app.get('/api/stats', async (req, res) => {
  try {
    const token = req.query.token || req.headers['x-admin-token'];
    if (process.env.ADMIN_TOKEN && token !== process.env.ADMIN_TOKEN) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const allEmails = await db.getAllEmails();
    const sent = allEmails.filter(e => e.email_sent).length;
    const pending = allEmails.filter(e => !e.email_sent).length;

    res.json({
      total: allEmails.length,
      email_sent: sent,
      email_pending: pending,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error fetching stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ──────────────────────────────────────────────────────────────
// STATIC FILES
// ──────────────────────────────────────────────────────────────

// Serve landing page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// SPA fallback: serve index.html for any non-API GET request
app.get('*', (req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    return res.sendFile(path.join(__dirname, 'index.html'));
  }
  next();
});

// ──────────────────────────────────────────────────────────────
// START SERVER
// ──────────────────────────────────────────────────────────────

const server = app.listen(PORT, () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 ASE Waitlist Server Running`);
  console.log(`${'='.repeat(60)}`);
  console.log(`🌐 Listening on: http://localhost:${PORT}`);
  console.log(`📧 Email Service: ${process.env.EMAIL_SERVICE || 'sendgrid'}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`\n📝 API Endpoints:`);
  console.log(`   POST   /api/waitlist           - Add to waitlist`);
  console.log(`   GET    /api/waitlist           - Get all entries (admin)`);
  console.log(`   GET    /api/stats              - Get statistics (admin)`);
  console.log(`   GET    /api/health            - Health check`);
  console.log(`   POST   /api/send-batch-emails - Send pending emails (admin)`);
  console.log(`${'='.repeat(60)}\n`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Shutting down gracefully...');
  server.close(() => {
    console.log('✓ Server closed');
  });
  await db.close();
  console.log('✓ Database closed');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n\n🛑 SIGTERM received, shutting down...');
  server.close(() => {
    console.log('✓ Server closed');
  });
  await db.close();
  process.exit(0);
});

