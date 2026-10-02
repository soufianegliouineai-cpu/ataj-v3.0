import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import {
  OidcAuthGuard,
  type AuthenticatedLifeOSRequest,
} from '../auth/oidc-auth.guard.js';
import { CreatePersonDto } from './person.dto.js';
import { PersonService } from './person.service.js';

@Controller('households/:householdId/people')
@UseGuards(OidcAuthGuard)
export class PersonController {
  constructor(private readonly people: PersonService) {}

  @Post()
  async create(
    @Param('householdId', new ParseUUIDPipe()) householdId: string,
    @Body() input: CreatePersonDto,
    @Req() request: AuthenticatedLifeOSRequest,
  ) {
    const identity = this.requireContext(request);

    return {
      data: await this.people.create(identity, householdId, input),
      meta: { requestId: request.lifeosRequestId ?? 'unknown' },
    };
  }

  @Get()
  async list(
    @Param('householdId', new ParseUUIDPipe()) householdId: string,
    @Req() request: AuthenticatedLifeOSRequest,
  ) {
    const identity = this.requireContext(request);

    return {
      data: await this.people.list(identity, householdId),
      meta: { requestId: request.lifeosRequestId ?? 'unknown' },
    };
  }

  private requireContext(request: AuthenticatedLifeOSRequest) {
    if (!this.people.enabled) {
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

    return request.lifeosIdentity;
  }
}
