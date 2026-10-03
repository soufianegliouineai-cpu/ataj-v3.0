import { Module } from '@nestjs/common';
import { DocumentProcessingController } from './document-processing.controller.js';
import { DocumentProcessingService } from './document-processing.service.js';
import { DocumentProcessingWorkerService } from './document-processing-worker.service.js';

@Module({
  controllers: [DocumentProcessingController],
  providers: [DocumentProcessingService, DocumentProcessingWorkerService],
  exports: [DocumentProcessingService, DocumentProcessingWorkerService],
})
export class DocumentProcessingModule {}
