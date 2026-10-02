import { Controller, Get } from '@nestjs/common';
import { LIFEOS_API_VERSION } from './constants.js';
import { OidcAuthService } from './auth/oidc-auth.service.js';
import { DatabaseService } from './database/database.service.js';

@Controller()
export class HealthController {
  constructor(
    private readonly database: DatabaseService,
    private readonly auth: OidcAuthService,
  ) {}

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
  async readiness() {
    const database = this.database.enabled
      ? await this.database.ping().catch(() => ({ enabled: true, ok: false }))
      : { enabled: false, ok: false };

    return {
      ready: true,
      service: 'lifeos-api',
      version: LIFEOS_API_VERSION,
      capabilities: {
        deterministicRules: 'ready',
        provenance: 'ready',
        idempotency: 'ready',
        genericExpiryProtection: 'ready',
        postgresSchema: 'tested',
        persistence: database.ok ? 'ready' : database.enabled ? 'degraded' : 'not_configured',
        authentication: this.auth.enabled ? 'ready' : 'not_configured',
        persistentProtection: this.auth.enabled && database.ok
          ? 'ready'
          : this.auth.enabled && database.enabled
            ? 'degraded'
            : 'not_configured',
        uploadMetadata: database.ok ? 'ready' : database.enabled ? 'degraded' : 'not_configured',
        byteTransport: 'not_configured',
        malwareScanning: 'not_configured',
        ocrExtraction: 'not_enabled',
        jurisdictionRules: 'not_enabled',
      },
      dependencies: {
        database,
        oidc: {
          configured: this.auth.enabled,
        },
      },
    };
  }

  @Get('version')
  version() {
    return { service: 'lifeos-api', version: LIFEOS_API_VERSION, runtime: 'nestjs' };
  }
}
