import { Request, Response } from 'express';
import Stripe from 'stripe';
import { z } from 'zod';
import { logger } from '../../utils/logger';
import { redis } from '../../config/redis';
import { db } from '../../config/database';
import { checkHealthFactor } from '../auth/authorization-service';
import { queueRecordDebt } from '../blockchain/transaction-queue';
import { recordMetrics } from '../../utils/metrics';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-08-16',
});

// Validation schemas
const AuthorizationRequestSchema = z.object({
  amount: z.number(),
  currency: z.string(),
  merchant_data: z.object({
    name: z.string().optional(),
    category: z.string().optional(),
    country: z.string().optional(),
  }),
  card: z.object({
    id: z.string(),
  }),
});

export class StripeWebhookHandler {
  /**
   * Main webhook handler for all Stripe Issuing events
   * CRITICAL: Must respond within 500ms for authorization requests
   */
  async handleWebhook(req: Request, res: Response): Promise<void> {
    const startTime = Date.now();
    let event: Stripe.Event;

    try {
      // Verify webhook signature
      const signature = req.headers['stripe-signature'] as string;
      event = stripe.webhooks.constructEvent(
        req.body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
    } catch (err) {
      logger.error('Webhook signature verification failed', { error: err });
      res.status(400).send('Webhook Error: Invalid signature');
      return;
    }

    // Handle different event types
    try {
      switch (event.type) {
        case 'issuing_authorization.request':
          await this.handleAuthorizationRequest(event, res);
          break;
        
        case 'issuing_authorization.updated':
          await this.handleAuthorizationUpdate(event);
          res.status(200).send('OK');
          break;
        
        case 'issuing_transaction.created':
          await this.handleTransactionCreated(event);
          res.status(200).send('OK');
          break;
        
        default:
          logger.info('Unhandled webhook event type', { type: event.type });
          res.status(200).send('OK');
      }
    } catch (error) {
      logger.error('Error handling webhook', { 
        error, 
        eventType: event.type,
        eventId: event.id 
      });
      
      // For authorization requests, must still respond
      if (event.type === 'issuing_authorization.request') {
        res.status(200).json({ approved: false });
      } else {
        res.status(500).send('Internal Server Error');
      }
    }

    // Record metrics
    const latency = Date.now() - startTime;
    recordMetrics('stripe.webhook.latency', latency, { event_type: event.type });
  }

  /**
   * Handle real-time authorization requests
   * Must approve/decline within 500ms
   */
  private async handleAuthorizationRequest(
    event: Stripe.Event,
    res: Response
  ): Promise<void> {
    const authorization = event.data.object as Stripe.Issuing.Authorization;
    const startTime = Date.now();

    try {
      // Validate authorization data
      const validatedData = AuthorizationRequestSchema.parse({
        amount: authorization.amount,
        currency: authorization.currency,
        merchant_data: authorization.merchant_data,
        card: authorization.card,
      });

      // Get card and user info from cache (1-2ms)
      const cardKey = `card:${validatedData.card.id}`;
      const cachedCard = await redis.get(cardKey);
      
      if (!cachedCard) {
        logger.warn('Card not found in cache', { cardId: validatedData.card.id });
        res.status(200).json({ approved: false });
        return;
      }

      const { userId, cardId } = JSON.parse(cachedCard);

      // Get user position from cache (1-2ms)
      const positionKey = `position:${userId}`;
      const cachedPosition = await redis.get(positionKey);
      
      if (!cachedPosition) {
        logger.warn('Position not found in cache', { userId });
        res.status(200).json({ approved: false });
        return;
      }

      const position = JSON.parse(cachedPosition);

      // Check if authorization would be healthy
      const authDecision = await checkHealthFactor({
        currentDebt: position.debt_usdc,
        collateralAmount: position.collateral_amount,
        collateralPrice: position.collateral_price,
        newDebtAmount: validatedData.amount / 100, // Convert cents to dollars
        liquidationThreshold: position.liquidation_threshold_bps,
      });

      // Log decision for audit
      await this.logAuthorizationDecision({
        userId,
        cardId,
        authorizationId: authorization.id,
        amount: validatedData.amount,
        approved: authDecision.approved,
        healthFactor: authDecision.healthFactor,
        reason: authDecision.reason,
        merchantName: validatedData.merchant_data.name,
        latency: Date.now() - startTime,
      });

      // Respond to Stripe
      res.status(200).json({ 
        approved: authDecision.approved,
        metadata: {
          health_factor: authDecision.healthFactor.toString(),
          decline_reason: authDecision.reason,
        }
      });

      // Record metrics
      recordMetrics('stripe.authorization.response_time', Date.now() - startTime);
      recordMetrics('stripe.authorization.decision', 1, {
        approved: authDecision.approved.toString(),
        reason: authDecision.reason || 'approved',
      });

    } catch (error) {
      logger.error('Error in authorization request', { error, authId: authorization.id });
      
      // Must respond even on error
      res.status(200).json({ approved: false });
      
      recordMetrics('stripe.authorization.error', 1);
    }
  }

  /**
   * Handle authorization updates (approvals/declines)
   */
  private async handleAuthorizationUpdate(event: Stripe.Event): Promise<void> {
    const authorization = event.data.object as Stripe.Issuing.Authorization;

    try {
      // Update our records
      await db.query(
        `UPDATE card_events 
         SET status = $1, approved = $2, decline_reason = $3
         WHERE stripe_event_id = $4`,
        [
          authorization.status === 'closed' && authorization.approved ? 'completed' : 'failed',
          authorization.approved,
          authorization.request_history?.[0]?.reason || null,
          authorization.id,
        ]
      );

      // If approved and captured, queue blockchain transaction
      if (authorization.approved && authorization.status === 'closed') {
        const cardResult = await db.query(
          'SELECT user_id FROM cards WHERE stripe_card_id = $1',
          [authorization.card.id]
        );

        if (cardResult.rows.length > 0) {
          await queueRecordDebt({
            userId: cardResult.rows[0].user_id,
            amount: authorization.amount / 100, // Convert to dollars
            authorizationId: authorization.id,
            merchantName: authorization.merchant_data.name || undefined,
          });
        }
      }

      recordMetrics('stripe.authorization.updated', 1, {
        status: authorization.status,
        approved: authorization.approved.toString(),
      });

    } catch (error) {
      logger.error('Error handling authorization update', { 
        error, 
        authId: authorization.id 
      });
    }
  }

  /**
   * Handle transaction creation (captures, refunds)
   */
  private async handleTransactionCreated(event: Stripe.Event): Promise<void> {
    const transaction = event.data.object as Stripe.Issuing.Transaction;

    try {
      // Get user info
      const cardResult = await db.query(
        'SELECT id, user_id FROM cards WHERE stripe_card_id = $1',
        [transaction.card]
      );

      if (cardResult.rows.length === 0) {
        logger.warn('Card not found for transaction', { 
          cardId: transaction.card,
          transactionId: transaction.id 
        });
        return;
      }

      const { id: cardId, user_id: userId } = cardResult.rows[0];

      // Record transaction
      await db.query(
        `INSERT INTO card_events 
         (user_id, card_id, stripe_event_id, type, amount, currency, 
          merchant_name, merchant_category, merchant_country, status, approved)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          userId,
          cardId,
          transaction.id,
          this.mapTransactionType(transaction.type),
          Math.abs(transaction.amount) / 100, // Convert to dollars
          transaction.currency.toUpperCase(),
          transaction.merchant_data?.name,
          transaction.merchant_data?.category,
          transaction.merchant_data?.country,
          'completed',
          true,
        ]
      );

      // Award points for spending
      if (transaction.type === 'capture' && transaction.amount < 0) {
        await this.awardSpendingPoints({
          userId,
          amount: Math.abs(transaction.amount) / 100,
          merchantCategory: transaction.merchant_data?.category,
        });
      }

      // Handle refunds
      if (transaction.type === 'refund') {
        await this.handleRefund({
          userId,
          amount: Math.abs(transaction.amount) / 100,
          transactionId: transaction.id,
        });
      }

      recordMetrics('stripe.transaction.created', 1, {
        type: transaction.type,
        currency: transaction.currency,
      });

    } catch (error) {
      logger.error('Error handling transaction created', { 
        error, 
        transactionId: transaction.id 
      });
    }
  }

  /**
   * Log authorization decision for audit trail
   */
  private async logAuthorizationDecision(data: {
    userId: string;
    cardId: string;
    authorizationId: string;
    amount: number;
    approved: boolean;
    healthFactor: number;
    reason?: string;
    merchantName?: string;
    latency: number;
  }): Promise<void> {
    try {
      // Store in database
      await db.query(
        `INSERT INTO card_events 
         (user_id, card_id, stripe_event_id, type, amount, currency, 
          merchant_name, status, health_factor_at_auth, approved, decline_reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          data.userId,
          data.cardId,
          data.authorizationId,
          'authorization_request',
          data.amount / 100, // Convert to dollars
          'USD',
          data.merchantName,
          data.approved ? 'completed' : 'failed',
          data.healthFactor,
          data.approved,
          data.reason,
        ]
      );

      // Also log to audit trail
      await db.query(
        `INSERT INTO audit_logs 
         (user_id, action, entity_type, entity_id, changes)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          data.userId,
          'card_authorization',
          'authorization',
          data.authorizationId,
          JSON.stringify({
            amount: data.amount,
            approved: data.approved,
            health_factor: data.healthFactor,
            latency_ms: data.latency,
            merchant: data.merchantName,
          }),
        ]
      );
    } catch (error) {
      logger.error('Error logging authorization decision', { error });
      // Don't throw - this is not critical for authorization
    }
  }

  /**
   * Award points for card spending
   */
  private async awardSpendingPoints(data: {
    userId: string;
    amount: number;
    merchantCategory?: string;
  }): Promise<void> {
    try {
      // Calculate points with multipliers
      let multiplier = 1.0;
      if (data.merchantCategory) {
        // Apply category multipliers
        if (data.merchantCategory.includes('crypto')) multiplier = 5.0;
        else if (data.merchantCategory.includes('tech')) multiplier = 3.0;
        else if (data.merchantCategory.includes('travel')) multiplier = 2.0;
      }

      const points = Math.floor(data.amount * multiplier);

      // Record points transaction
      await db.query(
        `INSERT INTO points_transactions 
         (user_id, type, amount, multiplier, description)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          data.userId,
          'spending',
          points,
          multiplier,
          `Card spending: $${data.amount.toFixed(2)}`,
        ]
      );

      // Update points balance
      await db.query(
        `INSERT INTO points_balances (user_id, total_earned, current_balance)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id) 
         DO UPDATE SET 
           total_earned = points_balances.total_earned + $2,
           current_balance = points_balances.current_balance + $3,
           updated_at = CURRENT_TIMESTAMP`,
        [data.userId, points, points]
      );

      logger.info('Points awarded for spending', { 
        userId: data.userId, 
        points, 
        amount: data.amount 
      });

    } catch (error) {
      logger.error('Error awarding spending points', { error });
      // Don't throw - points are not critical
    }
  }

  /**
   * Handle refund processing
   */
  private async handleRefund(data: {
    userId: string;
    amount: number;
    transactionId: string;
  }): Promise<void> {
    try {
      // Queue blockchain transaction to reduce debt
      await queueRecordDebt({
        userId: data.userId,
        amount: -data.amount, // Negative amount for refund
        authorizationId: data.transactionId,
        merchantName: 'Refund',
      });

      logger.info('Refund processed', { 
        userId: data.userId, 
        amount: data.amount 
      });

    } catch (error) {
      logger.error('Error handling refund', { error });
    }
  }

  /**
   * Map Stripe transaction types to our types
   */
  private mapTransactionType(stripeType: string): string {
    const typeMap: Record<string, string> = {
      'capture': 'capture',
      'refund': 'refund',
      'void': 'void',
      'dispute': 'dispute',
    };
    return typeMap[stripeType] || 'other';
  }
}

// Export singleton instance
export const stripeWebhookHandler = new StripeWebhookHandler(); 