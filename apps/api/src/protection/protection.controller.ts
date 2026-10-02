import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  OidcAuthGuard,
  type AuthenticatedLifeOSRequest,
} from '../auth/oidc-auth.guard.js';
import {
  LIFEOS_API_VERSION,
  SUPPORTED_DOCUMENT_TYPES,
} from '../constants.js';
import { ExpiryProtectionDto } from './protection.dto.js';
import { PersistExpiryProtectionDto } from './persist-expiry.dto.js';
import { ProtectionRepository } from './protection.repository.js';
import { ProtectionService } from './protection.service.js';

type LifeOSRequest = Request & { lifeosRequestId?: string };

@Controller()
export class ProtectionController {
  constructor(
    private readonly protectionService: ProtectionService,
    private readonly protectionRepository: ProtectionRepository,
  ) {}

  @Get('document-types')
  documentTypes(@Req() request: LifeOSRequest) {
    return {
      data: SUPPORTED_DOCUMENT_TYPES,
      meta: {
        requestId: request.lifeosRequestId ?? 'unknown',
        version: LIFEOS_API_VERSION,
      },
    };
  }

  @Post('households/:householdId/protection/expiry')
  @UseGuards(OidcAuthGuard)
  @HttpCode(201)
  async persistProtection(
    @Param('householdId', new ParseUUIDPipe()) householdId: string,
    @Body() input: PersistExpiryProtectionDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedLifeOSRequest,
  ) {
    if (!this.protectionRepository.enabled) {
      throw new ServiceUnavailableException({
        code: 'PERSISTENCE_NOT_CONFIGURED',
        message: 'Persistent LifeOS storage is not configured for this deployment.',
      });
    }

    const normalizedKey = idempotencyKey?.trim();
    if (!normalizedKey) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency-Key is required for persistent protection writes.',
      });
    }
    if (normalizedKey.length > 200) {
      throw new BadRequestException({
        code: 'INVALID_IDEMPOTENCY_KEY',
        message: 'Idempotency-Key must be 200 characters or fewer.',
      });
    }

    const identity = request.lifeosIdentity;
    if (!identity) {
      throw new ServiceUnavailableException({
        code: 'AUTH_CONTEXT_MISSING',
        message: 'Verified identity context is unavailable.',
      });
    }

    const result = this.protectionService.protect(
      input.documentType,
      input.expiryDate,
      input.leadDays ?? 90,
      normalizedKey,
    );

    const persisted = await this.protectionRepository.persistExpiryProtection({
      userId: identity.userId,
      householdId,
      personId: input.personId ?? null,
      documentType: input.documentType,
      expiryDate: input.expiryDate,
      leadDays: input.leadDays ?? 90,
      idempotencyKey: normalizedKey,
      requestId: request.lifeosRequestId ?? 'unknown',
      result,
    });

    return {
      data: persisted.data,
      meta: {
        requestId: request.lifeosRequestId ?? 'unknown',
        version: LIFEOS_API_VERSION,
        idempotent: true,
        replayed: persisted.replayed,
        persisted: true,
      },
    };
  }

  @Post('protection/expiry')
  protect(
    @Body() input: ExpiryProtectionDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: LifeOSRequest,
  ) {
    const normalizedKey = idempotencyKey?.trim();
    if (normalizedKey && normalizedKey.length > 200) {
      throw new BadRequestException({
        code: 'INVALID_IDEMPOTENCY_KEY',
        message: 'Idempotency-Key must be 200 characters or fewer.',
      });
    }

    const data = this.protectionService.protect(
      input.documentType,
      input.expiryDate,
      input.leadDays ?? 90,
      normalizedKey || undefined,
    );

    return {
      data,
      meta: {
        requestId: request.lifeosRequestId ?? 'unknown',
        version: LIFEOS_API_VERSION,
        idempotent: Boolean(normalizedKey),
      },
    };
  }
}
