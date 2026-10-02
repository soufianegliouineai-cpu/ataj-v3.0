import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  createRemoteJWKSet,
  jwtVerify,
  type RemoteJWKSet,
} from 'jose';
import type { LifeOSIdentity } from './auth.types.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class OidcAuthService {
  private readonly issuer = process.env.OIDC_ISSUER?.trim() || null;
  private readonly audience = process.env.OIDC_AUDIENCE?.trim() || null;
  private readonly jwksUrl = process.env.OIDC_JWKS_URL?.trim() || null;
  private readonly userIdClaim = process.env.OIDC_USER_ID_CLAIM?.trim() || 'sub';
  private readonly allowedAlgorithms = (process.env.OIDC_ALLOWED_ALGS ?? 'RS256,ES256')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  private readonly jwks: RemoteJWKSet | null;

  constructor() {
    this.jwks = this.createJwksResolver();
  }

  get enabled() {
    return Boolean(this.issuer && this.audience && this.jwksUrl && this.jwks);
  }

  async verifyAuthorizationHeader(header?: string): Promise<LifeOSIdentity> {
    if (!this.enabled || !this.jwks || !this.issuer || !this.audience) {
      throw new ServiceUnavailableException({
        code: 'AUTH_NOT_CONFIGURED',
        message: 'OIDC authentication is not configured for this deployment.',
      });
    }

    const token = parseBearerToken(header);

    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: this.issuer,
        audience: this.audience,
        algorithms: this.allowedAlgorithms,
        requiredClaims: ['sub', 'exp', 'iat'],
        clockTolerance: 5,
      });

      const rawUserId = payload[this.userIdClaim];
      if (typeof rawUserId !== 'string' || !UUID_PATTERN.test(rawUserId)) {
        throw new UnauthorizedException({
          code: 'INVALID_USER_ID_CLAIM',
          message: `Verified token is missing a UUID claim at "${this.userIdClaim}".`,
        });
      }

      if (typeof payload.sub !== 'string' || !payload.sub) {
        throw new UnauthorizedException({
          code: 'INVALID_ACCESS_TOKEN',
          message: 'Verified access token is missing subject identity.',
        });
      }

      return {
        userId: rawUserId,
        subject: payload.sub,
        issuer: this.issuer,
        audience: payload.aud ?? this.audience,
        claims: payload,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;

      throw new UnauthorizedException({
        code: 'INVALID_ACCESS_TOKEN',
        message: 'Access token verification failed.',
      });
    }
  }

  private createJwksResolver(): RemoteJWKSet | null {
    if (!this.jwksUrl) return null;

    let url: URL;
    try {
      url = new URL(this.jwksUrl);
    } catch {
      throw new Error('OIDC_JWKS_URL must be a valid URL');
    }

    const localhost =
      url.hostname === '127.0.0.1'
      || url.hostname === 'localhost'
      || url.hostname === '::1';

    if (url.protocol !== 'https:' && !(localhost && url.protocol === 'http:')) {
      throw new Error('OIDC_JWKS_URL must use HTTPS outside localhost test environments');
    }

    return createRemoteJWKSet(url, {
      cacheMaxAge: 10 * 60 * 1000,
      cooldownDuration: 30 * 1000,
      timeoutDuration: 5 * 1000,
    });
  }
}

function parseBearerToken(header?: string) {
  if (!header) {
    throw new UnauthorizedException({
      code: 'AUTH_REQUIRED',
      message: 'Bearer access token is required.',
    });
  }

  const match = /^Bearer\s+([^\s]+)$/i.exec(header.trim());
  if (!match?.[1]) {
    throw new UnauthorizedException({
      code: 'AUTH_REQUIRED',
      message: 'Authorization header must use the Bearer scheme.',
    });
  }

  return match[1];
}
