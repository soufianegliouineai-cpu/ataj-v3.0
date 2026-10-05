import { Module } from '@nestjs/common';
import { CountryRuleController } from './country-rule.controller.js';
import { CountryRuleService } from './country-rule.service.js';

@Module({
  controllers: [CountryRuleController],
  providers: [CountryRuleService],
  exports: [CountryRuleService],
})
export class CountryRuleModule {}
