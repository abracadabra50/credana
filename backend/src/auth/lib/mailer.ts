/**
 * Email Service using Postmark
 * Production-ready email delivery
 */

import axios from 'axios';

const POSTMARK_API_KEY = process.env.POSTMARK_API_KEY || '';
const FROM_EMAIL = process.env.POSTMARK_FROM_EMAIL || 'noreply@credana.io';
const APP_NAME = 'Credana';
const isDev = process.env.NODE_ENV !== 'production';

interface PostmarkEmail {
  From: string;
  To: string;
  Subject: string;
  HtmlBody?: string;
  TextBody?: string;
  MessageStream?: string;
  Tag?: string;
  Metadata?: Record<string, string>;
}

/**
 * Send email via Postmark API
 */
async function sendPostmarkEmail(email: PostmarkEmail): Promise<void> {
  if (isDev && !POSTMARK_API_KEY) {
    console.log('[Mailer] Dev mode - Email details:');
    console.log('  To:', email.To);
    console.log('  Subject:', email.Subject);
    console.log('  Content:', email.TextBody?.substring(0, 200));
    return;
  }

  try {
    const response = await axios.post(
      'https://api.postmarkapp.com/email',
      email,
      {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-Postmark-Server-Token': POSTMARK_API_KEY,
        },
      }
    );

    console.log(`[Postmark] Email sent successfully:`, {
      messageId: response.data.MessageID,
      to: response.data.To,
      submittedAt: response.data.SubmittedAt,
    });
  } catch (error: any) {
    console.error('[Postmark] Error sending email:', {
      error: error.response?.data || error.message,
      to: email.To,
    });
    throw error;
  }
}

/**
 * Send magic link email
 */
export async function sendMagicLinkEmail(email: string, link: string): Promise<void> {
  const htmlBody = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            margin: 0;
            padding: 0;
            background-color: #f5f5f5;
          }
          .container { 
            max-width: 600px; 
            margin: 40px auto; 
            background: white;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .header { 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
            padding: 40px 30px; 
            text-align: center; 
          }
          .header h1 { 
            color: white; 
            margin: 0; 
            font-size: 28px;
            font-weight: 600;
            letter-spacing: -0.5px;
          }
          .content { 
            padding: 40px 30px; 
          }
          .content h2 {
            margin-top: 0;
            color: #1a1a1a;
            font-size: 24px;
          }
          .content p {
            color: #666;
            margin: 20px 0;
          }
          .button { 
            display: inline-block; 
            padding: 16px 32px; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white !important; 
            text-decoration: none; 
            border-radius: 8px; 
            margin: 30px 0;
            font-weight: 600;
            font-size: 16px;
          }
          .button:hover {
            opacity: 0.9;
          }
          .footer { 
            text-align: center; 
            color: #999; 
            font-size: 12px; 
            padding: 30px;
            background: #fafafa;
            border-top: 1px solid #eee;
          }
          .link-text {
            word-break: break-all;
            color: #667eea;
            font-size: 12px;
            margin-top: 20px;
            padding: 15px;
            background: #f8f9ff;
            border-radius: 6px;
            border: 1px solid #e8eaff;
          }
          .security-notice {
            background: #fff9e6;
            border: 1px solid #ffd666;
            border-radius: 6px;
            padding: 12px;
            margin: 20px 0;
            font-size: 14px;
            color: #8b6914;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔐 ${APP_NAME}</h1>
          </div>
          <div class="content">
            <h2>Sign in to your account</h2>
            <p>Hi there! Click the button below to securely sign in to your Credana account.</p>
            
            <center>
              <a href="${link}" class="button">Sign In to Credana</a>
            </center>
            
            <div class="security-notice">
              ⚠️ This link expires in 10 minutes for your security.
            </div>
            
            <p style="color: #999; font-size: 14px;">
              If you didn't request this email, you can safely ignore it. No action is needed.
            </p>
            
            <div class="link-text">
              <strong>Can't click the button?</strong> Copy this link:<br>
              ${link}
            </div>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.</p>
            <p>The Credit Layer of DeFi</p>
          </div>
        </div>
      </body>
    </html>
  `;

  const textBody = `
Sign in to ${APP_NAME}

Click this link to sign in to your account:
${link}

This link will expire in 10 minutes for your security.

If you didn't request this email, you can safely ignore it.

© ${new Date().getFullYear()} ${APP_NAME}
  `.trim();

  await sendPostmarkEmail({
    From: FROM_EMAIL,
    To: email,
    Subject: `Sign in to ${APP_NAME}`,
    HtmlBody: htmlBody,
    TextBody: textBody,
    MessageStream: 'outbound',
    Tag: 'magic-link',
    Metadata: {
      type: 'authentication',
      method: 'magic-link',
    },
  });
}

/**
 * Send OTP email
 */
export async function sendOtpEmail(email: string, code: string): Promise<void> {
  const htmlBody = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            margin: 0;
            padding: 0;
            background-color: #f5f5f5;
          }
          .container { 
            max-width: 600px; 
            margin: 40px auto; 
            background: white;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .header { 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
            padding: 40px 30px; 
            text-align: center; 
          }
          .header h1 { 
            color: white; 
            margin: 0; 
            font-size: 28px;
            font-weight: 600;
            letter-spacing: -0.5px;
          }
          .content { 
            padding: 40px 30px; 
            text-align: center;
          }
          .content h2 {
            margin-top: 0;
            color: #1a1a1a;
            font-size: 24px;
          }
          .content p {
            color: #666;
            margin: 20px 0;
          }
          .code { 
            font-size: 36px; 
            font-weight: bold; 
            letter-spacing: 12px; 
            color: #667eea; 
            padding: 30px; 
            background: linear-gradient(135deg, #f8f9ff 0%, #f0f2ff 100%);
            border: 2px solid #e8eaff;
            border-radius: 12px; 
            margin: 30px 0;
            font-family: 'Courier New', monospace;
          }
          .footer { 
            text-align: center; 
            color: #999; 
            font-size: 12px; 
            padding: 30px;
            background: #fafafa;
            border-top: 1px solid #eee;
          }
          .security-notice {
            background: #fff9e6;
            border: 1px solid #ffd666;
            border-radius: 6px;
            padding: 12px;
            margin: 20px auto;
            font-size: 14px;
            color: #8b6914;
            max-width: 400px;
          }
          .icon {
            font-size: 48px;
            margin-bottom: 20px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔐 ${APP_NAME}</h1>
          </div>
          <div class="content">
            <div class="icon">🔑</div>
            <h2>Your verification code</h2>
            <p>Enter this code to complete your sign in:</p>
            
            <div class="code">${code}</div>
            
            <div class="security-notice">
              ⏱️ This code expires in 10 minutes
            </div>
            
            <p style="color: #999; font-size: 14px;">
              If you didn't request this code, please ignore this email.
            </p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.</p>
            <p>The Credit Layer of DeFi</p>
          </div>
        </div>
      </body>
    </html>
  `;

  const textBody = `
Your ${APP_NAME} verification code

${code}

Enter this code to complete your sign in.
This code expires in 10 minutes.

If you didn't request this code, please ignore this email.

© ${new Date().getFullYear()} ${APP_NAME}
  `.trim();

  await sendPostmarkEmail({
    From: FROM_EMAIL,
    To: email,
    Subject: `${code} is your ${APP_NAME} verification code`,
    HtmlBody: htmlBody,
    TextBody: textBody,
    MessageStream: 'outbound',
    Tag: 'otp',
    Metadata: {
      type: 'authentication',
      method: 'otp',
    },
  });
}

/**
 * Send welcome email after successful registration
 */
export async function sendWelcomeEmail(email: string, walletAddress: string): Promise<void> {
  const htmlBody = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            margin: 0;
            padding: 0;
            background-color: #f5f5f5;
          }
          .container { 
            max-width: 600px; 
            margin: 40px auto; 
            background: white;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .header { 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
            padding: 40px 30px; 
            text-align: center; 
          }
          .header h1 { 
            color: white; 
            margin: 0; 
            font-size: 28px;
            font-weight: 600;
            letter-spacing: -0.5px;
          }
          .content { 
            padding: 40px 30px; 
          }
          .wallet-info {
            background: #f8f9ff;
            border: 1px solid #e8eaff;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
          }
          .wallet-address {
            font-family: 'Courier New', monospace;
            font-size: 12px;
            color: #667eea;
            word-break: break-all;
          }
          .next-steps {
            background: #f0fff4;
            border: 1px solid #b7eb8f;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
          }
          .step {
            display: flex;
            align-items: flex-start;
            margin: 15px 0;
          }
          .step-number {
            background: #667eea;
            color: white;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: bold;
            margin-right: 12px;
            flex-shrink: 0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Welcome to ${APP_NAME}!</h1>
          </div>
          <div class="content">
            <h2>Your account is ready!</h2>
            <p>Congratulations! Your Credana wallet has been created and secured with your passkey.</p>
            
            <div class="wallet-info">
              <strong>Your Solana Wallet Address:</strong><br>
              <span class="wallet-address">${walletAddress}</span>
            </div>
            
            <div class="next-steps">
              <h3>✨ Next Steps:</h3>
              <div class="step">
                <span class="step-number">1</span>
                <div>
                  <strong>Deposit Collateral</strong><br>
                  Add SOL or supported tokens to unlock your credit limit
                </div>
              </div>
              <div class="step">
                <span class="step-number">2</span>
                <div>
                  <strong>Get Your Card</strong><br>
                  Request a virtual card and add it to Apple Pay
                </div>
              </div>
              <div class="step">
                <span class="step-number">3</span>
                <div>
                  <strong>Start Spending</strong><br>
                  Use your crypto-backed credit anywhere Visa is accepted
                </div>
              </div>
            </div>
            
            <p>Your wallet is secured by Turnkey's enterprise-grade infrastructure and your device's biometric authentication.</p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.</p>
            <p>The Credit Layer of DeFi</p>
          </div>
        </div>
      </body>
    </html>
  `;

  const textBody = `
Welcome to ${APP_NAME}!

Your account is ready!

Your Solana Wallet Address:
${walletAddress}

Next Steps:
1. Deposit Collateral - Add SOL or supported tokens
2. Get Your Card - Request and add to Apple Pay
3. Start Spending - Use anywhere Visa is accepted

© ${new Date().getFullYear()} ${APP_NAME}
  `.trim();

  await sendPostmarkEmail({
    From: FROM_EMAIL,
    To: email,
    Subject: `Welcome to ${APP_NAME} - Your wallet is ready!`,
    HtmlBody: htmlBody,
    TextBody: textBody,
    MessageStream: 'outbound',
    Tag: 'welcome',
    Metadata: {
      type: 'transactional',
      trigger: 'account-created',
    },
  });
} 