import { Controller, Get } from '@nestjs/common';
import { LIFEOS_API_VERSION } from './constants.js';
import { OidcAuthService } from './auth/oidc-auth.service.js';
import { DatabaseService } from './database/database.service.js';
import { WorkerDatabaseService } from './database/worker-database.service.js';
import { DocumentIntelligenceService } from './ocr/document-intelligence.service.js';
import { NotificationDispatcherService } from './reminders/notification-dispatcher.service.js';
import { ReminderSchedulerService } from './reminders/reminder-scheduler.service.js';
import { MalwareScannerService } from './scanning/malware-scanner.service.js';
import { ObjectStorageService } from './storage/object-storage.service.js';

@Controller()
export class HealthController {
  constructor(
    private readonly database: DatabaseService,
    private readonly workerDatabase: WorkerDatabaseService,
    private readonly auth: OidcAuthService,
    private readonly storage: ObjectStorageService,
    private readonly scanner: MalwareScannerService,
    private readonly ocr: DocumentIntelligenceService,
    private readonly reminders: ReminderSchedulerService,
    private readonly notifications: NotificationDispatcherService,
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
    const workerDatabase = this.workerDatabase.enabled
      ? await this.workerDatabase.ping().catch(() => ({ enabled: true, ok: false }))
      : { enabled: false, ok: false };

    const workerReady = Boolean(
      workerDatabase.ok
      && this.storage.configured
      && this.ocr.configured,
    );
    const reminderSchedulerReady = Boolean(workerDatabase.ok && this.reminders.configured);
    const inAppDeliveryReady = Boolean(workerDatabase.ok && this.notifications.configured);

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
        byteTransport: this.storage.configured ? 'ready' : 'not_configured',
        malwareScanning: this.scanner.configured ? 'ready' : 'not_configured',
        extractionReview: database.ok ? 'ready' : database.enabled ? 'degraded' : 'not_configured',
        ocrExtraction: this.ocr.configured ? 'ready' : 'not_configured',
        processingQueue: database.ok ? 'ready' : 'not_configured',
        processingWorker: workerReady ? 'ready' : workerDatabase.enabled ? 'degraded' : 'not_configured',
        documentProcessing: database.ok && workerReady && this.scanner.configured
          ? 'ready'
          : 'not_configured',
        reminderScheduling: reminderSchedulerReady
          ? 'ready'
          : workerDatabase.enabled
            ? 'degraded'
            : 'not_configured',
        reminderDelivery: inAppDeliveryReady ? 'in_app_ready' : 'not_configured',
        pushDelivery: 'not_configured',
        emailDelivery: 'not_configured',
        jurisdictionRules: 'not_enabled',
      },
      dependencies: {
        database,
        workerDatabase,
        oidc: {
          configured: this.auth.enabled,
        },
        objectStorage: this.storage.capability,
        malwareScanner: this.scanner.capability,
        documentIntelligence: this.ocr.capability,
        reminderScheduler: this.reminders.capability,
        notificationDispatcher: this.notifications.capability,
      },
    };
  }

  @Get('version')
  version() {
    return { service: 'lifeos-api', version: LIFEOS_API_VERSION, runtime: 'nestjs' };
  }
}
