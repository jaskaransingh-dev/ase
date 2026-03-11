const nodemailer = require('nodemailer');
require('dotenv').config();

class EmailService {
  constructor() {
    this.emailService = process.env.EMAIL_SERVICE || 'sendgrid';
    
    // Initialize email transporter based on service type
    if (this.emailService === 'sendgrid') {
      // SendGrid configuration
      this.apiKey = process.env.SENDGRID_API_KEY;
      if (!this.apiKey) {
        console.warn('⚠️  SENDGRID_API_KEY not set - emails will not be sent');
      }
      
      // Create SendGrid transporter using SMTP
      this.transporter = nodemailer.createTransport({
        host: 'smtp.sendgrid.net',
        port: 587,
        secure: false,
        auth: {
          user: 'apikey',
          pass: this.apiKey,
        },
      });
    } else {
      // Fallback to Gmail or other SMTP service
      this.transporter = nodemailer.createTransport({
        service: process.env.EMAIL_SERVICE || 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD,
        },
      });
    }
  }

  async sendWaitlistConfirmation(email, name = 'there') {
    if (!this.transporter) {
      console.warn('❌ Email transporter not configured');
      throw new Error('Email service not configured');
    }

    const mailOptions = {
      from: process.env.EMAIL_FROM || 'noreply@ase.com',
      to: email,
      subject: '🎉 Welcome to ASE - Agent Stock Exchange Waitlist',
      html: this.getWaitlistEmailTemplate(name),
      text: this.getPlainTextTemplate(name),
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log(`✉️  Email sent to ${email}:`, info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error(`❌ Error sending email to ${email}:`, error.message);
      throw new Error(`Failed to send email: ${error.message}`);
    }
  }

  getPlainTextTemplate(name) {
    return `Welcome to ASE - Agent Stock Exchange

Hello ${name},

Thank you for joining the ASE waitlist. We are excited to have you participate in the next generation of AI-driven trading.

WHAT WE ARE BUILDING
ASE is a regulated marketplace where AI agents and trading strategies become tradable assets. Deploy algorithms, allocate capital, and earn transparent, on-chain profits.

KEY FEATURES
• Transparent Performance: Real-time on-chain tracking of all agent performance metrics
• True Ownership: Invest in and profit directly from top-performing AI strategies
• Curated Assets: Rigorously vetted agents from leading developers
• Regulatory Compliance: Built for institutional and retail participation
• Market-Driven Valuation: Price discovery where performance determines asset value

Our MVP launches soon with institutional-grade features. Early participants will have preferred access.

Visit us: https://www.ase.com

Questions? Reply to this email anytime.

Best regards,
The ASE Team
---
ASE - Agent Stock Exchange
https://www.ase.com`;
  }

  getWaitlistEmailTemplate(name) {
    return `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; 
              line-height: 1.6; 
              color: #1a1f36; 
              background: #f5f5f5; 
              margin: 0;
              padding: 0;
            }
            .container { 
              max-width: 600px; 
              margin: 0 auto; 
              padding: 20px; 
            }
            .email-wrapper { 
              background: white; 
              border-radius: 8px; 
              overflow: hidden; 
              box-shadow: 0 2px 4px rgba(0,0,0,0.1); 
            }
            .header { 
              background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
              color: white; 
              padding: 40px 30px; 
              text-align: center; 
            }
            .header h1 { 
              margin: 0; 
              font-size: 32px; 
              font-weight: 700; 
              letter-spacing: -0.5px; 
            }
            .header p { 
              margin: 8px 0 0 0; 
              font-size: 14px; 
              opacity: 0.9; 
              font-weight: 500;
            }
            .content { 
              padding: 40px 30px; 
            }
            .content p { 
              margin: 0 0 16px 0; 
              font-size: 15px; 
              line-height: 1.7; 
              color: #4b5563;
            }
            .content h2 { 
              margin: 32px 0 16px 0; 
              font-size: 18px; 
              font-weight: 700; 
              color: #0f172a; 
            }
            .content ul { 
              margin: 16px 0; 
              padding-left: 20px; 
            }
            .content ul li { 
              margin: 12px 0; 
              font-size: 15px; 
              line-height: 1.6;
              color: #4b5563;
            }
            .content ul li strong { 
              color: #0f172a; 
              font-weight: 600;
            }
            .cta-button { 
              display: inline-block; 
              padding: 12px 32px; 
              background: #0f172a; 
              color: white; 
              text-decoration: none; 
              border-radius: 6px; 
              font-weight: 600; 
              margin: 24px 0; 
              font-size: 15px; 
              border: 2px solid #0f172a;
              transition: all 0.3s;
            }
            .cta-button:hover { 
              background: white;
              color: #0f172a;
            }
            .footer { 
              background: #f9fafb; 
              padding: 24px 30px; 
              border-top: 1px solid #e5e7eb; 
              font-size: 13px; 
              color: #6b7280; 
              text-align: center; 
            }
            .footer p { 
              margin: 4px 0; 
            }
            .footer a {
              color: #0f172a;
              text-decoration: none;
              font-weight: 600;
            }
            .divider { 
              height: 1px; 
              background: #e5e7eb; 
              margin: 24px 0; 
            }
            .emoji { margin: 0 4px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="email-wrapper">
              <div class="header">
                <h1>🎉 ASE</h1>
                <p>Agent Stock Exchange Waitlist</p>
              </div>
              <div class="content">
                <p>Hi ${name},</p>
                <p>Thank you for joining the <strong>ASE (Agent Stock Exchange)</strong> waitlist! You're now part of a community exploring the future of AI-driven trading.</p>
                
                <h2>What We're Building</h2>
                <p>ASE is a <strong>regulated marketplace where AI agents and trading strategies become tradable assets</strong>. It combines the best of three worlds:</p>
                <ul>
                  <li><strong>For Developers:</strong> Deploy your algorithms and get paid based on real performance</li>
                  <li><strong>For Investors:</strong> Access professional-grade trading strategies with transparent returns</li>
                  <li><strong>For Everyone:</strong> All transactions recorded on-chain for complete transparency</li>
                </ul>
                
                <h2>Core Features</h2>
                <ul>
                  <li><span class="emoji">✓</span> <strong>Transparent Performance:</strong> Real-time on-chain tracking of every agent's metrics</li>
                  <li><span class="emoji">✓</span> <strong>True Ownership:</strong> Profit directly from top-performing strategies</li>
                  <li><span class="emoji">✓</span> <strong>Curated Quality:</strong> Rigorously vetted agents from vetted developers</li>
                  <li><span class="emoji">✓</span> <strong>Regulatory Compliance:</strong> Built from day one for institutional and retail markets</li>
                  <li><span class="emoji">✓</span> <strong>Market Valuation:</strong> Price discovery where performance determines value</li>
                </ul>
                
                <p><strong>Timeline:</strong> Our MVP launches soon with crypto market access and a curated developer cohort. Early waitlist members get preferred access.</p>
                
                <div style="text-align: center;">
                  <a href="https://www.ase.com" class="cta-button">Visit ASE.com</a>
                </div>
                
                <p>In the meantime, stay tuned for:</p>
                <ul>
                  <li>Early access invitations</li>
                  <li>Private beta updates</li>
                  <li>Exclusive insights into ASE</li>
                </ul>
                
                <p style="font-style: italic; color: #6b7280; margin-top: 32px;">Questions? Just reply to this email. We're here to help! 😊</p>
              </div>
              <div class="footer">
                <p><strong>Agent Stock Exchange</strong></p>
                <p><a href="https://www.ase.com" style="color: #0f172a;">www.ase.com</a> • <a href="mailto:hello@ase.com" style="color: #0f172a;">hello@ase.com</a></p>
                <p style="margin-top: 16px; font-size: 12px; color: #9ca3af;">© 2026 Agent Stock Exchange. All rights reserved.<br>You received this email because you joined our waitlist.</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;
  }
}

module.exports = new EmailService();
