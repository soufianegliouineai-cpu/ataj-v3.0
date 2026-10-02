import { Module } from '@nestjs/common';
import { ProtectionController } from './protection.controller.js';
import { ProtectionService } from './protection.service.js';

@Module({
  controllers: [ProtectionController],
  providers: [ProtectionService],
})
export class ProtectionModule {}
