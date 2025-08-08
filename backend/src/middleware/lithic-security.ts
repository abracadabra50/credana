/**
 * Lithic Webhook Security Middleware
 * HMAC verification + Idempotency + Replay protection
 */

import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { LRUCache } from 'lru-cache';

// Idempotency cache: stores decision for 24 hours
const idempotencyCache = new LRUCache<string, {
  decision: any;
  timestamp: number;
  processed: boolean;
}>({
  max: 10000, // Max 10k entries
  ttl: 24 * 60 * 60 * 1000, // 24 hours
});

// Replay protection: seen signatures
const replayCache = new LRUCache<string, boolean>({
  max: 50000,
  ttl: 24 * 60 * 60 * 1000, // 24 hours
});

interface LithicWebhookRequest extends Request {
  lithicEvent?: {
    eventId: string;
    authId?: string;
    type: string;
    verified: boolean;
    idempotencyKey: string;
  };
}

/**
 * Verify Lithic HMAC signature
 * Fail-closed: any verification failure = 401
 */
export function verifyLithicHMAC(secret: string) {
  return (req: LithicWebhookRequest, res: Response, next: NextFunction) => {
    try {
      // Get signature from headers
      const signature = req.headers['webhook-signature'] || 
                        req.headers['x-lithic-signature'] ||
                        req.headers['lithic-signature'];
      
      const timestamp = req.headers['webhook-timestamp'] || 
                       req.headers['x-lithic-timestamp'];

      if (!signature || !timestamp) {
        console.error('[SECURITY] Missing Lithic signature/timestamp headers');
        return res.status(401).json({ 
          error: 'Missing authentication headers',
          code: 'MISSING_HMAC' 
        });
      }

      // Prevent replay attacks - check timestamp freshness (5 minute window)
      const now = Math.floor(Date.now() / 1000);
      const webhookTime = parseInt(timestamp as string);
      if (Math.abs(now - webhookTime) > 300) {
        console.error('[SECURITY] Webhook timestamp too old/future:', {
          webhookTime,
          now,
          diff: Math.abs(now - webhookTime)
        });
        return res.status(401).json({ 
          error: 'Timestamp outside acceptable window',
          code: 'TIMESTAMP_INVALID' 
        });
      }

      // Construct signed payload
      const payload = `${timestamp}.${JSON.stringify(req.body)}`;
      
      // Calculate expected signature
      const expectedSig = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      // Timing-safe comparison
      const providedSig = (signature as string).replace('v1=', '');
      if (!crypto.timingSafeEqual(
        Buffer.from(expectedSig),
        Buffer.from(providedSig)
      )) {
        console.error('[SECURITY] HMAC verification failed');
        return res.status(401).json({ 
          error: 'Invalid signature',
          code: 'HMAC_MISMATCH' 
        });
      }

      // Check replay protection
      const replayKey = `${timestamp}:${signature}`;
      if (replayCache.has(replayKey)) {
        console.warn('[SECURITY] Duplicate webhook detected (replay attack?)');
        return res.status(409).json({ 
          error: 'Duplicate webhook',
          code: 'REPLAY_DETECTED' 
        });
      }
      replayCache.set(replayKey, true);

      // Extract event details for idempotency
      const eventType = req.body?.type || 'unknown';
      const eventId = req.body?.event_id || 
                     req.body?.data?.event_id || 
                     crypto.randomBytes(16).toString('hex');
      const authId = req.body?.data?.authorization?.id || 
                    req.body?.data?.auth_id || 
                    req.body?.data?.transaction?.id;

      // Store in request for next middleware
      req.lithicEvent = {
        eventId,
        authId,
        type: eventType,
        verified: true,
        idempotencyKey: `${authId || eventId}:${eventType}`
      };

      console.log('[SECURITY] HMAC verified successfully:', {
        eventType,
        eventId: eventId.slice(0, 8) + '...',
        timestamp: webhookTime
      });

      next();
    } catch (error) {
      console.error('[SECURITY] HMAC verification error:', error);
      return res.status(401).json({ 
        error: 'Authentication failed',
        code: 'HMAC_ERROR' 
      });
    }
  };
}

/**
 * Idempotency middleware
 * Prevents duplicate processing of same event
 */
export function idempotencyMiddleware() {
  return (req: LithicWebhookRequest, res: Response, next: NextFunction) => {
    if (!req.lithicEvent) {
      return res.status(500).json({ 
        error: 'Security middleware not configured properly',
        code: 'MISSING_EVENT_DATA' 
      });
    }

    const { idempotencyKey, eventId, type } = req.lithicEvent;
    
    // Check if we've seen this before
    const cached = idempotencyCache.get(idempotencyKey);
    
    if (cached && cached.processed) {
      console.log('[IDEMPOTENCY] Duplicate event, returning cached response:', {
        eventId: eventId.slice(0, 8) + '...',
        type,
        originalTimestamp: new Date(cached.timestamp).toISOString()
      });
      
      // Return the same response we gave before
      return res.status(200).json({
        ...cached.decision,
        duplicate: true,
        original_timestamp: cached.timestamp
      });
    }

    // Store that we're processing this
    idempotencyCache.set(idempotencyKey, {
      decision: null,
      timestamp: Date.now(),
      processed: false
    });

    // Intercept response to cache it
    const originalJson = res.json.bind(res);
    res.json = function(data: any) {
      // Cache the decision
      idempotencyCache.set(idempotencyKey, {
        decision: data,
        timestamp: Date.now(),
        processed: true
      });
      
      console.log('[IDEMPOTENCY] Cached response for:', {
        eventId: eventId.slice(0, 8) + '...',
        type
      });
      
      return originalJson(data);
    };

    next();
  };
}

/**
 * Rate limiting for webhook endpoints
 */
export function webhookRateLimit() {
  const requestCounts = new Map<string, number[]>();
  
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || 'unknown';
    const now = Date.now();
    const windowMs = 60000; // 1 minute
    const maxRequests = 100; // 100 requests per minute
    
    // Get request history
    const requests = requestCounts.get(ip) || [];
    
    // Filter to only requests in current window
    const recentRequests = requests.filter(t => now - t < windowMs);
    
    if (recentRequests.length >= maxRequests) {
      console.warn('[RATE_LIMIT] Too many requests from:', ip);
      return res.status(429).json({ 
        error: 'Too many requests',
        code: 'RATE_LIMITED',
        retry_after: windowMs / 1000
      });
    }
    
    // Add current request
    recentRequests.push(now);
    requestCounts.set(ip, recentRequests);
    
    // Clean up old IPs periodically
    if (Math.random() < 0.01) { // 1% chance
      for (const [key, times] of requestCounts.entries()) {
        if (times.every(t => now - t > windowMs)) {
          requestCounts.delete(key);
        }
      }
    }
    
    next();
  };
}

/**
 * Extract webhook secret from environment
 */
export function getLithicWebhookSecret(): string {
  const secret = process.env.LITHIC_WEBHOOK_SECRET || process.env.LITHIC_API_KEY;
  
  if (!secret) {
    throw new Error('[SECURITY] LITHIC_WEBHOOK_SECRET not configured');
  }
  
  // Validate it looks like a valid secret
  if (secret.length < 32) {
    console.warn('[SECURITY] Webhook secret seems too short');
  }
  
  return secret;
} 