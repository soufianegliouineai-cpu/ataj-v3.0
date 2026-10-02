import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './health.controller.js';
import { ProtectionModule } from './protection/protection.module.js';

@Module({
  imports: [DatabaseModule, ProtectionModule],
  controllers: [HealthController],
})
export class AppModule {}
