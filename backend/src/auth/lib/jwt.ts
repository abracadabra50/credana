/**
 * JWT Token Management
 */

import jwt from 'jsonwebtoken';
import type { JWTPayload } from '../types';

const SECRET = process.env.JWT_SECRET || 'dev_secret_change_in_production';
const ISSUER = process.env.ISSUER_URL || 'http://localhost:3001';

export function signSession(payload: Omit<JWTPayload, 'iat' | 'exp'>, ttlSeconds = 900): string {
  return jwt.sign(payload, SECRET, {
    expiresIn: ttlSeconds,
    issuer: ISSUER,
  });
}

export function verifySession(token: string): JWTPayload {
  return jwt.verify(token, SECRET, {
    issuer: ISSUER,
  }) as JWTPayload;
}

export function decodeSession(token: string): JWTPayload | null {
  try {
    return jwt.decode(token) as JWTPayload;
  } catch {
    return null;
  }
} 