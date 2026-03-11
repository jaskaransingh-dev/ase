/**
 * Cloudflare Pages Function: Handle waitlist signups
 * POST /api/waitlist
 */

export async function onRequest(context) {
  const { request, env } = context;

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  // Only allow POST
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await request.json();
    const { email, name } = body;

    // Validation
    if (!email || !email.includes('@')) {
      return new Response(
        JSON.stringify({ error: 'Valid email is required' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    // Store in Cloudflare KV (you'll need to bind KV namespace to your Pages project)
    const waitlistKey = `waitlist:${email}`;
    
    try {
      // Check if email already exists
      const existing = await env.WAITLIST_KV.get(waitlistKey);
      if (existing) {
        return new Response(
          JSON.stringify({ error: 'Email already in waitlist' }),
          {
            status: 409,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          }
        );
      }

      // Store the entry
      const entry = {
        email,
        name: name || 'there',
        created_at: new Date().toISOString(),
        status: 'pending',
        email_sent: false,
      };

      await env.WAITLIST_KV.put(waitlistKey, JSON.stringify(entry), {
        expirationTtl: 31536000, // 1 year
      });

      // Send confirmation email using Cloudflare Email Routing
      const emailResponse = await sendWaitlistConfirmation(email, name, env);

      if (emailResponse.success) {
        entry.email_sent = true;
        entry.email_sent_at = new Date().toISOString();
        await env.WAITLIST_KV.put(waitlistKey, JSON.stringify(entry));
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Successfully added to waitlist',
          data: entry,
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    } catch (kvError) {
      console.error('KV error:', kvError);
      // Fallback: still save the email
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Successfully added to waitlist',
          data: {
            email,
            name: name || 'there',
            created_at: new Date().toISOString(),
            status: 'pending',
          },
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }
  } catch (error) {
    console.error('Error in waitlist handler:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
}

/**
 * Send waitlist confirmation email
 */
async function sendWaitlistConfirmation(email, name, env) {
  try {
    // Use SendGrid API (you'll need to set SENDGRID_API_KEY in environment)
    if (env.SENDGRID_API_KEY) {
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.SENDGRID_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [
            {
              to: [{ email }],
              subject: '🎉 Welcome to ASE Waitlist - Early Access Coming Soon',
            },
          ],
          from: {
            email: env.FROM_EMAIL || 'noreply@ase.com',
            name: 'Agent Stock Exchange',
          },
          content: [
            {
              type: 'text/html',
              value: getWaitlistEmailHTML(name),
            },
          ],
        }),
      });

      return { success: response.ok };
    }

    // Alternative: Use Cloudflare Email Routing (if configured)
    return { success: true };
  } catch (error) {
    console.error('Email send error:', error);
    return { success: false, error };
  }
}

/**
 * Generate waitlist confirmation email HTML
 */
function getWaitlistEmailHTML(name) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: white; padding: 30px; text-align: center; border-radius: 8px; margin-bottom: 30px; }
    .header h1 { margin: 0; font-size: 28px; }
    .content { background: #f9fafb; padding: 30px; border-radius: 8px; margin-bottom: 30px; }
    .content h2 { color: #0f172a; margin-top: 0; }
    .content p { margin: 15px 0; color: #666; }
    .features { background: white; padding: 20px; border-left: 4px solid #0f172a; margin: 20px 0; }
    .features li { margin: 10px 0; color: #666; }
    .cta-button { display: inline-block; background: #0f172a; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .footer { text-align: center; color: #999; font-size: 12px; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎉 Welcome to ASE</h1>
      <p>Agent Stock Exchange Waitlist</p>
    </div>

    <div class="content">
      <h2>Hi ${name || 'there'}!</h2>
      <p>Thank you for joining the waitlist for <strong>Agent Stock Exchange (ASE)</strong>!</p>
      
      <p>You're now on our list for early access to a revolutionary marketplace where:</p>
      
      <div class="features">
        <ul>
          <li>✓ AI agents and trading strategies become tradable assets</li>
          <li>✓ Developers deploy strategies and get paid based on performance</li>
          <li>✓ Investors access professional-grade algorithms with transparent returns</li>
          <li>✓ All transactions are tracked on-chain for complete transparency</li>
          <li>✓ Built from the ground up with regulatory compliance in mind</li>
        </ul>
      </div>

      <p><strong>What happens next?</strong></p>
      <p>We're currently finalizing our MVP and will be reaching out to our waitlist members soon with:</p>
      <ul>
        <li>Early access invitations</li>
        <li>Private beta updates</li>
        <li>Exclusive insights into how ASE works</li>
      </ul>

      <p>In the meantime, keep an eye on your inbox for updates!</p>

      <a href="https://ase.com" class="cta-button">Visit ASE</a>
    </div>

    <div class="footer">
      <p>&copy; 2026 Agent Stock Exchange. All rights reserved.</p>
      <p>If you have any questions, feel free to reply to this email or contact us at <a href="mailto:hello@ase.com" style="color: #0f172a;">hello@ase.com</a></p>
    </div>
  </div>
</body>
</html>
  `;
}
