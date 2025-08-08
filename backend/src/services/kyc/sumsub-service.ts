/**
 * Sumsub KYC Service
 * Handles identity verification for global users
 */

import axios from 'axios';
import crypto from 'crypto';
import { v4 as uuid } from 'uuid';

// Configuration
const SUMSUB_API_URL = process.env.SUMSUB_API_URL || 'https://api.sumsub.com';
const SUMSUB_APP_TOKEN = process.env.SUMSUB_APP_TOKEN || '';
const SUMSUB_SECRET_KEY = process.env.SUMSUB_SECRET_KEY || '';
const SUMSUB_WEBHOOK_SECRET = process.env.SUMSUB_WEBHOOK_SECRET || '';

// Blocked countries (OFAC + high risk)
const BLOCKED_COUNTRIES = [
  'IR', 'KP', 'SY', 'CU', // OFAC sanctioned
  'AF', 'BY', 'MM', 'VE', 'ZW', // High risk
  'RU' // Current sanctions
];

// Tier limits configuration
export const KYC_TIERS = {
  T0: {
    name: 'Unverified',
    dailyLimit: 0,
    maxLTV: 0,
    liquidationThreshold: 0,
    canIssueCard: false,
  },
  T1: {
    name: 'Basic',
    dailyLimit: 1000, // $1,000 USD
    maxLTV: 50, // 50%
    liquidationThreshold: 60, // 60%
    canIssueCard: true,
  },
  T2: {
    name: 'Advanced',
    dailyLimit: 5000, // $5,000 USD
    maxLTV: 60, // 60%
    liquidationThreshold: 70, // 70%
    canIssueCard: true,
  },
  T3: {
    name: 'VIP',
    dailyLimit: 25000, // $25,000 USD
    maxLTV: 70, // 70%
    liquidationThreshold: 80, // 80%
    canIssueCard: true,
  },
};

// KYC Status types
export type KycStatus = 
  | 'not_started'
  | 'initiated'
  | 'pending'
  | 'passed'
  | 'rejected'
  | 'action_required';

export interface KycProfile {
  userId: string;
  applicantId: string;
  status: KycStatus;
  tier: keyof typeof KYC_TIERS;
  country?: string;
  documentType?: string;
  riskScore?: number;
  isPep?: boolean;
  hasSanctions?: boolean;
  moderationComment?: string;
  reviewResult?: any;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Generate HMAC signature for Sumsub API requests
 */
function generateSignature(method: string, url: string, body?: any): string {
  const ts = Math.floor(Date.now() / 1000).toString();
  const bodyStr = body ? JSON.stringify(body) : '';
  const data = ts + method.toUpperCase() + url + bodyStr;
  
  const signature = crypto
    .createHmac('sha256', SUMSUB_SECRET_KEY)
    .update(data)
    .digest('hex');
  
  return signature;
}

/**
 * Make authenticated request to Sumsub API
 */
async function sumsubRequest(
  method: string,
  endpoint: string,
  data?: any
): Promise<any> {
  const url = `${SUMSUB_API_URL}${endpoint}`;
  const signature = generateSignature(method, endpoint, data);
  
  try {
    const response = await axios({
      method,
      url,
      data,
      headers: {
        'X-App-Token': SUMSUB_APP_TOKEN,
        'X-App-Access-Sig': signature,
        'X-App-Access-Ts': Math.floor(Date.now() / 1000).toString(),
        'Content-Type': 'application/json',
      },
    });
    
    return response.data;
  } catch (error: any) {
    console.error('[Sumsub] API Error:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Create a new KYC applicant
 */
export async function createApplicant(
  userId: string,
  email: string,
  country?: string,
  legalName?: string
): Promise<{ applicantId: string; accessToken: string }> {
  // Check country eligibility
  if (country && BLOCKED_COUNTRIES.includes(country)) {
    throw new Error(`Country ${country} is not supported`);
  }
  
  // Create applicant
  const applicantData = {
    externalUserId: userId,
    email,
    fixedInfo: {
      ...(country && { country }),
      ...(legalName && { firstName: legalName.split(' ')[0], lastName: legalName.split(' ').slice(1).join(' ') }),
    },
  };
  
  const applicant = await sumsubRequest('POST', '/resources/applicants', applicantData);
  
  // Generate access token for Web SDK
  const tokenResponse = await sumsubRequest(
    'POST',
    `/resources/accessTokens?userId=${applicant.id}&ttlInSecs=3600`,
    {}
  );
  
  return {
    applicantId: applicant.id,
    accessToken: tokenResponse.token,
  };
}

/**
 * Get applicant status
 */
export async function getApplicantStatus(applicantId: string): Promise<any> {
  return sumsubRequest('GET', `/resources/applicants/${applicantId}/status`);
}

/**
 * Verify webhook signature
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string
): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', SUMSUB_WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Process webhook event
 */
export async function processWebhookEvent(event: any): Promise<{
  status: KycStatus;
  tier: keyof typeof KYC_TIERS;
  shouldIssueCard: boolean;
  moderationComment?: string;
  riskLabels?: string[];
}> {
  const { type, applicantId, reviewResult, applicantMemberOf } = event;
  
  let status: KycStatus = 'pending';
  let tier: keyof typeof KYC_TIERS = 'T0';
  let shouldIssueCard = false;
  let moderationComment: string | undefined;
  let riskLabels: string[] = [];
  
  switch (type) {
    case 'applicantReviewed':
      if (reviewResult?.reviewAnswer === 'GREEN') {
        status = 'passed';
        
        // Determine tier based on risk score and labels
        const riskScore = reviewResult?.riskScore || 0;
        riskLabels = reviewResult?.riskLabels || [];
        
        if (riskScore < 30 && !riskLabels.length) {
          tier = 'T2'; // Low risk, higher limits
        } else if (riskScore < 60) {
          tier = 'T1'; // Standard tier
        } else {
          tier = 'T1'; // Higher risk, keep at basic
        }
        
        shouldIssueCard = true;
      } else if (reviewResult?.reviewAnswer === 'RED') {
        status = 'rejected';
        moderationComment = reviewResult?.moderationComment || 'Verification failed';
      }
      break;
      
    case 'applicantPending':
      status = 'pending';
      break;
      
    case 'applicantOnHold':
    case 'applicantActionRequired':
      status = 'action_required';
      moderationComment = 'Additional documentation required';
      break;
      
    case 'applicantDeleted':
      status = 'rejected';
      moderationComment = 'Application cancelled';
      break;
  }
  
  return {
    status,
    tier,
    shouldIssueCard,
    moderationComment,
    riskLabels,
  };
}

/**
 * Determine user tier based on KYC results
 */
export function getUserTier(kycProfile: KycProfile): keyof typeof KYC_TIERS {
  if (kycProfile.status !== 'passed') {
    return 'T0';
  }
  
  // Start with T1 by default
  let tier: keyof typeof KYC_TIERS = 'T1';
  
  // Upgrade based on risk assessment
  if (kycProfile.riskScore && kycProfile.riskScore < 30) {
    tier = 'T2';
  }
  
  // Downgrade for PEP/Sanctions
  if (kycProfile.isPep || kycProfile.hasSanctions) {
    tier = 'T1';
  }
  
  // High-risk countries stay at T1
  const highRiskCountries = ['NG', 'PK', 'BD', 'VN'];
  if (kycProfile.country && highRiskCountries.includes(kycProfile.country)) {
    tier = 'T1';
  }
  
  return tier;
}

/**
 * Get spending limits for a user
 */
export function getUserLimits(tier: keyof typeof KYC_TIERS) {
  return KYC_TIERS[tier];
}

/**
 * Check if user can issue card
 */
export function canIssueCard(kycProfile: KycProfile): boolean {
  if (kycProfile.status !== 'passed') {
    return false;
  }
  
  const tier = getUserTier(kycProfile);
  return KYC_TIERS[tier].canIssueCard;
}

/**
 * Format KYC status for frontend
 */
export function formatKycStatus(status: KycStatus): {
  label: string;
  color: string;
  icon: string;
  message: string;
} {
  switch (status) {
    case 'not_started':
      return {
        label: 'Not Started',
        color: 'gray',
        icon: '📋',
        message: 'Complete identity verification to unlock your card',
      };
      
    case 'initiated':
      return {
        label: 'In Progress',
        color: 'blue',
        icon: '⏳',
        message: 'Please complete the verification process',
      };
      
    case 'pending':
      return {
        label: 'Under Review',
        color: 'yellow',
        icon: '🔍',
        message: 'We\'re reviewing your documents (usually takes 2-5 minutes)',
      };
      
    case 'passed':
      return {
        label: 'Verified',
        color: 'green',
        icon: '✅',
        message: 'Identity verified! Your card is ready',
      };
      
    case 'rejected':
      return {
        label: 'Verification Failed',
        color: 'red',
        icon: '❌',
        message: 'We couldn\'t verify your identity. Please try again',
      };
      
    case 'action_required':
      return {
        label: 'Action Required',
        color: 'orange',
        icon: '⚠️',
        message: 'Additional documentation needed',
      };
      
    default:
      return {
        label: 'Unknown',
        color: 'gray',
        icon: '❓',
        message: 'Please contact support',
      };
  }
} 