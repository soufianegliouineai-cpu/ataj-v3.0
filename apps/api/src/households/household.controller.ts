import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import {
  OidcAuthGuard,
  type AuthenticatedLifeOSRequest,
} from '../auth/oidc-auth.guard.js';
import { CreateHouseholdDto } from './household.dto.js';
import { HouseholdService } from './household.service.js';

@Controller('households')
@UseGuards(OidcAuthGuard)
export class HouseholdController {
  constructor(private readonly households: HouseholdService) {}

  @Get()
  async list(@Req() request: AuthenticatedLifeOSRequest) {
    if (!this.households.enabled) {
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
      data: await this.households.list(identity.userId),
      meta: { requestId: request.lifeosRequestId ?? 'unknown' },
    };
  }

  @Post()
  async create(@Body() input: CreateHouseholdDto, @Req() request: AuthenticatedLifeOSRequest) {
    if (!this.households.enabled) {
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
      data: await this.households.create(identity, input),
      meta: { requestId: request.lifeosRequestId ?? 'unknown' },
    };
  }
}
