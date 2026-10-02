import {
  Controller,
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
import { DocumentProcessingService } from './document-processing.service.js';

@Controller('households/:householdId/uploads')
@UseGuards(OidcAuthGuard)
export class DocumentProcessingController {
  constructor(private readonly processing: DocumentProcessingService) {}

  @Post(':uploadId/process')
  async process(
    @Param('householdId', new ParseUUIDPipe()) householdId: string,
    @Param('uploadId', new ParseUUIDPipe()) uploadId: string,
    @Req() request: AuthenticatedLifeOSRequest,
  ) {
    if (!this.processing.enabled) {
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
      data: await this.processing.process(
        request.lifeosIdentity,
        householdId,
        uploadId,
        request.lifeosRequestId ?? 'unknown',
      ),
      meta: {
        requestId: request.lifeosRequestId ?? 'unknown',
        execution: 'synchronous_bootstrap',
      },
    };
  }
}
