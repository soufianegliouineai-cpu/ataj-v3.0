import {
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
import { ExtractionReviewService } from './extraction-review.service.js';

@Controller('households/:householdId/extractions')
@UseGuards(OidcAuthGuard)
export class ExtractionReviewController {
  constructor(private readonly reviews: ExtractionReviewService) {}

  @Get(':runId')
  async getRun(
    @Param('householdId', new ParseUUIDPipe()) householdId: string,
    @Param('runId', new ParseUUIDPipe()) runId: string,
    @Req() request: AuthenticatedLifeOSRequest,
  ) {
    const identity = this.requireContext(request);
    return {
      data: await this.reviews.getRun(identity, householdId, runId),
      meta: { requestId: request.lifeosRequestId ?? 'unknown' },
    };
  }

  @Post(':runId/fields/:fieldId/confirm')
  async confirmField(
    @Param('householdId', new ParseUUIDPipe()) householdId: string,
    @Param('runId', new ParseUUIDPipe()) runId: string,
    @Param('fieldId', new ParseUUIDPipe()) fieldId: string,
    @Req() request: AuthenticatedLifeOSRequest,
  ) {
    const identity = this.requireContext(request);
    return {
      data: await this.reviews.confirmField(
        identity,
        householdId,
        runId,
        fieldId,
        request.lifeosRequestId ?? 'unknown',
      ),
      meta: { requestId: request.lifeosRequestId ?? 'unknown' },
    };
  }

  private requireContext(request: AuthenticatedLifeOSRequest) {
    if (!this.reviews.enabled) {
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
