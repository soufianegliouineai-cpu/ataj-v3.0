import {
  Controller,
  Get,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import {
  OidcAuthGuard,
  type AuthenticatedLifeOSRequest,
} from '../auth/oidc-auth.guard.js';
import { LIFEOS_API_VERSION } from '../constants.js';
import { HomeService } from './home.service.js';

@Controller('home')
@UseGuards(OidcAuthGuard)
export class HomeController {
  constructor(private readonly home: HomeService) {}

  @Get()
  async getHome(@Req() request: AuthenticatedLifeOSRequest) {
    if (!this.home.enabled) {
      throw new ServiceUnavailableException({
        code: 'PERSISTENCE_NOT_CONFIGURED',
        message: 'Persistent LifeOS storage is not configured for this deployment.',
      });
    }

    const identity = request.lifeosIdentity;
    if (!identity) {
      throw new ServiceUnavailableException({
        code: 'AUTH_CONTEXT_MISSING',
        message: 'Verified identity context is unavailable.',
      });
    }

    return {
      data: await this.home.summary(identity.userId),
      meta: {
        requestId: request.lifeosRequestId ?? 'unknown',
        version: LIFEOS_API_VERSION,
      },
    };
  }
}
