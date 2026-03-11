const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';

// In-memory storage for demo (replace with database in production)
const waitlist = [];

// ──────────────────────────────────────────────────────────────
// SECURITY HEADERS
// ──────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  // HSTS for HTTPS
  if (NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  
  next();
});

// ──────────────────────────────────────────────────────────────
// MIDDLEWARE
// ──────────────────────────────────────────────────────────────
const allowedOrigins = [
  'http://localhost:3001',
  'http://localhost:3000',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: NODE_ENV === 'production' ? allowedOrigins : '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-admin-token'],
  credentials: true
}));

app.use(bodyParser.json({ limit: '1kb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '1kb' }));
app.use(express.static(path.join(__dirname, '.'), {
  maxAge: '1h',
  etag: false
}));

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

    // Input validation
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ 
        error: 'Valid email is required',
        code: 'MISSING_EMAIL'
      });
    }

    const trimmedEmail = email.trim().toLowerCase();

    // Email format validation (RFC 5322 simplified)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return res.status(400).json({ 
        error: 'Invalid email format',
        code: 'INVALID_EMAIL'
      });
    }

    // Check for duplicates
    if (waitlist.some(e => e.email === trimmedEmail)) {
      return res.status(409).json({ 
        error: 'Email already in waitlist',
        code: 'DUPLICATE_EMAIL'
      });
    }

    // Limit waitlist size to prevent memory issues
    if (waitlist.length >= 10000) {
      return res.status(503).json({ 
        error: 'Waitlist is at capacity',
        code: 'CAPACITY_EXCEEDED'
      });
    }

    const entry = {
      id: Date.now(),
      email: trimmedEmail,
      created_at: new Date().toISOString()
    };
    waitlist.push(entry);

    console.log(`✉️  Waitlist signup: ${trimmedEmail}`);

    res.status(200).json({
      success: true,
      message: 'Successfully added to waitlist',
      data: entry
    });
  } catch (error) {
    console.error('❌ Error adding to waitlist:', error.message);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'SERVER_ERROR'
    });
  }
});

/**
 * GET /api/waitlist
 * Get all waitlist entries (admin endpoint)
 * Requires ADMIN_TOKEN in headers or query params
 */
app.get('/api/waitlist', (req, res) => {
  try {
    // Check admin authentication
    const token = req.query.token || req.headers['x-admin-token'];
    
    if (!process.env.ADMIN_TOKEN) {
      console.warn('⚠️  ADMIN_TOKEN not configured');
      return res.status(403).json({ 
        error: 'Admin endpoint not configured',
        code: 'NOT_CONFIGURED'
      });
    }

    if (!token || token !== process.env.ADMIN_TOKEN) {
      return res.status(401).json({ 
        error: 'Unauthorized - invalid or missing admin token',
        code: 'UNAUTHORIZED'
      });
    }

    res.json({
      success: true,
      data: waitlist,
      count: waitlist.length,
      timestamp: new Date().toISOString(),
      environment: NODE_ENV
    });
  } catch (error) {
    console.error('❌ Error fetching waitlist:', error.message);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'SERVER_ERROR'
    });
  }
});

/**
 * GET /api/health
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  try {
    res.json({
      status: 'ok',
      service: 'ASE - Agent Stock Exchange',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      environment: NODE_ENV,
      uptime: Math.round(process.uptime()),
      memoryUsage: {
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
      },
      waitlistSize: waitlist.length
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      service: 'ASE - Agent Stock Exchange',
      error: error.message
    });
  }
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
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🚀 ASE - Agent Stock Exchange Server`);
  console.log(`${'='.repeat(70)}`);
  console.log(`🌐 Listening on: http://localhost:${PORT}`);
  console.log(`📍 Environment: ${NODE_ENV}`);
  console.log(`⏰ Started: ${new Date().toISOString()}`);
  console.log(`${'='.repeat(70)}`);
  console.log(`\n📝 API Endpoints:`);
  console.log(`   POST   /api/waitlist    - Add email to waitlist`);
  console.log(`   GET    /api/waitlist    - Get entries (requires ADMIN_TOKEN)`);
  console.log(`   GET    /api/health      - Server health check`);
  console.log(`   GET    /                - Landing page`);
  console.log(`${'='.repeat(70)}\n`);

  // Environment warnings
  if (!process.env.ADMIN_TOKEN && NODE_ENV === 'production') {
    console.warn('⚠️  WARNING: ADMIN_TOKEN not set - admin endpoints will be disabled\n');
  }
});

// ──────────────────────────────────────────────────────────────
// GRACEFUL SHUTDOWN
// ──────────────────────────────────────────────────────────────

process.on('SIGINT', () => {
  console.log('\n\n🛑 SIGINT received - shutting down gracefully...');
  server.close(() => {
    console.log('✓ Server closed successfully');
    process.exit(0);
  });
  
  // Force exit after 10 seconds
  setTimeout(() => {
    console.error('❌ Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
});

process.on('SIGTERM', () => {
  console.log('\n\n🛑 SIGTERM received - shutting down gracefully...');
  server.close(() => {
    console.log('✓ Server closed successfully');
    process.exit(0);
  });
  
  // Force exit after 10 seconds
  setTimeout(() => {
    console.error('❌ Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

