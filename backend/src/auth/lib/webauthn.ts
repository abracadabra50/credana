/**
 * WebAuthn Server Implementation
 */

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type GenerateRegistrationOptionsOpts,
  type VerifiedRegistrationResponse,
  type VerifiedAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from '@simplewebauthn/types';

const RP_ID = process.env.RP_ID || 'localhost';
const RP_NAME = process.env.RP_NAME || 'Credana';
const ORIGIN = process.env.ORIGIN || 'http://localhost:3000';

export async function startRegistration(
  userId: string,
  userEmail: string,
  existingCredentialIds: string[] = []
) {
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: Buffer.from(userId),
    userName: userEmail,
    userDisplayName: userEmail.split('@')[0],
    attestationType: 'none',
    excludeCredentials: existingCredentialIds.map(id => ({
      id: Buffer.from(id, 'base64'),
      type: 'public-key',
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
      authenticatorAttachment: 'platform', // Prefer platform authenticators (Touch ID, Face ID, Windows Hello)
    },
    timeout: 60000,
  });

  return options;
}

export async function finishRegistration(
  expectedChallenge: string,
  response: RegistrationResponseJSON
): Promise<VerifiedRegistrationResponse> {
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedRPID: RP_ID,
    expectedOrigin: ORIGIN,
    requireUserVerification: false,
  });

  return verification;
}

export async function startAuthentication(
  credentialIds: string[] = []
) {
  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    allowCredentials: credentialIds.map(id => ({
      id: Buffer.from(id, 'base64'),
      type: 'public-key',
    })),
    userVerification: 'preferred',
    timeout: 60000,
  });

  return options;
}

export async function finishAuthentication(
  expectedChallenge: string,
  response: AuthenticationResponseJSON,
  expectedCredentialId: string,
  credentialPublicKey: string
): Promise<VerifiedAuthenticationResponse> {
  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedRPID: RP_ID,
    expectedOrigin: ORIGIN,
    requireUserVerification: false,
    authenticator: {
      credentialID: Buffer.from(expectedCredentialId, 'base64'),
      credentialPublicKey: Buffer.from(credentialPublicKey, 'base64'),
      counter: 0,
    },
  });

  return verification;
} 