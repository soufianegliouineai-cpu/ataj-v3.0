import { Global, Module } from '@nestjs/common';
import { DocumentIntelligenceService } from './document-intelligence.service.js';

@Global()
@Module({
  providers: [DocumentIntelligenceService],
  exports: [DocumentIntelligenceService],
})
export class OcrModule {}
