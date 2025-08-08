/**
 * In-Memory Database for MVP
 * Replace with PostgreSQL/Prisma for production
 */

import type { User, Session, MagicToken, OtpCode, WebAuthnChallenge } from '../types';

class InMemoryDB {
  users = new Map<string, User>();
  usersByEmail = new Map<string, string>();
  sessions = new Map<string, Session>();
  magicTokens = new Map<string, MagicToken>();
  otpCodes = new Map<string, OtpCode>();
  webauthnChallenges = new Map<string, WebAuthnChallenge>();

  // User operations
  createUser(email: string): User {
    const user: User = {
      id: `user_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      email: email.toLowerCase(),
      emailVerified: false,
      kycStatus: 'none',
      passkeyBound: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.set(user.id, user);
    this.usersByEmail.set(email.toLowerCase(), user.id);
    return user;
  }

  getUserById(id: string): User | undefined {
    return this.users.get(id);
  }

  getUserByEmail(email: string): User | undefined {
    const userId = this.usersByEmail.get(email.toLowerCase());
    return userId ? this.users.get(userId) : undefined;
  }

  updateUser(id: string, updates: Partial<User>): User | undefined {
    const user = this.users.get(id);
    if (!user) return undefined;
    
    const updated = {
      ...user,
      ...updates,
      updatedAt: new Date(),
    };
    this.users.set(id, updated);
    return updated;
  }

  // Session operations
  createSession(userId: string, deviceId: string, passkeyBound: boolean): Session {
    const session: Session = {
      id: `sess_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      userId,
      deviceId,
      passkeyBound,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      createdAt: new Date(),
    };
    this.sessions.set(session.id, session);
    return session;
  }

  getSession(id: string): Session | undefined {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    if (session.expiresAt < new Date()) {
      this.sessions.delete(id);
      return undefined;
    }
    return session;
  }

  // Magic token operations
  createMagicToken(userId: string, email: string): MagicToken {
    const token: MagicToken = {
      token: `magic_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      userId,
      email,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      used: false,
    };
    this.magicTokens.set(token.token, token);
    return token;
  }

  getMagicToken(token: string): MagicToken | undefined {
    const magicToken = this.magicTokens.get(token);
    if (!magicToken) return undefined;
    if (magicToken.expiresAt < new Date() || magicToken.used) {
      this.magicTokens.delete(token);
      return undefined;
    }
    return magicToken;
  }

  useMagicToken(token: string): boolean {
    const magicToken = this.getMagicToken(token);
    if (!magicToken) return false;
    magicToken.used = true;
    this.magicTokens.set(token, magicToken);
    return true;
  }

  // OTP operations
  createOtp(email: string): OtpCode {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const otp: OtpCode = {
      email: email.toLowerCase(),
      code,
      attempts: 0,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    };
    this.otpCodes.set(email.toLowerCase(), otp);
    return otp;
  }

  verifyOtp(email: string, code: string): boolean {
    const otp = this.otpCodes.get(email.toLowerCase());
    if (!otp) return false;
    
    if (otp.expiresAt < new Date() || otp.attempts >= 3) {
      this.otpCodes.delete(email.toLowerCase());
      return false;
    }
    
    otp.attempts++;
    
    if (otp.code === code) {
      this.otpCodes.delete(email.toLowerCase());
      return true;
    }
    
    this.otpCodes.set(email.toLowerCase(), otp);
    return false;
  }

  // WebAuthn challenge operations
  createChallenge(userId: string, challenge: string): void {
    const webauthnChallenge: WebAuthnChallenge = {
      userId,
      challenge,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    };
    this.webauthnChallenges.set(userId, webauthnChallenge);
  }

  getChallenge(userId: string): string | undefined {
    const challenge = this.webauthnChallenges.get(userId);
    if (!challenge) return undefined;
    if (challenge.expiresAt < new Date()) {
      this.webauthnChallenges.delete(userId);
      return undefined;
    }
    return challenge.challenge;
  }

  deleteChallenge(userId: string): void {
    this.webauthnChallenges.delete(userId);
  }

  // Cleanup expired entries
  cleanup(): void {
    const now = new Date();
    
    for (const [id, session] of this.sessions) {
      if (session.expiresAt < now) {
        this.sessions.delete(id);
      }
    }
    
    for (const [token, magicToken] of this.magicTokens) {
      if (magicToken.expiresAt < now || magicToken.used) {
        this.magicTokens.delete(token);
      }
    }
    
    for (const [email, otp] of this.otpCodes) {
      if (otp.expiresAt < now || otp.attempts >= 3) {
        this.otpCodes.delete(email);
      }
    }
    
    for (const [userId, challenge] of this.webauthnChallenges) {
      if (challenge.expiresAt < now) {
        this.webauthnChallenges.delete(userId);
      }
    }
  }
}

export const db = new InMemoryDB();

// Run cleanup every minute
setInterval(() => db.cleanup(), 60 * 1000); 