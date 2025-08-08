/**
 * Authentication Routes
 */

import { Router } from 'express';
import { z } from 'zod';
import { db } from '../lib/db';
import { sendMagicLinkEmail, sendOtpEmail, sendWelcomeEmail } from '../lib/mailer';
import { signSession, verifySession } from '../lib/jwt';
import { startRegistration, finishRegistration } from '../lib/webauthn';
import { 
  tkCreateUserOrgAndWallet, 
  tkAddPasskeyAuthenticator,
  tkApplyUserPolicy 
} from '../lib/turnkey';
import crypto from 'crypto';

const router = Router();

const APP_URL = process.env.APP_URL || 'http://localhost:3000';

/**
 * Start email authentication flow
 * Sends both magic link and OTP
 */
router.post('/auth/email/start', async (req, res) => {
  try {
    const schema = z.object({
      email: z.string().email().toLowerCase(),
    });
    
    const { email } = schema.parse(req.body);
    
    // Get or create user
    let user = db.getUserByEmail(email);
    if (!user) {
      user = db.createUser(email);
    }
    
    // Create magic token
    const magicToken = db.createMagicToken(user.id, email);
    const magicLink = `${APP_URL}/auth/magic?token=${magicToken.token}`;
    
    // Create OTP
    const otp = db.createOtp(email);
    
    // Send emails
    await Promise.all([
      sendMagicLinkEmail(email, magicLink),
      sendOtpEmail(email, otp.code),
    ]);
    
    res.json({
      success: true,
      message: 'Check your email for sign-in link and verification code',
    });
  } catch (error: any) {
    console.error('[Auth] Email start error:', error);
    res.status(400).json({
      error: error.message || 'Failed to start authentication',
    });
  }
});

/**
 * Verify magic link or OTP
 */
router.post('/auth/email/verify', async (req, res) => {
  try {
    const schema = z.object({
      token: z.string().optional(),
      email: z.string().email().toLowerCase().optional(),
      code: z.string().optional(),
    });
    
    const { token, email, code } = schema.parse(req.body);
    
    let user;
    
    // Verify magic token
    if (token) {
      const magicToken = db.getMagicToken(token);
      if (!magicToken) {
        return res.status(400).json({ error: 'Invalid or expired token' });
      }
      
      user = db.getUserById(magicToken.userId);
      db.useMagicToken(token);
      
      // Mark email as verified
      if (user) {
        user = db.updateUser(user.id, { emailVerified: true });
      }
    }
    // Verify OTP
    else if (email && code) {
      const isValid = db.verifyOtp(email, code);
      if (!isValid) {
        return res.status(400).json({ error: 'Invalid or expired code' });
      }
      
      user = db.getUserByEmail(email);
      
      // Mark email as verified
      if (user) {
        user = db.updateUser(user.id, { emailVerified: true });
      }
    } else {
      return res.status(400).json({ error: 'Missing verification parameters' });
    }
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Create Turnkey org/wallet if not exists
    if (!user.turnkeyOrgId) {
      console.log('[Auth] Creating Turnkey org/wallet for user:', user.id);
      const turnkey = await tkCreateUserOrgAndWallet(user.email, user.id);
      
      user = db.updateUser(user.id, {
        turnkeyOrgId: turnkey.orgId,
        turnkeyWalletId: turnkey.walletId,
        turnkeyUserId: turnkey.userId,
        solanaAddress: turnkey.pubkey,
      });
    }
    
    // Generate device ID
    const deviceId = crypto.randomBytes(16).toString('hex');
    
    // Create session
    const session = db.createSession(user.id, deviceId, user.passkeyBound);
    
    // Prepare WebAuthn registration if not bound
    let webauthnOptions;
    if (!user.passkeyBound) {
      webauthnOptions = await startRegistration(
        user.id,
        user.email,
        user.passkeyCredentialId ? [user.passkeyCredentialId] : []
      );
      
      // Store challenge
      db.createChallenge(user.id, webauthnOptions.challenge);
    }
    
    // Sign JWT
    const sessionToken = signSession({
      uid: user.id,
      email: user.email,
      passkeyBound: user.passkeyBound,
      orgId: user.turnkeyOrgId,
      walletId: user.turnkeyWalletId,
    });
    
    res.json({
      success: true,
      sessionToken,
      sessionId: session.id,
      user: {
        id: user.id,
        email: user.email,
        solanaAddress: user.solanaAddress,
        passkeyBound: user.passkeyBound,
        kycStatus: user.kycStatus,
      },
      turnkey: {
        orgId: user.turnkeyOrgId,
        walletId: user.turnkeyWalletId,
      },
      needPasskey: !user.passkeyBound,
      webauthnOptions,
    });
  } catch (error: any) {
    console.error('[Auth] Email verify error:', error);
    res.status(400).json({
      error: error.message || 'Verification failed',
    });
  }
});

/**
 * Complete WebAuthn registration
 */
router.post('/auth/webauthn/register', async (req, res) => {
  try {
    const schema = z.object({
      userId: z.string(),
      credential: z.any(),
      deviceName: z.string().optional(),
    });
    
    const { userId, credential, deviceName } = schema.parse(req.body);
    
    // Get expected challenge
    const expectedChallenge = db.getChallenge(userId);
    if (!expectedChallenge) {
      return res.status(400).json({ error: 'No challenge found' });
    }
    
    // Verify registration
    const verification = await finishRegistration(expectedChallenge, credential);
    
    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: 'Registration verification failed' });
    }
    
    // Clean up challenge
    db.deleteChallenge(userId);
    
    // Get user
    const user = db.getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Store credential info
    const credentialId = Buffer.from(verification.registrationInfo.credentialID).toString('base64');
    const publicKey = Buffer.from(verification.registrationInfo.credentialPublicKey).toString('base64');
    
    // Add authenticator to Turnkey
    if (user.turnkeyOrgId && user.turnkeyUserId) {
      await tkAddPasskeyAuthenticator(
        user.turnkeyOrgId,
        user.turnkeyUserId,
        deviceName || 'Primary Device',
        credentialId,
        publicKey
      );
      
      // Apply user policy now that passkey is bound
      await tkApplyUserPolicy(user.turnkeyOrgId, user.turnkeyWalletId!, '1.0.0');
    }
    
    // Update user
    const updatedUser = db.updateUser(userId, {
      passkeyBound: true,
      passkeyCredentialId: credentialId,
      passkeyPublicKey: publicKey,
    });
    
    // Create new session with passkey bound
    const deviceId = crypto.randomBytes(16).toString('hex');
    const session = db.createSession(userId, deviceId, true);
    
    // Sign new JWT with passkey bound
    const sessionToken = signSession({
      uid: userId,
      email: updatedUser!.email,
      passkeyBound: true,
      orgId: updatedUser!.turnkeyOrgId,
      walletId: updatedUser!.turnkeyWalletId,
    });
    
    // Send welcome email
    if (updatedUser!.solanaAddress) {
      await sendWelcomeEmail(updatedUser!.email, updatedUser!.solanaAddress);
    }
    
    res.json({
      success: true,
      sessionToken,
      sessionId: session.id,
      message: 'Passkey successfully registered',
    });
  } catch (error: any) {
    console.error('[Auth] WebAuthn register error:', error);
    res.status(400).json({
      error: error.message || 'Registration failed',
    });
  }
});

/**
 * Get current session info
 */
router.get('/auth/session', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const token = authHeader.split(' ')[1];
    const payload = verifySession(token);
    
    const user = db.getUserById(payload.uid);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      user: {
        id: user.id,
        email: user.email,
        solanaAddress: user.solanaAddress,
        passkeyBound: user.passkeyBound,
        kycStatus: user.kycStatus,
      },
      turnkey: {
        orgId: user.turnkeyOrgId,
        walletId: user.turnkeyWalletId,
      },
    });
  } catch (error: any) {
    console.error('[Auth] Session error:', error);
    res.status(401).json({ error: 'Invalid session' });
  }
});

/**
 * Sign out
 */
router.post('/auth/signout', async (req, res) => {
  // In production, you'd invalidate the session in database
  res.json({ success: true });
});

export default router; 