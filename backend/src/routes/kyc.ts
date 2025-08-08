/**
 * KYC API Routes
 * Handles Sumsub integration for global identity verification
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  createApplicant,
  getApplicantStatus,
  verifyWebhookSignature,
  processWebhookEvent,
  getUserTier,
  getUserLimits,
  canIssueCard,
  formatKycStatus,
  KycStatus,
  KycProfile,
} from '../services/kyc/sumsub-service';
import { verifySession } from '../auth/lib/jwt';
import { db } from '../auth/lib/db';
import { sendKycStatusEmail } from '../services/email/kyc-emails';
import { createCardholder, issueVirtualCard } from '../services/lithic/card-service';

const router = Router();

// In-memory KYC store (replace with Postgres)
const kycProfiles = new Map<string, KycProfile>();
const webhookEvents = new Map<string, any>();

/**
 * Middleware to require authenticated session
 */
async function requireAuth(req: Request, res: Response, next: Function) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const decoded = verifySession(token);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * Create KYC applicant and get SDK token
 */
router.post('/api/kyc/sumsub/applicant', requireAuth, async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      country: z.string().optional(),
      legalName: z.string().optional(),
    });
    
    const { country, legalName } = schema.parse(req.body);
    const userId = req.user.uid;
    const user = db.getUserById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Check if KYC already exists
    let kycProfile = kycProfiles.get(userId);
    
    if (kycProfile && ['passed', 'pending'].includes(kycProfile.status)) {
      return res.status(400).json({ 
        error: 'KYC already in progress or completed',
        status: kycProfile.status,
      });
    }
    
    // Create Sumsub applicant
    const { applicantId, accessToken } = await createApplicant(
      userId,
      user.email,
      country,
      legalName
    );
    
    // Store KYC profile
    kycProfile = {
      userId,
      applicantId,
      status: 'initiated' as KycStatus,
      tier: 'T0',
      country,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    kycProfiles.set(userId, kycProfile);
    
    console.log(`[KYC] Created applicant ${applicantId} for user ${userId}`);
    
    return res.json({
      applicantId,
      accessToken,
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      flowName: 'individual-basic', // Configure in Sumsub dashboard
    });
    
  } catch (error: any) {
    console.error('[KYC] Error creating applicant:', error);
    return res.status(500).json({ 
      error: 'Failed to create KYC application',
      message: error.message,
    });
  }
});

/**
 * Get KYC status for current user
 */
router.get('/api/kyc/status', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user.uid;
    const kycProfile = kycProfiles.get(userId);
    
    if (!kycProfile) {
      return res.json({
        status: 'not_started',
        tier: 'T0',
        limits: getUserLimits('T0'),
        display: formatKycStatus('not_started'),
      });
    }
    
    // Get latest status from Sumsub if pending
    if (kycProfile.status === 'pending' || kycProfile.status === 'initiated') {
      try {
        const sumsubStatus = await getApplicantStatus(kycProfile.applicantId);
        // Update local status based on Sumsub response
        if (sumsubStatus.reviewResult) {
          const processed = await processWebhookEvent({
            type: 'applicantReviewed',
            applicantId: kycProfile.applicantId,
            reviewResult: sumsubStatus.reviewResult,
          });
          
          kycProfile.status = processed.status;
          kycProfile.tier = processed.tier;
          kycProfile.moderationComment = processed.moderationComment;
          kycProfiles.set(userId, kycProfile);
        }
      } catch (e) {
        console.error('[KYC] Error fetching status:', e);
      }
    }
    
    const tier = getUserTier(kycProfile);
    const limits = getUserLimits(tier);
    const display = formatKycStatus(kycProfile.status);
    
    return res.json({
      status: kycProfile.status,
      tier,
      limits,
      display,
      country: kycProfile.country,
      canIssueCard: canIssueCard(kycProfile),
      moderationComment: kycProfile.moderationComment,
      updatedAt: kycProfile.updatedAt,
    });
    
  } catch (error: any) {
    console.error('[KYC] Error getting status:', error);
    return res.status(500).json({ error: 'Failed to get KYC status' });
  }
});

/**
 * Sumsub webhook handler
 */
router.post('/api/webhooks/sumsub', async (req: Request, res: Response) => {
  try {
    // Verify webhook signature
    const signature = req.headers['x-payload-digest'] as string;
    const payload = JSON.stringify(req.body);
    
    if (!verifyWebhookSignature(payload, signature)) {
      console.error('[KYC] Invalid webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }
    
    const event = req.body;
    const { type, applicantId, externalUserId, reviewResult } = event;
    
    // Idempotency check
    const eventId = `${applicantId}-${type}-${Date.now()}`;
    if (webhookEvents.has(eventId)) {
      return res.status(200).json({ status: 'duplicate' });
    }
    webhookEvents.set(eventId, event);
    
    console.log(`[KYC] Webhook received: ${type} for applicant ${applicantId}`);
    
    // Find user by external ID or applicant ID
    let kycProfile: KycProfile | undefined;
    let userId: string | undefined;
    
    if (externalUserId) {
      userId = externalUserId;
      kycProfile = kycProfiles.get(userId);
    } else {
      // Search through all profiles
      for (const [uid, profile] of kycProfiles.entries()) {
        if (profile.applicantId === applicantId) {
          userId = uid;
          kycProfile = profile;
          break;
        }
      }
    }
    
    if (!kycProfile || !userId) {
      console.error(`[KYC] Profile not found for applicant ${applicantId}`);
      return res.status(404).json({ error: 'Profile not found' });
    }
    
    // Process the event
    const processed = await processWebhookEvent(event);
    
    // Update KYC profile
    kycProfile.status = processed.status;
    kycProfile.tier = processed.tier;
    kycProfile.moderationComment = processed.moderationComment;
    kycProfile.reviewResult = reviewResult;
    kycProfile.updatedAt = new Date();
    
    if (reviewResult) {
      kycProfile.riskScore = reviewResult.riskScore;
      kycProfile.isPep = reviewResult.pep;
      kycProfile.hasSanctions = reviewResult.sanctions;
    }
    
    kycProfiles.set(userId, kycProfile);
    
    // Handle status-specific actions
    const user = db.getUserById(userId);
    if (user) {
      switch (processed.status) {
        case 'passed':
          console.log(`[KYC] User ${userId} passed verification, tier ${processed.tier}`);
          
          // Issue virtual card
          if (processed.shouldIssueCard) {
            try {
              // Create Lithic cardholder
              const cardholder = await createCardholder({
                email: user.email,
                firstName: reviewResult?.fixedInfo?.firstName || 'User',
                lastName: reviewResult?.fixedInfo?.lastName || userId,
                country: kycProfile.country || 'US',
              });
              
              // Issue virtual card (frozen until collateral)
              const card = await issueVirtualCard({
                cardholderId: cardholder.token,
                spendLimit: getUserLimits(processed.tier).dailyLimit * 100, // Convert to cents
                state: 'PAUSED', // Frozen until collateral deposited
              });
              
              // Store card info (in production, use database)
              console.log(`[KYC] Issued card ${card.token} for user ${userId}`);
              
            } catch (cardError) {
              console.error('[KYC] Error issuing card:', cardError);
            }
          }
          
          // Send success email
          await sendKycStatusEmail(user.email, 'passed', {
            tier: processed.tier,
            limits: getUserLimits(processed.tier),
          });
          break;
          
        case 'rejected':
          console.log(`[KYC] User ${userId} rejected: ${processed.moderationComment}`);
          
          // Send rejection email
          await sendKycStatusEmail(user.email, 'rejected', {
            reason: processed.moderationComment,
          });
          break;
          
        case 'action_required':
          console.log(`[KYC] User ${userId} needs action: ${processed.moderationComment}`);
          
          // Send action required email
          await sendKycStatusEmail(user.email, 'action_required', {
            reason: processed.moderationComment,
          });
          break;
      }
    }
    
    return res.status(200).json({ 
      status: 'processed',
      kycStatus: processed.status,
      tier: processed.tier,
    });
    
  } catch (error: any) {
    console.error('[KYC] Webhook error:', error);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * Get tier limits
 */
router.get('/api/kyc/tiers', async (req: Request, res: Response) => {
  const tiers = Object.entries(getUserLimits).map(([key, value]) => ({
    tier: key,
    ...value,
  }));
  
  return res.json({ tiers });
});

export default router; 