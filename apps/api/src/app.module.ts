import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './health.controller.js';
import { HouseholdModule } from './households/household.module.js';
import { PersonModule } from './people/person.module.js';
import { ProtectionModule } from './protection/protection.module.js';
import { TimelineModule } from './timeline/timeline.module.js';

@Module({
  imports: [AuthModule, DatabaseModule, HouseholdModule, PersonModule, ProtectionModule, TimelineModule],
  controllers: [HealthController],
})
export class AppModule {}
