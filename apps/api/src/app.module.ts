import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { CountryRuleModule } from './country-rules/country-rule.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './health.controller.js';
import { HomeModule } from './home/home.module.js';
import { ExtractionReviewModule } from './extractions/extraction-review.module.js';
import { HouseholdModule } from './households/household.module.js';
import { OcrModule } from './ocr/ocr.module.js';
import { PersonModule } from './people/person.module.js';
import { ProtectionModule } from './protection/protection.module.js';
import { DocumentProcessingModule } from './processing/document-processing.module.js';
import { ReminderModule } from './reminders/reminder.module.js';
import { MalwareScannerModule } from './scanning/malware-scanner.module.js';
import { TaskModule } from './tasks/task.module.js';
import { TimelineModule } from './timeline/timeline.module.js';
import { UploadModule } from './uploads/upload.module.js';
import { ObjectStorageModule } from './storage/object-storage.module.js';

@Module({
  imports: [AuthModule, DatabaseModule, CountryRuleModule, ObjectStorageModule, MalwareScannerModule, OcrModule, DocumentProcessingModule, ReminderModule, ExtractionReviewModule, HomeModule, HouseholdModule, PersonModule, ProtectionModule, TaskModule, TimelineModule, UploadModule],
  controllers: [HealthController],
})
export class AppModule {}
