/**
 * Cloudflare Pages Function: Handle waitlist signups via D1 Database
 * POST /api/waitlist - Add email to waitlist
 * GET /api/waitlist - Get waitlist entries (requires admin token)
 */

export async function onRequestPost({ request, env }) {
  try {
    const data = await request.json();
    const { email } = data;

    // Input validation
    if (!email || typeof email !== 'string') {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Valid email is required',
          code: 'MISSING_EMAIL'
        }), 
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    const trimmedEmail = email.trim().toLowerCase();

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid email format',
          code: 'INVALID_EMAIL'
        }), 
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Check if database is available
    if (!env.DB) {
      console.error('D1 Database not bound');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Database unavailable',
          code: 'DB_ERROR'
        }), 
        { 
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Insert into D1 database
    try {
      const result = await env.DB.prepare(
        `INSERT INTO waitlist_users (email, created_at) VALUES (?, datetime('now'))`
      ).bind(trimmedEmail).run();

      console.log(`✉️ Waitlist signup: ${trimmedEmail}`);

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Successfully added to waitlist',
          data: {
            email: trimmedEmail,
            id: result.meta.last_row_id,
            created_at: new Date().toISOString()
          }
        }), 
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    } catch (dbError) {
      // Handle UNIQUE constraint violation (duplicate email)
      if (dbError.message && dbError.message.includes('UNIQUE constraint failed')) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Email already registered',
            code: 'DUPLICATE_EMAIL'
          }), 
          { 
            status: 409,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      console.error('Database error:', dbError.message);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Database error',
          code: 'DB_ERROR'
        }), 
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

  } catch (err) {
    console.error('❌ Error processing waitlist request:', err.message);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Internal server error',
        code: 'SERVER_ERROR'
      }), 
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

export async function onRequestGet({ request, env }) {
  try {
    // Check admin authentication
    const url = new URL(request.url);
    const token = url.searchParams.get('token') || request.headers.get('x-admin-token');

    if (!env.ADMIN_TOKEN) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Admin endpoint not configured',
          code: 'NOT_CONFIGURED'
        }), 
        { 
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    if (!token || token !== env.ADMIN_TOKEN) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Unauthorized - invalid or missing admin token',
          code: 'UNAUTHORIZED'
        }), 
        { 
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Check if database is available
    if (!env.DB) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Database unavailable',
          code: 'DB_ERROR'
        }), 
        { 
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Get all waitlist entries
    const result = await env.DB.prepare(
      `SELECT email, created_at FROM waitlist_users ORDER BY created_at DESC`
    ).all();

    return new Response(
      JSON.stringify({
        success: true,
        data: result.results || [],
        count: (result.results || []).length,
        timestamp: new Date().toISOString()
      }), 
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('❌ Error fetching waitlist:', error.message);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Internal server error',
        code: 'SERVER_ERROR'
      }), 
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
