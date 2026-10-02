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
import { CreateUploadIntentDto } from './upload.dto.js';
import { UploadService } from './upload.service.js';

@Controller('households/:householdId/uploads')
@UseGuards(OidcAuthGuard)
export class UploadController {
  constructor(private readonly uploads: UploadService) {}

  @Post('intents')
  async createIntent(
    @Param('householdId', new ParseUUIDPipe()) householdId: string,
    @Body() input: CreateUploadIntentDto,
    @Req() request: AuthenticatedLifeOSRequest,
  ) {
    const identity = this.requireContext(request);
    const requestId = request.lifeosRequestId ?? 'unknown';

    return {
      data: await this.uploads.createIntent(identity, householdId, input, requestId),
      meta: {
        requestId,
        byteTransportConfigured: this.uploads.transportConfigured,
      },
    };
  }

  @Post(':uploadId/finalize')
  async finalize(
    @Param('householdId', new ParseUUIDPipe()) householdId: string,
    @Param('uploadId', new ParseUUIDPipe()) uploadId: string,
    @Req() request: AuthenticatedLifeOSRequest,
  ) {
    const identity = this.requireContext(request);
    const requestId = request.lifeosRequestId ?? 'unknown';

    return {
      data: await this.uploads.finalize(identity, householdId, uploadId, requestId),
      meta: {
        requestId,
        byteTransportConfigured: this.uploads.transportConfigured,
      },
    };
  }

  @Get()
  async list(
    @Param('householdId', new ParseUUIDPipe()) householdId: string,
    @Req() request: AuthenticatedLifeOSRequest,
  ) {
    const identity = this.requireContext(request);

    return {
      data: await this.uploads.list(identity, householdId),
      meta: { requestId: request.lifeosRequestId ?? 'unknown' },
    };
  }

  private requireContext(request: AuthenticatedLifeOSRequest) {
    if (!this.uploads.enabled) {
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
