import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { SUPPORTED_DOCUMENT_TYPES, type SupportedDocumentType } from '../constants.js';

export class ExpiryProtectionDto {
  @IsIn(SUPPORTED_DOCUMENT_TYPES)
  documentType!: SupportedDocumentType;

  @IsDateString({ strict: true })
  expiryDate!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  leadDays?: number;
}
