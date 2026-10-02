import { Module } from '@nestjs/common';
import { ProtectionController } from './protection.controller.js';
import { ProtectionRepository } from './protection.repository.js';
import { ProtectionService } from './protection.service.js';

@Module({
  controllers: [ProtectionController],
  providers: [ProtectionService, ProtectionRepository],
  exports: [ProtectionService, ProtectionRepository],
})
export class ProtectionModule {}
