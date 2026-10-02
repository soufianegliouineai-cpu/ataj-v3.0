import { Module } from '@nestjs/common';
import { ExtractionReviewController } from './extraction-review.controller.js';
import { ExtractionReviewService } from './extraction-review.service.js';

@Module({
  controllers: [ExtractionReviewController],
  providers: [ExtractionReviewService],
  exports: [ExtractionReviewService],
})
export class ExtractionReviewModule {}
