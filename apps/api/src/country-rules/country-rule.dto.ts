import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class CountryRuleDocumentStateDto {
  @IsString()
  type!: string;

  @IsIn(['valid', 'expired', 'missing'])
  state!: 'valid' | 'expired' | 'missing';
}

export class EvaluateCountryRuleDto {
  @IsString()
  ruleCode!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(130)
  ageYears!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CountryRuleDocumentStateDto)
  documents!: CountryRuleDocumentStateDto[];
}
