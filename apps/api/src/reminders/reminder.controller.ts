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
import { ReminderService } from './reminder.service.js';

@Controller('reminders')
@UseGuards(OidcAuthGuard)
export class ReminderController {
  constructor(private readonly reminders: ReminderService) {}

  @Get()
  async list(@Req() request: AuthenticatedLifeOSRequest) {
    if (!this.reminders.enabled) {
      throw new ServiceUnavailableException({
        code: 'PERSISTENCE_NOT_CONFIGURED',
        message: 'Persistent LifeOS storage is not configured for this deployment.',
      });
    }

    if (!request.lifeosIdentity) {
      throw new ServiceUnavailableException({
        code: 'AUTH_CONTEXT_MISSING',
        message: 'Verified identity context is unavailable.',
      });
    }

    return {
      data: await this.reminders.list(request.lifeosIdentity),
      meta: { requestId: request.lifeosRequestId ?? 'unknown' },
    };
  }
}
