import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './health.controller.js';
import { HomeModule } from './home/home.module.js';
import { HouseholdModule } from './households/household.module.js';
import { PersonModule } from './people/person.module.js';
import { ProtectionModule } from './protection/protection.module.js';
import { TaskModule } from './tasks/task.module.js';
import { TimelineModule } from './timeline/timeline.module.js';
import { UploadModule } from './uploads/upload.module.js';

@Module({
  imports: [AuthModule, DatabaseModule, HomeModule, HouseholdModule, PersonModule, ProtectionModule, TaskModule, TimelineModule, UploadModule],
  controllers: [HealthController],
})
export class AppModule {}
