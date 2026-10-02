import { IsOptional, IsUUID } from 'class-validator';
import { ExpiryProtectionDto } from './protection.dto.js';

export class PersistExpiryProtectionDto extends ExpiryProtectionDto {
  @IsOptional()
  @IsUUID()
  personId?: string;
}
