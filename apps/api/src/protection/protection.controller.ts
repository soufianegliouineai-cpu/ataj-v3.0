import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  LIFEOS_API_VERSION,
  SUPPORTED_DOCUMENT_TYPES,
} from '../constants.js';
import { ExpiryProtectionDto } from './protection.dto.js';
import { ProtectionService } from './protection.service.js';

type LifeOSRequest = Request & { lifeosRequestId?: string };

@Controller()
export class ProtectionController {
  constructor(private readonly protectionService: ProtectionService) {}

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
