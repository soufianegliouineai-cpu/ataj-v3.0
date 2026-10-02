import { Module } from '@nestjs/common';
import { DocumentProcessingController } from './document-processing.controller.js';
import { DocumentProcessingService } from './document-processing.service.js';

@Module({
  controllers: [DocumentProcessingController],
  providers: [DocumentProcessingService],
  exports: [DocumentProcessingService],
})
export class DocumentProcessingModule {}
