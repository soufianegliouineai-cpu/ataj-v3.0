import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { ProtectionModule } from './protection/protection.module.js';

@Module({
  imports: [ProtectionModule],
  controllers: [HealthController],
})
export class AppModule {}
