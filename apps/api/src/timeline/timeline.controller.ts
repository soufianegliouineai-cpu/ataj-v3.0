import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import {
  OidcAuthGuard,
  type AuthenticatedLifeOSRequest,
} from '../auth/oidc-auth.guard.js';
import { LIFEOS_API_VERSION } from '../constants.js';
import { TimelineService } from './timeline.service.js';

@Controller('households/:householdId/timeline')
@UseGuards(OidcAuthGuard)
export class TimelineController {
  constructor(private readonly timeline: TimelineService) {}

  @Get()
  async getTimeline(
    @Param('householdId', new ParseUUIDPipe()) householdId: string,
    @Req() request: AuthenticatedLifeOSRequest,
  ) {
    if (!this.timeline.enabled) {
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
      data: await this.timeline.forHousehold(identity.userId, householdId),
      meta: {
        requestId: request.lifeosRequestId ?? 'unknown',
        version: LIFEOS_API_VERSION,
      },
    };
  }
}
