import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { OidcAuthService } from './oidc-auth.service.js';
import type { LifeOSIdentity } from './auth.types.js';

export type AuthenticatedLifeOSRequest = Request & {
  lifeosRequestId?: string;
  lifeosIdentity?: LifeOSIdentity;
};

@Injectable()
export class OidcAuthGuard implements CanActivate {
  constructor(private readonly auth: OidcAuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedLifeOSRequest>();
    request.lifeosIdentity = await this.auth.verifyAuthorizationHeader(
      request.header('authorization'),
    );
    return true;
  }
}
