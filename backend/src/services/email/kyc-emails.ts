/**
 * KYC Email Templates
 * Postmark transactional emails for KYC status updates
 */

import axios from 'axios';

const POSTMARK_API_KEY = process.env.POSTMARK_API_KEY || '';
const FROM_EMAIL = process.env.POSTMARK_FROM_EMAIL || 'noreply@credana.io';
const APP_NAME = 'Credana';
const APP_URL = process.env.APP_URL || 'https://credana.io';

interface EmailOptions {
  tier?: string;
  limits?: any;
  reason?: string;
}

/**
 * Send KYC status email via Postmark
 */
async function sendPostmarkEmail(
  to: string,
  subject: string,
  htmlBody: string,
  textBody: string,
  tag: string
) {
  if (!POSTMARK_API_KEY) {
    console.log('[Email] No Postmark key, logging to console:');
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Tag: ${tag}`);
    return;
  }

  try {
    await axios.post(
      'https://api.postmarkapp.com/email',
      {
        From: FROM_EMAIL,
        To: to,
        Subject: subject,
        HtmlBody: htmlBody,
        TextBody: textBody,
        MessageStream: 'outbound',
        Tag: tag,
      },
      {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-Postmark-Server-Token': POSTMARK_API_KEY,
        },
      }
    );
    console.log(`[Email] Sent ${tag} email to ${to}`);
  } catch (error: any) {
    console.error('[Email] Failed to send:', error.response?.data || error.message);
  }
}

/**
 * Send KYC status email based on status
 */
export async function sendKycStatusEmail(
  email: string,
  status: 'passed' | 'rejected' | 'action_required' | 'pending',
  options: EmailOptions = {}
) {
  let subject: string;
  let htmlBody: string;
  let textBody: string;
  let tag: string;

  switch (status) {
    case 'passed':
      subject = `✅ Identity verified - Your ${APP_NAME} card is ready!`;
      htmlBody = getPassedEmailHtml(options);
      textBody = getPassedEmailText(options);
      tag = 'kyc-passed';
      break;

    case 'rejected':
      subject = `We couldn't verify your identity`;
      htmlBody = getRejectedEmailHtml(options);
      textBody = getRejectedEmailText(options);
      tag = 'kyc-rejected';
      break;

    case 'action_required':
      subject = `📋 Action required - Complete your verification`;
      htmlBody = getActionRequiredEmailHtml(options);
      textBody = getActionRequiredEmailText(options);
      tag = 'kyc-action-required';
      break;

    case 'pending':
      subject = `🔍 We're reviewing your documents`;
      htmlBody = getPendingEmailHtml();
      textBody = getPendingEmailText();
      tag = 'kyc-pending';
      break;

    default:
      return;
  }

  await sendPostmarkEmail(email, subject, htmlBody, textBody, tag);
}

function getPassedEmailHtml(options: EmailOptions): string {
  const { tier = 'T1', limits = {} } = options;
  
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px; text-align: center; border-radius: 12px 12px 0 0; }
          .header h1 { color: white; margin: 0; font-size: 28px; }
          .content { background: white; padding: 40px; border: 1px solid #e5e5e5; border-radius: 0 0 12px 12px; }
          .success-icon { font-size: 72px; text-align: center; margin: 20px 0; }
          .limits-box { background: #f8f9ff; border: 1px solid #e8eaff; border-radius: 8px; padding: 20px; margin: 20px 0; }
          .limit-item { display: flex; justify-content: space-between; margin: 10px 0; }
          .cta-button { display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white !important; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: 600; }
          .next-steps { background: #f0fff4; border: 1px solid #b7eb8f; border-radius: 8px; padding: 20px; margin: 20px 0; }
          .step { margin: 15px 0; padding-left: 30px; position: relative; }
          .step:before { content: "✓"; position: absolute; left: 0; color: #52c41a; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Welcome to ${APP_NAME}!</h1>
          </div>
          <div class="content">
            <div class="success-icon">✅</div>
            <h2 style="text-align: center;">Identity Verified Successfully!</h2>
            <p>Great news! Your identity has been verified and your virtual card is ready to use.</p>
            
            <div class="limits-box">
              <h3>Your ${tier === 'T2' ? 'Enhanced' : 'Standard'} Limits:</h3>
              <div class="limit-item">
                <span>Daily Spending:</span>
                <strong>$${limits.dailyLimit || 1000}</strong>
              </div>
              <div class="limit-item">
                <span>Max Loan-to-Value:</span>
                <strong>${limits.maxLTV || 50}%</strong>
              </div>
              <div class="limit-item">
                <span>Liquidation Threshold:</span>
                <strong>${limits.liquidationThreshold || 60}%</strong>
              </div>
            </div>
            
            <div class="next-steps">
              <h3>✨ Next Steps:</h3>
              <div class="step">Deposit collateral to activate your card</div>
              <div class="step">Add your card to Apple Pay or Google Pay</div>
              <div class="step">Start spending with crypto-backed credit!</div>
            </div>
            
            <center>
              <a href="${APP_URL}/dashboard" class="cta-button">Go to Dashboard</a>
            </center>
            
            <p style="color: #666; font-size: 14px; margin-top: 30px;">
              Your card will remain frozen until you deposit collateral. Once you deposit SOL or other supported tokens, your spending limit will be calculated based on your collateral value.
            </p>
          </div>
        </div>
      </body>
    </html>
  `;
}

function getPassedEmailText(options: EmailOptions): string {
  const { tier = 'T1', limits = {} } = options;
  return `
Identity Verified Successfully!

Your ${APP_NAME} virtual card is ready to use.

Your ${tier === 'T2' ? 'Enhanced' : 'Standard'} Limits:
• Daily Spending: $${limits.dailyLimit || 1000}
• Max Loan-to-Value: ${limits.maxLTV || 50}%
• Liquidation Threshold: ${limits.liquidationThreshold || 60}%

Next Steps:
1. Deposit collateral to activate your card
2. Add your card to Apple Pay or Google Pay
3. Start spending with crypto-backed credit!

Go to Dashboard: ${APP_URL}/dashboard

Note: Your card will remain frozen until you deposit collateral.
  `.trim();
}

function getRejectedEmailHtml(options: EmailOptions): string {
  const { reason = 'Verification requirements not met' } = options;
  
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #ff4d4f; padding: 40px; text-align: center; border-radius: 12px 12px 0 0; }
          .header h1 { color: white; margin: 0; font-size: 28px; }
          .content { background: white; padding: 40px; border: 1px solid #e5e5e5; border-radius: 0 0 12px 12px; }
          .error-icon { font-size: 72px; text-align: center; margin: 20px 0; }
          .reason-box { background: #fff2f0; border: 1px solid #ffccc7; border-radius: 8px; padding: 20px; margin: 20px 0; }
          .cta-button { display: inline-block; padding: 16px 32px; background: #1890ff; color: white !important; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: 600; }
          .help-section { background: #f5f5f5; border-radius: 8px; padding: 20px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Verification Unsuccessful</h1>
          </div>
          <div class="content">
            <div class="error-icon">❌</div>
            <h2 style="text-align: center;">We Couldn't Verify Your Identity</h2>
            
            <div class="reason-box">
              <h3>Reason:</h3>
              <p>${reason}</p>
            </div>
            
            <p>Don't worry! This can happen for various reasons. Here are some common issues:</p>
            
            <div class="help-section">
              <h3>Common Issues & Solutions:</h3>
              <ul>
                <li><strong>Blurry photos:</strong> Ensure good lighting and steady hands</li>
                <li><strong>Expired documents:</strong> Use valid, non-expired ID</li>
                <li><strong>Name mismatch:</strong> Ensure name matches your ID exactly</li>
                <li><strong>Document type:</strong> Use passport or driver's license</li>
              </ul>
            </div>
            
            <center>
              <a href="${APP_URL}/kyc/retry" class="cta-button">Try Again</a>
            </center>
            
            <p style="color: #666; font-size: 14px; margin-top: 30px;">
              If you continue to have issues, please contact our support team at support@credana.io
            </p>
          </div>
        </div>
      </body>
    </html>
  `;
}

function getRejectedEmailText(options: EmailOptions): string {
  const { reason = 'Verification requirements not met' } = options;
  return `
We Couldn't Verify Your Identity

Reason: ${reason}

Common Issues & Solutions:
• Blurry photos: Ensure good lighting and steady hands
• Expired documents: Use valid, non-expired ID
• Name mismatch: Ensure name matches your ID exactly
• Document type: Use passport or driver's license

Try Again: ${APP_URL}/kyc/retry

If you continue to have issues, contact support@credana.io
  `.trim();
}

function getActionRequiredEmailHtml(options: EmailOptions): string {
  const { reason = 'Additional documentation needed' } = options;
  
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #faad14; padding: 40px; text-align: center; border-radius: 12px 12px 0 0; }
          .header h1 { color: white; margin: 0; font-size: 28px; }
          .content { background: white; padding: 40px; border: 1px solid #e5e5e5; border-radius: 0 0 12px 12px; }
          .warning-icon { font-size: 72px; text-align: center; margin: 20px 0; }
          .action-box { background: #fffbe6; border: 1px solid #ffe58f; border-radius: 8px; padding: 20px; margin: 20px 0; }
          .cta-button { display: inline-block; padding: 16px 32px; background: #faad14; color: white !important; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: 600; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Action Required</h1>
          </div>
          <div class="content">
            <div class="warning-icon">⚠️</div>
            <h2 style="text-align: center;">We Need Additional Information</h2>
            
            <div class="action-box">
              <h3>What's Needed:</h3>
              <p>${reason}</p>
            </div>
            
            <p>To complete your verification, please provide the requested documentation. This usually includes:</p>
            <ul>
              <li>Proof of address (utility bill, bank statement)</li>
              <li>Secondary ID document</li>
              <li>Clearer photo of your primary ID</li>
            </ul>
            
            <center>
              <a href="${APP_URL}/kyc/continue" class="cta-button">Continue Verification</a>
            </center>
            
            <p style="color: #666; font-size: 14px; margin-top: 30px;">
              This additional step helps us ensure the security of your account and comply with regulations.
            </p>
          </div>
        </div>
      </body>
    </html>
  `;
}

function getActionRequiredEmailText(options: EmailOptions): string {
  const { reason = 'Additional documentation needed' } = options;
  return `
Action Required - Complete Your Verification

What's Needed: ${reason}

This usually includes:
• Proof of address (utility bill, bank statement)
• Secondary ID document
• Clearer photo of your primary ID

Continue Verification: ${APP_URL}/kyc/continue

This helps ensure account security and regulatory compliance.
  `.trim();
}

function getPendingEmailHtml(): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #1890ff; padding: 40px; text-align: center; border-radius: 12px 12px 0 0; }
          .header h1 { color: white; margin: 0; font-size: 28px; }
          .content { background: white; padding: 40px; border: 1px solid #e5e5e5; border-radius: 0 0 12px 12px; }
          .pending-icon { font-size: 72px; text-align: center; margin: 20px 0; }
          .info-box { background: #e6f7ff; border: 1px solid #91d5ff; border-radius: 8px; padding: 20px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Documents Under Review</h1>
          </div>
          <div class="content">
            <div class="pending-icon">🔍</div>
            <h2 style="text-align: center;">We're Reviewing Your Documents</h2>
            
            <div class="info-box">
              <h3>What happens next?</h3>
              <p>Our automated system is reviewing your submitted documents. This usually takes 2-5 minutes.</p>
              <p>We'll email you as soon as the review is complete.</p>
            </div>
            
            <p>While you wait, you can:</p>
            <ul>
              <li>Explore the dashboard</li>
              <li>Learn about our collateral options</li>
              <li>Check out our fee structure</li>
            </ul>
            
            <p style="color: #666; font-size: 14px; margin-top: 30px;">
              If review takes longer than expected, we'll notify you if additional information is needed.
            </p>
          </div>
        </div>
      </body>
    </html>
  `;
}

function getPendingEmailText(): string {
  return `
We're Reviewing Your Documents

Our automated system is reviewing your submitted documents.
This usually takes 2-5 minutes.

We'll email you as soon as the review is complete.

While you wait, you can:
• Explore the dashboard
• Learn about our collateral options
• Check out our fee structure

If review takes longer than expected, we'll notify you if additional information is needed.
  `.trim();
} 