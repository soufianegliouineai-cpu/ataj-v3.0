import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EvaluateCountryRuleDto } from './country-rule.dto.js';
import { CountryRuleService } from './country-rule.service.js';

@Controller('country-packs')
export class CountryRuleController {
  constructor(private readonly rules: CountryRuleService) {}

  @Get(':jurisdiction')
  async getPack(@Param('jurisdiction') jurisdiction: string) {
    this.requirePersistence();
    return {
      data: await this.rules.getPack(jurisdiction),
    };
  }

  @Post(':jurisdiction/evaluate')
  async evaluate(
    @Param('jurisdiction') jurisdiction: string,
    @Body() input: EvaluateCountryRuleDto,
  ) {
    this.requirePersistence();
    return {
      data: await this.rules.evaluate(jurisdiction, input),
    };
  }

  private requirePersistence() {
    if (!this.rules.enabled) {
      throw new ServiceUnavailableException({
        code: 'COUNTRY_RULES_NOT_CONFIGURED',
        message: 'Country rule persistence is not configured for this deployment.',
      });
    }
  }
}
