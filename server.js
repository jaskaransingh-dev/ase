const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// In-memory storage for demo (replace with database in production)
const waitlist = [];

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
 * Add an email to the waitlist
 */
app.post('/api/waitlist', (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email is required' });
    }

    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    if (waitlist.find(e => e.email === email)) {
      return res.status(409).json({ error: 'Email already in waitlist' });
    }

    const entry = {
      id: Date.now(),
      email: email,
      created_at: new Date().toISOString()
    };
    waitlist.push(entry);

    console.log(`✉️  Waitlist signup: ${email}`);

    res.json({
      success: true,
      message: 'Successfully added to waitlist',
      data: entry
    });
  } catch (error) {
    console.error('❌ Error adding to waitlist:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/waitlist
 * Get all waitlist entries (admin endpoint)
 */
app.get('/api/waitlist', (req, res) => {
  try {
    const token = req.query.token || req.headers['x-admin-token'];
    if (process.env.ADMIN_TOKEN && token !== process.env.ADMIN_TOKEN) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    res.json({
      data: waitlist,
      count: waitlist.length,
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
    service: 'ASE - Agent Stock Exchange',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime()
  });
});

/**
 * GET /
 * Serve landing page
 */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

/**
 * SPA fallback
 */
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
  console.log(`🚀 ASE Server Running`);
  console.log(`${'='.repeat(60)}`);
  console.log(`🌐 Listening on: http://localhost:${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`\n📝 API Endpoints:`);
  console.log(`   POST   /api/waitlist - Add to waitlist`);
  console.log(`   GET    /api/waitlist - Get entries (admin)`);
  console.log(`   GET    /api/health  - Health check`);
  console.log(`${'='.repeat(60)}\n`);
});

process.on('SIGINT', () => {
  console.log('\n\n🛑 Shutting down gracefully...');
  server.close(() => {
    console.log('✓ Server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n\n🛑 SIGTERM received, shutting down...');
  server.close(() => {
    console.log('✓ Server closed');
    process.exit(0);
  });
});

