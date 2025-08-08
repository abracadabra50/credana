/**
 * Auth System Types
 */

export interface User {
  id: string;
  email: string;
  emailVerified: boolean;
  kycStatus: 'none' | 'pending' | 'passed' | 'failed';
  turnkeyOrgId?: string;
  turnkeyWalletId?: string;
  turnkeyUserId?: string;
  solanaAddress?: string;
  passkeyBound: boolean;
  passkeyCredentialId?: string;
  passkeyPublicKey?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Session {
  id: string;
  userId: string;
  deviceId: string;
  passkeyBound: boolean;
  expiresAt: Date;
  createdAt: Date;
}

export interface MagicToken {
  token: string;
  userId: string;
  email: string;
  expiresAt: Date;
  used: boolean;
}

export interface OtpCode {
  email: string;
  code: string;
  attempts: number;
  expiresAt: Date;
}

export interface WebAuthnChallenge {
  userId: string;
  challenge: string;
  expiresAt: Date;
}

export interface JWTPayload {
  uid: string;
  email: string;
  passkeyBound: boolean;
  orgId?: string;
  walletId?: string;
  iat?: number;
  exp?: number;
} 