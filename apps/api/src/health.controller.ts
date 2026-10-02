import { Controller, Get } from '@nestjs/common';
import { LIFEOS_API_VERSION } from './constants.js';

@Controller()
export class HealthController {
  @Get('health')
  health() {
    return {
      ok: true,
      service: 'lifeos-api',
      version: LIFEOS_API_VERSION,
      runtime: 'nestjs',
      architecture: 'modular-monolith',
    };
  }

  @Get('readiness')
  readiness() {
    return {
      ready: true,
      service: 'lifeos-api',
      version: LIFEOS_API_VERSION,
      capabilities: {
        deterministicRules: 'ready',
        provenance: 'ready',
        idempotency: 'ready',
        genericExpiryProtection: 'ready',
        postgresSchema: 'tested_not_attached',
        persistence: 'not_enabled',
        authentication: 'not_enabled',
        ocrExtraction: 'not_enabled',
        jurisdictionRules: 'not_enabled',
      },
    };
  }

  @Get('version')
  version() {
    return { service: 'lifeos-api', version: LIFEOS_API_VERSION, runtime: 'nestjs' };
  }
}
