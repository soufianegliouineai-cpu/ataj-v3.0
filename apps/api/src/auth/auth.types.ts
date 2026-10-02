import type { JWTPayload } from 'jose';

export interface LifeOSIdentity {
  userId: string;
  subject: string;
  issuer: string;
  audience: string | string[];
  claims: JWTPayload;
}
